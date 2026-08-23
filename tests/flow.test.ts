import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/core/doctor.js';
import { requiresAuth, isForbidden, classifyAction } from '../src/core/security.js';
import { findActionById, findActionsForIssue } from '../src/actions/registry.js';
import { buildExecutionPlan } from '../src/core/executor.js';
import type { PlatformAdapter, SystemInfo, PlatformInfo, Capability, ActionDefinition } from '../src/core/types.js';

// ─── Mock Adapter ───────────────────────────────────────────

function createMockAdapter(overrides: Partial<SystemInfo> = {}): PlatformAdapter {
  const defaultSystem: SystemInfo = {
    os: { name: 'Test OS', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test CPU', cores: 4, usage: null },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'NVIDIA GeForce GTX 1660', driver: '537.42', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    ...overrides,
  };

  return {
    name: 'test-platform',
    async detect(): Promise<PlatformInfo> {
      return { name: 'windows', os: 'Test OS 1.0', version: '1.0.0', arch: 'x64' };
    },
    async systemInfo(): Promise<SystemInfo> {
      return defaultSystem;
    },
    async capabilities(): Promise<Capability[]> {
      return [
        { name: 'Node.js', status: 'installed', version: '26.0.0' },
        { name: 'PowerShell', status: 'installed', version: '5.1' },
      ];
    },
  };
}

// ─── Flow Tests ─────────────────────────────────────────────

describe('Full flow: doctor → detect → propose → confirm', () => {

  it('should detect official GPU as OK (no warning)', async () => {
    const adapter = createMockAdapter({
      gpu: { name: 'NVIDIA GeForce GTX 1660', driver: '537.42', isGeneric: false },
    });

    const report = await runDoctor(adapter);

    const gpuItem = report.items.find(i => i.id === 'gpu-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.severity).toBe('ok');

    const genericWarning = report.items.find(i => i.id === 'gpu-generic-driver');
    expect(genericWarning).toBeUndefined();
  });

  it('should detect generic GPU as warning with suggested action', async () => {
    const adapter = createMockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0.19041.1', isGeneric: true },
    });

    const report = await runDoctor(adapter);

    const gpuItem = report.items.find(i => i.id === 'gpu-generic-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.severity).toBe('warning');
    expect(gpuItem!.suggestedAction).toBe('install-official-driver');
  });

  it('should suggest check-gpu-driver action when GPU is generic', async () => {
    const adapter = createMockAdapter({
      gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0.19041.1', isGeneric: true },
    });

    const report = await runDoctor(adapter);
    const genericItem = report.items.find(i => i.id === 'gpu-generic-driver');
    expect(genericItem).toBeDefined();

    // Map doctor item to an Observation for the registry API
    const observations = [{
      fact: genericItem!.message,
      category: 'gpu' as const,
      severity: genericItem!.severity as any,
    }];
    const suggestedActions = findActionsForIssue(observations, 'windows');
    expect(suggestedActions.length).toBeGreaterThan(0);
    expect(suggestedActions.some(sa => sa.action.id === 'check-gpu-driver')).toBe(true);
  });

  it('check-gpu-driver action should be AUTO_SAFE (no auth required)', async () => {
    const action = findActionById('check-gpu-driver');
    expect(action).toBeDefined();

    expect(classifyAction(action!)).toBe('auto_safe');
    expect(requiresAuth(action!)).toBe(false);
    expect(isForbidden(action!)).toBe(false);
  });

  it('check-gpu-driver should be valid via buildExecutionPlan', async () => {
    const action = findActionById('check-gpu-driver');
    expect(action).toBeDefined();

    const plan = await buildExecutionPlan(action!, 'windows');
    expect(plan.platformValid).toBe(true);
    expect(plan.levelValid).toBe(true);
    expect(plan.requiresAuth).toBe(false);
  });

  it('should produce a valid DoctorReport structure', async () => {
    const adapter = createMockAdapter();
    const report = await runDoctor(adapter);

    expect(report.platform).toBeDefined();
    expect(report.system).toBeDefined();
    expect(report.capabilities).toBeDefined();
    expect(report.items).toBeDefined();
    expect(report.timestamp).toBeDefined();

    for (const item of report.items) {
      expect(item.id).toBeDefined();
      expect(item.severity).toMatch(/^(ok|warning|error|unknown)$/);
      expect(item.category).toBeDefined();
      expect(item.message).toBeDefined();
    }
  });

  it('should find check-gpu-driver by id', () => {
    const action = findActionById('check-gpu-driver');
    expect(action).toBeDefined();
    expect(action!.id).toBe('check-gpu-driver');
    expect(action!.name).toBe('Verificar driver de GPU');
  });
});
