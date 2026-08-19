// Buffy Next — Windows Adapter
// Uses PowerShell + WMI for system detection

import { execSync, execFileSync } from 'node:child_process';
import type {
  PlatformAdapter,
  PlatformInfo,
  SystemInfo,
  Capability,
  ActionDefinition,
  ActionResult,
} from '../core/types.js';

function ps(command: string): string {
  try {
    // Use execFileSync to avoid cmd.exe shell interpretation
    // which can break pipes (|) inside PowerShell commands
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf-8', timeout: 15_000 },
    ).trim();
  } catch {
    return '';
  }
}

function psJson<T>(command: string): T | null {
  const raw = ps(`${command} | ConvertTo-Json -Compress -Depth 1`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // ConvertTo-Json with single object returns {} not [{}]
    // Normalize to array for consistency with WmiVideoController[] etc.
    return (Array.isArray(parsed) ? parsed : [parsed]) as T;
  } catch {
    return null;
  }
}

interface WmiOs {
  Caption?: string;
  Version?: string;
  OSArchitecture?: string;
  CSName?: string;
}

interface WmiCpu {
  Name?: string;
  NumberOfCores?: number;
  NumberOfLogicalProcessors?: number;
}

interface WmiMemory {
  TotalVisibleMemorySize?: string;
  FreePhysicalMemory?: string;
}

interface WmiVideoController {
  Name?: string;
  DriverVersion?: string;
  AdapterRAM?: number;
}

interface WmiDisk {
  DeviceID?: string;
  Size?: string;
  FreeSpace?: string;
}

interface WmiTemp {
  CurrentTemperature?: number;
}

interface WmiProcess {
  ProcessId?: number;
  Name?: string;
  WorkingSetSize?: number;
}

const GENERIC_GPU_PATTERNS = [
  'Microsoft Basic Display',
  'Microsoft Basic Render',
  'Standard VGA',
  'Microsoft Teredo',
];

function isGenericGpu(name: string): boolean {
  return GENERIC_GPU_PATTERNS.some((p) => name.toLowerCase().includes(p.toLowerCase()));
}

export class WindowsAdapter implements PlatformAdapter {
  readonly name = 'windows';

  async detect(): Promise<PlatformInfo> {
    const os = psJson<WmiOs>(
      'Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture',
    );
    return {
      name: 'windows',
      os: os?.Caption ?? 'Windows',
      version: os?.Version ?? 'unknown',
      arch: os?.OSArchitecture ?? process.arch,
    };
  }

  async systemInfo(): Promise<SystemInfo> {
    const [osData, cpuData, memData, gpuData, disks, temps, procs] = await Promise.all([
      psJson<WmiOs>(
        'Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture',
      ),
      psJson<WmiCpu>(
        'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors',
      ),
      psJson<WmiMemory>(
        'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory',
      ),
      psJson<WmiVideoController[]>(
        'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM',
      ),
      psJson<WmiDisk[]>(
        'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace',
      ),
      psJson<WmiTemp>(
        'Get-CimInstance MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1 CurrentTemperature',
      ),
      psJson<WmiProcess[]>(
        'Get-CimInstance Win32_Process | Sort-Object WorkingSetSize -Descending | Select-Object -First 20 ProcessId,Name,WorkingSetSize',
      ),
    ]);

    const totalMemKB = parseInt(memData?.TotalVisibleMemorySize ?? '0', 10);
    const freeMemKB = parseInt(memData?.FreePhysicalMemory ?? '0', 10);
    const totalGB = Math.round((totalMemKB / 1048576) * 10) / 10;
    const availableGB = Math.round((freeMemKB / 1048576) * 10) / 10;

    const primaryGpu = gpuData?.[0];
    const gpuName = primaryGpu?.Name ?? 'Unknown GPU';
    const gpuDriver = primaryGpu?.DriverVersion ?? 'unknown';

    const storageDevices = (disks ?? []).map((d) => {
      const total = parseInt(d.Size ?? '0', 10);
      const free = parseInt(d.FreeSpace ?? '0', 10);
      const totalGB = Math.round((total / 1073741824) * 10) / 10;
      const freeGB = Math.round((free / 1073741824) * 10) / 10;
      return {
        mount: d.DeviceID ?? '/',
        totalGB,
        freeGB,
        usedPercent: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
      };
    });

    // WMI returns tenths of Kelvin — explicit null check (0 is not absence)
    const rawTemp = temps?.CurrentTemperature;
    const cpuCelsius = rawTemp != null
      ? Math.round((rawTemp / 10) - 273.15)
      : null;

    const processes = (procs ?? []).map((p) => ({
      pid: p.ProcessId ?? 0,
      name: p.Name ?? 'unknown',
      cpuPercent: 0, // WMI doesn't provide real-time CPU% easily
      memoryMB: Math.round((p.WorkingSetSize ?? 0) / 1048576),
    }));

    return {
      os: {
        name: osData?.Caption ?? 'Windows',
        version: osData?.Version ?? 'unknown',
        arch: osData?.OSArchitecture ?? process.arch,
      },
      cpu: {
        model: cpuData?.Name ?? 'Unknown CPU',
        cores: cpuData?.NumberOfCores ?? 0,
      },
      memory: { totalGB, availableGB, usedPercent: totalGB > 0 ? Math.round(((totalGB - availableGB) / totalGB) * 100) : 0 },
      gpu: { name: gpuName, driver: gpuDriver, isGeneric: isGenericGpu(gpuName) },
      storage: storageDevices,
      temperature: { cpuCelsius: cpuCelsius ?? 0 },
      processes,
    };
  }

  async capabilities(): Promise<Capability[]> {
    const tools: Array<{ name: string; check: string; versionCmd?: string }> = [
      { name: 'Node.js', check: 'node', versionCmd: 'node --version' },
      { name: 'npm', check: 'npm', versionCmd: 'npm --version' },
      { name: 'PowerShell', check: 'powershell', versionCmd: '$PSVersionTable.PSVersion.ToString()' },
      { name: 'winget', check: 'winget', versionCmd: 'winget --version' },
      { name: 'git', check: 'git', versionCmd: 'git --version' },
      { name: 'Python', check: 'python', versionCmd: 'python --version' },
      { name: 'ADB', check: 'adb', versionCmd: 'adb --version' },
    ];

    return Promise.all(
      tools.map(async (tool) => {
        const found = ps(`Get-Command ${tool.check} -ErrorAction SilentlyContinue`);
        if (!found) return { name: tool.name, status: 'missing' as const };

        const version = tool.versionCmd ? ps(tool.versionCmd) : undefined;
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
