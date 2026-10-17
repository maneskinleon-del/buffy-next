/**
 * FUSION GUARD — tests/mcp-fusion-guard.test.ts
 *
 * Verifica que el handler de buffy_verify en src/mcp.ts usa execCtxCaptured
 * (capturado, bounded, sin signal-forwarding) y NUNCA execCtx (inherit,
 * signal-forwarding, sin timeout).
 *
 * Aislamiento: este archivo hace vi.mock del módulo ctx para poder spy-gear
 * execCtxCaptured y execCtx por separado. El vi.mock es file-scoped en vitest,
 * por eso este test vive en su propio archivo (no en mcp-verify.test.ts, que
 * necesita la implementación real de execCtxCaptured para el test de JSON).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// ─── Mock del módulo ctx ANTES de importar mcp ────────────────
// vi.mock es hoisteado por vitest a la línea 1 del archivo, antes de los imports.
// Proporcionamos TODOS los exports de ctx.ts para que mcp.ts pueda importarlos.
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

describe('FUSION GUARD — buffy_verify handler boundary', () => {
  it('usa execCtxCaptured (spy): se llama con ("verify", ["--json"])', async () => {
    // Arrange: el mock devuelve un CapturedResult válido
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 0,
      stdout: '{"repo":"test","verified":1,"stale":0,"unknown":0,"expired":0,"trust_score":100,"items":[],"_info":"test"}',
      stderr: '',
      timedOut: false,
    });
    vi.mocked(execCtx).mockClear();

    // Act
    const result = await handleToolCall('buffy_verify');

    // Assert: execCtxCaptured fue llamado con los argumentos correctos
    expect(execCtxCaptured).toHaveBeenCalledTimes(1);
    expect(execCtxCaptured).toHaveBeenCalledWith('verify', ['--json']);

    // El handler devuelve el stdout (JSON) como contenido de la tool
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"trust_score"');
    expect(result.isError).toBeUndefined();
  });

  it('NO usa execCtx: execCtx nunca se llama desde el handler de buffy_verify', async () => {
    vi.mocked(execCtxCaptured).mockResolvedValue({
      code: 0,
      stdout: '{"repo":"test","verified":0,"stale":0,"unknown":0,"expired":0,"trust_score":0,"items":[],"_info":"test"}',
      stderr: '',
      timedOut: false,
    });
    vi.mocked(execCtx).mockClear();

    await handleToolCall('buffy_verify');

    // FUSION GUARD: execCtx (el de la CLI interactiva) NO debe ser llamado
    expect(execCtx).not.toHaveBeenCalled();
  });

  it('structural guard: mcp.ts importa execCtxCaptured, NO importa execCtx', () => {
    const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf-8');

    // Debe importar execCtxCaptured
    expect(src).toMatch(/\bexecCtxCaptured\b/);

    // NO debe importar ni referenciar execCtx de forma aislada.
    // \bexecCtx\b NO coincide con "execCtxCaptured" (no hay word boundary
    // entre 'x' y 'C' — ambos son word chars). Así evitamos false positives
    // en el futuro refactor "de limpieza" que unifique ambas funciones.
    expect(src).not.toMatch(/\bexecCtx\b/);
  });
});
