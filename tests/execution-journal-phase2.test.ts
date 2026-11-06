// Execution Journal Fase 2 — tests de idempotencia (at-most-once)
// Diseño v3: ai-context/reports/execution-journal-phase1/design-v3.md (§5-§12)
// T1–T17 según §10. Los tests de fault injection (T6-T9) corren en procesos
// hijos vía tests/fixtures/phase2-runner.ts con BUFFY_FAULT_POINT.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  beginKey,
  finishKey,
  hitFaultPoint,
  lookupKey,
  resolveKey,
  validateIdempotencyKey,
  keyHashOf,
  currentLivenessFields,
  getFingerprint,
  getJournalPath,
  getInflightDir,
} from '../src/core/execution-journal.js';
import { ActionGate } from '../src/core/action-gate.js';
import type { ActionDefinition, ActionResult, PlatformAdapter, ActionExecutor } from '../src/core/types.js';
import type { ExecutorRegistry } from '../src/core/executor-registry.js';

// Timeout alto: los hijos con npx tsx y el delay de T5 son lentos.
let testTimeoutMs = 60000;

let dir: string;
let execLogPath: string;
let createdDirs: string[];

const RUNNER = new URL('./fixtures/phase2-runner.ts', import.meta.url).pathname;
const CHILD_ENV_EXTRA = ['BUFFY_EXEC_LOG', 'BUFFY_EXEC_DELAY', 'BUFFY_EXEC_MODE', 'BUFFY_RESOLVE_REASON', 'BUFFY_RESOLVE_EVIDENCE'];

function freshDir(): void {
  dir = mkdtempSync(join(tmpdir(), 'buffy-fase2-'));
  createdDirs.push(dir);
  execLogPath = join(dir, 'exec.log');
  process.env.BUFFY_DIR = dir;
}

beforeEach(() => {
  createdDirs = [];
  freshDir();
});

afterEach(() => {
  for (const d of createdDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {}
  }
  for (const k of ['BUFFY_DIR', ...CHILD_ENV_EXTRA, 'BUFFY_FAULT_POINT'] as string[]) delete process.env[k];
});

// ─── Helpers ──────────────────────────────────────────────

const FP_T = (): string => getFingerprint('test-fase2', 'node', 'linux');
const journalPath = (): string => getJournalPath();
const execCount = (): number => (existsSync(execLogPath) ? readFileSync(execLogPath, 'utf-8').split('\n').filter((l) => l.trim()).length : 0);

function runChild(args: string[], extraEnv: Record<string, string> = {}): { code: number; raw: string } {
  const res = spawnSync('npx', ['tsx', RUNNER, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, BUFFY_DIR: dir, BUFFY_EXEC_LOG: execLogPath, ...extraEnv },
  });
  return { code: res.status ?? 137, raw: (res.stdout ?? '') + '\n' + (res.stderr ?? '') };
}

function parseResult(raw: string): { success: boolean; message: string; persisted?: boolean; details?: Record<string, unknown>; state?: string } {
  const line = raw.split('\n').find((l) => l.startsWith('@@RESULT@@'));
  if (!line) throw new Error(`hijo sin @@RESULT@@; salida cruda:\n${raw}`);
  return JSON.parse(line.slice('@@RESULT@@'.length));
}

interface SeedSpec {
  type: string;
  key: string;
  fingerprint?: string;
  executionId?: string;
  result?: { success: boolean; message: string } | null;
  pid?: number;
  hostname?: string;
  bootId?: string | null;
  starttime?: number | null;
  resolution?: string;
  reason?: string;
}

/** Siembra una entrada con key en journal.jsonl (append directo, fuera del API). */
function seedKeyEntry(spec: SeedSpec): void {
  const { key, ...rest } = spec;
  const line = {
    fingerprint: rest.fingerprint ?? FP_T(),
    actionId: 'test-fase2',
    target: 'node',
    platform: 'linux',
    executionId: rest.executionId ?? `exec-${spec.type}`,
    ts: new Date().toISOString(),
    idempotencyKey: key,
    keyHash: keyHashOf(key),
    ...rest,
  };
  appendFileSync(journalPath(), JSON.stringify(line) + '\n');
}

/** Siembra un claim en inflight/ con propietario muerto y de otro host por defecto. */
function seedClaim(fingerprint: string, executionId: string, opts: { pid?: number; hostname?: string } = {}): string {
  mkdirSync(getInflightDir(), { recursive: true });
  const claimPath = join(getInflightDir(), `${fingerprint}.json`);
  writeFileSync(
    claimPath,
    JSON.stringify({
      fingerprint,
      actionId: 'test-fase2',
      target: 'node',
      platform: 'linux',
      executionId,
      pid: opts.pid ?? 2147483646,
      hostname: opts.hostname ?? 'host-remoto',
      startedAt: new Date().toISOString(),
    }) + '\n',
  );
  return claimPath;
}

