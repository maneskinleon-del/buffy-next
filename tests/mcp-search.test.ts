/**
 * MCP buffy_search — tests mínimos (MVP)
 *
 * Cobertura:
 *  1. buffy_search tool schema: readOnlyHint=true, destructiveHint=false,
 *     inputSchema {type:'object', properties:{query}, required:['query']}
 *  2. tools/list incluye buffy_search con name correcto
 *  3. handler buffy_search: empty query → isError=true (empty_query)
 *  4. handler buffy_search: query válida → execCtxCaptured('search', ['--json', query])
 *
 * El FUSION GUARD (execCtxCaptured vs execCtx para buffy_search) vive en
 * tests/mcp-fusion-guard.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// ─── Mock del módulo ctx ANTES de importar mcp ───────────────────
vi.mock('../src/shared/ctx.js', () => ({
  execCtx: vi.fn(),
  execCtxCaptured: vi.fn(),
  resolveScriptPath: vi.fn(),
  resolveContextRepo: vi.fn(),
  listCtxCommands: vi.fn(),
  readContextVersion: vi.fn(),
  contextEnvInfo: vi.fn(),
}));

import { BUFFY_SEARCH_TOOL, handleToolCall } from '../src/mcp.js';
import { execCtxCaptured, execCtx } from '../src/shared/ctx.js';

// ─── 1. Schema and annotations ────────────────────────────────

describe('MCP buffy_search — schema and annotations', () => {
  it('name es buffy_search', () => {
    expect(BUFFY_SEARCH_TOOL.name).toBe('buffy_search');
  });

  it('inputSchema require query: string, additionalProperties: false', () => {
    expect(BUFFY_SEARCH_TOOL.inputSchema).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: expect.any(String) },
      },
      required: ['query'],
      additionalProperties: false,
    });
  });

  it('tiene readOnlyHint: true y destructiveHint: false', () => {
    expect(BUFFY_SEARCH_TOOL.annotations.readOnlyHint).toBe(true);
    expect(BUFFY_SEARCH_TOOL.annotations.destructiveHint).toBe(false);
  });

  it('annotations incluye idempotentHint: true y openWorldHint: false', () => {
    expect(BUFFY_SEARCH_TOOL.annotations.idempotentHint).toBe(true);
    expect(BUFFY_SEARCH_TOOL.annotations.openWorldHint).toBe(false);
  });
});

// ─── 2. tools/list includes buffy_search ──────────────────────

describe('MCP tools/list', () => {
  it('handler de tools/list incluye buffy_search', () => {
    const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf-8');
    expect(src).toContain('BUFFY_SEARCH_TOOL');
  });
});

// ─── 3. handler: empty query → isError ────────────────────────

describe('MCP buffy_search handler — validation', () => {
  it('empty query → isError=true con error empty_query', async () => {
    const result = await handleToolCall('buffy_search', {
      arguments: { query: '' },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe('empty_query');
    expect(parsed.results).toEqual([]);
    // execCtxCaptured NO debe llamarse si la query es vacía
    expect(execCtxCaptured).not.toHaveBeenCalled();
  });

  it('missing query → isError=true', async () => {
    const result = await handleToolCall('buffy_search', {});

    expect(result.isError).toBe(true);
  });
});

// ─── 4. handler: valid query → execCtxCaptured ─────────────────

describe('MCP buffy_search handler — delegation', () => {
  it('llama a execCtxCaptured("search", ["--json", query])', async () => {
    const mockResult = {
      code: 0,
      stdout: JSON.stringify({
        query: 'ADB',
        repo: '/test',
        results: [{ path: 'README.md', lineno: 1, snippet: 'adb' }],
        total: 1,
        limit: 15,
        has_more: false,
        _info: 'FTS5 search over buffy-context',
      }),
      stderr: '',
      timedOut: false,
    };
    vi.mocked(execCtxCaptured).mockResolvedValue(mockResult);
    vi.mocked(execCtx).mockClear();

    const result = await handleToolCall('buffy_search', {
      arguments: { query: 'ADB' },
    });

    expect(execCtxCaptured).toHaveBeenCalledTimes(1);
    expect(execCtxCaptured).toHaveBeenCalledWith('search', ['--json', 'ADB']);

    // execCtx (el de la CLI interactiva) NO debe llamarse
    expect(execCtx).not.toHaveBeenCalled();

    // El handler pasa el JSON stdout como contenido de la tool
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(1);
    expect(parsed.results).toHaveLength(1);
  });

  it('timedOut → isError=true', async () => {
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: 'timeout',
      timedOut: true,
    });

    const result = await handleToolCall('buffy_search', {
      arguments: { query: 'ADB' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('timed out');
  });

  it('script error (code != 0) → isError=true', async () => {
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 2,
      stdout: JSON.stringify({
        query: 'test',
        error: 'invalid_query',
        message: 'FTS5 query syntax error',
        results: [],
      }),
      stderr: '',
      timedOut: false,
    });

    const result = await handleToolCall('buffy_search', {
      arguments: { query: 'test' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid_query');
  });
});

// ─── 5. Structural guard ──────────────────────────────────────

describe('MCP buffy_search — structural guard', () => {
  it('handler buffy_search usa execCtxCaptured (no execCtx)', () => {
    const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf-8');

    // La línea que llama al search debe usar execCtxCaptured
    expect(src).toMatch(/execCtxCaptured\(['"]search['"]/);
  });
});
