import { describe, it, expect } from 'vitest';

// ─── psJson / psJsonArray cardinality contracts ────────────
// These simulate the parsing logic in src/adapters/windows.ts
// to verify that single-object vs array contracts are respected.

/**
 * Single-object contract: returns parsed JSON as-is.
 * Mirrors psJson<T>() in windows.ts.
 */
function parseSingleObject<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Array contract: normalizes single objects to [object].
 * Mirrors psJsonArray<T>() in windows.ts.
 */
function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [parsed] as T[];
  } catch {
    return [];
  }
}

// ─── GPU parsing logic (extracted from WindowsAdapter for testability) ───

interface WmiVideoController {
  Name?: string;
  DriverVersion?: string;
  AdapterRAM?: number;
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

/**
 * Simulates WindowsAdapter GPU detection logic.
 * Normalizes single object → array, applies null semantics.
 */
function detectGpu(gpuData: WmiVideoController[] | null): {
  name: string | null;
  driver: string | null;
  isGeneric: boolean | null;
} {
  // Normalize: ConvertTo-Json with single object returns {} not [{}]
  const normalized = Array.isArray(gpuData) ? gpuData : gpuData ? [gpuData] : [];
  const primaryGpu = normalized[0];

  const gpuName = primaryGpu?.Name ?? null;
  const gpuDriver = primaryGpu?.DriverVersion ?? null;

  return {
    name: gpuName,
    driver: gpuDriver,
    isGeneric: gpuName ? isGenericGpu(gpuName) : null,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('WindowsAdapter — GPU detection', () => {

  // ── RX 550 regression (permanent) ────────────────────────

  it('RX 550 Series from WMI → correct BuffyContext fields', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Radeon 550 Series',
      DriverVersion: '26.20.12028.2',
      AdapterRAM: 2147483648,
    }];

    const result = detectGpu(gpuData);

    expect(result.name).toBe('Radeon 550 Series');
    expect(result.driver).toBe('26.20.12028.2');
    expect(result.isGeneric).toBe(false);
  });

  // ── Single object normalization ───────────────────────────

  it('single object (not array) → normalized to array', () => {
    // ConvertTo-Json with single Win32_VideoController returns {}
    const gpuData = {
      Name: 'NVIDIA GeForce RTX 3060',
      DriverVersion: '31.0.15.3623',
      AdapterRAM: 12884901888,
    };

    const result = detectGpu(gpuData as WmiVideoController[]);

    expect(result.name).toBe('NVIDIA GeForce RTX 3060');
    expect(result.driver).toBe('31.0.15.3623');
    expect(result.isGeneric).toBe(false);
  });

  // ── Null/undefined handling ───────────────────────────────

  it('null gpuData → null (NOT "Unknown GPU")', () => {
    const result = detectGpu(null);
    expect(result.name).toBeNull();
    expect(result.driver).toBeNull();
    expect(result.isGeneric).toBeNull();
  });

  it('empty array → null (NOT "Unknown GPU")', () => {
    const result = detectGpu([]);
    expect(result.name).toBeNull();
    expect(result.driver).toBeNull();
    expect(result.isGeneric).toBeNull();
  });

  it('object with no Name → null for name', () => {
    const gpuData: WmiVideoController[] = [{
      DriverVersion: '1.0.0',
      AdapterRAM: 1024,
    }];

    const result = detectGpu(gpuData);
    expect(result.name).toBeNull();
    expect(result.driver).toBe('1.0.0');
    expect(result.isGeneric).toBeNull();
  });

  // ── Generic GPU detection ─────────────────────────────────

  it('Microsoft Basic Display → isGeneric: true', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Microsoft Basic Display Adapter',
      DriverVersion: '10.0.19041.1',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(true);
  });

