import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'child_process';
import { getFingerprint, keyHashOf } from '../src/core/execution-journal.js';

// ─── Aislamiento: BUFFY_DIR temporal ─────────────────────────

const dir = join(tmpdir(), `buffy-journal-cli-${process.pid}`);
const cliEnv = (): NodeJS.ProcessEnv => ({ ...process.env, BUFFY_DIR: dir });

beforeAll(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'inflight'), { recursive: true });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ─── Seed: claim abandonado (propietario muerto y de otro host) ──

function seedClaim(actionId: string, executionId: string): string {
  const fingerprint = getFingerprint(actionId, 't', 'linux');
  writeFileSync(
    join(dir, 'inflight', `${fingerprint}.json`),
    JSON.stringify(
      {
        fingerprint,
        actionId,
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
  return fingerprint;
}

interface CliResult {
  code: number;
  out: string;
  err: string;
}

function runCli(args: string[]): CliResult {
  const cli = new URL('../src/cli.ts', import.meta.url).pathname;
  try {
    const out = execFileSync('npx', ['tsx', cli, ...args], {
      encoding: 'utf-8',
      env: cliEnv(),
    });
    return { code: 0, out, err: '' };
  } catch (e: any) {
    return { code: e.status ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}

// ─── buffy journal — resolución humana auditada ──────────────

describe('CLI: buffy journal', () => {
  it('journal list --json expone los claims inflight con su identidad', () => {
    const fp = seedClaim('cli-list-test', 'exec-lista');
    const { code, out } = runCli(['journal', 'list', '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.count).toBeGreaterThanOrEqual(1);
    const claim = parsed.claims.find((c: any) => c.fingerprint === fp);
    expect(claim).toBeDefined();
    expect(claim.executionId).toBe('exec-lista');
    // cleanup del test
    expect(runCli(['journal', 'resolve', fp, 'exec-lista', 'abandonada_sin_determinar', ' limpieza de flujo de listado']).code).toBe(0);
  });

  it('journal resolve sin args requeridos → exit 1 con ayuda', () => {
    const { code, err } = runCli(['journal', 'resolve']);
    expect(code).toBe(1);
    expect(err).toContain('buffy journal');
  });

  it('journal resolve con executionId equivocado → exit 1, el claim se conserva', () => {
    const fp = seedClaim('cli-identity-test', 'exec-correcto');
    const { code, err } = runCli([
      'journal',
      'resolve',
      fp,
      'exec-equivocado',
      'abandonada_sin_determinar',
      'intento con identidad ajena',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('No se resolvió');
    expect(existsSync(join(dir, 'inflight', `${fp}.json`))).toBe(true);
  });

  it('journal resolve con resolución inválida → exit 1 con valores admitidos', () => {
    const fp = seedClaim('cli-resolution-test', 'exec-res');
    const { code, err } = runCli([
      'journal',
      'resolve',
      fp,
      'exec-res',
      'resolucion_inventada',
      'intento con valor no admitido',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('Valores admitidos');
    expect(existsSync(join(dir, 'inflight', `${fp}.json`))).toBe(true);
    // cleanup
    expect(runCli(['journal', 'resolve', fp, 'exec-res', 'abandonada_sin_determinar', ' limpieza de flujo de resolución']).code).toBe(0);
  });

  it('journal resolve válido → exit 0, claim borrado y decisión registrada en el journal', () => {
    const fp = seedClaim('cli-resolve-test', 'exec-resuelve');
    const { code, out } = runCli([
      'journal',
      'resolve',
      fp,
      'exec-resuelve',
      'efecto_ausente_confirmado',
      'verifiqué que el cambio no se aplicó',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('Claim resuelto');
    expect(existsSync(join(dir, 'inflight', `${fp}.json`))).toBe(false);

    const journal = readFileSync(join(dir, 'journal.jsonl'), 'utf-8').trim().split('\n');
    const resolutions = journal
      .map((l) => JSON.parse(l))
      .filter((e: any) => e.type === 'resolution' && e.fingerprint === fp);
    expect(resolutions.length).toBe(1);
    expect(resolutions[0].resolution).toBe('efecto_ausente_confirmado');
    expect(resolutions[0].resolutionReason).toBe('verifiqué que el cambio no se aplicó');
    expect(resolutions[0].executionId).toBe('exec-resuelve');
  });

  // ─── Fase 2: journal resolve --key (subprocess real) ──────────

  const journalFile = (): string => join(dir, 'journal.jsonl');

  function seedKeyEntry(key: string, type: 'started' | 'completed', executionId: string): void {
    appendFileSync(
      journalFile(),
      JSON.stringify({
        type,
        idempotencyKey: key,
        keyHash: keyHashOf(key),
        fingerprint: getFingerprint('cli-key-test', 't', 'linux'),
        actionId: 'cli-key-test',
        target: 't',
        platform: 'linux',
        executionId,
        ts: new Date().toISOString(),
        pid: 2147483646,
        hostname: 'host-remoto',
        bootId: null,
        starttime: null,
        ...(type === 'completed' ? { result: { success: true, message: 'ok' } } : {}),
      }) + '\n',
    );
  }

  function keyResolutions(key: string): any[] {
    if (!existsSync(journalFile())) return [];
    return readFileSync(journalFile(), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((e: any) => e.type === 'resolution' && e.idempotencyKey === key);
  }

  it('--key con needs_resolution → exit 0 y resolución auditada en el journal', () => {
    seedKeyEntry('cli-key-ok', 'started', 'exec-key-ok');
    const { code, out } = runCli([
      'journal',
      'resolve',
      '--key',
      'cli-key-ok',
      'abandonada_sin_determinar',
      'revisé el registro de la key',
    ]);
    expect(code).toBe(0);
    expect(out).toContain('Key resuelta');
    const resolutions = keyResolutions('cli-key-ok');
    expect(resolutions.length).toBe(1);
    expect(resolutions[0].resolution).toBe('abandonada_sin_determinar');
    expect(resolutions[0].reason).toBe('revisé el registro de la key');
    expect(resolutions[0].resolvedBy).toBe('human');
  });

  it('--key efecto_ausente_confirmado sin --evidence → exit 1, sin entrada nueva', () => {
    seedKeyEntry('cli-key-sin-evidencia', 'started', 'exec-key-sin-ev');
    const { code, err } = runCli([
      'journal',
      'resolve',
      '--key',
      'cli-key-sin-evidencia',
      'efecto_ausente_confirmado',
      'lo verifiqué manualmente',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('evidence');
    expect(keyResolutions('cli-key-sin-evidencia').length).toBe(0);
  });

  it('--key efecto_ausente_confirmado con --evidence → exit 0 y evidencia persistida', () => {
    seedKeyEntry('cli-key-con-evidencia', 'started', 'exec-key-con-ev');
    const { code } = runCli([
      'journal',
      'resolve',
      '--key',
      'cli-key-con-evidencia',
      'efecto_ausente_confirmado',
      'verificado que no se aplicó',
      '--evidence',
      'comprobado con git status',
    ]);
    expect(code).toBe(0);
    const resolutions = keyResolutions('cli-key-con-evidencia');
    expect(resolutions.length).toBe(1);
    expect(resolutions[0].evidence).toBe('comprobado con git status');
  });

  it('--key en estado cached (completed) → exit 1 not_resolvable', () => {
    seedKeyEntry('cli-key-completada', 'completed', 'exec-key-completada');
    const { code, err } = runCli([
      'journal',
      'resolve',
      '--key',
      'cli-key-completada',
      'abandonada_sin_determinar',
      'intento sobre key ya completada',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('not_resolvable');
  });

  it('--key inválida (separador de ruta) → exit 1 invalid_key', () => {
    const { code, err } = runCli([
      'journal',
      'resolve',
      '--key',
      'a/b',
      'abandonada_sin_determinar',
      'intento con key inválida',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('invalid_key');
  });

  it('--key sin motivo → exit 1 con ayuda', () => {
    const { code, err } = runCli(['journal', 'resolve', '--key', 'cli-key-sin-motivo', 'abandonada_sin_determinar']);
    expect(code).toBe(1);
    expect(err).toContain('buffy journal');
  });
});
