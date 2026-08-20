import { describe, it, expect } from 'vitest';
import { buildContext } from '../src/core/context.js';
import type { DoctorReport, BuffyContext } from '../src/core/types.js';

// ─── Mock DoctorReport ──────────────────────────────────────

function makeReport(overrides?: Partial<DoctorReport>): DoctorReport {
  return {
    platform: {
      name: 'linux',
      os: 'EndeavourOS',
      version: '6.18.42-1-lts',
      arch: 'x86_64',
    },
    system: {
      os: { name: 'EndeavourOS', version: '6.18.42-1-lts', arch: 'x86_64' },
      cpu: { model: 'AMD Ryzen 5 3400G', cores: 4, usage: null },
      memory: { totalGB: 13.0, availableGB: 5.2, usedPercent: 60 },
      gpu: { name: 'AMD Ryzen 5 3400G with Radeon Vega Graphics', driver: 'amdgpu', isGeneric: false },
      storage: [{ mount: '/', totalGB: 476.9, freeGB: 182.3, usedPercent: 62 }],
      temperature: { cpuCelsius: 54 },
      processes: [],
    },
    capabilities: [
      { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
      { name: 'npm', status: 'installed', version: '12.0.2' },
      { name: 'git', status: 'installed', version: 'git version 2.55.0' },
      { name: 'PowerShell', status: 'missing' },
    ],
    privileges: { shell: true, shizuku: false, root: false, adb: false },
    items: [],
    timestamp: '2026-08-19T15:00:00.000Z',
    ...overrides,
  };
}

// ─── Schema ─────────────────────────────────────────────────

describe('Context Package — schema', () => {
  it('should have schema field = "buffy.context/v1"', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.schema).toBe('buffy.context/v1');
  });

  it('should have buffy_version as a semver string', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.buffy_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have generated_at as ISO 8601', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.generated_at).toBe('2026-08-19T15:00:00.000Z');
  });
});

// ─── Required top-level fields ──────────────────────────────

describe('Context Package — required fields', () => {
  it('should have all top-level sections', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.platform).toBeDefined();
    expect(ctx.hardware).toBeDefined();
    expect(ctx.environment).toBeDefined();
    expect(ctx.tools).toBeDefined();
    expect(ctx.privileges).toBeDefined();
  });

  it('should have all platform sub-fields', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.platform.os).toBeDefined();
    expect(ctx.platform.os_name).toBeDefined();
    expect('os_version' in ctx.platform).toBe(true);
    expect('kernel' in ctx.platform).toBe(true);
    expect(ctx.platform.architecture).toBeDefined();
  });

  it('should have all hardware sub-fields', () => {
    const ctx = buildContext(makeReport());
    expect('cpu' in ctx.hardware).toBe(true);
    expect('cpu_cores' in ctx.hardware).toBe(true);
    expect('ram_gb' in ctx.hardware).toBe(true);
    expect('ram_available_gb' in ctx.hardware).toBe(true);
    expect('gpu' in ctx.hardware).toBe(true);
    expect('gpu_driver' in ctx.hardware).toBe(true);
    expect('gpu_is_generic' in ctx.hardware).toBe(true);
    expect(ctx.hardware.storage).toBeDefined();
    expect('temperature_c' in ctx.hardware).toBe(true);
  });

  it('should have all privileges sub-fields', () => {
    const ctx = buildContext(makeReport());
    expect(typeof ctx.privileges.shell).toBe('boolean');
    expect(typeof ctx.privileges.shizuku).toBe('boolean');
    expect(typeof ctx.privileges.root).toBe('boolean');
    expect(typeof ctx.privileges.adb).toBe('boolean');
  });
});

// ─── Null handling (adjustment #2) ──────────────────────────

