import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveContextRepo,
  resolveScriptPath,
  listCtxCommands,
  readContextVersion,
  execCtx,
} from '../src/shared/ctx.js';
import { execFileSync } from 'child_process';

// ─── Fixture repo (BUFFY_CONTEXT_REPO → tmp dir) ─────────────

const fixtureRepo = join(tmpdir(), `buffy-ctx-fixture-${process.pid}`);

function makeFixture(): void {
  mkdirSync(join(fixtureRepo, 'scripts'), { recursive: true });
  // Script inocuo: echo de args (prueba pass-through verbatim)
  const echo = join(fixtureRepo, 'scripts', 'buffy-echo.sh');
  writeFileSync(echo, '#!/usr/bin/env bash\ncount=0\nfor a in "$@"; do echo "arg$count=$a"; count=$((count+1)); done\n');
  chmodSync(echo, 0o755);
  // Script que falla (exit 7 — código distintivo para verificar passthrough)
  const fail = join(fixtureRepo, 'scripts', 'buffy-fail.sh');
  writeFileSync(fail, '#!/usr/bin/env bash\necho "mensaje-stderr-ctx" >&2\nexit 7\n');
  chmodSync(fail, 0o755);
  writeFileSync(join(fixtureRepo, 'VERSION'), 'v9.9.9-test\n');
}

makeFixture();
const prevRepo = process.env.BUFFY_CONTEXT_REPO;
process.env.BUFFY_CONTEXT_REPO = fixtureRepo;

afterAll(() => {
  if (prevRepo === undefined) delete process.env.BUFFY_CONTEXT_REPO;
  else process.env.BUFFY_CONTEXT_REPO = prevRepo;
  rmSync(fixtureRepo, { recursive: true, force: true });
});

// ─── Resolución de repo (Ajuste 1: REPO, no HOME) ────────────

describe('ctx — resolución de repo', () => {
  it('respeta BUFFY_CONTEXT_REPO (override de instalación)', () => {
    expect(resolveContextRepo()).toBe(fixtureRepo);
  });

  it('nombre inválido → null (path traversal y caracteres de inyección bloqueados)', () => {
    // El nombre se valida ANTES de interpolar en ruta: ../ nunca llega a
    // convertirse en scripts/buffy-../foo.sh
    expect(resolveScriptPath('../evil')).toBeNull();
    expect(resolveScriptPath('foo bar')).toBeNull();
    expect(resolveScriptPath('foo;rm')).toBeNull();
    expect(resolveScriptPath('')).toBeNull();
    expect(resolveScriptPath('memory')).not.toBeNull(); // válido: [a-z0-9-]+
  });
});

// ─── Discovery (Ajuste 2: filesystem, no lista cerrada) ──────

describe('ctx — discovery por filesystem', () => {
  it('descubre scripts buffy-*.sh y strippea prefix/suffix', () => {
    const cmds = listCtxCommands();
    expect(cmds).toContain('echo');
    expect(cmds).toContain('fail');
    expect(cmds).toEqual([...cmds].sort());
  });

  it('repo inexistente → lista vacía (no crash)', () => {
    const prev = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = join(tmpdir(), 'buffy-no-existe-12345');
    expect(listCtxCommands()).toEqual([]);
    process.env.BUFFY_CONTEXT_REPO = prev;
  });
});

// ─── execCtx: pass-through estricto ──────────────────────────

describe('ctx — exec pass-through', () => {
  it('Ajuste 3b: args pasados VERBATIM, sin reinterpretación (incluye --flags)', async () => {
    // Si el delegador filtrara/reordenara/parseara args, este test falla:
    // --json debe llegar al script intacto, no ser consumido como flag de Next.
    const code = await execCtx('echo', ['hola', '--json', 'mundo con espacios']);
    expect(code).toBe(0);
  });

  it('stdout del script fluye sin mediación (pass-through, subprocess real)', async () => {
    // Con stdio:inherit el output del hijo va directo a los fd del proceso —
    // inaptable por monkey-patching (esa es precisamente la prueba del
    // pass-through). Se verifica via subprocess del CLI: el padre captura
    // el stdout del nieto solo porque heredó los fd.
    const cli = new URL('../src/cli.ts', import.meta.url).pathname;
    const out = execFileSync(
      'npx',
      ['tsx', cli, 'ctx', 'echo', 'capturado'],
      { encoding: 'utf-8', env: { ...process.env, BUFFY_CONTEXT_REPO: fixtureRepo } },
    );
    expect(out).toContain('arg0=capturado');
  });

  it('exit code del script se preserva (exit 7 → 7, no colapsado a 1)', async () => {
    const code = await execCtx('fail', []);
    expect(code).toBe(7);
  });

  it('script inexistente → exit 1 + stderr nombrando la capa y el remedio (R2/R4)', async () => {
    // Los mensajes de execCtx van por console.error → stderr del proceso,
    // pero con stdio:inherit del nieto no; estos son del PADRE (Node), así
    // que se verifican via subprocess CLI capturando stderr.
    const cli = new URL('../src/cli.ts', import.meta.url).pathname;
    let code = 0;
    let err = '';
    try {
      execFileSync('npx', ['tsx', cli, 'ctx', 'noexiste'], {
        encoding: 'utf-8',
        env: { ...process.env, BUFFY_CONTEXT_REPO: fixtureRepo },
      });
    } catch (e: any) {
      code = e.status ?? 1;
      err = e.stderr ?? '';
    }
    expect(code).toBe(1);
    expect(err).toContain('ctx:');
    expect(err).toContain('buffy env'); // apunta al diagnóstico de topología
  });
});

// ─── env: topología (R3) ─────────────────────────────────────

describe('env — topología de instalación', () => {
  it('reporta versión de Context desde VERSION (null honesto si falta)', () => {
    expect(readContextVersion()).toBe('v9.9.9-test');
    const prev = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = tmpdir(); // repo sin VERSION
    expect(readContextVersion()).toBeNull();
    process.env.BUFFY_CONTEXT_REPO = prev;
  });
});

// ─── CLI end-to-end: `buffy ctx` sin args (Ajuste 3a: exit 0) ─

describe('CLI wiring — buffy ctx (contracto de superficie)', () => {
  it('el dispatch de ctx existe en cli.ts y corre ANTES de createAdapter', async () => {
    // Guard estructural: ctx es comando de topología — debe funcionar aunque
    // el adapter esté roto. Si alguien mueve el dispatch después de
    // createAdapter, este test falla.
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../src/cli.ts', import.meta.url),
      'utf-8',
    );
    const ctxIdx = src.indexOf("command === 'ctx'");
    const adapterIdx = src.indexOf('const adapter = await createAdapter()');
    expect(ctxIdx).toBeGreaterThan(-1);
    expect(adapterIdx).toBeGreaterThan(-1);
    // ctx debe aparecer ANTES de la creación del adapter en main()
    expect(ctxIdx).toBeLessThan(adapterIdx);
  });

  it('sin args → exit 0 con listado (Ajuste 3a: verificado vía subprocess CLI)', async () => {
    // Ejecuta el CLI real en modo dev (tsx) con el fixture como repo.
    // No destructivo: solo listing.
    const cli = new URL('../src/cli.ts', import.meta.url).pathname;
    const out = execFileSync(
      'npx',
      ['tsx', cli, 'ctx'],
      {
        encoding: 'utf-8',
        env: { ...process.env, BUFFY_CONTEXT_REPO: fixtureRepo },
      },
    );
    expect(out).toContain('buffy ctx');
    expect(out).toContain('echo');
    expect(out).toContain('Uso: buffy ctx <comando>');
  });
});
