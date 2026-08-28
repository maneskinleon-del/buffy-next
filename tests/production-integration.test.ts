import { describe, it, expect, vi, afterEach } from 'vitest';
import { diagnose } from '../src/core/diagnose.js';
import { LinuxAdapter } from '../src/adapters/linux.js';
import type { CheckResult } from '../src/core/types.js';

// ─── Mock Adapter ──────────────────────────────────────────

function createMockAdapter() {
  return {
    name: 'linux',
    detect: async () => ({
      name: 'linux' as const,
      os: 'Test Linux',
      version: '6.1.0',
      arch: 'x86_64',
    }),
    systemInfo: async () => ({
      os: { name: 'Test Linux', version: '6.1.0', arch: 'x86_64' },
      cpu: { model: 'Test CPU', cores: 4, usage: 50 },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'Test GPU', driver: 'test-driver', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    }),
    capabilities: async () => [],
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Production Integration — End-to-End', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Fresh data flow', () => {
    it('should return fresh observations with provenance', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'chequea la RAM');

      // Should have observations
      expect(response.observations.length).toBeGreaterThan(0);

      // Each observation should have provenance
      for (const obs of response.observations) {
        expect(obs.observedAt).toBeDefined();
        expect(obs.source).toBeDefined();
      }
    });

    it('should include audit trail', async () => {
      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'CPU lento');

      // Should have audit trail
      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('CPU lento');
      expect(response.audit!.selectedFields).toContain('cpu');
      expect(response.audit!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(response.audit!.contextBytes).toBeGreaterThan(0);
    });

    it('should have correct freshness decisions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      // All observations should be fresh
      for (const obs of response.observations) {
        if (obs.observedAt) {
          const ageMs = Date.now() - new Date(obs.observedAt).getTime();
          expect(ageMs).toBeLessThan(1000); // Less than 1 second old
        }
      }

      // No stale fields should be detected
      expect(response.audit!.staleFields.length).toBe(0);
    });
  });

  describe('Stale data flow', () => {
    it('should detect stale data and refresh', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      // Simulate time passing (35 seconds > 30s threshold for memory)
      vi.setSystemTime(new Date('2026-08-28T12:00:35.000Z'));

      // Create stale observation
      const staleObs: CheckResult = {
        id: 'ram-status',
        category: 'RAM',
        severity: 'warning',
        message: 'RAM: 8 GB disponibles (50% usado)',
        observedAt: '2026-08-28T12:00:00.000Z', // 35 seconds ago
        source: 'LinuxAdapter.systemInfo.memory',
      };

      // Apply freshness gating
      const { applyFreshnessGating } = await import('../src/core/freshness-gating.js');
      const selection = { checks: ['ram' as const], ambiguous: false, confidence: 'high' as const };
      const gating = await applyFreshnessGating([staleObs], selection, adapter);

      // Should detect staleness
      expect(gating.instrumentation[0].epistemicStateBefore).toBe('stale');
      // Should refresh
      expect(gating.instrumentation[0].refreshRequired).toBe(true);
      expect(gating.instrumentation[0].refreshPerformed).toBe(true);
      // Should be fresh after refresh
      expect(gating.instrumentation[0].epistemicStateAfter).toBe('observed');
    });

    it('should omit stale irrelevant fields', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();

      // Create stale observation for RAM
      const staleObs: CheckResult = {
        id: 'ram-status',
        category: 'RAM',
        severity: 'warning',
        message: 'RAM: 8 GB disponibles (50% usado)',
        observedAt: '2026-08-28T11:59:25.000Z', // 35 seconds ago
        source: 'LinuxAdapter.systemInfo.memory',
      };

      // Selection only asks for CPU (RAM is irrelevant)
      const selection = { checks: ['cpu' as const], ambiguous: false, confidence: 'high' as const };

      const { applyFreshnessGating } = await import('../src/core/freshness-gating.js');
      const gating = await applyFreshnessGating([staleObs], selection, adapter);

      // Should omit stale irrelevant field
      expect(gating.omittedStale).toContain('ram-status');
      expect(gating.included.length).toBe(0);
    });
  });

  describe('Unknown data flow', () => {
    it('should not fabricate unknown values', async () => {
      const adapter = createMockAdapter();

      // Create unknown observation
      const unknownObs: CheckResult = {
        id: 'temperature-status',
        category: 'Temperatura',
        severity: 'unknown',
        message: 'No temperature data',
        // No observedAt — treated as unknown
      };

      const selection = { checks: ['temperature' as const], ambiguous: false, confidence: 'high' as const };

      const { applyFreshnessGating } = await import('../src/core/freshness-gating.js');
      const gating = await applyFreshnessGating([unknownObs], selection, adapter);

      // Unknown observations without observedAt are treated as legacy and included
      expect(gating.included.length).toBe(1);
    });
  });

  describe('Refresh failure flow', () => {
    it('should handle refresh failure gracefully', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      // Create adapter that fails on refresh
      const failingAdapter = {
        name: 'linux',
        detect: async () => ({
          name: 'linux' as const,
          os: 'Test Linux',
          version: '6.1.0',
          arch: 'x86_64',
        }),
        systemInfo: async () => {
          throw new Error('System info unavailable');
        },
        capabilities: async () => [],
      };

      // Create stale observation
      const staleObs: CheckResult = {
        id: 'ram-status',
        category: 'RAM',
        severity: 'warning',
        message: 'RAM: 8 GB disponibles (50% usado)',
        observedAt: '2026-08-28T11:59:25.000Z', // 35 seconds ago
        source: 'LinuxAdapter.systemInfo.memory',
      };

      const selection = { checks: ['ram' as const], ambiguous: false, confidence: 'high' as const };

      const { applyFreshnessGating } = await import('../src/core/freshness-gating.js');

      // Should not throw
      const gating = await applyFreshnessGating([staleObs], selection, failingAdapter);

      // Should mark as needs refresh (couldn't refresh)
      expect(gating.needsRefresh).toContain('ram-status');
    });
  });

  describe('Audit trail', () => {
    it('should track all freshness decisions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      // Should have audit trail
      expect(response.audit).toBeDefined();
      expect(response.audit!.selectedFields).toContain('cpu');
      expect(response.audit!.selectedFields).toContain('ram');
      expect(response.audit!.staleFields).toEqual([]);
      expect(response.audit!.refreshRequired).toEqual([]);
      expect(response.audit!.refreshPerformed).toEqual([]);
      expect(response.audit!.finalCorrect).toBe(true);
      expect(response.audit!.unsupportedClaims).toBe(0);
    });

    it('should track latency', async () => {
      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'chequea CPU');

      expect(response.audit!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(response.audit!.latencyMs).toBeLessThan(10000); // Should be fast
    });

    it('should track context size', async () => {
      const adapter = createMockAdapter();
      const response = await diagnose(adapter, 'chequea CPU');

      expect(response.audit!.contextBytes).toBeGreaterThan(0);
    });
  });
});
