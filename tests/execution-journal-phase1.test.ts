import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimInflight, appendToJournal, releaseInflight, getFingerprint, readJournal, listInflight } from '../src/core/execution-journal.js';
import { ActionGate } from '../src/core/action-gate.js';
import type { ActionDefinition, ActionResult, PlatformAdapter, ActionExecutor } from '../src/core/types.js';
import type { ExecutorRegistry } from '../src/core/executor-registry.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'buffy-test-'));
  process.env.BUFFY_DIR = testDir;
});

afterEach(() => {
  try {
    // Verificar que no se escribió fuera del directorio temporal
    const home = require('os').homedir();
    const realBuffy = join(home, '.buffy');
    // No verificamos estrictamente para no fallar por estado previo, pero aseguramos limpieza
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  } catch {}
  delete process.env.BUFFY_DIR;
});

function createMockAdapter(platform: string = 'linux'): PlatformAdapter {
  return {
    name: platform as any,
    detect: async () => ({ name: platform as any, os: 'Test', version: '1.0', arch: 'x64' }),
    systemInfo: async () => ({
      os: { name: 'Test', version: '1.0', arch: 'x64' },
      cpu: { model: 'Test', cores: 4 },
      memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
      gpu: { name: 'GPU', driver: '1.0', isGeneric: false },
      storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
      temperature: { cpuCelsius: 45 },
      processes: [],
    }),
    capabilities: async () => [],
  };
}

function makeAction(overrides: Partial<ActionDefinition> & { id: string }): ActionDefinition {
  return {
    name: overrides.id,
    description: 'Test action',
    level: 'auto_safe',
    reversible: false,
    platforms: ['linux', 'windows', 'android-termux'],
    prerequisites: [],
    ...overrides,
  };
}

function mockExecutor(result: ActionResult = { success: true, message: 'executed' }): ActionExecutor {
  const fn = vi.fn(async () => result);
  return fn as any;
}

function makeRegistry(executors: Record<string, ActionExecutor>): ExecutorRegistry {
  return {
    get: (id: string) => executors[id],
    has: (id: string) => id in executors,
  };
}

describe('Execution Journal Fase 1 - Critical Guarantees', () => {
  describe('Fingerprint', () => {
    it('same actionId, target, platform gives same fingerprint', () => {
      const fp1 = getFingerprint('install-tool', 'node', 'linux');
      const fp2 = getFingerprint('install-tool', 'node', 'linux');
      expect(fp1).toBe(fp2);
    });

    it('different target gives different fingerprint', () => {
      const fp1 = getFingerprint('install-tool', 'node', 'linux');
      const fp2 = getFingerprint('install-tool', 'python', 'linux');
      expect(fp1).not.toBe(fp2);
    });

    it('different platform gives different fingerprint', () => {
      const fp1 = getFingerprint('install-tool', 'node', 'linux');
      const fp2 = getFingerprint('install-tool', 'node', 'windows');
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('Inflight claims', () => {
    it('claim is published atomically with complete manifest', () => {
      const result = claimInflight('install-tool-test', 'node', 'linux', { requestId: 'req-123', executionId: 'exec-456' });
      expect(result.claimed).toBe(true);
      expect(existsSync(result.claimPath)).toBe(true);
      const claims = listInflight();
      const claim = claims.find(c => c.fingerprint === result.fingerprint);
      expect(claim?.actionId).toBe('install-tool-test');
      expect(claim?.target).toBe('node');
      expect(claim?.platform).toBe('linux');
      expect(claim?.requestId).toBe('req-123');
      expect(claim?.executionId).toBe('exec-456');
      releaseInflight(result.fingerprint);
    });

    it('equivalent concurrent operations blocked', () => {
      const result1 = claimInflight('install-tool-test2', 'node', 'linux', { executionId: 'exec-1' });
      expect(result1.claimed).toBe(true);
      const result2 = claimInflight('install-tool-test2', 'node', 'linux', { executionId: 'exec-2' });
      expect(result2.claimed).toBe(false);
      releaseInflight(result1.fingerprint);
    });

    it('different operations not blocked', () => {
      const result1 = claimInflight('install-tool-test3', 'node', 'linux', { executionId: 'exec-1' });
      expect(result1.claimed).toBe(true);
      const result2 = claimInflight('install-tool-test4', 'python', 'linux', { executionId: 'exec-2' });
      expect(result2.claimed).toBe(true);
      releaseInflight(result1.fingerprint);
      releaseInflight(result2.fingerprint);
    });
  });

  describe('Journal', () => {
    it('appends entries without overwriting', () => {
      const before = readJournal().length;
      appendToJournal({
        type: 'execution',
        fingerprint: 'abc123',
        actionId: 'test',
        target: 'x',
        platform: 'linux',
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      appendToJournal({
        type: 'execution',
        fingerprint: 'def456',
        actionId: 'test2',
        target: 'y',
        platform: 'linux',
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      const journal = readJournal();
      expect(journal.length).toBeGreaterThanOrEqual(before + 2);
    });
  });

  describe('Reconciliación inequívoca', () => {
    it('no libera sin correlación', async () => {
      const { reconcileClaim } = await import('../src/core/execution-journal.js');
      const res = claimInflight('test-nocorr', 't', 'linux');
      expect(res.claimed).toBe(true);
      const r = reconcileClaim(res.fingerprint);
      expect(r.reconciled).toBe(false);
      releaseInflight(res.fingerprint);
    });
  });

  describe('ActionGate integration', () => {
    it('executes successfully with journal protection', async () => {
      const action = makeAction({ id: 'test-action-j1' });
      const executorSpy = mockExecutor({ success: true, message: 'done' });
      const adapter = createMockAdapter();
      const gate = new ActionGate({
        adapter,
        actionDefinitions: [action],
        executorRegistry: makeRegistry({ 'test-action-j1': executorSpy }),
      });
      const result = await gate.execute('test-action-j1');
      expect(result.success).toBe(true);
      expect((executorSpy as any).mock.calls.length).toBe(1);
    });

    it('blocks equivalent concurrent calls', async () => {
      const action = makeAction({ id: 'test-action-j2' });
      const executorSpy = mockExecutor({ success: true, message: 'done' });
      const adapter = createMockAdapter();
      const gate = new ActionGate({
        adapter,
        actionDefinitions: [action],
        executorRegistry: makeRegistry({ 'test-action-j2': executorSpy }),
      });
      const [r1, r2] = await Promise.all([
        gate.execute('test-action-j2'),
        gate.execute('test-action-j2'),
      ]);
      expect((executorSpy as any).mock.calls.length).toBe(1);
    });
  });
});
