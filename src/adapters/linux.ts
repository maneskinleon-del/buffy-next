// Buffy Next — Linux Adapter
// Uses standard Linux tools: /proc, /sys, lspci, df, ps

import { execSync } from 'node:child_process';
import type {
  PlatformAdapter,
  PlatformInfo,
  SystemInfo,
  Capability,
  PlatformCapabilities,
} from '../core/types.js';

function sh(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH ?? '' },
    }).trim();
  } catch {
    return '';
  }
}

// ─── GPU detection ──────────────────────────────────────────

const GENERIC_LINUX_GPU = [
  'ASPEED', 'Matrox', 'VMware', 'VirtualBox', 'QXL',
  'Microsoft Basic', 'Cirrus', 'Bochs',
];

function isGenericLinuxGpu(name: string): boolean {
  return GENERIC_LINUX_GPU.some((p) => name.toLowerCase().includes(p.toLowerCase()));
}

function detectGpu(): { name: string | null; driver: string | null; isGeneric: boolean | null } {
  // Try lspci
  const lspciLine = sh('lspci 2>/dev/null | grep -i "vga\\|3d\\|display" | head -1');
  if (lspciLine) {
    // Extract GPU name: "07:00.0 VGA compatible controller: AMD/ATI Renoir" → "AMD/ATI Renoir"
    const nameMatch = lspciLine.match(/(?:VGA|3D|Display)(?:\s+compatible)?\s+controller:\s*(.+)$/i);
    const name = nameMatch?.[1]?.trim() ?? null;

    // Extract driver from lspci -k
    const driverLine = sh('lspci -k 2>/dev/null | grep -i "kernel driver" | head -1');
    const driverMatch = driverLine.match(/Kernel driver in use:\s*(.+)$/i);
    const driver = driverMatch?.[1]?.trim() ?? null;

    return {
      name,
      driver,
      isGeneric: name ? isGenericLinuxGpu(name) : null,
    };
  }

  // Fallback: /sys/class/drm
  const vendor = sh('cat /sys/class/drm/card0/device/vendor 2>/dev/null');
  if (vendor) {
    const name = `vendor:${vendor}`;
    const driverPath = sh('readlink /sys/class/drm/card0/device/driver 2>/dev/null');
    const driver = driverPath?.split('/').pop() ?? null;
    return { name, driver, isGeneric: false };
  }

  // Both failed → null (NOT "Unknown GPU")
  return { name: null, driver: null, isGeneric: null };
}

// ─── Temperature detection ──────────────────────────────────

function detectTemperature(): number | null {
  // Try /sys/class/thermal
  const thermalRaw = sh('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1');
  if (thermalRaw) {
    const temp = parseInt(thermalRaw, 10);
    if (!isNaN(temp) && temp > 0) return Math.round(temp / 1000);
  }

  // Try lm-sensors
  const sensorsRaw = sh('sensors -j 2>/dev/null');
  if (sensorsRaw) {
    try {
      const data = JSON.parse(sensorsRaw);
      // Look for coretemp or k10temp
      for (const chip of Object.values(data) as Record<string, unknown>[]) {
        if (typeof chip !== 'object' || chip === null) continue;
        const entries = chip as Record<string, { input?: number }>;
        for (const [key, val] of Object.entries(entries)) {
          if (key.endsWith('_input') && typeof val === 'object' && val !== null && 'input' in val) {
            const input = (val as { input: number }).input;
            if (typeof input === 'number' && input > 0) {
              return Math.round(input);
            }
          }
        }
      }
    } catch {
      // JSON parse failed
    }
  }

  // Both failed → null (NOT 0)
  return null;
}

// ─── CPU detection ──────────────────────────────────────────

function detectCpu(): { model: string | null; cores: number } {
  // Try /proc/cpuinfo
  const cpuinfo = sh('cat /proc/cpuinfo 2>/dev/null');
  const modelMatch = cpuinfo.match(/^model name\s*:\s*(.+)$/m);
  const model = modelMatch?.[1]?.trim() ?? null;

  // Cores: nproc is most reliable
  const nproc = sh('nproc');
  const cores = parseInt(nproc, 10) || 1;

  return { model, cores };
}

// ─── Memory detection ───────────────────────────────────────

function detectMemory(): { totalGB: number | null; availableGB: number | null } {
  const meminfo = sh('cat /proc/meminfo 2>/dev/null');

  const totalKB = parseInt(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1] ?? '0', 10);
  let availKB = parseInt(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? '0', 10);

  // Fallback: MemFree if MemAvailable not present
  if (!availKB) {
    availKB = parseInt(meminfo.match(/^MemFree:\s+(\d+)/m)?.[1] ?? '0', 10);
  }

  return {
    totalGB: totalKB ? Math.round((totalKB / 1048576) * 10) / 10 : null,
    availableGB: availKB ? Math.round((availKB / 1048576) * 10) / 10 : null,
  };
}

// ─── Storage detection ──────────────────────────────────────

function detectStorage(): Array<{ mount: string; totalGB: number; freeGB: number; usedPercent: number }> {
  const dfRaw = sh('df -BM / 2>/dev/null | tail -1');
  const parts = dfRaw.split(/\s+/).filter(Boolean);

  if (parts.length >= 4) {
    const totalMB = parseInt(parts[1] ?? '', 10) || 0;
    const availMB = parseInt(parts[3] ?? '', 10) || 0;
    const usedPercent = parseInt(parts[4]?.replace('%', '') ?? '', 10) || 0;

    if (totalMB > 0) {
      return [{
        mount: '/',
        totalGB: Math.round((totalMB / 1024) * 10) / 10,
        freeGB: Math.round((availMB / 1024) * 10) / 10,
        usedPercent,
      }];
    }
  }

  return [];
}

