import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      expect(releaseInflight(result.fingerprint, { executionId: 'exec-456' })).toBe(true);
    });

    it('identidad obligatoria: un claim con executionId no se libera sin nombrarlo', () => {
      const res = claimInflight('identidad-obligatoria', 't', 'linux', { executionId: 'exec-e1' });
      expect(res.claimed).toBe(true);

      // Sin nombrar: no se borra nada, aunque exista el fingerprint
      expect(releaseInflight(res.fingerprint)).toBe(false);
      expect(existsSync(res.claimPath)).toBe(true);

      // Nombrando la identidad correcta: se libera
      expect(releaseInflight(res.fingerprint, { executionId: 'exec-e1' })).toBe(true);
      expect(existsSync(res.claimPath)).toBe(false);
    });

    it('equivalent concurrent operations blocked', () => {
      const result1 = claimInflight('install-tool-test2', 'node', 'linux', { executionId: 'exec-1' });
      expect(result1.claimed).toBe(true);
      const result2 = claimInflight('install-tool-test2', 'node', 'linux', { executionId: 'exec-2' });
      expect(result2.claimed).toBe(false);
      expect(releaseInflight(result1.fingerprint, { executionId: 'exec-1' })).toBe(true);
    });

    it('different operations not blocked', () => {
      const result1 = claimInflight('install-tool-test3', 'node', 'linux', { executionId: 'exec-1' });
      expect(result1.claimed).toBe(true);
      const result2 = claimInflight('install-tool-test4', 'python', 'linux', { executionId: 'exec-2' });
      expect(result2.claimed).toBe(true);
      expect(releaseInflight(result1.fingerprint, { executionId: 'exec-1' })).toBe(true);
      expect(releaseInflight(result2.fingerprint, { executionId: 'exec-2' })).toBe(true);
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
      // Claim anónimo (sin executionId/requestId): no requiere nombramiento
      expect(releaseInflight(res.fingerprint)).toBe(true);
    });
  });

  describe('Resolución humana de claims abandonados', () => {
    /** Claim escrito a mano: propietario muerto y de otro host (no verificable aquí). */
    function writeAbandonedClaim(executionId: string) {
      const fingerprint = getFingerprint('test-abandoned-' + executionId, 't', 'linux');
      mkdirSync(join(testDir, 'inflight'), { recursive: true });
      const claimPath = join(testDir, 'inflight', `${fingerprint}.json`);
      writeFileSync(
        claimPath,
        JSON.stringify(
          {
            fingerprint,
            actionId: 'test-abandoned-' + executionId,
            target: 't',
            platform: 'linux',
            executionId,
            pid: 2147483646,
            hostname: 'host-remoto',
            startedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
      );
      return { fingerprint, claimPath };
    }

    it('releaseInflight no borra un claim cuya identidad no coincide', () => {
      const res = claimInflight('test-identidad', 't', 'linux', { executionId: 'exec-propio' });
      expect(res.claimed).toBe(true);

      expect(releaseInflight(res.fingerprint, { executionId: 'exec-ajeno' })).toBe(false);
      expect(existsSync(res.claimPath)).toBe(true);

      expect(releaseInflight(res.fingerprint, { executionId: 'exec-propio' })).toBe(true);
      expect(existsSync(res.claimPath)).toBe(false);
    });

    it('resolveClaim exige motivo y ejecutionId coincidente, y registra la decisión', async () => {
      const { resolveClaim } = await import('../src/core/execution-journal.js');
      const { fingerprint, claimPath } = writeAbandonedClaim('exec-resolver');

      // Sin motivo: no es auditable
      expect(
        resolveClaim(fingerprint, 'abandonada_sin_determinar', {
          expected: { executionId: 'exec-resolver' },
          resolutionReason: '   ',
        }),
      ).toBe(false);

      // executionId que no corresponde al claim almacenado
      expect(
        resolveClaim(fingerprint, 'abandonada_sin_determinar', {
          expected: { executionId: 'exec-otro' },
          resolutionReason: 'revisado en el listado',
        }),
      ).toBe(false);
      expect(existsSync(claimPath)).toBe(true);

      // Resolución válida: se registra antes de borrar
      expect(
        resolveClaim(fingerprint, 'efecto_ausente_confirmado', {
          expected: { executionId: 'exec-resolver' },
          resolutionReason: 'verifiqué que el cambio no se aplicó',
        }),
      ).toBe(true);
      expect(existsSync(claimPath)).toBe(false);

      const resolutions = readJournal().filter((e) => e.type === 'resolution' && e.fingerprint === fingerprint);
      expect(resolutions.length).toBe(1);
      expect(resolutions[0].resolution).toBe('efecto_ausente_confirmado');
      expect(resolutions[0].resolutionReason).toBe('verifiqué que el cambio no se aplicó');
      expect(resolutions[0].resolvedBy).toBe('human');
    });

    it('resolveClaim no libera un claim cuyo propietario sigue vivo', async () => {
      const { resolveClaim } = await import('../src/core/execution-journal.js');
      const res = claimInflight('test-vivo', 't', 'linux', { executionId: 'exec-vivo' });

      expect(
        resolveClaim(res.fingerprint, 'abandonada_sin_determinar', {
          expected: { executionId: 'exec-vivo' },
          resolutionReason: 'intento sobre proceso vivo',
        }),
      ).toBe(false);
      expect(existsSync(res.claimPath)).toBe(true);

      releaseInflight(res.fingerprint, { executionId: 'exec-vivo' });
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
