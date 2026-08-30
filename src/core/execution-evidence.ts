// Buffy Next — ExecutionEvidence
// Evidence levels for actions, based on what Buffy can actually observe.
//
// SURFACES (Design Gate Q1 — verdict: PARTIAL):
//   self-action    — actions that cross ActionGate (buffy act / buffy_action).
//                    Buffy observes them directly (executor result, state.json
//                    actionHistory). Evidence: STRONG.
//   self-delivery  — Buffy's own emissions (context pack, capabilities,
//                    diagnose response). Attestable only in-process today:
//                    the delivery ledger is Phase 2 — NOT BUILT YET.
//   external       — actions performed by the harness/agent outside Buffy
//                    (harness read_files, run_terminal_command, other tools).
//                    STRUCTURALLY unobservable: no channel exists and none is
//                    planned. Real case (E-LOAD session): LOAD_CONTEXT.md was
//                    read via harness read_files — invisible to Buffy.

// ─── Levels ────────────────────────────────────────────────
//
// SEMANTICS (Design Gate §3, one assignment rule per level):
//
//   DELIVERED              Buffy attests it EMITTED something through its own
//                          interface. Requires an in-band emission record.
//                          Never inferred.
//   OBSERVED_EXECUTED      Buffy directly observed its own executor COMPLETE
//                          the action (in-band result, or persisted record).
//                          Never from filesystem artifacts (provenance not
//                          attributable); never from a self-reporting check
//                          of the same flow.
//   VERIFIED               OBSERVED_EXECUTED + the expected postcondition was
//                          CONFIRMED by an independent observation channel
//                          (adapter re-observation, source != executor source).
//                          Requires the action to be catalog-verifiable
//                          (ActionDefinition.verifiable). Without a naturally
//                          observable postcondition, the ceiling is
//                          OBSERVED_EXECUTED — that is a property of the
//                          action, not a bug of the evidence system.
//   NOT_VERIFIED           A delivered/suggested item on an OBSERVABLE surface
//                          whose available evidence was examined and does NOT
//                          confirm execution. Statement about the confirmation
//                          status — NEVER "it did not occur".
//   UNKNOWN_UNOBSERVABLE   The action happens on a surface with NO structural
//                          channel for Buffy (external). Statement about
//                          observation capability, permanently true for S4.
//   UNKNOWN_NO_EVIDENCE    The surface WAS observable, but the evidence needed
//                          is not available in the current window (expired,
//                          rotated out of the ledger, process gone).
//   UNKNOWN_CHANNEL_NOT_BUILT   The surface would be observable, but the
//                          observation channel itself is not built yet (Phase 2
//                          delivery ledger). This is the ONLY level expected to
//                          be retired by a later phase; it is a documented
//                          design gap, not a permanent structural limit.
//
// INVARIANT: "no observé" (NOT_VERIFIED) is never conflated with "no pude
// examinar" (UNKNOWN_*), and no level ever asserts "it did not occur".

export type ExecutionEvidenceLevel =
  | 'DELIVERED'
  | 'OBSERVED_EXECUTED'
  | 'VERIFIED'
  | 'NOT_VERIFIED'
  | 'UNKNOWN_UNOBSERVABLE'
  | 'UNKNOWN_NO_EVIDENCE'
  | 'UNKNOWN_CHANNEL_NOT_BUILT';

export type ExecutionSurface = 'self-action' | 'self-delivery' | 'external';

export interface EvidencePostcondition {
  /** Expected world-state, expressed before execution (catalog-declared). */
  expected: string;
  /** World-state observed AFTER execution, via an independent channel. */
  observed: string;
  matched: boolean;
  /** Source of the post-condition observation. MUST differ from the
   *  executor's source for VERIFIED (self-attestation guard). */
  source: string;
}

export interface ExecutionEvidenceRecord {
  actionId: string;
  surface: ExecutionSurface;
  level: ExecutionEvidenceLevel;
  /** When the evidence was examined (ISO). */
  observedAt: string;
  /** Where the evidence came from: 'action-gate' | 'state.json' |
   *  'adapter:<name>' | 'delivery-ledger' | … */
  source: string;
  /** Identity of the emitting invocation (identity-provider), when known. */
  correlationId?: string;
  /** Mandatory for indirect/artifact-only and for provisional states. */
  evidenceNote?: string;
  postcondition?: EvidencePostcondition;
}

