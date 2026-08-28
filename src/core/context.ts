// Buffy Next — Context Package Builder
// Transforms DoctorReport into a stable BuffyContext for external consumers

import type { DoctorReport, BuffyContext, HardwareField } from './types.js';

const BUFFY_VERSION = '0.1.0';

/**
 * Build a BuffyContext from a DoctorReport.
 *
 * This is a pure transformation — no side effects, no platform calls.
 * The DoctorReport is already the result of adapter.detect() + systemInfo() + capabilities().
 *
 * Rules:
 *  - null = data not available (never invent 0, "", or defaults)
 *  - tools[].available = functional/usable, not just binary found
 *  - os_version ≠ kernel (separated explicitly)
 */
export function buildContext(report: DoctorReport): BuffyContext {
  return {
    schema: 'buffy.context/v1',
    buffy_version: BUFFY_VERSION,
    generated_at: report.generatedAt,

    platform: {
      os: report.platform.name,
      os_name: report.platform.os,
      os_version: normalizeOsVersion(report),
      kernel: extractKernel(report),
      architecture: report.platform.arch,
    },

    hardware: {
      cpu: hwField(report.system.cpu.model, 'string', report),
      cpu_cores: report.system.cpu.cores || null,
      ram_gb: hwField(report.system.memory.totalGB, 'GB', report),
      ram_available_gb: hwField(report.system.memory.availableGB, 'GB', report),
      gpu: hwField(report.system.gpu.name, 'string', report),
      gpu_driver: hwField(report.system.gpu.driver, 'string', report),
      gpu_is_generic: hwField(report.system.gpu.isGeneric, 'boolean', report),
      storage: report.system.storage.map((d) => ({
        mount: d.mount,
        total_gb: d.totalGB,
        free_gb: d.freeGB,
        used_percent: d.usedPercent,
      })),
      temperature_c: hwField(report.system.temperature?.cpuCelsius ?? null, '°C', report),
      process_groups: report.system.processGroups?.map(g => ({
        name: g.name,
        count: g.processCount,
        total_memory_mb: g.totalMemoryMB,
      })) ?? undefined,
    },

    environment: {
      shell: detectShell(report.platform.name),
      node_version: findToolVersion(report, 'Node.js'),
    },

    tools: report.capabilities.map((c) => ({
      name: c.name,
      available: c.status === 'installed',
      version: c.version ?? null,
    })),

    privileges: {
      shell: report.privileges?.shell ?? false,
      shizuku: report.privileges?.shizuku ?? false,
      root: report.privileges?.root ?? false,
      adb: report.privileges?.adb ?? false,
    },
  };
}

/**
 * Normalize OS version string.
 *
 * Platform-specific:
 *  - Linux: adapter.version is often the kernel (e.g. "6.18.42-1-lts"), NOT the OS version.
 *    The OS name ("EndeavourOS") already identifies the distro. Return null.
 *  - Windows: adapter.version IS the OS version (e.g. "10.0.19045"). Return it.
 *  - Android: adapter.version IS the Android version (e.g. "13"). Return it.
 */
function normalizeOsVersion(report: DoctorReport): string | null {
  const version = report.platform.version;
  if (!version) return null;

  // Linux: version field contains kernel, not OS version
  if (report.platform.name === 'linux') {
    return null;
  }

  // Windows / Android: version IS the OS version
  return version || null;
}

/**
 * Extract kernel version from the report.
 *
 * Platform-specific logic:
 *  - Linux: adapter.version may be the kernel (e.g. "6.18.42-1-lts")
 *  - Windows: adapter.version is OS build ("10.0.19045"), not kernel
 *  - Android: adapter.version is Android version ("13"), not kernel
 */
function extractKernel(report: DoctorReport): string | null {
  const version = report.platform.version;
  if (!version) return null;

  // Only Linux adapters embed kernel version in os.version
  if (report.platform.name === 'linux') {
    if (/^\d+\.\d+/.test(version)) {
      return version;
    }
  }

  return null;
}

/**
 * Detect the current shell based on platform and environment.
 */
function detectShell(platformName: string): string | null {
  if (platformName === 'windows') return 'powershell';

  // For Linux/Android, check environment
  const shell = process.env.SHELL;
  if (shell) {
    const shellName = shell.split('/').pop();
    return shellName || null;
  }

  return null;
}

/**
 * Find a tool's version from capabilities list.
 */
function findToolVersion(report: DoctorReport, toolName: string): string | null {
  const tool = report.capabilities.find(
    (c) => c.name === toolName && c.status === 'installed',
  );
  return tool?.version ?? null;
}

/**
 * Wrap a primitive value into a HardwareField object.
 * Uses the report's generatedAt as observedAt (per-field timestamps
 * are not yet available from adapters — this preserves runtime behavior
 * while satisfying the HardwareField type).
 */
function hwField(
  value: number | string | boolean | null | undefined,
  unit: string,
  report: DoctorReport,
): HardwareField | null {
  // Treat null, undefined, and empty string as unknown
  if (value == null || value === '') {
    return { value: null, unit, observedAt: report.generatedAt, ageMs: 0, freshness: 'unknown', source: 'DoctorReport' };
  }
  return { value, unit, observedAt: report.generatedAt, ageMs: 0, freshness: 'observed', source: 'DoctorReport' };
}
