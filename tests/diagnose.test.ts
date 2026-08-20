import { describe, it, expect } from 'vitest';
import { diagnose } from '../src/core/diagnose.js';
import type { PlatformAdapter, SystemInfo } from '../src/core/types.js';

function mockAdapter(overrides: Partial<SystemInfo> = {}): PlatformAdapter {
  const defaultSystem: SystemInfo = {
    os: { name: 'Test OS', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test CPU', cores: 4 },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'NVIDIA GTX', driver: '537', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    ...overrides,
  };

  return {
    name: 'test-platform',
    async detect() { return { name: 'windows', os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return defaultSystem; },
    async capabilities() { return []; },
    async execute(action) { return action.execute(); },
  };
}

describe('Diagnose', () => {

  it('should return items and suggestedActions', async () => {
    const result = await diagnose(mockAdapter(), 'lento');
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.suggestedActions).toBeDefined();
  });

  it('should include relevant checks for performance query', async () => {
    const result = await diagnose(mockAdapter(), 'mi sistema está lento');
    const ids = result.items.map(i => i.id);
    expect(ids).toContain('cpu-status');
    expect(ids).toContain('ram-status');
  });

  it('should detect generic GPU as warning', async () => {
    const adapter = mockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0', isGeneric: true },
    });
    const result = await diagnose(adapter, 'gpu driver pantalla');
    const gpuItem = result.items.find(i => i.id === 'gpu-generic-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.severity).toBe('warning');
    expect(gpuItem!.suggestedAction).toBe('install-official-driver');
  });

  it('should detect high RAM usage as error', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
    });
    const result = await diagnose(adapter, 'memoria ram');
    const ramItem = result.items.find(i => i.id === 'ram-status');
    expect(ramItem).toBeDefined();
    expect(ramItem!.severity).toBe('error');
  });

  it('should detect high temperature as error', async () => {
    const adapter = mockAdapter({
      temperature: { cpuCelsius: 85 },
    });
    const result = await diagnose(adapter, 'temperatura');
    const tempItem = result.items.find(i => i.id === 'temperature-status');
    expect(tempItem).toBeDefined();
    expect(tempItem!.severity).toBe('error');
  });

  it('should detect heavy processes as warning', async () => {
    const adapter = mockAdapter({
      processes: [
        { pid: 1, name: 'chrome', cpuPercent: 80, memoryMB: 2000 },
      ],
    });
    const result = await diagnose(adapter, 'procesos app');
    const procItem = result.items.find(i => i.id === 'heavy-processes');
    expect(procItem).toBeDefined();
    expect(procItem!.severity).toBe('warning');
    expect(procItem!.message).toContain('chrome');
  });

  it('should handle storage check', async () => {
    const adapter = mockAdapter({
      storage: [{ mount: '/', totalGB: 100, freeGB: 2, usedPercent: 98 }],
    });
    const result = await diagnose(adapter, 'disco lleno espacio');
    const storageItem = result.items.find(i => i.id?.startsWith('storage-'));
    expect(storageItem).toBeDefined();
    expect(storageItem!.severity).toBe('error');
  });

  it('should return no items for empty query (non-diagnostic)', async () => {
    const result = await diagnose(mockAdapter(), '');
    expect(result.items.length).toBe(0);
  });

  it('should return default items for vague diagnostic intent', async () => {
    const result = await diagnose(mockAdapter(), 'algo anda mal');
    expect(result.items.length).toBeGreaterThan(3);
  });
});