export interface EvidenceInput {
  surface: ExecutionSurface;
  actionId: string;
  observedAt: string;
  /** self-action: completed execution record (ActionGate / actionHistory). */
  executionRecord?: { completed: boolean; source: string };
  /** self-delivery: is the delivery ledger built and in place? (Phase 1: false) */
  deliveryLedgerAvailable?: boolean;
  /** self-delivery: emission record (only meaningful if ledger available). */
  deliveryRecord?: { emittedAt: string; source: string };
  /** Does the evidence window cover the moment of the action?
   *  false = rotated out / process gone (→ UNKNOWN_NO_EVIDENCE). */
  windowCoversAction?: boolean;
  /** Only meaningful for catalog-verifiable actions, observed independently. */
  postcondition?: EvidencePostcondition;
  evidenceNote?: string;
  correlationId?: string;
}

// ─── Classifier ────────────────────────────────────────────

/**
 * Pure and deterministic: given surface + available evidence + window,
 * assigns exactly one level per the semantics table above.
 */
export function classifyEvidence(input: EvidenceInput): ExecutionEvidenceRecord {
  const base = {
    actionId: input.actionId,
    surface: input.surface,
    observedAt: input.observedAt,
    correlationId: input.correlationId,
  };

  // S4 — no structural channel. Even a world-state delta is not action evidence.
  if (input.surface === 'external') {
    return {
      ...base,
      level: 'UNKNOWN_UNOBSERVABLE',
      source: 'none',
      evidenceNote:
        input.evidenceNote ??
        'surface outside Buffy boundary: harness/agent actions are structurally unobservable',
    };
  }

  // S2 — own deliveries. Channel not built in Phase 1 → provisional level.
  if (input.surface === 'self-delivery') {
    if (!input.deliveryLedgerAvailable) {
      return {
        ...base,
        level: 'UNKNOWN_CHANNEL_NOT_BUILT',
        source: 'none',
        evidenceNote:
          input.evidenceNote ??
          'delivery ledger pending (Phase 2): delivery attestation channel not built yet',
      };
    }
    if (input.deliveryRecord) {
      return {
        ...base,
        level: 'DELIVERED',
        source: input.deliveryRecord.source,
      };
    }
    return {
      ...base,
      level: 'UNKNOWN_NO_EVIDENCE',
      source: 'delivery-ledger',
      evidenceNote: 'ledger available but no emission record found for this action',
    };
  }

  // S1 — own actions (ActionGate surface).
  if (input.executionRecord?.completed) {
    const post = input.postcondition;
    if (post && post.matched && post.source !== input.executionRecord.source) {
      return { ...base, level: 'VERIFIED', source: input.executionRecord.source, postcondition: post };
    }
    // Ceiling: OBSERVED_EXECUTED. Either no verifiable postcondition, or the
    // confirmation came from the executor itself (self-attestation guard).
    return {
      ...base,
      level: 'OBSERVED_EXECUTED',
      source: input.executionRecord.source,
      postcondition: post,
      evidenceNote: post
        ? 'postcondition not independently confirmed (self-attestation or unmatched)'
        : input.evidenceNote,
    };
  }

  // No completed record. Window covers the action → evidence was examined,
  // confirmation not found (may include a failed attempt — still NOT_VERIFIED:
  // "not verified as executed", never "did not occur").
  if (input.windowCoversAction === true) {
    return {
      ...base,
      level: 'NOT_VERIFIED',
      source: 'state.json',
      evidenceNote: input.evidenceNote ?? 'no execution record found in covered window',
    };
  }

  // Window does not cover the action: evidence expired / rotated / process gone.
  return {
    ...base,
    level: 'UNKNOWN_NO_EVIDENCE',
    source: 'state.json',
    evidenceNote: input.evidenceNote ?? 'evidence window does not cover the action (rotation or process lifetime)',
  };
}
