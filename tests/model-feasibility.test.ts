import { describe, it, expect } from 'vitest';
import { canExecute, MODEL_SPECS } from '../src/core/model-feasibility.js';
import type { SystemInfo, PlatformName, ModelSpec } from '../src/core/types.js';

// ─── Mock System ───────────────────────────────────────────

function mockSystem(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    os: { name: 'Test OS', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test CPU', cores: 4 },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'NVIDIA GTX', driver: '537', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    ...overrides,
  };
}

// ─── FIT Tests ─────────────────────────────────────────────

describe('Model Feasibility — FIT', () => {

  it('gemma-2b-q4 should be FIT on 16GB system', () => {
    const system = mockSystem({
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['gemma-2b-q4'], system);
    expect(result.level).toBe('fit');
    expect(result.limits).toBeUndefined();
  });

  it('qwen2.5-7b-q4 should be FIT on 16GB system', () => {
    const system = mockSystem({
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.level).toBe('fit');
  });

  it('should be FIT when temperature is below 75°C', () => {
    const system = mockSystem({
      temperature: { cpuCelsius: 60 },
    });
    const result = canExecute(MODEL_SPECS['gemma-2b-q4'], system);
    expect(result.level).toBe('fit');
  });

});

// ─── CONSTRAINED Tests ─────────────────────────────────────

describe('Model Feasibility — CONSTRAINED', () => {

  it('qwen2.5-7b-q4 should be CONSTRAINED on 4GB available', () => {
    const system = mockSystem({
      memory: { totalGB: 8, availableGB: 4, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.level).toBe('constrained');
    expect(result.limits).toBeDefined();
    expect(result.limits?.concurrency).toBe(1);
    expect(result.limits?.monitorMemory).toBe(true);
  });

  it('should be CONSTRAINED when temperature is 75-89°C', () => {
    const system = mockSystem({
      temperature: { cpuCelsius: 80 },
    });
    const result = canExecute(MODEL_SPECS['gemma-2b-q4'], system);
    expect(result.level).toBe('constrained');
    expect(result.reason).toContain('temperature');
  });

  it('should be CONSTRAINED when CPU cores are one less than required', () => {
    const system = mockSystem({
      cpu: { model: 'Test CPU', cores: 3 }, // qwen2.5-7b-q4 needs 4
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.level).toBe('constrained');
    expect(result.reason).toContain('cores');
  });

  it('limits should have reduced context', () => {
    const system = mockSystem({
      memory: { totalGB: 8, availableGB: 4, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.limits?.maxContext).toBeLessThan(MODEL_SPECS['qwen2.5-7b-q4'].maxContext);
  });

});

// ─── UNFIT Tests ───────────────────────────────────────────

describe('Model Feasibility — UNFIT', () => {

  it('qwen2.5-7b-q4 should be UNFIT on 2GB available', () => {
    const system = mockSystem({
      memory: { totalGB: 4, availableGB: 2, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.level).toBe('unfit');
    expect(result.reason).toContain('RAM');
  });

  it('should be UNFIT when CPU cores are 2+ less than required', () => {
    const system = mockSystem({
      cpu: { model: 'Test CPU', cores: 2 }, // qwen2.5-7b-q4 needs 4
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.level).toBe('unfit');
    expect(result.reason).toContain('CPU');
  });

  it('llama-70b-q4 should be UNFIT on limited system (RAM check fails first)', () => {
    const system = mockSystem({
      memory: { totalGB: 8, availableGB: 8, usedPercent: 0 },
      gpu: { name: 'None', driver: 'none', isGeneric: true },
    });
    const result = canExecute(MODEL_SPECS['llama-70b-q4'], system);
    expect(result.level).toBe('unfit');
    // RAM check fails first (8GB < 40GB required)
    expect(result.reason).toContain('RAM');
  });

  it('llama-70b-q4 should be UNFIT due to GPU when RAM and CPU are sufficient', () => {
    const system = mockSystem({
      memory: { totalGB: 64, availableGB: 60, usedPercent: 6 },
      cpu: { model: 'Test CPU', cores: 16 }, // enough for llama-70b
      gpu: { name: 'None', driver: 'none', isGeneric: true },
    });
    const result = canExecute(MODEL_SPECS['llama-70b-q4'], system);
    expect(result.level).toBe('unfit');
    expect(result.reason).toContain('GPU');
  });

  it('UNFIT should suggest alternatives', () => {
    const system = mockSystem({
      memory: { totalGB: 4, availableGB: 2, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives!.length).toBeGreaterThan(0);
  });

  it('alternatives should have lower RAM requirements', () => {
    const system = mockSystem({
      memory: { totalGB: 4, availableGB: 2, usedPercent: 50 },
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system);
    const originalRam = MODEL_SPECS['qwen2.5-7b-q4'].estimatedRamGB;
    for (const alt of result.alternatives!) {
      expect(alt.estimatedRamGB).toBeLessThan(originalRam);
    }
  });

});

// ─── Edge Cases ────────────────────────────────────────────

describe('Model Feasibility — Edge Cases', () => {

  it('should handle null temperature gracefully', () => {
    const system = mockSystem({
      temperature: null,
    });
    const result = canExecute(MODEL_SPECS['gemma-2b-q4'], system);
    expect(result.level).toBe('fit');
  });

  it('should handle exact RAM boundary', () => {
    const system = mockSystem({
      memory: { totalGB: 8, availableGB: 4.0, usedPercent: 50 }, // exactly 4GB
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system); // needs 4GB
    expect(result.level).toBe('constrained'); // 4.0 < 4.0 * 1.5
  });

  it('should handle exact CPU boundary', () => {
    const system = mockSystem({
      cpu: { model: 'Test CPU', cores: 4 }, // exactly 4 cores
    });
    const result = canExecute(MODEL_SPECS['qwen2.5-7b-q4'], system); // needs 4 cores
    expect(result.level).toBe('fit'); // 4 >= 4
  });

});

// ─── Pre-defined Model Specs ───────────────────────────────

describe('Model Feasibility — Model Specs', () => {

  it('should have specs for common models', () => {
    expect(MODEL_SPECS['gemma-2b-q4']).toBeDefined();
    expect(MODEL_SPECS['gemma-2b-q8']).toBeDefined();
    expect(MODEL_SPECS['qwen2.5-7b-q4']).toBeDefined();
    expect(MODEL_SPECS['qwen2.5-7b-q8']).toBeDefined();
    expect(MODEL_SPECS['llama-70b-q4']).toBeDefined();
  });

  it('gemma-2b-q4 should require less RAM than qwen2.5-7b-q4', () => {
    expect(MODEL_SPECS['gemma-2b-q4'].estimatedRamGB).toBeLessThan(
      MODEL_SPECS['qwen2.5-7b-q4'].estimatedRamGB,
    );
  });

  it('llama-70b-q4 should require GPU', () => {
    expect(MODEL_SPECS['llama-70b-q4'].requiresGpu).toBe(true);
  });

});