// ─── Process detection ──────────────────────────────────────

function detectProcesses(): Array<{ pid: number; name: string; cpuPercent: number; memoryMB: number }> {
  const psRaw = sh('ps aux --sort=-%mem 2>/dev/null | head -21');
  const lines = psRaw.split('\n').slice(1); // skip header

  return lines.map((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parseInt(parts[1] ?? '', 10);
    if (isNaN(pid) || pid === 0) return null;

    return {
      pid,
      name: parts[10] ?? 'unknown',
      cpuPercent: parseFloat(parts[2] ?? '0') || 0,
      memoryMB: Math.round((parseFloat(parts[5] ?? '0') || 0) / 1024),
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null);
}

// ─── LinuxAdapter ───────────────────────────────────────────

export class LinuxAdapter implements PlatformAdapter {
  readonly name = 'linux';

  async detect(): Promise<PlatformInfo> {
    // OS name from /etc/os-release
    const osRelease = sh('cat /etc/os-release 2>/dev/null');
    const prettyLine = osRelease.split('\n').find((l) => l.startsWith('PRETTY_NAME='));
    const nameLine = osRelease.split('\n').find((l) => l.startsWith('NAME='));
    const nameMatch = prettyLine?.split('=')[1] ?? nameLine?.split('=')[1];
    const osName = nameMatch?.replace(/["']/g, '').trim() ?? 'Linux';

    // Kernel (put in version field — context.ts extracts it for Linux)
    const kernel = sh('uname -r') || null;

    // Architecture
    const arch = sh('uname -m') || process.arch;

    return {
      name: 'linux',
      os: osName,
      version: kernel ?? 'unknown',
      arch,
    };
  }

  async systemInfo(): Promise<SystemInfo> {
    const cpu = detectCpu();
    const mem = detectMemory();
    const gpu = detectGpu();
    const storage = detectStorage();
    const temperature = detectTemperature();
    const processes = detectProcesses();

    // OS name from /etc/os-release
    const osRelease = sh('cat /etc/os-release 2>/dev/null');
    const prettyLine = osRelease.split('\n').find((l) => l.startsWith('PRETTY_NAME='));
    const nameLine = osRelease.split('\n').find((l) => l.startsWith('NAME='));
    const osName = (prettyLine?.split('=')[1] ?? nameLine?.split('=')[1])?.replace(/["']/g, '').trim() ?? 'Linux';

    return {
      os: {
        name: osName,
        version: sh('uname -r') || 'unknown',
        arch: sh('uname -m') || process.arch,
      },
      cpu: {
        model: cpu.model ?? 'Unknown CPU',
        cores: cpu.cores,
      },
      memory: {
        totalGB: mem.totalGB ?? 0,
        availableGB: mem.availableGB ?? 0,
        usedPercent: mem.totalGB && mem.availableGB
          ? Math.round(((mem.totalGB - mem.availableGB) / mem.totalGB) * 100)
          : 0,
      },
      gpu: {
        name: gpu.name ?? 'Unknown GPU',
        driver: gpu.driver ?? 'unknown',
        isGeneric: gpu.isGeneric ?? true,
      },
      storage,
      temperature: temperature !== null ? { cpuCelsius: temperature } : null,
      processes,
      privileges: await this.detectPrivileges(),
    };
  }

  async detectPrivileges(): Promise<PlatformCapabilities> {
    // Shell: always true on Linux
    const shell = true;

    // Shizuku: always false on Linux
    const shizuku = false;

    // Root: check with id -u
    const uid = sh('id -u 2>/dev/null');
    const root = uid === '0';

    // ADB: check if adb binary exists and device is connected
    const adbPath = sh('command -v adb 2>/dev/null');
    let adb = false;
    if (adbPath) {
      const devices = sh('adb devices 2>/dev/null');
      adb = /^\S+\tdevice$/m.test(devices);
    }

    return { shell, shizuku, root, adb };
  }

  async capabilities(): Promise<Capability[]> {
    const tools: Array<{ name: string; check: string; versionCmd?: string }> = [
      { name: 'Node.js', check: 'node', versionCmd: 'node --version' },
      { name: 'npm', check: 'npm', versionCmd: 'npm --version' },
      { name: 'git', check: 'git', versionCmd: 'git --version' },
      { name: 'Python', check: 'python3', versionCmd: 'python3 --version' },
      { name: 'GCC', check: 'gcc', versionCmd: 'gcc --version' },
      { name: 'Make', check: 'make', versionCmd: 'make --version' },
      { name: 'Docker', check: 'docker', versionCmd: 'docker --version' },
      { name: 'ADB', check: 'adb', versionCmd: 'adb --version' },
      { name: 'curl', check: 'curl', versionCmd: 'curl --version' },
      { name: 'wget', check: 'wget', versionCmd: 'wget --version' },
    ];

    return Promise.all(
      tools.map(async (tool) => {
        const found = sh(`command -v ${tool.check} 2>/dev/null`);
        if (!found) return { name: tool.name, status: 'missing' as const };

        const version = tool.versionCmd ? sh(tool.versionCmd) : undefined;
        return {
          name: tool.name,
          status: 'installed' as const,
          version: version || undefined,
        };
      }),
    );
  }
}
