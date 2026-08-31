import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformAdapter, ActionDefinition, ActionExecutor } from '../src/core/types.js';

// Wiring Gate — ExecutionEvidence integration tests (§13).
// Follows tests/pipeline.test.ts patterns: mocked store (no real ~/.buffy
// writes), mocked presenter, mock adapter, injected executors overriding
// REAL catalog action ids (invented ids are rejected by gate lookup).

const store = vi.hoisted(() => ({
  current: { actionHistory: [] as any[], evidence: undefined as any },
}));

vi.mock('../src/state/store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/state/store.js')>();
  return {
    ...actual,
    loadState: vi.fn(() => JSON.parse(JSON.stringify(store.current))),
    updateState: vi.fn((patch: any) => {
      store.current = { ...store.current, ...patch };
      return store.current;
    }),
  };
});

vi.mock('../src/core/presenter.js', () => ({
  renderActionResult: vi.fn((r: any) => `[MOCK] ${r.message}`),
  toJSON: vi.fn((obj: any) => JSON.stringify(obj)),
  renderGreeting: vi.fn(),
  renderDoctorReport: vi.fn(),
  renderDiagnosticReport: vi.fn(),
  renderProposal: vi.fn(),
  renderCapabilities: vi.fn(),
}));

import { executeWithGates } from '../src/core/pipeline.js';
import { executeWithGatesForTests } from '../src/core/pipeline.test-harness.js';
import { classifyEvidence } from '../src/core/execution-evidence.js';
import { getAllActions } from '../src/actions/registry.js';
import { EVIDENCE_CAP } from '../src/state/store.js';

// ─── Real catalog action (used by most tests) ──────────────

const diskAction: ActionDefinition = getAllActions().find((a) => a.id === 'check-disk-space')!;
const installAction: ActionDefinition = getAllActions().find((a) => a.id === 'install-tool')!;

// ─── Mock adapter (same pattern as pipeline.test.ts) ───────

function createMockAdapter(): PlatformAdapter {
  return {
    name: 'windows',
    detect: async () => ({ name: 'windows', os: 'Test OS', version: '1.0', arch: 'x64' }),
    systemInfo: async () => ({
      os: { name: 'Test', version: '1.0', arch: 'x64' },
      cpu: { model: 'Test', cores: 4, usage: null },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'GPU', driver: '1.0', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
    }),
    capabilities: async () => [],
  };
}

// ─── Test actions (metadata only) ──────────────────────────

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test auto_safe action',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const forbiddenAction: ActionDefinition = {
  id: 'test-forbidden',
  name: 'Test Forbidden',
  description: 'Test forbidden action',
  level: 'forbidden',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const linuxOnlyAction: ActionDefinition = {
  id: 'test-linux-only',
  name: 'Test Linux Only',
  description: 'Rejected by platform validation on windows',
  level: 'auto_safe',
  reversible: false,
  platforms: ['linux'],
  prerequisites: [],
};

const executor = (result: Partial<any>): ActionExecutor =>
  async () => ({ success: true, message: 'ok', ...result }) as any;

beforeEach(() => {
  store.current = { actionHistory: [] };
});

