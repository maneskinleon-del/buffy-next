import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'child_process';
import { getFingerprint } from '../src/core/execution-journal.js';

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
});
