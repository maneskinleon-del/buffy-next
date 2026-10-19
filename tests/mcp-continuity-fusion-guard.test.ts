/**
 * FUSION GUARD — tests/mcp-continuity-fusion-guard.test.ts
 *
 * Verifica que el handler de buffy_continuity en src/mcp.ts usa execCtxCaptured
 * (capturado, bounded, sin signal-forwarding) y NUNCA execCtx (inherit,
 * signal-forwarding, sin timeout).
 *
 * Aislamiento: este archivo hace vi.mock del módulo ctx. El vi.mock es
 * file-scoped en vitest, por eso este test vive en su propio archivo.
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

// Imports que resuelven a las versiones mockeadas
import { handleToolCall } from '../src/mcp.js';
import { execCtx, execCtxCaptured } from '../src/shared/ctx.js';

describe('FUSION GUARD — buffy_continuity handler boundary', () => {
  it('usa execCtxCaptured (spy): se llama con ("continuity", ["--json"])', async () => {
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        source: 'repo',
        path: '/repo/ai-context/CONTINUE.md',
        exists: true,
        readable: true,
        size_bytes: 1428,
        line_count: 9,
        content: '## CHECKPOINT (test) — GameBoost Pro\n\nraw content preserved\n',
      }),
      stderr: '',
      timedOut: false,
    });
    vi.mocked(execCtx).mockClear();

    const result = await handleToolCall('buffy_continuity');

    expect(execCtxCaptured).toHaveBeenCalledTimes(1);
    expect(execCtxCaptured).toHaveBeenCalledWith('continuity', ['--json']);

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"content"');
    expect(result.isError).toBeUndefined();
  });

  it('NO usa execCtx: execCtx nunca se llama desde el handler de buffy_continuity', async () => {
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        source: 'repo',
        path: '/repo/ai-context/CONTINUE.md',
        exists: true,
        readable: true,
        size_bytes: 0,
        line_count: 1,
        content: '',
      }),
      stderr: '',
      timedOut: false,
    });
    vi.mocked(execCtx).mockClear();

    await handleToolCall('buffy_continuity');

    // FUSION GUARD: execCtx (el de la CLI interactativa) NO debe ser llamado
    expect(execCtx).not.toHaveBeenCalled();
  });

  it('structural guard: mcp.ts importa execCtxCaptured, NO importa execCtx', () => {
    const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf-8');

    // Debe importar execCtxCaptured
    expect(src).toMatch(/\bexecCtxCaptured\b/);

    // NO debe importar ni referenciar execCtx de forma aislada.
    // \bexecCtx\b NO coincide con "execCtxCaptured" — no hay word boundary
    // entre 'x' y 'C' (ambos son word chars). Evita false positives.
    expect(src).not.toMatch(/\bexecCtx\b/);
  });
});
