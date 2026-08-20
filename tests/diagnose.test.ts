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
    name: 'windows',
    async detect() { return { name: 'windows', os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return defaultSystem; },
    async capabilities() { return []; },
    async execute(action) { return action.execute(); },
  };
}

describe('Diagnose', () => {

  it('should return observations, inferences, and suggestedActions', async () => {
    const result = await diagnose(mockAdapter(), 'lento');
    expect(result.observations).toBeDefined();
    expect(Array.isArray(result.observations)).toBe(true);
    expect(result.inferences).toBeDefined();
    expect(Array.isArray(result.inferences)).toBe(true);
    expect(result.suggestedActions).toBeDefined();
  });

  it('should include relevant checks for performance query', async () => {
    const result = await diagnose(mockAdapter(), 'mi sistema está lento');
    const categories = result.observations.map(o => o.category);
    expect(categories).toContain('cpu');
    expect(categories).toContain('memory');
  });

  it('should detect generic GPU as warning', async () => {
    const adapter = mockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0', isGeneric: true },
    });
    const result = await diagnose(adapter, 'gpu driver pantalla');
    const gpuObs = result.observations.find(o => o.category === 'gpu');
    expect(gpuObs).toBeDefined();
    expect(gpuObs!.severity).toBe('warning');
  });

  it('should detect high RAM usage as error', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
    });
    const result = await diagnose(adapter, 'memoria ram');
    const ramObs = result.observations.find(o => o.category === 'memory');
    expect(ramObs).toBeDefined();
    expect(ramObs!.severity).toBe('error');
  });

  it('should detect high temperature as error', async () => {
    const adapter = mockAdapter({
      temperature: { cpuCelsius: 85 },
    });
    const result = await diagnose(adapter, 'temperatura');
    const tempObs = result.observations.find(o => o.category === 'temperature');
    expect(tempObs).toBeDefined();
    expect(tempObs!.severity).toBe('error');
  });

  it('should detect heavy processes as warning', async () => {
    const adapter = mockAdapter({
      processes: [
        { pid: 1, name: 'chrome', cpuPercent: 80, memoryMB: 2000 },
      ],
    });
    const result = await diagnose(adapter, 'procesos app');
    const procObs = result.observations.find(o => o.category === 'processes');
    expect(procObs).toBeDefined();
    expect(procObs!.severity).toBe('warning');
    expect(procObs!.fact).toContain('chrome');
  });

  it('should handle storage check', async () => {
    const adapter = mockAdapter({
      storage: [{ mount: '/', totalGB: 100, freeGB: 2, usedPercent: 98 }],
    });
    const result = await diagnose(adapter, 'disco lleno espacio');
    const storageObs = result.observations.find(o => o.category === 'storage');
    expect(storageObs).toBeDefined();
    expect(storageObs!.severity).toBe('error');
  });

  it('should run all checks for empty/generic query', async () => {
    const result = await diagnose(mockAdapter(), '');
    expect(result.observations.length).toBeGreaterThan(3);
  });

  it('should derive inferences from warning/error observations', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
      temperature: { cpuCelsius: 85 },
    });
    const result = await diagnose(adapter, 'lento');
    // Should have individual inferences + combined
    expect(result.inferences.length).toBeGreaterThanOrEqual(2);
    expect(result.inferences.some(i => i.statement.includes('memoria'))).toBe(true);
    expect(result.inferences.some(i => i.statement.includes('temperatura'))).toBe(true);
  });

  it('should derive combined inference when both RAM and temp are elevated', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
      temperature: { cpuCelsius: 85 },
    });
    const result = await diagnose(adapter, 'lento');
    const combined = result.inferences.find(i => i.statement.includes('Combinación'));
    expect(combined).toBeDefined();
    expect(combined!.basedOn.length).toBe(2);
  });

  it('should derive GPU inference when GPU is generic', async () => {
    const adapter = mockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0', isGeneric: true },
    });
    const result = await diagnose(adapter, 'gpu');
    const gpuInf = result.inferences.find(i => i.statement.includes('GPU'));
    expect(gpuInf).toBeDefined();
  });

  // ─── Platform-aware action filtering ─────────────────────

  it('storage error with no matching action → suggestedActions should be empty', async () => {
    const adapter = mockAdapter({
      storage: [{ mount: '/', totalGB: 64, freeGB: 1, usedPercent: 98 }],
    });
    const result = await diagnose(adapter, 'no tengo espacio disco lleno');
    const storageObs = result.observations.find(o => o.category === 'storage');
    expect(storageObs).toBeDefined();
    expect(storageObs!.severity).toBe('error');
    // No storage action exists → suggestedActions should be empty
    expect(result.suggestedActions.length).toBe(0);
  });

  it('Windows platform → check-shizuku should never be suggested', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
    });
    const result = await diagnose(adapter, 'lento');
    const shizukuAction = result.suggestedActions.find(sa => sa.action.id === 'check-shizuku');
    expect(shizukuAction).toBeUndefined();
  });

  it('Android platform + high temp → check-shizuku can be suggested if category matches', async () => {
    // check-shizuku has platforms: ['android-termux'], prerequisites: ['shizuku']
    // It should NOT appear because no observation category maps to it
    const adapter = mockAdapter({
      temperature: { cpuCelsius: 85 },
    }, 'android-termux');
    const result = await diagnose(adapter, 'temperatura');
    // check-shizuku is not in CATEGORY_TO_ACTIONS for temperature
    const shizukuAction = result.suggestedActions.find(sa => sa.action.id === 'check-shizuku');
    expect(shizukuAction).toBeUndefined();
  });

  it('observation category is typed — all categories in ObservationCategory union', async () => {
    const result = await diagnose(mockAdapter(), 'lento ram gpu temperatura procesos disco');
    const validCategories = new Set(['cpu', 'memory', 'gpu', 'temperature', 'processes', 'storage']);
    for (const obs of result.observations) {
      expect(validCategories.has(obs.category)).toBe(true);
    }
  });
});
