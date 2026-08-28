import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { diagnose } from '../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../src/core/freshness.js';
import type { CheckResult, PlatformAdapter, SystemInfo, PlatformInfo, Capability } from '../src/core/types.js';

// ─── Mock Adapters ─────────────────────────────────────────

function createLinuxAdapter(): PlatformAdapter {
  return {
    name: 'linux',
    detect: async () => ({
      name: 'linux' as const,
      os: 'EndeavourOS',
      version: '6.18.42-1-lts',
      arch: 'x86_64',
    }),
    systemInfo: async () => ({
      os: { name: 'EndeavourOS', version: '6.18.42-1-lts', arch: 'x86_64' },
      cpu: { model: 'AMD Ryzen 5 3400G', cores: 4, usage: 45 },
      memory: { totalGB: 15.3, availableGB: 8.2, usedPercent: 46 },
      gpu: { name: 'AMD/ATI Renoir', driver: 'amdgpu', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 42 },
      processes: [
        { pid: 1, name: 'systemd', cpuPercent: 0.1, memoryMB: 12 },
        { pid: 2, name: 'node', cpuPercent: 2.5, memoryMB: 128 },
      ],
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    }),
    capabilities: async () => [
      { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
      { name: 'git', status: 'installed', version: '2.55.0' },
    ],
  };
}

function createWindowsAdapter(): PlatformAdapter {
  return {
    name: 'windows',
    detect: async () => ({
      name: 'windows' as const,
      os: 'Microsoft Windows 11 Pro',
      version: '10.0.22631',
      arch: 'x64',
    }),
    systemInfo: async () => ({
      os: { name: 'Microsoft Windows 11 Pro', version: '10.0.22631', arch: 'x64' },
      cpu: { model: 'Intel Core i7-12700K', cores: 12, usage: 35 },
      memory: { totalGB: 32.0, availableGB: 18.5, usedPercent: 42 },
      gpu: { name: 'NVIDIA GeForce RTX 3070', driver: '546.33', isGeneric: false },
      storage: [{ mount: 'C:', totalGB: 1000, freeGB: 450, usedPercent: 55 }],
      temperature: { cpuCelsius: 38 },
      processes: [
        { pid: 1, name: 'System', cpuPercent: 0.5, memoryMB: 24 },
        { pid: 2, name: 'chrome.exe', cpuPercent: 5.2, memoryMB: 512 },
      ],
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    }),
    capabilities: async () => [
      { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
      { name: 'PowerShell', status: 'installed', version: '5.1.22621' },
    ],
  };
}

function createAndroidAdapter(): PlatformAdapter {
  return {
    name: 'android-termux',
    detect: async () => ({
      name: 'android-termux' as const,
      os: 'Xiaomi Mi 10',
      version: '13',
      arch: 'aarch64',
    }),
    systemInfo: async () => ({
      os: { name: 'Android 13', version: 'TP1A.220624.014', arch: 'aarch64' },
      cpu: { model: 'Qualcomm Snapdragon 865', cores: 8, usage: null },
      memory: { totalGB: 8.0, availableGB: 4.5, usedPercent: 44 },
      gpu: { name: 'Adreno 650', driver: 'bundled', isGeneric: false },
      storage: [{ mount: '/data', totalGB: 256, freeGB: 120, usedPercent: 53 }],
      temperature: { cpuCelsius: 35 },
      processes: [
        { pid: 1, name: 'init', cpuPercent: 0, memoryMB: 8 },
        { pid: 2, name: 'com.android.systemui', cpuPercent: 1.2, memoryMB: 96 },
      ],
      privileges: { shell: true, shizuku: true, root: false, adb: true },
    }),
    capabilities: async () => [
      { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
      { name: 'ADB', status: 'installed', version: '34.0.4' },
    ],
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Cross-Platform Validation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Linux Baseline', () => {
    it('should produce valid observations with provenance', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createLinuxAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      // Should have observations
      expect(response.observations.length).toBeGreaterThan(0);

      // Each observation should have provenance
      for (const obs of response.observations) {
        expect(obs.observedAt).toBeDefined();
        expect(obs.source).toBeDefined();
        expect(new Date(obs.observedAt!)).toBeInstanceOf(Date);
      }
    });

    it('should have correct audit trail', async () => {
      const adapter = createLinuxAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('chequea RAM');
      expect(response.audit!.selectedFields).toContain('ram');
      expect(response.audit!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(response.audit!.finalCorrect).toBe(true);
    });

    it('should detect all hardware fields', async () => {
      const adapter = createLinuxAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      // Should select relevant checks
      expect(response.selection.checks).toContain('cpu');
      expect(response.selection.checks).toContain('ram');
      expect(response.selection.checks).toContain('gpu');
      expect(response.selection.checks).toContain('temperature');
      expect(response.selection.checks).toContain('processes');
    });
  });

  describe('Windows Adapter', () => {
    it('should produce valid observations with provenance', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createWindowsAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      // Should have observations
      expect(response.observations.length).toBeGreaterThan(0);

      // Each observation should have provenance
      for (const obs of response.observations) {
        expect(obs.observedAt).toBeDefined();
        expect(obs.source).toBeDefined();
      }
    });

    it('should have correct audit trail', async () => {
      const adapter = createWindowsAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('chequea RAM');
      expect(response.audit!.selectedFields).toContain('ram');
      expect(response.audit!.finalCorrect).toBe(true);
    });

    it('should detect all hardware fields', async () => {
      const adapter = createWindowsAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      expect(response.selection.checks).toContain('cpu');
      expect(response.selection.checks).toContain('ram');
      expect(response.selection.checks).toContain('gpu');
      expect(response.selection.checks).toContain('temperature');
      expect(response.selection.checks).toContain('processes');
    });
  });

  describe('Android/Termux Adapter', () => {
    it('should produce valid observations with provenance', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createAndroidAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      // Should have observations
      expect(response.observations.length).toBeGreaterThan(0);

      // Each observation should have provenance
      for (const obs of response.observations) {
        expect(obs.observedAt).toBeDefined();
        expect(obs.source).toBeDefined();
      }
    });

    it('should have correct audit trail', async () => {
      const adapter = createAndroidAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('chequea RAM');
      expect(response.audit!.selectedFields).toContain('ram');
      expect(response.audit!.finalCorrect).toBe(true);
    });

    it('should handle UNKNOWN gracefully', async () => {
      const adapter = createAndroidAdapter();
      const response = await diagnose(adapter, 'chequea red');

      // Network might not be fully observable
      expect(response.observability).toBeDefined();
    });
  });

  describe('Freshness Cross-Platform', () => {
    it('should classify fresh observations correctly on Linux', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createLinuxAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      for (const obs of response.observations) {
        if (obs.observedAt) {
          const ageMs = calculateAgeMs(obs.observedAt);
          expect(ageMs).toBeLessThan(1000); // Less than 1 second old
        }
      }
    });

    it('should classify fresh observations correctly on Windows', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createWindowsAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      for (const obs of response.observations) {
        if (obs.observedAt) {
          const ageMs = calculateAgeMs(obs.observedAt);
          expect(ageMs).toBeLessThan(1000);
        }
      }
    });

    it('should classify fresh observations correctly on Android', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const adapter = createAndroidAdapter();
      const response = await diagnose(adapter, 'chequea RAM');

      for (const obs of response.observations) {
        if (obs.observedAt) {
          const ageMs = calculateAgeMs(obs.observedAt);
          expect(ageMs).toBeLessThan(1000);
        }
      }
    });

    it('should detect staleness correctly', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      // Create observation from 5 minutes ago (stale for memory: 30s threshold)
      const staleObs: CheckResult = {
        id: 'ram-status',
        category: 'RAM',
        severity: 'warning',
        message: 'RAM: 8 GB disponibles (50% usado)',
        observedAt: '2026-08-28T11:55:00.000Z',
        source: 'LinuxAdapter.systemInfo.memory',
      };

      const state = classifyEpistemicState(staleObs.observedAt!, 'memory');
      expect(state).toBe('stale');
    });
  });

  describe('Audit Trail Cross-Platform', () => {
    it('should include all required fields on Linux', async () => {
      const adapter = createLinuxAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('Mi PC está lenta');
      expect(Array.isArray(response.audit!.selectedFields)).toBe(true);
      expect(Array.isArray(response.audit!.staleFields)).toBe(true);
      expect(Array.isArray(response.audit!.refreshRequired)).toBe(true);
      expect(Array.isArray(response.audit!.refreshPerformed)).toBe(true);
      expect(typeof response.audit!.toolCalls).toBe('number');
      expect(typeof response.audit!.contextBytes).toBe('number');
      expect(typeof response.audit!.latencyMs).toBe('number');
      expect(typeof response.audit!.finalCorrect).toBe('boolean');
      expect(typeof response.audit!.unsupportedClaims).toBe('number');
    });

    it('should include all required fields on Windows', async () => {
      const adapter = createWindowsAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('Mi PC está lenta');
      expect(Array.isArray(response.audit!.selectedFields)).toBe(true);
      expect(typeof response.audit!.contextBytes).toBe('number');
      expect(typeof response.audit!.latencyMs).toBe('number');
    });

    it('should include all required fields on Android', async () => {
      const adapter = createAndroidAdapter();
      const response = await diagnose(adapter, 'Mi PC está lenta');

      expect(response.audit).toBeDefined();
      expect(response.audit!.query).toBe('Mi PC está lenta');
      expect(Array.isArray(response.audit!.selectedFields)).toBe(true);
      expect(typeof response.audit!.contextBytes).toBe('number');
      expect(typeof response.audit!.latencyMs).toBe('number');
    });
  });

  describe('Cross-Platform Comparison', () => {
    it('should produce semantically equivalent results for same query', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

      const linuxAdapter = createLinuxAdapter();
      const windowsAdapter = createWindowsAdapter();
      const androidAdapter = createAndroidAdapter();

      const linuxResponse = await diagnose(linuxAdapter, 'chequea RAM');
      const windowsResponse = await diagnose(windowsAdapter, 'chequea RAM');
      const androidResponse = await diagnose(androidAdapter, 'chequea RAM');

      // All should select RAM check
      expect(linuxResponse.selection.checks).toContain('ram');
      expect(windowsResponse.selection.checks).toContain('ram');
      expect(androidResponse.selection.checks).toContain('ram');

      // All should have observations
      expect(linuxResponse.observations.length).toBeGreaterThan(0);
      expect(windowsResponse.observations.length).toBeGreaterThan(0);
      expect(androidResponse.observations.length).toBeGreaterThan(0);

      // All should have audit trails
      expect(linuxResponse.audit).toBeDefined();
      expect(windowsResponse.audit).toBeDefined();
      expect(androidResponse.audit).toBeDefined();
    });

    it('should handle platform-specific capabilities', async () => {
      const linuxAdapter = createLinuxAdapter();
      const windowsAdapter = createWindowsAdapter();
      const androidAdapter = createAndroidAdapter();

      const linuxCaps = await linuxAdapter.capabilities();
      const windowsCaps = await windowsAdapter.capabilities();
      const androidCaps = await androidAdapter.capabilities();

      // Linux should have git
      expect(linuxCaps.some(c => c.name === 'git')).toBe(true);

      // Windows should have PowerShell
      expect(windowsCaps.some(c => c.name === 'PowerShell')).toBe(true);

      // Android should have ADB
      expect(androidCaps.some(c => c.name === 'ADB')).toBe(true);
    });
  });
});
