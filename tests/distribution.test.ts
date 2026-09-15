import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ─── Paths ────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const script = join(repoRoot, 'scripts', 'buffy-distribute.sh');
const template = join(repoRoot, 'templates', 'ai-context-README.md');

// ─── Constants for assertions ─────────────────────────────────

const GHOST_SCRIPTS = [
  'buffy-doctor.sh',
  'buffy-repair.sh',
  'buffy-verify.sh',
  'buffy-source.sh',
];

const COMMAND_CLAIMS = [
  'buffy doctor',
  'buffy capabilities',
  'buffy act',
  'buffy diagnose',
];

const CONTRACT_MARKERS = [
  'environment specialist',
  'ActionGate',
  'buffy.context/v1',
  'never for',
];

const EXPECTED_ENTRIES = [
  'buffy-next',
  'buffy-context',
  'BUFFY-AGENT-CONTRACT-COMPACT.md',
  'BUFFY-AGENT-CONTRACT.md',
  'AGENT-DISCOVERY.md',
  'scripts/buffy-bootstrap.sh',
  'scripts/buffy-distribute.sh',
];

// ─── Helpers ──────────────────────────────────────────────────

const tempHomes: string[] = [];
function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'buffy-dist-'));
  tempHomes.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tempHomes.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function runBootstrap(home: string): string {
  return execFileSync('bash', [script], {
    env: { ...process.env, HOME: home },
    encoding: 'utf-8',
  });
}

function resolveRef(ref: string, home: string): string {
  return ref.startsWith('~/') ? join(home, ref.slice(2)) : ref;
}

function parseRefs(readme: string): string[] {
  const raw = readme.match(/[~\/][A-Za-z0-9_.~\/+-]+/g) ?? [];
  return raw
    .map((r) => r.replace(/[.,:;)]$/, ''))
    .filter(
      (r) =>
        r.length > 1 &&
        (r.startsWith('~/') || (r.startsWith('/') && r.includes('/', 1))),
    );
}

function readJson(home: string) {
  return JSON.parse(readFileSync(join(home, '.buffy', 'layout.json'), 'utf-8'));
}

function readReadme(home: string): string {
  return readFileSync(join(home, 'ai-context', 'README.md'), 'utf-8');
}

// ─── Tests ────────────────────────────────────────────────────

