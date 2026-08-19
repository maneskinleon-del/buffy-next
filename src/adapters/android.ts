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
  PlatformCapabilities,
} from '../core/types.js';

function sh(command: string, extraEnv?: Record<string, string>): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH ?? '', ...extraEnv },
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

  /** Detect platform-level privileges (Shell / Shizuku / Root / ADB) */
  async detectPrivileges(): Promise<PlatformCapabilities> {
    // Shell: verify with a safe read-only command
    const shell = !!sh('id 2>/dev/null');

    // Shizuku: check if rish binary is available and Shizuku service responds
    // rish requires RISH_APPLICATION_ID (Termux package name) to authenticate
    const rishPath = sh('command -v rish 2>/dev/null');
    let shizuku = false;
    if (rishPath) {
      const rishEnv = { RISH_APPLICATION_ID: process.env.RISH_APPLICATION_ID ?? 'com.termux' };
      const rishTest = sh('rish -c "id" 2>/dev/null', rishEnv);
      shizuku = rishTest.includes('uid=');
    }

    // Root: check su binary and actual root access
    const suPath = sh('command -v su 2>/dev/null');
    let root = false;
    if (suPath) {
      const rootTest = sh('su -c "id" 2>/dev/null');
      root = rootTest.includes('uid=0');
    }

    // ADB: check if adb binary exists and device is connected
    const adbPath = sh('command -v adb 2>/dev/null');
    let adb = false;
    if (adbPath) {
      const devices = sh('adb devices 2>/dev/null');
      // Match actual device lines: "<serial>\tdevice" (not the header)
      adb = /^\S+\tdevice$/m.test(devices);
    }

    return { shell, shizuku, root, adb };
  }

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
    const totalKB = parseInt(memRaw.match(/^MemTotal:\s+(\d+)/m)?.[1] ?? '0', 10);
    // MemAvailable may not exist on older kernels; fall back to MemFree
    let availKB = parseInt(memRaw.match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? '0', 10);
    if (!availKB) {
      availKB = parseInt(memRaw.match(/^MemFree:\s+(\d+)/m)?.[1] ?? '0', 10);
    }
    const totalGB = Math.round((totalKB / 1048576) * 10) / 10;
    const availableGB = Math.round((availKB / 1048576) * 10) / 10;

    // GPU — try multiple sources: ADB dumpsys, getprop, or local GL renderer
    // Pattern anchored to lines starting with 'GLES:' to avoid matching
    // unrelated strings like SingleSuppressCallback that contain 'GLES' as substring
    const gpuRaw = adbShell('dumpsys SurfaceFlinger 2>/dev/null | grep -i "^ *GLES:" | head -1');
    const gpuName = gpuRaw.replace(/^\s*GLES:\s*/, '')
      || sh('getprop ro.hardware.egl')
      || sh('getprop ro.board.platform')
      || 'Unknown GPU';

    // Temperature from thermal zones
    const thermalRaw = sh('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5');
    const temps = thermalRaw.split('\n').map(Number).filter((n) => n > 0);
    const avgTemp = temps.length > 0
      ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length / 1000)
      : 0;

    // Storage — df /data outputs 1K-blocks (df -BM may not work on Termux)
    let storageTotalKB = 0;
    let storageUsedKB = 0;
    let storageFreeKB = 0;
    // Primary: df /data (1K-blocks)
    const dfRaw = sh('df /data 2>/dev/null | tail -1');
    const dfParts = dfRaw.split(/\s+/).filter(Boolean);
    if (dfParts.length >= 4) {
      // Columns: Filesystem 1K-blocks Used Available Use% Mounted
      storageTotalKB = parseInt(dfParts[1] ?? '', 10) || 0;
      storageUsedKB = parseInt(dfParts[2] ?? '', 10) || 0;
      storageFreeKB = parseInt(dfParts[3] ?? '', 10) || 0;
    }
    // Fallback: stat -f /data (Blocks: Total: N Free: N Available: N)
    if (!storageTotalKB) {
      const statRaw = sh('stat -f /data 2>/dev/null');
      const totalBlocks = parseInt(statRaw.match(/Total:\s+(\d+)/)?.[1] ?? '', 10) || 0;
      const freeBlocks = parseInt(statRaw.match(/Free:\s+(\d+)/)?.[1] ?? '', 10) || 0;
      if (totalBlocks) {
        storageTotalKB = totalBlocks * 4; // 4KB block size
        storageFreeKB = freeBlocks * 4;
        storageUsedKB = storageTotalKB - storageFreeKB;
      }
    }

    // Processes — Termux `ps -A` columns: PID TTY TIME CMD (no RSS/CPU)
    const psRaw = sh('ps -A 2>/dev/null | head -20');
    const psLines = psRaw.split('\n').filter(Boolean);
    const processes = psLines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0] ?? '', 10);
      if (isNaN(pid) || pid === 0) return null; // skip header or invalid
      // ps -A columns: PID TTY TIME CMD
      // No RSS in default ps; read from /proc/[pid]/status
      let rssMB = 0;
      try {
        const status = sh(`cat /proc/${pid}/status 2>/dev/null | grep VmRSS`);
        const rssKB2 = parseInt(status.match(/VmRSS:\s+(\d+)/)?.[1] ?? '0', 10);
        rssMB = Math.round(rssKB2 / 1024);
      } catch { /* ignore */ }
      return {
        pid,
        name: parts[parts.length - 1] ?? 'unknown',
        cpuPercent: 0, // not available in default ps
        memoryMB: rssMB,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Detect platform-level privileges
    const privileges = await this.detectPrivileges();

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
          totalGB: Math.round((storageTotalKB / 1048576) * 10) / 10,
          freeGB: Math.round((storageFreeKB / 1048576) * 10) / 10,
          usedPercent: storageTotalKB > 0 ? Math.round((storageUsedKB / storageTotalKB) * 100) : 0,
        },
      ],
      temperature: { cpuCelsius: avgTemp },
      processes,
      privileges,
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
