import { describe, it, expect } from 'vitest';
import {
  classifyEvidence,
  type EvidenceInput,
  type ExecutionEvidenceRecord,
} from '../src/core/execution-evidence.js';
import { recordEvidence, EVIDENCE_CAP } from '../src/state/store.js';
import type { BuffyState } from '../src/core/types.js';

// ─── Design Gate §7 — ExecutionEvidence (Fase 1) ───────────
// Covers: direct evidence; absence of evidence on an observable surface;
// non-observable surface; indirect artifact-based result; and the explicit
// discrimination NOT_VERIFIED vs UNKNOWN_UNOBSERVABLE vs UNKNOWN_NO_EVIDENCE
// vs UNKNOWN_CHANNEL_NOT_BUILT.

const NOW = '2026-08-30T18:00:00.000Z';

function base(over: Partial<EvidenceInput>): EvidenceInput {
  return { surface: 'self-action', actionId: 'install-tool', observedAt: NOW, ...over };
}

describe('ExecutionEvidence — classifier', () => {
  it('§7.1 direct evidence: completed ActionGate record → OBSERVED_EXECUTED', () => {
    const r = classifyEvidence(
      base({
        executionRecord: { completed: true, source: 'action-gate' },
        windowCoversAction: true,
      }),
    );
    expect(r.level).toBe('OBSERVED_EXECUTED');
    expect(r.source).toBe('action-gate');
  });

  it('§7.2 VERIFIED requires an independent observation channel (self-attestation guard)', () => {
    // Postcondition confirmed by the executor itself → ceiling stays at OBSERVED_EXECUTED.
    const selfAttested = classifyEvidence(
      base({
        executionRecord: { completed: true, source: 'action-gate' },
        postcondition: {
          expected: 'tool present in capabilities',
          observed: 'tool present in capabilities',
          matched: true,
          source: 'action-gate',
        },
      }),
    );
    expect(selfAttested.level).toBe('OBSERVED_EXECUTED');

    // Same postcondition, observed via the adapter layer → VERIFIED.
    const verified = classifyEvidence(
      base({
        executionRecord: { completed: true, source: 'action-gate' },
        postcondition: {
          expected: 'tool present in capabilities',
          observed: 'tool present in capabilities',
          matched: true,
          source: 'adapter:linux',
        },
      }),
    );
    expect(verified.level).toBe('VERIFIED');
    expect(verified.postcondition?.matched).toBe(true);

    // Unmatched postcondition → never VERIFIED.
    const unmatched = classifyEvidence(
      base({
        executionRecord: { completed: true, source: 'action-gate' },
        postcondition: {
          expected: 'tool present',
          observed: 'tool absent',
          matched: false,
          source: 'adapter:linux',
        },
      }),
    );
    expect(unmatched.level).toBe('OBSERVED_EXECUTED');
  });

  it('§7.3 absence of evidence on an observable surface (window covered) → NOT_VERIFIED, never "did not occur"', () => {
    const r = classifyEvidence(base({ windowCoversAction: true }));
    expect(r.level).toBe('NOT_VERIFIED');
    // The record asserts confirmation status only — it must NOT carry a
    // negative-occurrence claim.
    expect(r.postcondition).toBeUndefined();
    expect(r.evidenceNote).not.toMatch(/did not occur|no ocurrió/i);
  });

  it('§7.4 non-observable surface → UNKNOWN_UNOBSERVABLE regardless of any other input', () => {
    const withoutRecord = classifyEvidence(base({ surface: 'external' }));
    expect(withoutRecord.level).toBe('UNKNOWN_UNOBSERVABLE');

    // Even the presence of execution-shaped input cannot promote an external surface.
    const withRecord = classifyEvidence(
      base({ surface: 'external', executionRecord: { completed: true, source: 'harness' } }),
    );
    expect(withRecord.level).toBe('UNKNOWN_UNOBSERVABLE');
  });

  it('§7.5 artifact-only result → NOT_VERIFIED with artifact note; never escalates to OBSERVED_EXECUTED/VERIFIED', () => {
    const r = classifyEvidence(
      base({
        windowCoversAction: true,
        evidenceNote: 'artifact-only: config file mtime changed; provenance not attributable',
      }),
    );
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.evidenceNote).toContain('artifact-only');
    expect(r.level === 'VERIFIED' || r.level === 'OBSERVED_EXECUTED').toBe(false);
  });

  it('§7.6 window not covering the action → UNKNOWN_NO_EVIDENCE (expired/rotated/process gone)', () => {
    const r = classifyEvidence(base({ windowCoversAction: false }));
    expect(r.level).toBe('UNKNOWN_NO_EVIDENCE');
    expect(r.evidenceNote).toMatch(/window|rotation|process/i);
  });

  it('§7.7 discrimination: same action, only surface/window differ → three distinct levels', () => {
    const unobservable = classifyEvidence(base({ surface: 'external' }));
    const notVerified = classifyEvidence(base({ windowCoversAction: true }));
    const noEvidence = classifyEvidence(base({ windowCoversAction: false }));
    expect(unobservable.level).toBe('UNKNOWN_UNOBSERVABLE');
    expect(notVerified.level).toBe('NOT_VERIFIED');
    expect(noEvidence.level).toBe('UNKNOWN_NO_EVIDENCE');
    expect(new Set([unobservable.level, notVerified.level, noEvidence.level]).size).toBe(3);
  });

  it('§7.8 delivery without a built ledger → UNKNOWN_CHANNEL_NOT_BUILT (distinct from the other UNKNOWNs); graduates to DELIVERED once the ledger exists', () => {
    // Phase 1: the delivery ledger does not exist yet.
    const pending = classifyEvidence(
      base({ surface: 'self-delivery', actionId: 'install-tool', deliveryLedgerAvailable: false }),
    );
    expect(pending.level).toBe('UNKNOWN_CHANNEL_NOT_BUILT');
    expect(pending.evidenceNote).toMatch(/Phase 2|ledger/i);
    // It must not be conflated with the other UNKNOWN subtypes.
    expect(pending.level === 'UNKNOWN_NO_EVIDENCE').toBe(false);
    expect(pending.level === 'UNKNOWN_UNOBSERVABLE').toBe(false);

    // Once the ledger exists (Phase 2 graduation path): emission record → DELIVERED.
    const delivered = classifyEvidence(
      base({
        surface: 'self-delivery',
        deliveryLedgerAvailable: true,
        deliveryRecord: { emittedAt: NOW, source: 'presenter' },
      }),
    );
    expect(delivered.level).toBe('DELIVERED');

    // Ledger available, but no emission record for this action → UNKNOWN_NO_EVIDENCE.
    const missing = classifyEvidence(
      base({ surface: 'self-delivery', deliveryLedgerAvailable: true }),
    );
    expect(missing.level).toBe('UNKNOWN_NO_EVIDENCE');
  });

  it('failed attempt with covered window → NOT_VERIFIED (not verified as executed, never "did not occur")', () => {
    const r = classifyEvidence(
      base({
        executionRecord: { completed: false, source: 'action-gate' },
        windowCoversAction: true,
        evidenceNote: 'execution attempted and failed',
      }),
    );
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.evidenceNote).toContain('failed');
  });
});

