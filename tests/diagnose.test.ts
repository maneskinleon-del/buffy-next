import { describe, it, expect, vi } from 'vitest';
import { diagnose } from '../src/core/diagnose.js';
import type { PlatformAdapter, SystemInfo, PlatformName } from '../src/core/types.js';

// ─── Mock Adapter ───────────────────────────────────────────

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
    name: 'windows' as PlatformName,
    async detect() { return { name: 'windows' as PlatformName, os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return defaultSystem; },
    async capabilities() { return []; },
    async execute(action) { return action.execute(); },
  };
}

// ─── v0.8 DiagnosticResponse tests ─────────────────────────

describe('Diagnose — v0.8 Canonical Pipeline', () => {

  it('should return DiagnosticResponse with all fields', async () => {
    const result = await diagnose(mockAdapter(), 'lento');
    expect(result.query).toBe('lento');
    expect(result.selection).toBeDefined();
    expect(result.observations).toBeDefined();
    expect(Array.isArray(result.observations)).toBe(true);
    expect(result.actions).toBeDefined();
    expect(Array.isArray(result.actions)).toBe(true);
    expect(result.platform).toBe('windows');
  });

  it('should include relevant checks for performance query', async () => {
    const result = await diagnose(mockAdapter(), 'mi sistema está lento');
    const ids = result.observations.map(i => i.id);
    expect(ids).toContain('cpu-status');
    expect(ids).toContain('ram-status');
  });

  it('should detect generic GPU as warning', async () => {
    const adapter = mockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0', isGeneric: true },
    });
    const result = await diagnose(adapter, 'gpu driver pantalla');
    const gpuItem = result.observations.find(i => i.id === 'gpu-generic-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.severity).toBe('warning');
  });

  it('should detect high RAM usage as error', async () => {
    const adapter = mockAdapter({
      memory: { totalGB: 16, availableGB: 1, usedPercent: 95 },
    });
    const result = await diagnose(adapter, 'memoria ram');
    const ramItem = result.observations.find(i => i.id === 'ram-status');
    expect(ramItem).toBeDefined();
    expect(ramItem!.severity).toBe('error');
  });

  it('should detect high temperature as error', async () => {
    const adapter = mockAdapter({
      temperature: { cpuCelsius: 85 },
    });
    const result = await diagnose(adapter, 'temperatura');
    const tempItem = result.observations.find(i => i.id === 'temperature-status');
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
    const procItem = result.observations.find(i => i.id === 'heavy-processes');
    expect(procItem).toBeDefined();
    expect(procItem!.severity).toBe('warning');
    expect(procItem!.message).toContain('chrome');
  });

  it('should handle storage check', async () => {
    const adapter = mockAdapter({
      storage: [{ mount: '/', totalGB: 100, freeGB: 2, usedPercent: 98 }],
    });
    const result = await diagnose(adapter, 'disco lleno espacio');
    const storageItem = result.observations.find(i => i.id?.startsWith('storage-'));
    expect(storageItem).toBeDefined();
    expect(storageItem!.severity).toBe('error');
  });

  it('should return no observations for empty query (non-diagnostic)', async () => {
    const result = await diagnose(mockAdapter(), '');
    expect(result.observations.length).toBe(0);
    expect(result.selection.checks).toEqual([]);
  });

  it('should return default observations for vague diagnostic intent', async () => {
    const result = await diagnose(mockAdapter(), 'algo anda mal');
    expect(result.observations.length).toBeGreaterThan(3);
  });

  it('should produce actions via v0.8 mapActions', async () => {
    const adapter = mockAdapter({
      cpu: { model: 'X', cores: 4, usage: 85 },
    });
    const result = await diagnose(adapter, 'mi PC está lenta');
    // With high CPU, should get at least one action
    expect(result.actions.length).toBeGreaterThan(0);
    // Actions should have v0.8 fields
    const action = result.actions[0];
    expect(action.id).toBeDefined();
    expect(action.observed).toBeDefined();
    expect(action.inferred).toBeDefined();
    expect(action.recommended).toBeDefined();
    expect(action.confidence).toBeDefined();
    expect(action.instructions).toBeDefined();
  });
});