describe('Context Package — null for unavailable data', () => {
  it('should use null for missing GPU info', () => {
    const report = makeReport({
      system: {
        ...makeReport().system,
        gpu: { name: '', driver: '', isGeneric: true },
      },
    });
    const ctx = buildContext(report);
    // Empty string from adapter should become null in context
    expect(ctx.hardware.gpu).toBe(null);
    expect(ctx.hardware.gpu_driver).toBe(null);
  });

  it('should use null for missing temperature', () => {
    const report = makeReport({
      system: { ...makeReport().system, temperature: null },
    });
    const ctx = buildContext(report);
    expect(ctx.hardware.temperature_c).toBeNull();
  });

  it('should use null for missing OS version', () => {
    const report = makeReport({
      platform: { name: 'linux', os: 'Linux', version: '', arch: 'x64' },
    });
    const ctx = buildContext(report);
    expect(ctx.platform.os_version).toBeNull();
  });

  it('should use null for missing shell', () => {
    const originalShell = process.env.SHELL;
    delete process.env.SHELL;
    const ctx = buildContext(makeReport());
    expect(ctx.environment.shell).toBeNull();
    if (originalShell !== undefined) process.env.SHELL = originalShell;
  });

  it('should use null for missing tool versions', () => {
    const report = makeReport({
      capabilities: [
        { name: 'git', status: 'installed' }, // no version
      ],
    });
    const ctx = buildContext(report);
    const gitTool = ctx.tools.find((t) => t.name === 'git');
    expect(gitTool?.version).toBeNull();
  });

  it('should use 0/false for missing capabilities (not null)', () => {
    const report = makeReport({ capabilities: [], privileges: undefined });
    const ctx = buildContext(report);
    expect(ctx.tools).toEqual([]);
    // privileges defaults to all false when undefined
    expect(ctx.privileges.shell).toBe(false);
    expect(ctx.privileges.shizuku).toBe(false);
  });
});

// ─── Kernel separate from os_version (adjustment #1) ────────

describe('Context Package — kernel vs os_version', () => {
  it('should detect kernel version separately on Linux', () => {
    const report = makeReport({
      platform: { name: 'linux', os: 'EndeavourOS', version: '6.18.42-1-lts', arch: 'x86_64' },
    });
    const ctx = buildContext(report);
    // os_version should be the distro version, kernel should be extracted
    expect(ctx.platform.kernel).toBe('6.18.42-1-lts');
  });

  it('should set kernel to null when not a kernel version', () => {
    const report = makeReport({
      platform: { name: 'windows', os: 'Windows 10 LTSC', version: '10.0.19045', arch: 'x64' },
    });
    const ctx = buildContext(report);
    expect(ctx.platform.kernel).toBeNull();
    expect(ctx.platform.os_version).toBe('10.0.19045');
  });

  it('should handle Android version correctly', () => {
    const report = makeReport({
      platform: { name: 'android-termux', os: 'Xiaomi Mi 10', version: '13', arch: 'arm64-v8a' },
    });
    const ctx = buildContext(report);
    expect(ctx.platform.os_version).toBe('13');
    expect(ctx.platform.os_name).toBe('Xiaomi Mi 10');
  });
});

// ─── tools.available = functional (adjustment #3) ───────────

