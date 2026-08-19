import { describe, it, expect } from 'vitest';

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
