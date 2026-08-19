import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformAdapter, ActionDefinition, Capability } from '../src/core/types.js';

// Mock modules before importing pipeline
vi.mock('../src/state/store.js', () => ({
  loadState: vi.fn(() => ({ actionHistory: [] })),
  updateState: vi.fn(),
  ensureBuffyDir: vi.fn(),
}));

vi.mock('../src/core/presenter.js', () => ({
  renderActionResult: vi.fn((r: any) => `[MOCK] ${r.message}`),
  toJSON: vi.fn((obj: any) => JSON.stringify(obj)),
  renderGreeting: vi.fn(),
  renderDoctorReport: vi.fn(),
  renderDiagnosticReport: vi.fn(),
  renderProposal: vi.fn(),
  renderCapabilities: vi.fn(),
}));

import { executeWithGates } from '../src/core/pipeline.js';
import { loadState, updateState } from '../src/state/store.js';
import { renderActionResult } from '../src/core/presenter.js';

// ─── Mock Adapter ───────────────────────────────────────────

function createMockAdapter(caps: Capability[] = []): PlatformAdapter {
  return {
    name: 'windows',
    detect: async () => ({ name: 'windows', os: 'Test OS', version: '1.0', arch: 'x64' }),
    systemInfo: async () => ({
      os: { name: 'Test', version: '1.0', arch: 'x64' },
      cpu: { model: 'Test', cores: 4 },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'GPU', driver: '1.0', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
    }),
    capabilities: async () => caps,
    execute: async (action: ActionDefinition) => action.execute(),
  };
}

// ─── Test Actions ───────────────────────────────────────────

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test auto_safe action',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'auto executed' }; },
};

const confirmAction: ActionDefinition = {
  id: 'test-confirm',
  name: 'Test Confirm',
  description: 'Test confirm action',
  level: 'confirm',
  reversible: true,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'confirmed and executed' }; },
};

const forbiddenAction: ActionDefinition = {
  id: 'test-forbidden',
  name: 'Test Forbidden',
  description: 'Test forbidden action',
  level: 'forbidden',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'should not run' }; },
};

const actionWithPrereqs: ActionDefinition = {
  id: 'test-prereq',
  name: 'Test Prereq',
  description: 'Action requiring Node.js',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: ['Node.js'],
  async execute() { return { success: true, message: 'prereq ok' }; },
};

const actionWithDryRun: ActionDefinition = {
  id: 'test-dryrun',
  name: 'Test DryRun',
  description: 'Action with dry run',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'dryrun executed' }; },
  async dryRun() { return 'echo test-command'; },
};

const actionWithVerify: ActionDefinition = {
  id: 'test-verify',
  name: 'Test Verify',
  description: 'Action with verify',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'verified' }; },
  async verify() { return true; },
};

// ─── Tests ──────────────────────────────────────────────────

describe('executeWithGates — Unified Execution Pipeline', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Gate 1: Forbidden ---

  it('should block forbidden actions', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: forbiddenAction });

    expect(logSpy).toHaveBeenCalledWith('Acción prohibida: Test Forbidden');
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // --- Gate 2: Platform ---

  it('should block actions on wrong platform', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = createMockAdapter();
    adapter.name = 'android-termux' as any;

    const windowsOnlyAction: ActionDefinition = {
      ...autoSafeAction,
      platforms: ['windows'],
    };

    await executeWithGates({ adapter, action: windowsOnlyAction });

    expect(logSpy).toHaveBeenCalledWith('Acción no disponible en esta plataforma');
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // --- Gate 2: Prerequisites ---

  it('should block when prerequisites are missing', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = createMockAdapter([]); // no capabilities

    await executeWithGates({ adapter, action: actionWithPrereqs });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Prerequisito no satisfecho'));
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should proceed when prerequisites are met', async () => {
    const adapter = createMockAdapter([
      { name: 'Node.js', status: 'installed', version: '26.0.0' },
    ]);

    await executeWithGates({ adapter, action: actionWithPrereqs });

    expect(renderActionResult).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalled();
  });

  // --- Gate 3: Authorization (CONFIRM) ---

  it('should prompt for auth on CONFIRM action and execute on "y"', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('y');

    await executeWithGates({ adapter, action: confirmAction, promptUser });

    expect(promptUser).toHaveBeenCalled();
    expect(renderActionResult).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalled();
  });

  it('should cancel CONFIRM action on "n"', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('n');

    await executeWithGates({ adapter, action: confirmAction, promptUser });

    expect(promptUser).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Acción cancelada.');
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should cancel CONFIRM action on empty string', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('');

    await executeWithGates({ adapter, action: confirmAction, promptUser });

    expect(promptUser).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Acción cancelada.');
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should accept "si" (without accent) for CONFIRM authorization', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('si');

    await executeWithGates({ adapter, action: confirmAction, promptUser });

    expect(renderActionResult).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalled();
  });

  it('should accept "sí" for CONFIRM authorization', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('sí');

    await executeWithGates({ adapter, action: confirmAction, promptUser });

    expect(renderActionResult).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalled();
  });

  // --- Auto-safe: no auth required ---

  it('should execute AUTO_SAFE without prompting', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn();

    await executeWithGates({ adapter, action: autoSafeAction, promptUser });

    expect(promptUser).not.toHaveBeenCalled();
    expect(renderActionResult).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalled();
  });

  // --- DryRun display ---

  it('should display dryRun result before executing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: actionWithDryRun });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('📋'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('echo test-command'));
    expect(renderActionResult).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // --- JSON mode ---

  it('should output JSON plan in jsonMode and skip execution', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: autoSafeAction, jsonMode: true });

    // Should output JSON but NOT execute
    expect(logSpy).toHaveBeenCalled();
    expect(renderActionResult).not.toHaveBeenCalled();
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // --- State persistence ---

  it('should persist action in state.json after execution', async () => {
    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: autoSafeAction });

    expect(updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        actionHistory: expect.arrayContaining([
          expect.objectContaining({
            actionId: 'test-auto',
            success: true,
            message: 'auto executed',
          }),
        ]),
      }),
    );
  });

  // --- Verify failure ---

  it('should report verify failure in result', async () => {
    const failVerifyAction: ActionDefinition = {
      ...autoSafeAction,
      id: 'test-verify-fail',
      async execute() { return { success: true, message: 'executed' }; },
      async verify() { return false; },
    };

    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: failVerifyAction });

    // executeAction handles verify failure — result should be passed to presenter
    expect(renderActionResult).toHaveBeenCalled();
    const callArg = (renderActionResult as any).mock.calls[0][0];
    expect(callArg.success).toBe(false);
    expect(callArg.message).toContain('verificación falló');
  });

  // --- Missing promptUser for CONFIRM ---

  it('should error when CONFIRM action has no promptUser', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = createMockAdapter();

    await executeWithGates({ adapter, action: confirmAction });

    expect(logSpy).toHaveBeenCalledWith('Se requiere interacción del usuario pero no hay promptUser');
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
