import { describe, it, expect, vi } from 'vitest';
import { diagnose, capabilities, version } from '../src/tool.js';
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
    name: 'linux' as PlatformName,
    async detect() { return { name: 'linux' as PlatformName, os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return defaultSystem; },
    async capabilities() { return []; },
    async execute(action) { return action.execute(); },
  };
}

// ─── diagnose() contract ────────────────────────────────────

describe('Buffy Tool — diagnose()', () => {

  it('should return BuffyToolResponse with tool and schemaVersion', async () => {
    const response = await diagnose(mockAdapter(), 'mi PC está lenta');

    expect(response.tool).toBe('buffy');
    expect(response.schemaVersion).toBe('0.8');
    expect(response.query).toBe('mi PC está lenta');
    expect(response.selection).toBeDefined();
    expect(response.observations).toBeDefined();
    expect(response.actions).toBeDefined();
    expect(response.platform).toBeDefined();
  });

  it('should return valid DiagnosticResponse for diagnostic query', async () => {
    const response = await diagnose(mockAdapter(), 'mi PC está lenta');

    expect(response.selection.checks.length).toBeGreaterThan(0);
    expect(response.observations.length).toBeGreaterThan(0);
    expect(typeof response.platform).toBe('string');
  });

  it('should return empty results for non-diagnostic query', async () => {
    const response = await diagnose(mockAdapter(), 'hola');

    expect(response.selection.checks).toEqual([]);
    expect(response.observations).toEqual([]);
    expect(response.actions).toEqual([]);
    expect(response.tool).toBe('buffy');
    expect(response.schemaVersion).toBe('0.8');
  });

  it('should not execute any actions on the system', async () => {
    const adapter = mockAdapter();
    const executeSpy = vi.spyOn(adapter, 'execute');

    await diagnose(adapter, 'mi PC está lenta');

    expect(executeSpy).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it('should not import executeWithGates or pipeline', async () => {
    const fs = await import('fs');
    const toolSource = fs.readFileSync(
      new URL('../src/tool.ts', import.meta.url),
      'utf-8',
    );
    const importLines = toolSource.split('\n').filter(l => l.startsWith('import'));
    const allImports = importLines.join('\n');
    expect(allImports).not.toContain('executeWithGates');
    expect(allImports).not.toContain('executeAction');
    expect(allImports).not.toContain('pipeline');
    expect(allImports).not.toContain('../actions/registry');
  });

  it('should not reinterpret confidence or instruction.status', async () => {
    const adapter = mockAdapter({
      cpu: { model: 'X', cores: 4, usage: 90 },
    });
    const response = await diagnose(adapter, 'CPU alto');

    // confidence should come directly from mapActions, not modified
    if (response.actions.length > 0) {
      expect(['high', 'medium', 'low']).toContain(response.actions[0].confidence);
      // instructions should preserve original status
      for (const inst of response.actions[0].instructions) {
        expect(['verified', 'partial', 'unsupported']).toContain(inst.status);
      }
    }
  });
});

// ─── capabilities() contract ────────────────────────────────

describe('Buffy Tool — capabilities()', () => {

  it('should return capabilities without touching the system', async () => {
    const caps = capabilities();

    expect(caps.tool).toBe('buffy');
    expect(caps.schemaVersion).toBe('0.8');
    expect(caps.checks).toBeDefined();
    expect(caps.actions).toBeDefined();
    expect(caps.platforms).toBeDefined();
    expect(caps.description).toBeDefined();
  });

  it('should list available checks', () => {
    const caps = capabilities();
    expect(caps.checks).toContain('cpu');
    expect(caps.checks).toContain('ram');
    expect(caps.checks).toContain('gpu');
    expect(caps.checks).toContain('storage');
    expect(caps.checks).toContain('temperature');
    expect(caps.checks).toContain('processes');
  });

  it('should list available actions', () => {
    const caps = capabilities();
    expect(caps.actions.length).toBeGreaterThan(0);
    expect(caps.actions).toContain('inspect-processes');
  });

  it('should list supported platforms', () => {
    const caps = capabilities();
    expect(caps.platforms).toContain('windows');
    expect(caps.platforms).toContain('linux');
    expect(caps.platforms).toContain('android-termux');
  });
});

// ─── version() contract ─────────────────────────────────────

describe('Buffy Tool — version()', () => {

  it('should return version info without touching the system', () => {
    const v = version();

    expect(v.tool).toBe('buffy');
    expect(v.schemaVersion).toBe('0.8');
    expect(v.version).toBe('0.8.0');
    expect(v.modules).toBeDefined();
    expect(v.modules.length).toBeGreaterThan(0);
  });

  it('should list pipeline modules', () => {
    const v = version();
    expect(v.modules).toContain('check-selector v0.5-B');
    expect(v.modules).toContain('context-scorer v0.6');
    expect(v.modules).toContain('action-mapper v0.8');
    expect(v.modules).toContain('diagnose pipeline v0.8');
  });
});

// ─── JSON determinism ───────────────────────────────────────

describe('Buffy Tool — JSON determinism', () => {

  it('should produce identical JSON for same input', async () => {
    const adapter = mockAdapter();
    const r1 = await diagnose(adapter, 'hola');
    const r2 = await diagnose(adapter, 'hola');

    // Non-diagnostic: deterministic
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