  it('Microsoft Basic Render → isGeneric: true', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Microsoft Basic Render Driver',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(true);
  });

  it('Standard VGA → isGeneric: true', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Standard VGA Graphics Adapter',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(true);
  });

  // ── Real GPU names ────────────────────────────────────────

  it('AMD Radeon RX 580 → not generic', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Radeon RX 580 Series',
      DriverVersion: '27.20.12029.1000',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(false);
  });

  it('Intel UHD Graphics → not generic', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'Intel(R) UHD Graphics 630',
      DriverVersion: '27.20.100.9466',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(false);
  });

  it('NVIDIA GeForce → not generic', () => {
    const gpuData: WmiVideoController[] = [{
      Name: 'NVIDIA GeForce GTX 1660 Ti',
      DriverVersion: '31.0.15.3623',
    }];

    const result = detectGpu(gpuData);
    expect(result.isGeneric).toBe(false);
  });

  // ── Multiple GPUs ─────────────────────────────────────────

  it('multiple GPUs → uses first one', () => {
    const gpuData: WmiVideoController[] = [
      { Name: 'Radeon 550 Series', DriverVersion: '26.20.12028.2' },
      { Name: 'Intel(R) UHD Graphics 630', DriverVersion: '27.20.100.9466' },
    ];

    const result = detectGpu(gpuData);
    expect(result.name).toBe('Radeon 550 Series');
  });
});

// ─── psJson cardinality (single object contract) ─────────

describe('psJson — single object contract', () => {

  it('WMI single object → returns object (NOT array)', () => {
    // Win32_Processor returns {Name: "Intel...", NumberOfCores: 4}
    const raw = JSON.stringify({ Name: 'Intel(R) Core(TM) i5-3330', NumberOfCores: 4 });
    const result = parseSingleObject<{ Name?: string; NumberOfCores?: number }>(raw);

    expect(result).not.toBeNull();
    expect(result?.Name).toBe('Intel(R) Core(TM) i5-3330');
    expect(result?.NumberOfCores).toBe(4);
    expect(Array.isArray(result)).toBe(false);
  });

  it('null → null', () => {
    const result = parseSingleObject<{ Name?: string }>(null);
    expect(result).toBeNull();
  });

  it('empty string → null', () => {
    const result = parseSingleObject<{ Name?: string }>('');
    expect(result).toBeNull();
  });

  it('invalid JSON → null', () => {
    const result = parseSingleObject<{ Name?: string }>('not json');
    expect(result).toBeNull();
  });

  it('WMI memory object → preserves fields', () => {
    const raw = JSON.stringify({ TotalVisibleMemorySize: '12478464', FreePhysicalMemory: '7340032' });
    const result = parseSingleObject<{ TotalVisibleMemorySize?: string; FreePhysicalMemory?: string }>(raw);

    expect(result?.TotalVisibleMemorySize).toBe('12478464');
    expect(result?.FreePhysicalMemory).toBe('7340032');
  });

  it('WMI OS object → preserves Caption and Version', () => {
    const raw = JSON.stringify({
      Caption: 'Microsoft Windows 10 Enterprise LTSC',
      Version: '10.0.17763',
      OSArchitecture: '64 bits',
    });
    const result = parseSingleObject<{ Caption?: string; Version?: string; OSArchitecture?: string }>(raw);

    expect(result?.Caption).toBe('Microsoft Windows 10 Enterprise LTSC');
    expect(result?.Version).toBe('10.0.17763');
    expect(result?.OSArchitecture).toBe('64 bits');
  });
});

// ─── psJsonArray cardinality (array contract) ────────────

