/**
 * MCP buffy_verify — tests mínimos (MVP)
 *
 * Cobertura:
 *  1. buffy_verify tool schema: readOnlyHint=true, destructiveHint=false
 *  2. tools/list anuncia buffy_context Y buffy_verify
 *  3. buffy_verify devuelve JSON parseable con keys
 *     {repo, verified, stale, unknown, expired, trust_score, items, _info}
 *
 * El FUSION GUARD (execCtxCaptured vs execCtx) vive en
 * tests/mcp-fusion-guard.test.ts — separado para aislar el vi.mock del
 * módulo ctx (que contaminaría las pruebas de integración real).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BUFFY_CONTEXT_TOOL, BUFFY_VERIFY_TOOL, BUFFY_CONTINUITY_TOOL } from '../src/mcp.js';
import { execCtxCaptured } from '../src/shared/ctx.js';

// ─── Fixture repo con mock buffy-verify.sh ────────────────────

const fixtureRepo = join(tmpdir(), `buffy-mcp-verify-fixture-${process.pid}`);

beforeAll(() => {
  mkdirSync(join(fixtureRepo, 'scripts'), { recursive: true });
  const verifyScript = join(fixtureRepo, 'scripts', 'buffy-verify.sh');
  writeFileSync(
    verifyScript,
    [
      '#!/usr/bin/env bash',
      '# Mock buffy-verify.sh — produce JSON estructurado',
      'cat <<JSONEOF',
      JSON.stringify({
        repo: fixtureRepo,
        verified: 14,
        stale: 5,
        unknown: 0,
        expired: 0,
        trust_score: 73.7,
        items: [],
        _info:
          'verificación factual de ai-context/INFO-core.md vs sistema real',
      }),
      'JSONEOF',
    ].join('\n') + '\n',
  );
  chmodSync(verifyScript, 0o755);
});

afterAll(() => {
  rmSync(fixtureRepo, { recursive: true, force: true });
});

// ─── 1. Schema and annotations ────────────────────────────────

describe('MCP buffy_verify — schema and annotations', () => {
  it('tiene readOnlyHint: true y destructiveHint: false', () => {
    expect(BUFFY_VERIFY_TOOL.annotations.readOnlyHint).toBe(true);
    expect(BUFFY_VERIFY_TOOL.annotations.destructiveHint).toBe(false);
  });

  it('name es buffy_verify, inputSchema es {} con additionalProperties: false', () => {
    expect(BUFFY_VERIFY_TOOL.name).toBe('buffy_verify');
    expect(BUFFY_VERIFY_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('annotations incluye idempotentHint: true y openWorldHint: false', () => {
    expect(BUFFY_VERIFY_TOOL.annotations.idempotentHint).toBe(true);
    expect(BUFFY_VERIFY_TOOL.annotations.openWorldHint).toBe(false);
  });
});

// ─── 2. tools/list announces all three tools ─────────────────────

describe('MCP tools/list', () => {
  it('exporta buffy_context, buffy_verify Y buffy_continuity con names correctos', () => {
    expect(BUFFY_CONTEXT_TOOL.name).toBe('buffy_context');
    expect(BUFFY_VERIFY_TOOL.name).toBe('buffy_verify');
    expect(BUFFY_CONTINUITY_TOOL.name).toBe('buffy_continuity');
  });

  it('handler de tools/list incluye las 3 tools', () => {
    const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf-8');
    expect(src).toContain(
      'tools: [BUFFY_CONTEXT_TOOL, BUFFY_VERIFY_TOOL, BUFFY_CONTINUITY_TOOL]',
    );
  });
});

// ─── 2b. buffy_continuity schema and annotations ─────────────────

describe('MCP buffy_continuity — schema and annotations', () => {
  it('tiene readOnlyHint: true y destructiveHint: false', () => {
    expect(BUFFY_CONTINUITY_TOOL.annotations.readOnlyHint).toBe(true);
    expect(BUFFY_CONTINUITY_TOOL.annotations.destructiveHint).toBe(false);
  });

  it('name es buffy_continuity, inputSchema es {} con additionalProperties: false', () => {
    expect(BUFFY_CONTINUITY_TOOL.name).toBe('buffy_continuity');
    expect(BUFFY_CONTINUITY_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('annotations incluye idempotentHint: true y openWorldHint: false', () => {
    expect(BUFFY_CONTINUITY_TOOL.annotations.idempotentHint).toBe(true);
    expect(BUFFY_CONTINUITY_TOOL.annotations.openWorldHint).toBe(false);
  });
});

// ─── 3. buffy_verify returns JSON with required keys ──────────

describe('MCP buffy_verify — JSON output', () => {
  it('devuelve JSON parseable con keys {repo, verified, stale, unknown, expired, trust_score, items, _info}', async () => {
    const prevRepo = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = fixtureRepo;

    try {
      const result = await execCtxCaptured('verify', ['--json']);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const data = JSON.parse(result.stdout);

      // Keys requeridas (ver task spec §4)
      expect(data).toHaveProperty('repo');
      expect(data).toHaveProperty('verified');
      expect(data).toHaveProperty('stale');
      expect(data).toHaveProperty('unknown');
      expect(data).toHaveProperty('expired');
      expect(data).toHaveProperty('trust_score');
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('_info');

      // Tipos y valores
      expect(data.repo).toBe(fixtureRepo);
      expect(data.verified).toBe(14);
      expect(data.stale).toBe(5);
      expect(data.unknown).toBe(0);
      expect(data.expired).toBe(0);
      expect(data.trust_score).toBe(73.7);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data._info).toContain('verificación factual');
    } finally {
      if (prevRepo === undefined) delete process.env.BUFFY_CONTEXT_REPO;
      else process.env.BUFFY_CONTEXT_REPO = prevRepo;
    }
  });

  it('captura stderr por separado (no mezclado con stdout)', async () => {
    const prevRepo = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = fixtureRepo;

    try {
      const result = await execCtxCaptured('verify', ['--json']);
      // El mock no escribe a stderr
      expect(result.stderr).toBe('');
      // stdout es JSON puro (parseable)
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    } finally {
      if (prevRepo === undefined) delete process.env.BUFFY_CONTEXT_REPO;
      else process.env.BUFFY_CONTEXT_REPO = prevRepo;
    }
  });
});

// ─── 4. buffy_continuity integration — JSON output ───────────────

const continuityFixtureRepo = join(tmpdir(), `buffy-mcp-cont-fixture-${process.pid}`);

beforeAll(() => {
  mkdirSync(join(continuityFixtureRepo, 'scripts'), { recursive: true });
  const continuityScript = join(continuityFixtureRepo, 'scripts', 'buffy-continuity.sh');
  writeFileSync(
    continuityScript,
    [
      '#!/usr/bin/env bash',
      '# Mock buffy-continuity.sh — produce JSON estructurado',
      'cat <<JSONEOF',
      JSON.stringify({
        repo: continuityFixtureRepo,
        source_file: 'ai-context/CONTINUE.md',
        last_checkpoint: '## CHECKPOINT (2026-10-15) — GameBoost Pro',
        last_inline_checkpoint: '[CHECKPOINT 2026-10-17 — Retiro de kimi_vision]',
        summary: 'Trabajo: buffy_continuity MCP tool MVP',
        pending: ['Revisar Cursor E2E', 'Documentar caveat AGY'],
        stack: 'Buffy Next (MVP buffy_verify) → buffy_context → buffy_continuity',
        _info: 'continuidad operativa — handoff entre sesiones (instancia local)',
      }),
      'JSONEOF',
    ].join('\n') + '\n',
  );
  chmodSync(continuityScript, 0o755);
});

afterAll(() => {
  rmSync(continuityFixtureRepo, { recursive: true, force: true });
});

describe('MCP buffy_continuity — JSON output', () => {
  it('devuelve JSON parseable con keys {repo, source_file, last_checkpoint, last_inline_checkpoint, summary, pending, stack, _info}', async () => {
    const prevRepo = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = continuityFixtureRepo;

    try {
      const result = await execCtxCaptured('continuity', ['--json']);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(0);
      expect(result.stdout).toBeTruthy();

      const data = JSON.parse(result.stdout);

      expect(data).toHaveProperty('repo');
      expect(data).toHaveProperty('source_file');
      expect(data).toHaveProperty('last_checkpoint');
      expect(data).toHaveProperty('last_inline_checkpoint');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('pending');
      expect(data).toHaveProperty('stack');
      expect(data).toHaveProperty('_info');

      // Tipos y valores
      expect(data.repo).toBe(continuityFixtureRepo);
      expect(data.source_file).toBe('ai-context/CONTINUE.md');
      expect(data.last_checkpoint).toBe('## CHECKPOINT (2026-10-15) — GameBoost Pro');
      expect(data.last_inline_checkpoint).toBe('[CHECKPOINT 2026-10-17 — Retiro de kimi_vision]');
      expect(data.summary).toContain('buffy_continuity');
      expect(Array.isArray(data.pending)).toBe(true);
      expect(data.pending).toHaveLength(2);
      expect(data.stack).toContain('buffy_context');
      expect(data._info).toContain('continuidad operativa');
    } finally {
      if (prevRepo === undefined) delete process.env.BUFFY_CONTEXT_REPO;
      else process.env.BUFFY_CONTEXT_REPO = prevRepo;
    }
  });

  it('captura stderr separado de stdout (no mezcla)', async () => {
    const prevRepo = process.env.BUFFY_CONTEXT_REPO;
    process.env.BUFFY_CONTEXT_REPO = continuityFixtureRepo;

    try {
      const result = await execCtxCaptured('continuity', ['--json']);
      expect(result.stderr).toBe('');
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    } finally {
      if (prevRepo === undefined) delete process.env.BUFFY_CONTEXT_REPO;
      else process.env.BUFFY_CONTEXT_REPO = prevRepo;
    }
  });
});