function keyEntries(key: string): Array<Record<string, any>> {
  if (!existsSync(journalPath())) return [];
  const kh = keyHashOf(key);
  return readFileSync(journalPath(), 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { _corrupt: true, raw: l, keyHash: l.includes(kh) ? kh : undefined };
      }
    })
    .filter((e) => e.keyHash === kh);
}

function entryCountByType(key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of keyEntries(key)) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

function dirSnapshot(): string[] {
  return readdirSync(dir).sort();
}

// ─── Adaptador/registry en proceso (para tests sin hijos) ───

function createMockAdapter(platform = 'linux'): PlatformAdapter {
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

function makeRegistry(executor: ActionExecutor): ExecutorRegistry {
  return {
    get: (id: string) => (id === 'test-fase2' ? executor : undefined),
    has: (id: string) => id === 'test-fase2',
  };
}

function makeAction(): ActionDefinition {
  return {
    id: 'test-fase2',
    name: 'test-fase2',
    description: 'Test',
    level: 'auto_safe',
    reversible: false,
    platforms: ['linux', 'windows', 'android-termux'],
    prerequisites: [],
  };
}

function makeGateWithExecutor(fn: (request: any) => Promise<ActionResult>, gateOpts: { adapter?: PlatformAdapter } = {}): ActionGate {
  return new ActionGate({
    adapter: gateOpts.adapter ?? createMockAdapter(),
    actionDefinitions: [makeAction()],
    executorRegistry: makeRegistry(fn as ActionExecutor),
  });
}

// ═══════════════════ T1–T17 ═══════════════════

describe('Execution Journal Fase 2 — idempotencia (at-most-once, diseño v3)', () => {
  it('T1: primera ejecución → completed; segunda → cached, executor invocado 1 vez', async () => {
    const r1 = parseResult(runChild(['execute', 'K-T1']).raw);
    expect(r1.success).toBe(true);
    expect(r1.persisted).toBe(true);
    expect(execCount()).toBe(1);
    expect(entryCountByType('K-T1')).toEqual({ started: 1, completed: 1 });

    const r2 = parseResult(runChild(['execute', 'K-T1']).raw);
    expect(r2.success).toBe(true);
    expect(String(r2.message)).toContain('cached');
    expect(execCount()).toBe(1);
  }, testTimeoutMs);

  it('T2: misma key, fingerprint distinta → key_conflict, sin ejecutar', async () => {
    seedKeyEntry({ type: 'started', key: 'K-T2', fingerprint: 'no-es-la-fingerprint' });
    const before = keyEntries('K-T2').length;
    const r = parseResult(runChild(['execute', 'K-T2']).raw);
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('key_conflict');
    expect(execCount()).toBe(0);
    expect(keyEntries('K-T2').length).toBe(before);
  }, testTimeoutMs);

  it('T3: keys peligrosas → invalid_key; nada fuera de BUFFY_DIR', async () => {
    for (const bad of ['../x', 'a/b', 'ÁéÍ', 'k'.repeat(257), '']) {
      expect(validateIdempotencyKey(bad)).toBe(false);
    }
    const before = dirSnapshot();
    for (const bad of ['../x', 'a/b', 'ÁéÍ', 'k'.repeat(257), '']) {
      const r = parseResult(runChild(['execute', bad]).raw);
      expect(r.success).toBe(false);
      expect(String(r.message)).toContain('invalid_key');
      expect(execCount()).toBe(0);
    }
    expect(dirSnapshot()).toEqual(before);
  }, testTimeoutMs);

  it('T4: dos procesos simultáneos, misma key → un proceed, el otro in_progress o cached; executor 1 vez', async () => {
    const mk = (): ChildProcess => spawn('npx', ['tsx', RUNNER, 'execute', 'K-T4'], { env: { ...process.env, BUFFY_DIR: dir, BUFFY_EXEC_LOG: execLogPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    const p1 = mk();
    const p2 = mk();
    const outs = await Promise.all([
      new Promise<string>((res) => { let b = ''; p1.stdout?.on('data', (d) => (b += d)); p1.on('exit', () => res(b)); p1.on('error', () => res(b)); }),
      new Promise<string>((res) => { let b = ''; p2.stdout?.on('data', (d) => (b += d)); p2.on('exit', () => res(b)); p2.on('error', () => res(b)); }),
    ]);
    const results = outs.map(parseResult);
    expect(execCount()).toBe(1);
    const counts = entryCountByType('K-T4');
    expect(counts['started']).toBe(1);
    expect(counts['completed']).toBe(1);
    // El que no procede queda in_progress (dueño vivo) o cached (si llegó después del completed)
    const others = results.filter((r) => String(r.message).includes('in_progress') || String(r.message).includes('[cached]'));
    expect(others).toHaveLength(1);
  }, testTimeoutMs);

  it('T5: dos keys distintas, misma fingerprint, serializadas → un completed, el otro aborted/claim_exists', async () => {
    const winner = spawn('npx', ['tsx', RUNNER, 'execute', 'K-T5-A'], { env: { ...process.env, BUFFY_DIR: dir, BUFFY_EXEC_LOG: execLogPath, BUFFY_EXEC_DELAY: '4000' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((res) => setTimeout(res, 1500)); // el winner ya tiene started + claim
    const loser = parseResult(runChild(['execute', 'K-T5-B']).raw);
    expect(loser.success).toBe(false);
    expect(String(loser.message)).toContain('claim_exists');
    await new Promise<string>((res) => { let b = ''; winner.stdout?.on('data', (d) => (b += d)); winner.on('exit', () => res(b)); winner.on('error', () => res(b)); });

    expect(execCount()).toBe(1);
    expect(entryCountByType('K-T5-A')).toEqual({ started: 1, completed: 1 });
    expect(entryCountByType('K-T5-B')).toEqual({ started: 1, aborted: 1 });
  }, testTimeoutMs);

  it('T6: crash after_started → needs_resolution; executor 0 veces', async () => {
    const crash = runChild(['execute', 'K-T6'], { BUFFY_FAULT_POINT: 'after_started' });
    expect(crash.code).toBe(137);
    expect(execCount()).toBe(0);
    expect(entryCountByType('K-T6')).toEqual({ started: 1 });

    const retry = parseResult(runChild(['execute', 'K-T6']).raw);
    expect(retry.success).toBe(false);
    expect(String(retry.message)).toContain('needs_resolution');
    expect(execCount()).toBe(0);
  }, testTimeoutMs);

  it('T7: crash after_claim → needs_resolution; executor 0 veces', async () => {
    const crash = runChild(['execute', 'K-T7'], { BUFFY_FAULT_POINT: 'after_claim' });
    expect(crash.code, `raw=${crash.raw}`).toBe(137);
    expect(execCount()).toBe(0); // el hook sale antes del executor: sin efecto
    expect(entryCountByType('K-T7')).toEqual({ started: 1 });

    const retry = parseResult(runChild(['execute', 'K-T7']).raw);
    expect(retry.success).toBe(false);
    expect(String(retry.message)).toContain('needs_resolution');
    expect(execCount()).toBe(0);
  }, testTimeoutMs);

  it('T8: crash after_execute y before_terminal_append → mismo resultado, needs_resolution, no reejecuta', async () => {
    for (const point of ['after_execute', 'before_terminal_append'] as const) {
      freshDir(); // escenario independiente: el crash del punto anterior deja claim huérfano
      const key = `K-T8-${point}`;
      const crash = runChild(['execute', key], { BUFFY_FAULT_POINT: point });
      expect(crash.code, `punto=${point} raw=${crash.raw}`).toBe(137);
      expect(execCount()).toBe(1);
      const counts = entryCountByType(key);
      expect(counts['completed']).toBeUndefined();
      expect(counts['failed']).toBeUndefined();

      const retry = parseResult(runChild(['execute', key]).raw);
      expect(retry.success).toBe(false);
      expect(String(retry.message)).toContain('needs_resolution');
      expect(execCount()).toBe(1);
    }
  }, testTimeoutMs);

  it('T9: fallo simulado (EISDIR) del append terminal → persisted:false, claim retenido; nada de "incierto" escrito', async () => {
    // El executor destruye journal.jsonl (lo reemplaza por un directorio) antes de
    // que el gate intente el append terminal: simula ENOSPC/EIO.
    let journalBackup = '';
    const gate = makeGateWithExecutor(async () => {
      journalBackup = readJournalRawText(); // ya contiene el started de beginKey
      rmSync(journalPath());
      mkdirSync(journalPath());
      return { success: true, message: 'sirvió' };
    });
    const r = await gate.execute('test-fase2', 'node', { idempotencyKey: 'K-T9' });
    expect(r.success).toBe(true);
    expect(r.persisted).toBe(false);
    expect(existsSync(join(getInflightDir(), `${FP_T()}.json`))).toBe(true); // claim retenido

    // Recuperación: restaurar el journal (con dueño muerto para el reintento)
    rmSync(journalPath(), { recursive: true });
    writeFileSync(
      journalPath(),
      journalBackup.replace(/"pid":[0-9]+/, '"pid":2147483646').replace(/"hostname":"[^"]+"/, '"hostname":"host-remoto"'),
    );
    expect(entryCountByType('K-T9')).toEqual({ started: 1 }); // solo started, sin terminal
    expect(readJournalRawText()).not.toContain('incierto');

    const retry = parseResult(runChild(['execute', 'K-T9']).raw);
    expect(retry.success).toBe(false);
    expect(String(retry.message)).toContain('needs_resolution');
    expect(execCount()).toBe(0); // el reintento no invoca el executor (la primera vez fue en-proceso)
  }, testTimeoutMs);

  it('T10: fallo del append started → executor no invocado, error al llamador, sin entradas; reintento proceed', async () => {
    mkdirSync(journalPath()); // journal.jsonl ilegible/escribible como EISDIR
    const r = parseResult(runChild(['execute', 'K-T10']).raw);
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('started');
    expect(execCount()).toBe(0);
    rmSync(journalPath(), { recursive: true });

    const retry = parseResult(runChild(['execute', 'K-T10']).raw);
    expect(retry.success).toBe(true);
    expect(execCount()).toBe(1);
    expect(entryCountByType('K-T10')).toEqual({ started: 1, completed: 1 });
  }, testTimeoutMs);

  it('T11: executor lanza → failed; reintento → needs_resolution', async () => {
    const r1 = parseResult(runChild(['execute', 'K-T11'], { BUFFY_EXEC_MODE: 'throw' }).raw);
    expect(r1.success).toBe(false);
    expect(entryCountByType('K-T11')).toEqual({ started: 1, failed: 1 });
    expect(existsSync(join(getInflightDir(), `${FP_T()}.json`))).toBe(false); // claim liberado tras terminal exitoso

    const r2 = parseResult(runChild(['execute', 'K-T11']).raw);
    expect(r2.success).toBe(false);
    expect(String(r2.message)).toContain('needs_resolution');
    expect(execCount()).toBe(1);
  }, testTimeoutMs);

  it('T12: línea truncada al final → ignorada; otras keys intactas', async () => {
    seedKeyEntry({ type: 'started', key: 'K-T12', executionId: 'exec-t12' });
    seedKeyEntry({ type: 'completed', key: 'K-T12', executionId: 'exec-t12', result: { success: true, message: 'hecho' } });
    const truncated = `{"type":"started","idempotencyKey":"K-T12","keyHash":"${keyHashOf('K-T12')}","finger`;
    appendFileSync(journalPath(), truncated);
    expect(readJournalRawText().endsWith('\n')).toBe(false);

    const info = parseResult(runChild(['lookup', 'K-T12']).raw);
    expect(info.state).toBe('cached');

    // Otra key intacta: proceed y ejecuta
    const r = parseResult(runChild(['execute', 'K-T12-OTRA']).raw);
    expect(r.success).toBe(true);
    expect(execCount()).toBe(1);
    // El truncamiento no fue "reparado" ni eliminado
    expect(readJournalRawText()).toContain(truncated);
  }, testTimeoutMs);

  it('T13: línea corrupta intermedia sobre la key consultada → fail-closed', async () => {
    seedKeyEntry({ type: 'started', key: 'K-T13', executionId: 'exec-t13' });
    const corrupt = `{"type":"started","idempotencyKey":"K-T13","keyHash":"${keyHashOf('K-T13')}","broken`;
    appendFileSync(journalPath(), corrupt + '\n'); // intermedia: termina en \n pero no es la última... añadir algo después
    seedKeyEntry({ type: 'completed', key: 'K-T13', executionId: 'exec-t13', result: { success: true, message: 'hecho' } });

    const info = parseResult(runChild(['lookup', 'K-T13']).raw);
    expect(info.state).toBe('needs_resolution'); // fail-closed aunque la última sea completed

    // Otra key no afectada
    expect(lookupKey('K-T13-OTRA').state).toBe('proceed');
  }, testTimeoutMs);

  it('T14: resolve — 3 resoluciones, rechazos sin reason/evidence y con estado no resolvable', async () => {
    // (a) efecto_confirmado: libera claim y deja la key en cached
    seedKeyEntry({ type: 'started', key: 'K-T14A', executionId: 'exec-t14a' });
    const claimA = seedClaim(FP_T(), 'exec-t14a');
    const rA = resolveKey('K-T14A', 'efecto_confirmado', { reason: 'el efecto estaba ya aplicado' });
    expect(rA.ok).toBe(true);
    expect(existsSync(claimA)).toBe(false);
    expect(lookupKey('K-T14A').state).toBe('cached');

    // (b) efecto_ausente_confirmado sin evidence → rechazado; con evidence → reabre
    seedKeyEntry({ type: 'started', key: 'K-T14B', executionId: 'exec-t14b' });
    const beforeB = keyEntries('K-T14B').length;
    expect(resolveKey('K-T14B', 'efecto_ausente_confirmado', { reason: 'no aplicó', evidence: '' }).ok).toBe(false);
    expect(keyEntries('K-T14B').length).toBe(beforeB);
    const rB = resolveKey('K-T14B', 'efecto_ausente_confirmado', { reason: 'no aplicó', evidence: 'ls del directorio objetivo' });
    expect(rB.ok).toBe(true);
    expect(lookupKey('K-T14B').state).toBe('proceed');

    // (c) abandonada_sin_determinar: conserva claim, bloquea para siempre
    seedKeyEntry({ type: 'started', key: 'K-T14C', executionId: 'exec-t14c' });
    const claimC = seedClaim(FP_T(), 'exec-t14c');
    const rC = resolveKey('K-T14C', 'abandonada_sin_determinar', { reason: 'sin evidencia disponible' });
    expect(rC.ok).toBe(true);
    expect(rC.claimReleased).toBe(false);
    expect(existsSync(claimC)).toBe(true);
    expect(lookupKey('K-T14C').state).toBe('needs_resolution');

    // (d) estado no needs_resolution → not_resolvable, sin entradas nuevas
    seedKeyEntry({ type: 'completed', key: 'K-T14D', executionId: 'exec-t14d', result: { success: true, message: 'vía completed' } });
    const beforeD = keyEntries('K-T14D').length;
    expect(resolveKey('K-T14D', 'efecto_confirmado', { reason: 'no corresponde' }).error).toBe('not_resolvable');
    expect(keyEntries('K-T14D').length).toBe(beforeD);
  }, testTimeoutMs);

  it('T15: aborted por claim_exists → reintento posterior permitido (proceed)', async () => {
    seedKeyEntry({ type: 'aborted', key: 'K-T15', executionId: 'exec-t15', reason: 'claim_exists' });
    const r = parseResult(runChild(['execute', 'K-T15']).raw);
    expect(r.success).toBe(true);
    expect(entryCountByType('K-T15')).toEqual({ aborted: 1, started: 1, completed: 1 });
    expect(execCount()).toBe(1);
  }, testTimeoutMs);

  it('T16: ejecución sin key → idéntica a Fase 1; la suite existente sigue verde', async () => {
    const gate = makeGateWithExecutor(async () => ({ success: true, message: 'ejecutado' }));
    const r = await gate.execute('test-fase2', 'node');
    expect(r.success).toBe(true);
    expect(r.persisted).toBeUndefined();
    const raw = readJournalRawText();
    expect(raw).toContain('"type":"execution"');
    expect(raw).not.toContain('"idempotencyKey"');
    expect(existsSync(join(getInflightDir(), `${FP_T()}.json`))).toBe(false);
    expect(execCount()).toBe(0); // executor en-proceso, no hijo
  }, testTimeoutMs);

  it('T17: resolve con dueño vivo → owner_alive, sin entrada nueva ni cambio en el claim', async () => {
    const fields = currentLivenessFields();
    seedKeyEntry({ type: 'started', key: 'K-T17', executionId: 'exec-t17', pid: fields.pid, hostname: fields.hostname, bootId: fields.bootId, starttime: fields.starttime });
    const claim = seedClaim(FP_T(), 'exec-t17', { pid: fields.pid, hostname: fields.hostname });
    const before = keyEntries('K-T17').length;
    const r = resolveKey('K-T17', 'abandonada_sin_determinar', { reason: 'el dueño sigue vivo' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('owner_alive');
    expect(keyEntries('K-T17').length).toBe(before);
    expect(existsSync(claim)).toBe(true);
  }, testTimeoutMs);
});

// ─── Utilidades locales (definidas al final para claridad) ───

function readJournalRawText(): string {
  try {
    return readFileSync(journalPath(), 'utf-8');
  } catch {
    return '';
  }
}

// Los parámetros usados arriba explican los flujos: hitFaultPoint y beginKey/
// finishKey se usan indirectamente a través del gate y del runner hijo. Esta
// referencia evita que el import caiga si la implementación reordena exports.
void hitFaultPoint;
void beginKey;
void finishKey;
