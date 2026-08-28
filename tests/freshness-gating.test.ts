import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyFreshnessGating,
  getGatedObservations,
  hasUnresolvedStale,
} from '../src/core/freshness-gating.js';
import type {
  CheckResult,
  CheckSelection,
  PlatformAdapter,
  SystemInfo,
  PlatformInfo,
  Capability,
} from '../src/core/types.js';

// ─── Mock Adapter ──────────────────────────────────────────

function createMockAdapter(systemInfo?: Partial<SystemInfo>): PlatformAdapter {
  return {
    name: 'linux',
    detect: async (): Promise<PlatformInfo> => ({
      name: 'linux',
      os: 'Test Linux',
      version: '6.1.0',
      arch: 'x86_64',
    }),
    systemInfo: async (): Promise<SystemInfo> => ({
      os: { name: 'Test Linux', version: '6.1.0', arch: 'x86_64' },
      cpu: { model: 'Test CPU', cores: 4, usage: 50 },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'Test GPU', driver: 'test-driver', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
      privileges: { shell: true, shizuku: false, root: false, adb: false },
      ...systemInfo,
    }),
    capabilities: async (): Promise<Capability[]> => [],
  };
}

// ─── Helper: Create observation with timestamp ─────────────

function createObservation(
  id: string,
  category: string,
  ageMs: number,
  overrides?: Partial<CheckResult>,
): CheckResult {
  const observedAt = new Date(Date.now() - ageMs).toISOString();
  return {
    id,
    category,
    severity: 'ok',
    message: `Test ${id}`,
    observedAt,
    source: 'TestAdapter.test',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Freshness Gating (E4.2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Fresh observations', () => {
    it('should include fresh observations', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu', 'ram'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000), // 5s ago
        createObservation('ram-status', 'RAM', 10_000), // 10s ago
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      expect(result.included.length).toBe(2);
      expect(result.refreshed.length).toBe(0);
      expect(result.omittedStale.length).toBe(0);
      expect(result.needsRefresh.length).toBe(0);
    });

    it('should mark fresh observations in instrumentation', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000),
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      expect(result.instrumentation[0].epistemicStateBefore).toBe('observed');
      expect(result.instrumentation[0].includedInContext).toBe(true);
      expect(result.instrumentation[0].refreshRequired).toBe(false);
    });
  });

  describe('Stale observations', () => {
    it('should omit stale irrelevant observations', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu'], // Only CPU is relevant
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000), // Fresh
        createObservation('ram-status', 'RAM', 120_000), // Stale (2min, threshold 30s)
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      expect(result.included.length).toBe(1);
      expect(result.included[0].id).toBe('cpu-status');
      expect(result.omittedStale).toContain('ram-status');
    });

    it('should refresh stale relevant observations', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu', 'ram'], // Both relevant
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000), // Fresh
        createObservation('ram-status', 'RAM', 120_000), // Stale
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      expect(result.included.length).toBe(1); // cpu
      expect(result.refreshed.length).toBe(1); // ram refreshed
      expect(result.refreshed[0].id).toBe('ram-status');
    });

    it('should report refresh success in instrumentation', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['ram'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('ram-status', 'RAM', 120_000), // Stale
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      const ramInstr = result.instrumentation.find(i => i.field === 'ram-status');
      expect(ramInstr).toBeDefined();
      expect(ramInstr!.refreshRequired).toBe(true);
      expect(ramInstr!.refreshPerformed).toBe(true);
      expect(ramInstr!.epistemicStateAfter).toBe('observed');
      expect(ramInstr!.includedInContext).toBe(true);
    });
  });

  describe('Unknown observations', () => {
    it('should omit unknown observations without fabricating', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu', 'temperature'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000),
        {
          id: 'temperature-status',
          category: 'Temperatura',
          severity: 'unknown',
          message: 'No temperature data',
          // No observedAt — treated as unknown
        },
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      // temperature-status has no observedAt, so it's treated as legacy and included
      expect(result.included.length).toBe(2);
    });
  });

  describe('Regression: Fresh context behavior', () => {
    it('should not regress when all fields are fresh', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000),
        createObservation('ram-status', 'RAM', 5_000),
        createObservation('gpu-driver-ok', 'GPU', 5_000),
        createObservation('temperature-status', 'Temperatura', 5_000),
        createObservation('processes-ok', 'Procesos', 5_000),
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      // All should be included
      expect(result.included.length).toBe(5);
      expect(result.refreshed.length).toBe(0);
      expect(result.omittedStale.length).toBe(0);
      expect(result.needsRefresh.length).toBe(0);
    });

    it('should handle mixed fresh and stale correctly', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const selection: CheckSelection = {
        checks: ['cpu', 'ram', 'gpu'],
        ambiguous: false,
        confidence: 'high',
      };

      const observations: CheckResult[] = [
        createObservation('cpu-status', 'CPU', 5_000), // Fresh
        createObservation('ram-status', 'RAM', 120_000), // Stale (relevant, has refresh)
        createObservation('gpu-driver-ok', 'GPU', 400_000), // Stale (relevant, NO refresh)
      ];

      const result = await applyFreshnessGating(observations, selection, adapter);

      expect(result.included.length).toBe(1); // cpu
      expect(result.refreshed.length).toBe(1); // ram refreshed
      expect(result.needsRefresh).toContain('gpu-driver-ok'); // gpu can't refresh
      expect(result.omittedStale.length).toBe(0);
    });
  });

  describe('Utility functions', () => {
    it('getGatedObservations should return included + refreshed', () => {
      const result = {
        included: [{ id: 'a' } as CheckResult],
        refreshed: [{ id: 'b' } as CheckResult],
        omittedStale: [],
        needsRefresh: [],
        instrumentation: [],
      };

      const all = getGatedObservations(result);
      expect(all.length).toBe(2);
      expect(all.map(o => o.id)).toEqual(['a', 'b']);
    });

    it('hasUnresolvedStale should return true when needsRefresh exists', () => {
      const result = {
        included: [],
        refreshed: [],
        omittedStale: [],
        needsRefresh: ['ram-status'],
        instrumentation: [],
      };

      expect(hasUnresolvedStale(result)).toBe(true);
    });

    it('hasUnresolvedStale should return false when needsRefresh is empty', () => {
      const result = {
        included: [],
        refreshed: [],
        omittedStale: [],
        needsRefresh: [],
        instrumentation: [],
      };

      expect(hasUnresolvedStale(result)).toBe(false);
    });
  });
});
