import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/core/doctor.js';

// Mock adapter for testing
const mockAdapter = {
  name: 'test-platform',
  async detect() {
    return {
      name: 'windows' as const,
      os: 'Test OS 1.0',
      version: '1.0.0',
      arch: 'x64',
    };
  },
  async systemInfo() {
    return {
      os: { name: 'Test OS', version: '1.0', arch: 'x64' },
      cpu: { model: 'Test CPU', cores: 4, usage: null },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'Test GPU', driver: '1.0', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
    };
  },
  async capabilities() {
    return [
      { name: 'Node.js', status: 'installed' as const, version: '26.0.0' },
      { name: 'PowerShell', status: 'missing' as const },
    ];
  },
  async execute(action: any) {
    return action.execute();
  },
};

describe('Doctor', () => {
  it('should return a complete report', async () => {
    const report = await runDoctor(mockAdapter as any);

    expect(report.platform).toBeDefined();
    expect(report.system).toBeDefined();
    expect(report.capabilities).toBeDefined();
    expect(report.items).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  it('should have items with required fields', async () => {
    const report = await runDoctor(mockAdapter as any);

    for (const item of report.items) {
      expect(item.id).toBeDefined();
      expect(item.severity).toMatch(/^(ok|warning|error|unknown)$/);
      expect(item.category).toBeDefined();
      expect(item.message).toBeDefined();
    }
  });

  it('should detect generic GPU as warning', async () => {
    const genericAdapter = {
      ...mockAdapter,
      async systemInfo() {
        const info = await mockAdapter.systemInfo();
        return { ...info, gpu: { ...info.gpu, name: 'Microsoft Basic Display Adapter', isGeneric: true } };
      },
    };

    const report = await runDoctor(genericAdapter as any);
    const gpuItem = report.items.find(i => i.id === 'gpu-generic-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.severity).toBe('warning');
  });
});