describe('psJsonArray — array contract', () => {

  it('WMI array → returns array', () => {
    const raw = JSON.stringify([
      { DeviceID: 'C:', Size: '119234877440', FreeSpace: '37046540288' },
      { DeviceID: 'D:', Size: '500107862016', FreeSpace: '423465402368' },
    ]);
    const result = parseArray<{ DeviceID?: string; Size?: string }>(raw);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].DeviceID).toBe('C:');
    expect(result[1].DeviceID).toBe('D:');
  });

  it('single object → normalized to [object]', () => {
    // ConvertTo-Json with single Win32_VideoController returns {}
    const raw = JSON.stringify({ Name: 'Radeon 550 Series', DriverVersion: '26.20.12028.2' });
    const result = parseArray<{ Name?: string; DriverVersion?: string }>(raw);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe('Radeon 550 Series');
    expect(result[0].DriverVersion).toBe('26.20.12028.2');
  });

  it('null → empty array', () => {
    const result = parseArray<{ Name?: string }>(null);
    expect(result).toEqual([]);
  });

  it('empty string → empty array', () => {
    const result = parseArray<{ Name?: string }>('');
    expect(result).toEqual([]);
  });

  it('invalid JSON → empty array', () => {
    const result = parseArray<{ Name?: string }>('not json');
    expect(result).toEqual([]);
  });

  it('WMI process array → preserves all fields', () => {
    const raw = JSON.stringify([
      { ProcessId: 1234, Name: 'opera', WorkingSetSize: 337000000 },
      { ProcessId: 5678, Name: 'RobloxPlayerBeta', WorkingSetSize: 181000000 },
    ]);
    const result = parseArray<{ ProcessId?: number; Name?: string; WorkingSetSize?: number }>(raw);

    expect(result).toHaveLength(2);
    expect(result[0].ProcessId).toBe(1234);
    expect(result[0].Name).toBe('opera');
    expect(result[0].WorkingSetSize).toBe(337000000);
    expect(result[1].ProcessId).toBe(5678);
    expect(result[1].Name).toBe('RobloxPlayerBeta');
  });

  it('single object (not array) with empty array fallback → still works', () => {
    // Edge case: what if PowerShell returns '[]' for empty collection?
    const raw = '[]';
    const result = parseArray<{ Name?: string }>(raw);
    expect(result).toEqual([]);
  });
});

// ─── psJsonArray — CPU usage from Win32_PerfFormattedData ──

describe('WindowsAdapter — CPU usage contract', () => {

  it('PercentProcessorTime _Total → usage number', () => {
    const raw = JSON.stringify([
      { Name: '0', PercentProcessorTime: 19 },
      { Name: '1', PercentProcessorTime: 12 },
      { Name: '_Total', PercentProcessorTime: 16 },
    ]);
    const usageData = parseArray<{ Name?: string; PercentProcessorTime?: number }>(raw);
    const total = usageData.find((c) => c.Name === '_Total');
    expect(total).toBeDefined();
    expect(total!.PercentProcessorTime).toBe(16);
  });

  it('no _Total entry → usage null', () => {
    const raw = JSON.stringify([
      { Name: '0', PercentProcessorTime: 19 },
    ]);
    const usageData = parseArray<{ Name?: string; PercentProcessorTime?: number }>(raw);
    const total = usageData.find((c) => c.Name === '_Total');
    expect(total).toBeUndefined();
  });

  it('empty array → usage null', () => {
    const usageData = parseArray<{ Name?: string; PercentProcessorTime?: number }>([]);
    const total = usageData.find((c) => c.Name === '_Total');
    expect(total).toBeUndefined();
  });

  it('WMI returns null → usage null', () => {
    const usageData = parseArray<{ Name?: string; PercentProcessorTime?: number }>(null);
    const total = usageData.find((c) => c.Name === '_Total');
    expect(total).toBeUndefined();
  });

  it('PercentProcessorTime = 0 → usage 0 (real value, not null)', () => {
    const raw = JSON.stringify([{ Name: '_Total', PercentProcessorTime: 0 }]);
    const usageData = parseArray<{ Name?: string; PercentProcessorTime?: number }>(raw);
    const total = usageData.find((c) => c.Name === '_Total');
    expect(total!.PercentProcessorTime).toBe(0);
  });
});