describe('Context Package — tools.available semantics', () => {
  it('should mark installed tools as available', () => {
    const report = makeReport({
      capabilities: [
        { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
        { name: 'git', status: 'installed', version: '2.55.0' },
      ],
    });
    const ctx = buildContext(report);
    expect(ctx.tools.every((t) => t.available === true)).toBe(true);
  });

  it('should mark missing tools as not available', () => {
    const report = makeReport({
      capabilities: [
        { name: 'PowerShell', status: 'missing' },
        { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
      ],
    });
    const ctx = buildContext(report);
    const ps = ctx.tools.find((t) => t.name === 'PowerShell');
    expect(ps?.available).toBe(false);
  });

  it('should include all tools, both available and unavailable', () => {
    const report = makeReport({
      capabilities: [
        { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
        { name: 'PowerShell', status: 'missing' },
        { name: 'ADB', status: 'installed' },
      ],
    });
    const ctx = buildContext(report);
    expect(ctx.tools.length).toBe(3);
  });

  it('should map unknown status to available=false', () => {
    const report = makeReport({
      capabilities: [
        { name: 'MysteryTool', status: 'unknown' },
      ],
    });
    const ctx = buildContext(report);
    expect(ctx.tools[0].available).toBe(false);
  });

  it('should preserve exact version string when present', () => {
    const report = makeReport({
      capabilities: [
        { name: 'ADB', status: 'installed', version: 'Android Debug Bridge version 1.0.41' },
      ],
    });
    const ctx = buildContext(report);
    expect(ctx.tools[0].version).toBe('Android Debug Bridge version 1.0.41');
  });
});

// ─── Determinism ────────────────────────────────────────────

describe('Context Package — determinism', () => {
  it('should produce identical output for identical input', () => {
    const report = makeReport();
    const ctx1 = buildContext(report);
    const ctx2 = buildContext(report);
    expect(ctx1).toEqual(ctx2);
  });

  it('should not mutate the input report', () => {
    const report = makeReport();
    const original = JSON.parse(JSON.stringify(report));
    buildContext(report);
    expect(report).toEqual(original);
  });

  it('should produce stable timestamps', () => {
    const report = makeReport({ timestamp: '2026-01-01T00:00:00.000Z' });
    const ctx = buildContext(report);
    expect(ctx.generated_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ─── Compatibility with existing outputs ────────────────────

describe('Context Package — compatibility', () => {
  it('should not affect DoctorReport structure', () => {
    const report = makeReport();
    // buildContext should not modify the report
    buildContext(report);
    expect(report.platform.name).toBe('linux');
    expect(report.system.cpu.model).toBe('AMD Ryzen 5 3400G');
    expect(report.items).toEqual([]);
  });

  it('should be valid JSON serializable', () => {
    const ctx = buildContext(makeReport());
    const json = JSON.stringify(ctx);
    const parsed = JSON.parse(json);
    expect(parsed.schema).toBe('buffy.context/v1');
  });

  it('should produce JSON without undefined values', () => {
    const ctx = buildContext(makeReport());
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('undefined');
  });

  it('should have correct storage mapping', () => {
    const ctx = buildContext(makeReport());
    expect(ctx.hardware.storage).toHaveLength(1);
    expect(ctx.hardware.storage[0]).toEqual({
      mount: '/',
      total_gb: 476.9,
      free_gb: 182.3,
      used_percent: 62,
    });
  });
});

// ─── Cross-platform shapes ──────────────────────────────────

describe('Context Package — cross-platform shapes', () => {
  it('should work with Windows adapter shape', () => {
    const report = makeReport({
      platform: { name: 'windows', os: 'Windows 10 LTSC', version: '10.0.19045', arch: 'x64' },
      system: {
        ...makeReport().system,
        os: { name: 'Windows 10 LTSC', version: '10.0.19045', arch: 'x64' },
        gpu: { name: 'NVIDIA GeForce GTX 1650', driver: '27.20.12029.1000', isGeneric: false },
        temperature: { cpuCelsius: 42 },
      },
      capabilities: [
        { name: 'Node.js', status: 'installed', version: 'v26.7.0' },
        { name: 'PowerShell', status: 'installed', version: '5.1.19041' },
        { name: 'winget', status: 'installed', version: '1.4.2113' },
      ],
      privileges: { shell: true, shizuku: false, root: false, adb: false },
    });
    const ctx = buildContext(report);
    expect(ctx.platform.os).toBe('windows');
    expect(ctx.platform.os_name).toBe('Windows 10 LTSC');
    expect(ctx.platform.os_version).toBe('10.0.19045');
    expect(ctx.platform.kernel).toBeNull();
    expect(ctx.hardware.gpu).toBe('NVIDIA GeForce GTX 1650');
    expect(ctx.hardware.gpu_is_generic).toBe(false);
  });

  it('should work with Android adapter shape', () => {
    const report = makeReport({
      platform: { name: 'android-termux', os: 'Xiaomi Mi 10', version: '13', arch: 'arm64-v8a' },
      system: {
        ...makeReport().system,
        os: { name: 'Android 13', version: '13', arch: 'arm64-v8a' },
        gpu: { name: 'Adreno 650', driver: 'bundled', isGeneric: false },
        temperature: { cpuCelsius: 38 },
      },
      capabilities: [
        { name: 'Node.js', status: 'installed', version: 'v20.11.0' },
        { name: 'ADB', status: 'installed' },
        { name: 'Shizuku (rish)', status: 'missing' },
      ],
      privileges: { shell: true, shizuku: false, root: false, adb: true },
    });
    const ctx = buildContext(report);
    expect(ctx.platform.os).toBe('android-termux');
    expect(ctx.platform.os_name).toBe('Xiaomi Mi 10');
    expect(ctx.platform.os_version).toBe('13');
    expect(ctx.privileges.shizuku).toBe(false);
    expect(ctx.privileges.adb).toBe(true);
    const shizuku = ctx.tools.find((t) => t.name === 'Shizuku (rish)');
    expect(shizuku?.available).toBe(false);
  });
});