describe('buffy-distribute', () => {
  // ─── T1 — integridad/renderizado de la plantilla ────────────

  it('T1: template rendered without leftover placeholders', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    expect(readme).not.toMatch(/__[A-Z][A-Z_]*__/);
  });

  it('T1: all referenced paths in README exist on disk', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    const refs = parseRefs(readme);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const abs = resolveRef(ref, home);
      expect(existsSync(abs), `reference ${ref} resolves to ${abs}`).toBe(true);
    }
  });

  it('T1: manifest and README are created', () => {
    const home = makeHome();
    runBootstrap(home);
    expect(existsSync(join(home, '.buffy', 'layout.json'))).toBe(true);
    expect(existsSync(join(home, 'ai-context', 'README.md'))).toBe(true);
  });

  // ─── T2 — anti-rutas fantasma ───────────────────────────────

  it('T2: README does not mention non-existent auxiliar scripts', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    for (const ghost of GHOST_SCRIPTS) {
      expect(readme).not.toContain(ghost);
    }
  });

  it('T2: README does not present Buffy CLI commands as verifiable claims', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    for (const cmd of COMMAND_CLAIMS) {
      expect(readme).not.toContain(cmd);
    }
  });

  it('T2: every manifest entry with status "found" points to an existing path', () => {
    const home = makeHome();
    runBootstrap(home);
    const layout = readJson(home);
    for (const name of EXPECTED_ENTRIES) {
      const entry = layout.entries[name];
      expect(entry, `entry ${name}`).toBeDefined();
      if (entry.status === 'found') {
        expect(existsSync(entry.path), `path for ${name}`).toBe(true);
      } else {
        expect(entry.path).toBeNull();
      }
    }
  });

  it('T2: buffy-context is "missing" (not present in test environment)', () => {
    const home = makeHome();
    runBootstrap(home);
    const layout = readJson(home);
    expect(layout.entries['buffy-context'].status).toBe('missing');
    expect(layout.entries['buffy-context'].path).toBeNull();
  });

  // ─── T3 — README como índice, no copia del contrato ────────

  it('T3: README is a small index (< 4 KB)', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    expect(Buffer.byteLength(readme, 'utf8')).toBeLessThan(4096);
  });

  it('T3: README does not reproduce contract content', () => {
    const home = makeHome();
    runBootstrap(home);
    const readme = readReadme(home);
    for (const marker of CONTRACT_MARKERS) {
      expect(readme).not.toContain(marker);
    }
  });

  // ─── T4 — bootstrap en entorno limpio ───────────────────────

  it('T4: generates ~/.buffy/layout.json and ~/ai-context/README.md from scratch', () => {
    const home = makeHome();
    expect(existsSync(join(home, '.buffy'))).toBe(false);
    expect(existsSync(join(home, 'ai-context'))).toBe(false);

    runBootstrap(home);

    expect(existsSync(join(home, '.buffy', 'layout.json'))).toBe(true);
    expect(existsSync(join(home, 'ai-context', 'README.md'))).toBe(true);
  });

  it('T4: buffy-next found at script location, context missing', () => {
    const home = makeHome();
    runBootstrap(home);
    const layout = readJson(home);

    expect(layout.entries['buffy-next'].status).toBe('found');
    expect(layout.entries['buffy-next'].path).toBe(repoRoot);

    expect(layout.entries['buffy-context'].status).toBe('missing');
    expect(layout.entries['buffy-context'].path).toBeNull();
  });

  it('T4: does not create unrelated files or directories', () => {
    const home = makeHome();
    runBootstrap(home);

    const top = readdirSync(home);
    // only .buffy and ai-context should exist
    expect(top.sort()).toEqual(['.buffy', 'ai-context']);
  });

  it('T4: idempotent — second run produces identical entries and README', () => {
    const home = makeHome();
    runBootstrap(home);

    const layout1 = readJson(home);
    const readme1 = readReadme(home);

    runBootstrap(home);

    const layout2 = readJson(home);
    const readme2 = readReadme(home);

    expect(readme2).toBe(readme1);
    expect(layout2.entries).toEqual(layout1.entries);
    expect(layout2.artifacts).toEqual(layout1.artifacts);
  });

  it('T4: script exits 0 on success', () => {
    const home = makeHome();
    const out = runBootstrap(home);
    expect(out).toContain('buffy-distribute: manifest ->');
    expect(out).toContain('buffy-distribute: readme   ->');
  });

  // ─── T5 — Buffy Context encontrado: entrypoints reales en README ──

  function makeContextFixture(home: string): string {
    const ctx = join(home, 'buffy-context');
    mkdirSync(join(ctx, 'scripts'), { recursive: true });
    mkdirSync(join(ctx, 'ai-context'), { recursive: true });
    for (const s of ['buffy-agent.sh', 'buffy-memory.sh', 'buffy-router.sh', 'buffy-doctor.sh']) {
      writeFileSync(join(ctx, 'scripts', s), '#!/usr/bin/env bash\n');
    }
    writeFileSync(join(ctx, 'ai-context', 'LOAD_CONTEXT.md'), '# protocolo\n');
    return ctx;
  }

  function runBootstrapFound(home: string, ctx: string): string {
    return execFileSync('bash', [script], {
      env: { ...process.env, HOME: home, BUFFY_CONTEXT_HOME: ctx },
      encoding: 'utf-8',
    });
  }

  it('T5: buffy-context found when BUFFY_CONTEXT_HOME set', () => {
    const home = makeHome();
    const ctx = makeContextFixture(home);
    runBootstrapFound(home, ctx);

    const layout = readJson(home);
    expect(layout.entries['buffy-context'].status).toBe('found');
    expect(layout.entries['buffy-context'].path).toBe(ctx);
  });

  it('T5: README lists verified Buffy Context entrypoints when found', () => {
    const home = makeHome();
    const ctx = makeContextFixture(home);
    runBootstrapFound(home, ctx);

    const readme = readReadme(home);
    for (const p of [
      join(ctx, 'ai-context', 'LOAD_CONTEXT.md'),
      join(ctx, 'scripts', 'buffy-agent.sh'),
      join(ctx, 'scripts', 'buffy-memory.sh'),
      join(ctx, 'scripts', 'buffy-router.sh'),
      join(ctx, 'scripts', 'buffy-doctor.sh'),
    ]) {
      // README renders paths under $HOME in tilde form (display_path).
      const tilde = p.startsWith(home) ? `~${p.slice(home.length)}` : p;
      expect(readme).toContain(tilde);
    }
  });

  it('T5: README states roles + complementarity, and all refs verify', () => {
    const home = makeHome();
    const ctx = makeContextFixture(home);
    runBootstrapFound(home, ctx);

    const readme = readReadme(home);
    expect(readme).toMatch(/Capacidades/);
    expect(readme).toMatch(/complementarias/);
    expect(readme).toMatch(/memoria/);
    expect(readme).toMatch(/entorno vivo/);

    const refs = parseRefs(readme);
    for (const ref of refs) {
      const abs = resolveRef(ref, home);
      expect(existsSync(abs), `reference ${ref} resolves to ${abs}`).toBe(true);
    }
  });
});
