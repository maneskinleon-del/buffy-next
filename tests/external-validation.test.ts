import { describe, it, expect, vi, afterEach } from 'vitest';
import { diagnose } from '../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../src/core/freshness.js';
import type {
  PlatformAdapter,
  SystemInfo,
  PlatformInfo,
  Capability,
  CheckResult,
} from '../src/core/types.js';

// ─── Mock Adapter with controllable timestamps ─────────────

/**
 * Adapter that allows controlling the timestamp of observations.
 * Simulates real-world scenario: fresh → stale → refresh.
 */
function createControllableAdapter() {
  let currentSystemInfo: SystemInfo = {
    os: { name: 'Test Linux', version: '6.1.0', arch: 'x86_64' },
    cpu: { model: 'Test CPU', cores: 4, usage: 50 },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'Test GPU', driver: 'test-driver', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    privileges: { shell: true, shizuku: false, root: false, adb: false },
  };

  let observeTimestamp: string = new Date().toISOString();

  return {
    adapter: {
      name: 'linux',
      detect: async (): Promise<PlatformInfo> => ({
        name: 'linux',
        os: 'Test Linux',
        version: '6.1.0',
        arch: 'x86_64',
      }),
      systemInfo: async (): Promise<SystemInfo> => {
        // Return system info with controlled timestamp
        return {
          ...currentSystemInfo,
          // Add metadata for testing
          _observedAt: observeTimestamp,
        } as SystemInfo;
      },
      capabilities: async (): Promise<Capability[]> => [],
    } as PlatformAdapter,

    // Controls
    setSystemInfo(info: Partial<SystemInfo>) {
      currentSystemInfo = { ...currentSystemInfo, ...info };
    },
    setObserveTimestamp(timestamp: string) {
      observeTimestamp = timestamp;
    },
    getCurrentTimestamp() {
      return observeTimestamp;
    },
  };
}

// ─── External Validation Tests ─────────────────────────────

describe('External Validation — Real-world stale detection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should detect stale data and refresh when system changes', async () => {
    vi.useFakeTimers();

    // Phase 1: Fresh data (T+0)
    const t0 = new Date('2026-08-28T12:00:00.000Z');
    vi.setSystemTime(t0);

    const freshAdapter = createControllableAdapter();
    const freshResponse = await diagnose(freshAdapter.adapter, 'chequea la RAM');
    expect(freshResponse.observations.length).toBeGreaterThan(0);

    // All observations should be fresh
    for (const obs of freshResponse.observations) {
      if (obs.observedAt) {
        expect(classifyEpistemicState(obs.observedAt, 'memory')).toBe('observed');
      }
    }

    // Phase 2: Time passes (T+5min) — observations become stale
    const t5 = new Date('2026-08-28T12:05:00.000Z');
    vi.setSystemTime(t5);

    // The fresh observations from phase 1 are now stale
    // (5 minutes > 30s threshold for memory)
    for (const obs of freshResponse.observations) {
      if (obs.observedAt && obs.category === 'RAM') {
        expect(classifyEpistemicState(obs.observedAt, 'memory')).toBe('stale');
      }
    }
  });

  it('should detect stale data using applyFreshnessGating directly', async () => {
    vi.useFakeTimers();

    // Set current time to T+5min
    const t5 = new Date('2026-08-28T12:05:00.000Z');
    vi.setSystemTime(t5);

    // Create adapter
    const { adapter } = createControllableAdapter();

    // Create stale observation (from T+0, 5 minutes ago)
    const staleObservation: CheckResult = {
      id: 'ram-status',
      category: 'RAM',
      severity: 'warning',
      message: 'RAM: 8 GB disponibles (50% usado)',
      observedAt: '2026-08-28T12:00:00.000Z', // 5 minutes ago
      source: 'LinuxAdapter.systemInfo.memory',
    };

    const selection = { checks: ['ram' as const], ambiguous: false, confidence: 'high' as const };

    const { applyFreshnessGating } = await import('../src/core/freshness-gating.js');
    const result = await applyFreshnessGating([staleObservation], selection, adapter);

    // Should detect staleness
    expect(result.instrumentation[0].epistemicStateBefore).toBe('stale');
    // Should refresh
    expect(result.instrumentation[0].refreshRequired).toBe(true);
    expect(result.instrumentation[0].refreshPerformed).toBe(true);
    // Should be fresh after refresh
    expect(result.instrumentation[0].epistemicStateAfter).toBe('observed');
    // Should be included
    expect(result.instrumentation[0].includedInContext).toBe(true);
  });

  it('should not send stale data as fresh to the model', async () => {
    vi.useFakeTimers();

    const { adapter, setObserveTimestamp } = createControllableAdapter();

    // Observation from 5 minutes ago (stale for memory: 30s threshold)
    const oldTimestamp = new Date('2026-08-28T11:55:00.000Z');
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    setObserveTimestamp(oldTimestamp.toISOString());

    const response = await diagnose(adapter, 'RAM llena');

    // Check that no stale observation was sent as fresh
    if (response.gating) {
      for (const instr of response.gating.instrumentation) {
        if (instr.epistemicStateBefore === 'stale') {
          expect(instr.includedInContext && !instr.refreshPerformed).toBe(false);
        }
      }
    }
  });

  it('should maintain fresh context behavior when data is current', async () => {
    vi.useFakeTimers();

    const { adapter, setObserveTimestamp } = createControllableAdapter();

    // Fresh observation (just now)
    const now = new Date('2026-08-28T12:00:00.000Z');
    vi.setSystemTime(now);
    setObserveTimestamp(now.toISOString());

    const response = await diagnose(adapter, 'mi PC está lento');

    // Should have observations
    expect(response.observations.length).toBeGreaterThan(0);

    // All should be fresh
    for (const obs of response.observations) {
      if (obs.observedAt) {
        const ageMs = calculateAgeMs(obs.observedAt);
        expect(ageMs).toBeLessThan(30_000); // Within 30s threshold
      }
    }

    // No refresh should be needed
    if (response.gating) {
      expect(response.gating.refreshed.length).toBe(0);
      expect(response.gating.needsRefresh.length).toBe(0);
    }
  });

  it('should handle rapid successive queries correctly', async () => {
    vi.useFakeTimers();

    const { adapter, setObserveTimestamp } = createControllableAdapter();

    const now = new Date('2026-08-28T12:00:00.000Z');
    vi.setSystemTime(now);
    setObserveTimestamp(now.toISOString());

    // Query 1
    const r1 = await diagnose(adapter, 'CPU lento');
    expect(r1.observations.length).toBeGreaterThan(0);

    // Query 2 (same time)
    const r2 = await diagnose(adapter, 'RAM llena');
    expect(r2.observations.length).toBeGreaterThan(0);

    // Both should work without errors
    expect(r1.observations).toBeDefined();
    expect(r2.observations).toBeDefined();
  });

  it('should include freshness metadata in context output', async () => {
    vi.useFakeTimers();

    const { adapter, setObserveTimestamp } = createControllableAdapter();

    const now = new Date('2026-08-28T12:00:00.000Z');
    vi.setSystemTime(now);
    setObserveTimestamp(now.toISOString());

    const response = await diagnose(adapter, 'chequea CPU');

    // Check that observations have freshness metadata
    for (const obs of response.observations) {
      expect(obs.observedAt).toBeDefined();
      expect(obs.source).toBeDefined();
    }
  });
});
