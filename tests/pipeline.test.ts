import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformAdapter, ActionDefinition, ActionResult, Capability, ActionExecutor } from '../src/core/types.js';

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

import { executeWithGates, executeWithGatesForTests } from '../src/core/pipeline.js';
import { loadState, updateState } from '../src/state/store.js';

// ─── Mock Adapter (no execute — detection only) ───────────

function createMockAdapter(caps: Capability[] = []): PlatformAdapter {
  return {
    name: 'windows',
    detect: async () => ({ name: 'windows', os: 'Test OS', version: '1.0', arch: 'x64' }),
    systemInfo: async () => ({
      os: { name: 'Test', version: '1.0', arch: 'x64' },
      cpu: { model: 'Test', cores: 4, usage: null },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'GPU', driver: '1.0', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
    }),
    capabilities: async () => caps,
  };
}

// ─── Test Actions (metadata only) ──────────────────────────

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test auto_safe action',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const confirmAction: ActionDefinition = {
  id: 'test-confirm',
  name: 'Test Confirm',
  description: 'Test confirm action',
  level: 'confirm',
  reversible: true,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const forbiddenAction: ActionDefinition = {
  id: 'test-forbidden',
  name: 'Test Forbidden',
  description: 'Test forbidden action',
  level: 'forbidden',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const actionWithPrereqs: ActionDefinition = {
  id: 'test-prereq',
  name: 'Test Prereq',
  description: 'Action requiring Node.js',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: ['Node.js'],
};

// Test actions and their executors
const TEST_ACTIONS: ActionDefinition[] = [autoSafeAction, confirmAction, forbiddenAction, actionWithPrereqs];

const TEST_EXECUTOR_MAP: Record<string, ActionExecutor> = {
  'test-auto': async () => ({ success: true, message: 'auto executed' }),
  'test-confirm': async () => ({ success: true, message: 'confirmed and executed' }),
  'test-forbidden': async () => ({ success: true, message: 'should not run' }),
  'test-prereq': async () => ({ success: true, message: 'prereq ok' }),
};

// ─── Tests ──────────────────────────────────────────────────

describe('executeWithGates — Unified Execution Pipeline', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Gate 1: Forbidden ---

  it('should block forbidden actions', async () => {
    const adapter = createMockAdapter();

    const result = await executeWithGatesForTests({
      adapter,
      action: forbiddenAction,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('prohibida');
    expect(updateState).not.toHaveBeenCalled();
  });

  // --- Gate 2: Platform ---

  it('should block actions on wrong platform', async () => {
    const adapter = createMockAdapter();
    adapter.name = 'android-termux' as any;

    const windowsOnlyAction: ActionDefinition = {
      id: 'test-windows-only',
      name: 'Windows Only',
      description: 'Test',
      level: 'auto_safe',
      reversible: false,
      platforms: ['windows'],
      prerequisites: [],
    };

    const result = await executeWithGatesForTests({
      adapter,
      action: windowsOnlyAction,
      actions: [windowsOnlyAction],
      customExecutorMap: { 'test-windows-only': async () => ({ success: true, message: 'ok' }) },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('disponible');
    expect(updateState).not.toHaveBeenCalled();
  });

  // --- Gate 2: Prerequisites ---

  it('should block when prerequisites are missing', async () => {
    const adapter = createMockAdapter([]); // no capabilities

    const result = await executeWithGatesForTests({
      adapter,
      action: actionWithPrereqs,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('faltante');
    expect(updateState).not.toHaveBeenCalled();
  });

  it('should proceed when prerequisites are met', async () => {
    const adapter = createMockAdapter([
      { name: 'Node.js', status: 'installed', version: '26.0.0' },
    ]);

    const result = await executeWithGatesForTests({
      adapter,
      action: actionWithPrereqs,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(true);
    expect(updateState).toHaveBeenCalled();
  });

  // --- Gate 3: Authorization (CONFIRM) ---

  it('should prompt for auth on CONFIRM action and execute on "y"', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('y');

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(promptUser).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(updateState).toHaveBeenCalled();
  });

  it('should cancel CONFIRM action on "n"', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('n');

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(promptUser).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toContain('cancelada');
    expect(updateState).not.toHaveBeenCalled();
  });

  it('should cancel CONFIRM action on empty string', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('');

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(promptUser).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(updateState).not.toHaveBeenCalled();
  });

  it('should accept "si" (without accent) for CONFIRM authorization', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('si');

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(true);
    expect(updateState).toHaveBeenCalled();
  });

  it('should accept "sí" for CONFIRM authorization', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn().mockResolvedValue('sí');

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(true);
    expect(updateState).toHaveBeenCalled();
  });

  // --- Auto-safe: no auth required ---

  it('should execute AUTO_SAFE without prompting', async () => {
    const adapter = createMockAdapter();
    const promptUser = vi.fn();

    const result = await executeWithGatesForTests({
      adapter,
      action: autoSafeAction,
      promptUser,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(promptUser).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(updateState).toHaveBeenCalled();
  });

  // --- JSON mode ---

  it('should output JSON in jsonMode and skip execution', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = createMockAdapter();

    await executeWithGatesForTests({
      adapter,
      action: autoSafeAction,
      jsonMode: true,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(logSpy).toHaveBeenCalled();
    expect(updateState).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  // --- State persistence ---

  it('should persist action in state.json after execution', async () => {
    const adapter = createMockAdapter();

    await executeWithGatesForTests({
      adapter,
      action: autoSafeAction,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

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

  // --- Missing promptUser for CONFIRM ---

  it('should error when CONFIRM action has no promptUser', async () => {
    const adapter = createMockAdapter();

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmAction,
      actions: TEST_ACTIONS,
      customExecutorMap: TEST_EXECUTOR_MAP,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('promptUser');
    expect(updateState).not.toHaveBeenCalled();
  });

  // --- Action not found ---

  it('should return error for unknown action ID', async () => {
    const adapter = createMockAdapter();

    const result = await executeWithGatesForTests({
      adapter,
      action: { id: 'nonexistent', name: 'X', description: 'X', level: 'auto_safe', reversible: false, platforms: ['windows'], prerequisites: [] },
      actions: [],
      customExecutorMap: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('no encontrada');
  });
});

// ═══════════════════════════════════════════════════════════════════
// rawParams Transport Tests (SEQ-6.1 — BUG #2 fix verification)
//
// Verifies that rawParams flows correctly from CLI through the pipeline
// to the ActionGate and arrives as the executor's request.target.
// ═══════════════════════════════════════════════════════════════════

describe('rawParams transport — CLI → Pipeline → ActionGate → Executor', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const installAction: ActionDefinition = {
    id: 'install-tool',
    name: 'Install Tool',
    description: 'Install a tool',
    level: 'auto_safe',
    reversible: false,
    platforms: ['windows', 'android-termux', 'linux'],
    prerequisites: [],
  };

  // A) install-tool receives 'node' — executor receives rawParams as target
  it('A) executor receives rawParams as request.target', async () => {
    const adapter = createMockAdapter();
    let capturedTarget = '';
    const capturingExecutor: ActionExecutor = async (request) => {
      capturedTarget = request.target;
      return { success: true, message: `installed ${request.target}` };
    };

    await executeWithGatesForTests({
      adapter,
      action: installAction,
      rawParams: 'node',
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    expect(capturedTarget).toBe('node');
  });

  // B) CanonicalRequest contains exactly 'node'
  it('B) CanonicalRequest target matches rawParams exactly', async () => {
    const adapter = createMockAdapter();
    let capturedTarget = '';
    const capturingExecutor: ActionExecutor = async (request) => {
      capturedTarget = request.target;
      return { success: true, message: 'ok' };
    };

    await executeWithGatesForTests({
      adapter,
      action: installAction,
      rawParams: 'node',
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    // CanonicalRequest.target should be exactly 'node'
    expect(capturedTarget).toBe('node');
  });

  // C) Different rawParams arrive correctly
  it('C) different rawParams values arrive correctly at executor', async () => {
    const adapter = createMockAdapter();
    const capturedTargets: string[] = [];
    const capturingExecutor: ActionExecutor = async (request) => {
      capturedTargets.push(request.target);
      return { success: true, message: 'ok' };
    };

    await executeWithGatesForTests({
      adapter,
      action: installAction,
      rawParams: 'git',
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    await executeWithGatesForTests({
      adapter,
      action: installAction,
      rawParams: 'docker',
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    expect(capturedTargets).toEqual(['git', 'docker']);
  });

  // D) Mutating original input after normalization does NOT change the target
  it('D) mutating rawParams object after call does not affect CanonicalRequest', async () => {
    const adapter = createMockAdapter();
    let capturedTarget = '';
    const capturingExecutor: ActionExecutor = async (request) => {
      capturedTarget = request.target;
      return { success: true, message: 'ok' };
    };

    const input = { value: 'node' };
    await executeWithGatesForTests({
      adapter,
      action: installAction,
      rawParams: input.value,
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    // Mutate the original input
    input.value = 'MALICIOUS';

    // The executor already received 'node' — the mutation happened after
    expect(capturedTarget).toBe('node');
  });

  // E) Negative confirmation does not execute — target not consumed
  it('E) negative confirmation prevents execution — no target reaches executor', async () => {
    const adapter = createMockAdapter();
    const executorSpy = vi.fn().mockResolvedValue({ success: true, message: 'should not run' });
    const promptUser = vi.fn().mockResolvedValue('no');

    const confirmInstallAction: ActionDefinition = {
      ...installAction,
      level: 'confirm',
    };

    const result = await executeWithGatesForTests({
      adapter,
      action: confirmInstallAction,
      rawParams: 'node',
      promptUser,
      actions: [confirmInstallAction],
      customExecutorMap: { 'install-tool': executorSpy },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('cancelada');
    expect(executorSpy).not.toHaveBeenCalled();
  });

  // F) rawParams is optional — empty target when omitted
  it('F) omitting rawParams produces empty target in CanonicalRequest', async () => {
    const adapter = createMockAdapter();
    let capturedTarget = '__NOT_SET__';
    const capturingExecutor: ActionExecutor = async (request) => {
      capturedTarget = request.target;
      return { success: true, message: 'ok' };
    };

    await executeWithGatesForTests({
      adapter,
      action: installAction,
      // rawParams intentionally omitted
      actions: [installAction],
      customExecutorMap: { 'install-tool': capturingExecutor },
    });

    expect(capturedTarget).toBe('');
  });
});
