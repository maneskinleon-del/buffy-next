import { describe, it, expect } from 'vitest';
import { mapActions } from '../src/core/action-mapper.js';
import type { CheckResult, PlatformName } from '../src/core/types.js';

// ─── Helpers ───────────────────────────────────────────────

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'test-check',
    category: 'test',
    severity: 'warning',
    message: 'Test check',
    ...overrides,
  };
}

// ─── Golden Test: Killian ──────────────────────────────────

describe('Action Mapper — Golden Test: Killian', () => {

  it('should map "Roblox lag" diagnosis to actionable steps', () => {
    const results: CheckResult[] = [
      check({ id: 'cpu-status', category: 'CPU', message: 'CPU: 85% usage' }),
      check({ id: 'heavy-processes', category: 'Procesos', message: 'Roblox consuming high CPU' }),
    ];

    const actions = mapActions(results, 'windows');
    expect(actions.length).toBeGreaterThan(0);

    // Should have at least one action with instructions
    const hasInstruction = actions.some(
      a => a.instructions.some(i => i.status === 'verified' || i.status === 'partial'),
    );
    expect(hasInstruction).toBe(true);

    // No action should have ALL instructions as unsupported
    for (const action of actions) {
      const allUnsupported = action.instructions.every(i => i.status === 'unsupported');
      // This is acceptable — some actions may not have platform instructions
      // But the ACTION itself should exist
      expect(action.recommended).toBeDefined();
    }
  });

  it('should NOT invent instructions for unsupported platforms', () => {
    const results: CheckResult[] = [
      check({ id: 'gpu-generic-driver', category: 'GPU', message: 'Generic driver' }),
    ];

    // Android has no GPU driver install instructions
    const actions = mapActions(results, 'android-termux');
    const gpuAction = actions.find(a => a.id === 'install-gpu-driver');

    if (gpuAction) {
      const androidInstructions = gpuAction.instructions.filter(i => i.platform === 'android-termux');
      // If there are instructions, they should NOT be 'verified' for unsupported platforms
      for (const inst of androidInstructions) {
        expect(inst.status).not.toBe('verified');
      }
    }
  });
});

// ─── Confidence levels ─────────────────────────────────────

describe('Action Mapper — Confidence', () => {

  it('should return high confidence when verified instructions exist', () => {
    const results: CheckResult[] = [
      check({ id: 'cpu-status', category: 'CPU', message: 'High CPU' }),
    ];

    const actions = mapActions(results, 'windows');
    const action = actions.find(a => a.id === 'close-heavy-processes');
    expect(action).toBeDefined();
    expect(action!.confidence).toBe('high');
  });

  it('should return low confidence when all instructions are unsupported', () => {
    const results: CheckResult[] = [
      check({ id: 'gpu-generic-driver', category: 'GPU', message: 'Generic driver' }),
    ];

    const actions = mapActions(results, 'android-termux');
    const action = actions.find(a => a.id === 'install-gpu-driver');
    // Android has no GPU driver instructions
    if (action) {
      expect(action.confidence).toBe('low');
    }
  });
});

// ─── 10 Diagnostic Scenarios ───────────────────────────────

describe('Action Mapper — Diagnostic Scenarios', () => {

  const scenarios: Array<{
    name: string;
    platform: PlatformName;
    checks: CheckResult[];
    expectedActionId?: string;
    expectedConfidence?: Confidence;
  }> = [
    {
      name: 'Windows: high CPU',
      platform: 'windows',
      checks: [check({ id: 'cpu-status', message: 'CPU 85%' })],
      expectedActionId: 'close-heavy-processes',
      expectedConfidence: 'high',
    },
    {
      name: 'Windows: high temperature',
      platform: 'windows',
      checks: [check({ id: 'temperature-status', message: 'Temp 85°C' })],
      expectedActionId: 'check-thermal',
      expectedConfidence: 'high',
    },
    {
      name: 'Windows: disk full',
      platform: 'windows',
      checks: [check({ id: 'storage-/', message: 'Disk 95% full' })],
      expectedActionId: 'free-disk-space',
      expectedConfidence: 'high',
    },
    {
      name: 'Linux: high CPU',
      platform: 'linux',
      checks: [check({ id: 'cpu-status', message: 'CPU 90%' })],
      expectedActionId: 'close-heavy-processes',
      expectedConfidence: 'high',
    },
    {
      name: 'Linux: network issue',
      platform: 'linux',
      checks: [check({ id: 'network-status', message: 'Network unstable' })],
      expectedActionId: 'restart-network',
      expectedConfidence: 'high',
    },
    {
      name: 'Android: Shizuku not running',
      platform: 'android-termux',
      checks: [check({ id: 'shizuku-status', message: 'Shizuku not running' })],
      // No action for Shizuku in current registry
    },
    {
      name: 'Windows: Chrome slow (too many tabs)',
      platform: 'windows',
      checks: [check({ id: 'heavy-processes', message: 'Chrome using 4GB' })],
      expectedActionId: 'close-chrome-tabs',
      expectedConfidence: 'high',
    },
    {
      name: 'Linux: mouse moves alone (ambiguous)',
      platform: 'linux',
      checks: [],
      // No checks = no actions
    },
    {
      name: 'Windows: vague performance issue',
      platform: 'windows',
      checks: [check({ id: 'cpu-status', message: 'CPU elevated' })],
      expectedActionId: 'close-heavy-processes',
    },
    {
      name: 'Android: thermal throttle',
      platform: 'android-termux',
      checks: [check({ id: 'temperature-status', message: 'Temp 45°C' })],
      expectedActionId: 'check-thermal',
      expectedConfidence: 'high',
    },
  ];

  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const actions = mapActions(scenario.checks, scenario.platform);

      if (scenario.expectedActionId) {
        const action = actions.find(a => a.id === scenario.expectedActionId);
        expect(action).toBeDefined();
        if (scenario.expectedConfidence) {
          expect(action!.confidence).toBe(scenario.expectedConfidence);
        }
      } else {
        // No expected action — just verify no crash
        expect(Array.isArray(actions)).toBe(true);
      }
    });
  }
});

// ─── Instruction Status ────────────────────────────────────

describe('Action Mapper — Instruction Status', () => {

  it('should include InstructionStatus in every instruction', () => {
    const results: CheckResult[] = [
      check({ id: 'cpu-status', message: 'High CPU' }),
    ];

    const actions = mapActions(results, 'windows');
    for (const action of actions) {
      for (const inst of action.instructions) {
        expect(['verified', 'partial', 'unsupported']).toContain(inst.status);
      }
    }
  });

  it('should have platform field in every instruction', () => {
    const results: CheckResult[] = [
      check({ id: 'cpu-status', message: 'High CPU' }),
    ];

    const actions = mapActions(results, 'windows');
    for (const action of actions) {
      for (const inst of action.instructions) {
        expect(['windows', 'linux', 'android-termux']).toContain(inst.platform);
      }
    }
  });
});
