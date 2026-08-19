// Buffy Next — Android/Termux Adapter
// Uses bash + ADB/Shizuku for system detection

import { execSync } from 'node:child_process';
import type {
  PlatformAdapter,
  PlatformInfo,
  SystemInfo,
  Capability,
  ActionDefinition,
  ActionResult,
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

function shJson<T>(command: string): T | null {
  const raw = sh(command);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function adbShell(command: string): string {
  return sh(`adb shell "${command}" 2>/dev/null`);
}

function adbShellJson<T>(command: string): T | null {
  const raw = adbShell(command);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Generic GPU patterns for Android (Mali, Adreno, PowerVR, etc.)
const MOBILE_GPU_VENDORS = ['Mali', 'Adreno', 'PowerVR', 'Vivante', 'Qualcomm', 'ARM', 'Apple'];

function isGenericGpu(name: string): boolean {
  if (!name) return true;
  return !MOBILE_GPU_VENDORS.some((v) => name.toLowerCase().includes(v.toLowerCase()));
}

export class AndroidTermuxAdapter implements PlatformAdapter {
  readonly name = 'android-termux';

  async detect(): Promise<PlatformInfo> {
    const model = sh('getprop ro.product.model');
    const version = sh('getprop ro.build.version.release');
    const arch = sh('getprop ro.product.cpu.abi');
    return {
      name: 'android-termux',
      os: model || 'Android (Termux)',
      version: version || 'unknown',
      arch: arch || process.arch,
    };
  }

  async systemInfo(): Promise<SystemInfo> {
    // CPU info from /proc/cpuinfo
    const cpuRaw = sh('head -20 /proc/cpuinfo');
    const cpuModelMatch = cpuRaw.match(/^model name\s*:\s*(.+)$/m) ?? cpuRaw.match(/^Hardware\s*:\s*(.+)$/m);
    const cpuModel = cpuModelMatch?.[1]?.trim() ?? 'Unknown CPU';
    const cpuCores = parseInt(sh('nproc') || '1', 10);

    // Memory from /proc/meminfo
    const memRaw = sh('cat /proc/meminfo 2>/dev/null');
    const totalKB = parseInt(memRaw.match(/^MemTotal:\s+(\d+)/)?.[1] ?? '0', 10);
    const availKB = parseInt(memRaw.match(/^MemAvailable:\s+(\d+)/)?.[1] ?? '0', 10);
    const totalGB = Math.round((totalKB / 1048576) * 10) / 10;
    const availableGB = Math.round((availKB / 1048576) * 10) / 10;

    // GPU via ADB dumpsys
    const gpuName = adbShell('dumpsys SurfaceFlinger 2>/dev/null | grep -i "GLES" | head -1')
      .replace(/^GLES:\s*/, '')
      || sh('getprop ro.hardware.egl') || 'Unknown GPU';

    // Temperature from thermal zones
    const thermalRaw = sh('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5');
    const temps = thermalRaw.split('\n').map(Number).filter((n) => n > 0);
    const avgTemp = temps.length > 0
      ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length / 1000)
      : 0;

    // Storage
    const dfRaw = sh("df -BM /data 2>/dev/null | tail -1");
    const dfParts = dfRaw.split(/\s+/);
    const storageTotalMB = parseInt(dfParts[1] ?? '0', 10);
    const storageUsedMB = parseInt(dfParts[2] ?? '0', 10);
    const storageFreeMB = parseInt(dfParts[3] ?? '0', 10);

    // Processes via ADB
    const psRaw = adbShell('ps -A -o PID,NAME,%CPU,RSS 2>/dev/null | head -20');
    const processes = psRaw.split('\n').filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0] ?? '0', 10),
        name: parts[1] ?? 'unknown',
        cpuPercent: parseFloat(parts[2] ?? '0'),
        memoryMB: Math.round((parseInt(parts[3] ?? '0', 10) * 1024) / 1048576),
      };
    });

    return {
      os: {
        name: `Android ${sh('getprop ro.build.version.release') || '?'}`,
        version: sh('getprop ro.build.display.id') || 'unknown',
        arch: sh('getprop ro.product.cpu.abi') || process.arch,
      },
      cpu: { model: cpuModel, cores: cpuCores },
      memory: {
        totalGB,
        availableGB,
        usedPercent: totalGB > 0 ? Math.round(((totalGB - availableGB) / totalGB) * 100) : 0,
      },
      gpu: { name: gpuName, driver: 'bundled', isGeneric: isGenericGpu(gpuName) },
      storage: [
        {
          mount: '/data',
          totalGB: Math.round((storageTotalMB / 1024) * 10) / 10,
          freeGB: Math.round((storageFreeMB / 1024) * 10) / 10,
          usedPercent: storageTotalMB > 0 ? Math.round((storageUsedMB / storageTotalMB) * 100) : 0,
        },
      ],
      temperature: { cpuCelsius: avgTemp },
      processes,
    };
  }

  async capabilities(): Promise<Capability[]> {
    const tools: Array<{ name: string; check: string; versionCmd?: string }> = [
      { name: 'Node.js', check: 'node', versionCmd: 'node --version' },
      { name: 'npm', check: 'npm', versionCmd: 'npm --version' },
      { name: 'ADB', check: 'adb', versionCmd: 'adb --version' },
      { name: 'Shizuku (rish)', check: 'rish', versionCmd: 'rish --version 2>/dev/null || echo active' },
      { name: 'pkg', check: 'pkg', versionCmd: 'pkg --version' },
      { name: 'git', check: 'git', versionCmd: 'git --version' },
      { name: 'Python', check: 'python', versionCmd: 'python --version' },
      { name: 'scrcpy', check: 'scrcpy', versionCmd: 'scrcpy --version 2>/dev/null' },
      { name: 'SQLite', check: 'sqlite3', versionCmd: 'sqlite3 --version' },
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

  async execute(action: ActionDefinition): Promise<ActionResult> {
    return action.execute();
  }
}