describe('Wiring Gate — ExecutionEvidence emission', () => {
  it('§13.1 successful execution → exactly one record: OBSERVED_EXECUTED, attempts=[success], executionId', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: diskAction,
      customExecutorMap: { 'check-disk-space': executor({ message: 'done' }) },
    });
    expect(store.current.evidence).toHaveLength(1);
    const r = store.current.evidence[0];
    expect(r.level).toBe('OBSERVED_EXECUTED');
    expect(r.actionId).toBe('check-disk-space');
    expect(r.attempts).toEqual([{ outcome: 'success', detail: 'done' }]);
    expect(r.executionId).toMatch(/^exec-/);
    expect(r.source).toBe('action-gate');
  });

  it('§13.2 executor returns failure → NOT_VERIFIED with the failure preserved in attempts', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: diskAction,
      customExecutorMap: {
        'check-disk-space': async () => ({ success: false, message: 'efecto no logrado' }),
      },
    });
    const r = store.current.evidence[0];
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.attempts).toEqual([{ outcome: 'failed', detail: 'efecto no logrado' }]);
  });

  it('§13.3 executor throws → NOT_VERIFIED with outcome exception', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: diskAction,
      customExecutorMap: {
        'check-disk-space': async () => {
          throw new Error('boom');
        },
      },
    });
    const r = store.current.evidence[0];
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.attempts).toEqual([
      { outcome: 'exception', detail: expect.stringContaining('boom') },
    ]);
  });

  it('§13.4 CONFIRM rejected without promptUser (real install-tool) → zero records', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: installAction,
      customExecutorMap: { 'install-tool': executor({}) },
    });
    expect(store.current.evidence).toBeUndefined();
  });

  it('§13.5 FORBIDDEN → zero records (gate denial before execStore.start)', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: forbiddenAction,
      actions: [forbiddenAction],
      customExecutorMap: { 'test-forbidden': executor({}) },
    });
    expect(store.current.evidence).toBeUndefined();
  });

  it('§13.6 jsonMode → plan shown, zero records', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: diskAction,
      jsonMode: true,
      customExecutorMap: { 'check-disk-space': executor({}) },
    });
    expect(store.current.evidence).toBeUndefined();
  });

  it('§13.7 platform-mismatch rejection → zero records', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: linuxOnlyAction,
      actions: [linuxOnlyAction],
      customExecutorMap: { 'test-linux-only': executor({}) },
    });
    expect(store.current.evidence).toBeUndefined();
  });

  it('§13.8 unknown action id → zero records (gate lookup fails)', async () => {
    const ghost: ActionDefinition = { ...autoSafeAction, id: 'ghost-action' };
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: ghost,
      actions: [autoSafeAction],
      customExecutorMap: { 'ghost-action': executor({}) },
    });
    expect(store.current.evidence).toBeUndefined();
  });

  it('§13.9 reaches execStore but no executor registered → record with NOT_VERIFIED (Q1 case 4 sub-case)', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: autoSafeAction,
      actions: [autoSafeAction],
      customExecutorMap: {}, // auto_safe action with no executor registered
    });
    const r = store.current.evidence[0];
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.attempts[0].outcome).toBe('exception');
  });

  it('§13.10 one request → exactly one record (exactly-once)', async () => {
    await executeWithGatesForTests({
      adapter: createMockAdapter(),
      action: diskAction,
      customExecutorMap: { 'check-disk-space': executor({}) },
    });
    expect(store.current.evidence).toHaveLength(1);
  });
});

describe('Wiring Gate — compound records (Q2 mandatory case, classifier level)', () => {
  it('fail, fail, success → one compound record: OBSERVED_EXECUTED with failures preserved', () => {
    const r = classifyEvidence({
      surface: 'self-action',
      actionId: 'install-tool',
      observedAt: '2026-08-30T20:00:00.000Z',
      executionId: 'exec-abc',
      attempts: [
        { outcome: 'failed', detail: 'lock' },
        { outcome: 'failed', detail: 'lock' },
        { outcome: 'success', detail: 'installed' },
      ],
      finalOutcome: 'success',
      windowCoversAction: true,
    });
    expect(r.level).toBe('OBSERVED_EXECUTED');
    expect(r.attempts).toHaveLength(3);
    expect(r.attempts![0].outcome).toBe('failed');
    expect(r.attempts![2].outcome).toBe('success');
  });

  it('all attempts fail → NOT_VERIFIED, failures preserved verbatim', () => {
    const r = classifyEvidence({
      surface: 'self-action',
      actionId: 'install-tool',
      observedAt: '2026-08-30T20:00:00.000Z',
      attempts: [
        { outcome: 'failed' },
        { outcome: 'failed' },
        { outcome: 'failed' },
      ],
      finalOutcome: 'failed',
      windowCoversAction: true,
    });
    expect(r.level).toBe('NOT_VERIFIED');
    expect(r.attempts).toHaveLength(3);
  });

  it('EVIDENCE_CAP unchanged (registered design decision — 200 stays under compound semantics)', () => {
    expect(EVIDENCE_CAP).toBe(200);
  });
});