// ─── Ledger (state store) ──────────────────────────────────

describe('ExecutionEvidence — ledger rotation', () => {
  const rec = (i: number): ExecutionEvidenceRecord => ({
    actionId: `action-${i}`,
    surface: 'self-action',
    level: 'OBSERVED_EXECUTED',
    observedAt: NOW,
    source: 'action-gate',
  });

  it('recordEvidence appends and rotates down to EVIDENCE_CAP', () => {
    let state: BuffyState = { actionHistory: [] };
    const total = EVIDENCE_CAP + 25;
    for (let i = 0; i < total; i++) {
      state = recordEvidence(state, rec(i));
    }
    expect(state.evidence).toBeDefined();
    expect(state.evidence!.length).toBe(EVIDENCE_CAP);
    // Oldest records were rotated out; the window keeps the newest EVIDENCE_CAP.
    expect(state.evidence![0].actionId).toBe(`action-${total - EVIDENCE_CAP}`);
    expect(state.evidence![EVIDENCE_CAP - 1].actionId).toBe(`action-${total - 1}`);
  });

  it('recordEvidence on a state without prior evidence creates the ledger', () => {
    const state = recordEvidence({ actionHistory: [] }, rec(0));
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence![0].level).toBe('OBSERVED_EXECUTED');
  });

  it('rotation semantics: a rotated-out record would be queried as UNKNOWN_NO_EVIDENCE', () => {
    // Documents the link between ledger rotation and the evidence semantics:
    // once a record leaves the ledger, later queries must fall to
    // UNKNOWN_NO_EVIDENCE (window no longer covers), never NOT_VERIFIED.
    let state: BuffyState = { actionHistory: [] };
    state = recordEvidence(state, rec(0));
    const before = state.evidence!.length;
    for (let i = 1; i <= EVIDENCE_CAP; i++) state = recordEvidence(state, rec(i));
    expect(state.evidence!.length).toBe(EVIDENCE_CAP);
    expect(state.evidence!.some((e) => e.actionId === 'action-0')).toBe(false);
    expect(before).toBe(1);

    const query = classifyEvidence(
      base({ actionId: 'action-0', windowCoversAction: false }),
    );
    expect(query.level).toBe('UNKNOWN_NO_EVIDENCE');
  });
});