// ─── SECURITY: diagnose must never execute ──────────────────

describe('Diagnose — SECURITY: no execution', () => {

  it('diagnose() must not call execute() on the adapter', async () => {
    const adapter = mockAdapter();
    const executeSpy = vi.spyOn(adapter, 'execute');

    await diagnose(adapter, 'mi PC está lenta');

    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it('diagnose() must not import executeWithGates or pipeline', async () => {
    // Structural test: diagnose.ts should NOT import execution modules
    const fs = await import('fs');
    const diagnoseSource = fs.readFileSync(
      new URL('../src/core/diagnose.ts', import.meta.url),
      'utf-8',
    );
    // Check import statements only (lines starting with import)
    const importLines = diagnoseSource.split('\n').filter(l => l.startsWith('import'));
    const allImports = importLines.join('\n');
    expect(allImports).not.toContain('executeWithGates');
    expect(allImports).not.toContain('executeAction');
    expect(allImports).not.toContain('pipeline');
  });

  it('diagnose() must not import old action registry', async () => {
    const fs = await import('fs');
    const diagnoseSource = fs.readFileSync(
      new URL('../src/core/diagnose.ts', import.meta.url),
      'utf-8',
    );
    expect(diagnoseSource).not.toContain('findActionsForIssue');
    expect(diagnoseSource).not.toContain('../actions/registry');
  });
});

// ─── Integration: full pipeline v0.8 ───────────────────────

describe('Diagnose — Integration: full v0.8 pipeline', () => {

  it('complete pipeline: query → selection → observations → actions', async () => {
    const adapter = mockAdapter({
      cpu: { model: 'Intel i7', cores: 8, usage: 85 },
      memory: { totalGB: 16, availableGB: 4, usedPercent: 75 },
    });
    const response = await diagnose(adapter, 'mi PC está lenta');

    // Selection (v0.5-B + v0.6)
    expect(response.selection.checks.length).toBeGreaterThan(0);
    expect(response.selection.confidence).toBeDefined();
    expect(['high', 'medium', 'low']).toContain(response.selection.confidence);

    // Observations (analyzeForQuery)
    expect(response.observations.length).toBeGreaterThan(0);
    const cpuObs = response.observations.find(i => i.id === 'cpu-status');
    expect(cpuObs).toBeDefined();
    expect(cpuObs!.severity).toBe('warning'); // usage=85 > 80

    // Actions (v0.8 mapActions)
    expect(response.actions.length).toBeGreaterThan(0);
    const action = response.actions[0];
    expect(action.id).toBeDefined();
    expect(action.confidence).toBeDefined();
    expect(action.instructions).toBeDefined();
    expect(action.instructions.length).toBeGreaterThan(0);

    // Platform
    expect(response.platform).toBe('windows');
  });

  it('non-diagnostic query → empty selection → no observations → no actions', async () => {
    const adapter = mockAdapter();
    const response = await diagnose(adapter, 'hola');

    expect(response.selection.checks).toEqual([]);
    expect(response.observations).toEqual([]);
    expect(response.actions).toEqual([]);
  });

  it('multi-fragment query: "wifi lento y temperatura sube"', async () => {
    const adapter = mockAdapter({
      temperature: { cpuCelsius: 80 },
    });
    const response = await diagnose(adapter, 'wifi es lento y la temperatura sube');

    // Should have temperature check from "temperatura sube"
    const tempObs = response.observations.find(i => i.id === 'temperature-status');
    expect(tempObs).toBeDefined();
    expect(tempObs!.severity).toBe('warning'); // 80 > 65

    // Platform present
    expect(response.platform).toBeDefined();
  });

  it('multi-fragment ambiguity: "wifi lento y la temperatura sube"', async () => {
    const adapter = mockAdapter();
    const response = await diagnose(adapter, 'wifi es lento y la temperatura sube');

    // Multi-fragment queries go through entity-modifier binding
    // The selection should have checks (not empty)
    expect(response.selection.checks.length).toBeGreaterThan(0);
    // Confidence should be medium (context modified the selection)
    expect(response.selection.confidence).toBe('medium');
  });
});
