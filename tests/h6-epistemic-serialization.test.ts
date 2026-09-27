import { describe, it, expect, vi } from 'vitest';
import { diagnose, analyzeForQuery } from '../src/core/diagnose.js';
import type { SystemInfo } from '../src/core/types.js';

// ─── Mock de clasificación (H6: valor forzado no-observed) ────
//
// DECISIÓN DE DISEÑO — NO "mejorar" este test con fake timers.
//
// analyzeForQuery re-stampea observedAt = now en cada llamada, así que con
// fake timers TODO ítem nacería 'observed' y este test pasaría SIEMPRE,
// incluso si el fix fuera "emitir la constante 'observed'" — es decir, no
// falsificaría nada. El único seam honesto para forzar un estado no-observed
// es interceptar classifyEpistemicState por categoría.
//
// Se apunta al PRE-GATING (sitio de serialización) porque el diseño de
// freshness impide observar 'stale' post-gating: el gating nunca deja salir
// un stale relevante sin refresh (refresh) ni un stale irrelevante (omit).
// El contrato se verifica DONDE PUEDE SER VIOLADO, no donde el pipeline lo
// oculta. Con gpu→'stale' y el resto→'observed' se verifica que el valor
// serializado es el REAL que devuelve la clasificación, no una constante.
//
// El resto del módulo (FRESHNESS_POLICY, calculateAgeMs) queda intacto.
vi.mock('../src/core/freshness.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/freshness.js')>();
  return {
    ...actual,
    classifyEpistemicState: vi.fn(
      (observedAt: string, category: string) =>
        category === 'gpu' ? ('stale' as const) : ('observed' as const),
    ),
  };
});

// ─── System fixture (misma convención que diagnose.test.ts) ──

const testSystem: SystemInfo = {
  os: { name: 'Test OS', version: '1.0', arch: 'x64' },
  cpu: { model: 'Test CPU', cores: 4 },
  memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
  gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0', isGeneric: true },
  storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
  temperature: { cpuCelsius: 45 },
  processes: [],
};

// ─── H6 tests ────────────────────────────────────────────────

describe('H6 — epistemicState por-observación en diagnose output', () => {
  it('cada observación del output serializa epistemicState (mata el dead computation)', async () => {
    // Query sin gpu: bajo el mock, todos los ítems de esta query son 'observed'.
    const result = await diagnose(
      {
        name: 'windows' as const,
        async detect() { return { name: 'windows' as const, os: 'Test', version: '1.0', arch: 'x64' }; },
        async systemInfo() { return testSystem; },
        async capabilities() { return []; },
        async execute(action) { return action.execute(); },
      },
      'mi sistema está lento',
    );

    expect(result.observations.length).toBeGreaterThan(0);
    for (const obs of result.observations) {
      // Contrato E4.1: clasificación del ítem, SIEMPRE emitida.
      // Si la línea de classifyEpistemicState vuelve a comentarse,
      // este expect falla (guard de regresión funcional).
      expect(obs.epistemicState).toBeDefined();
      expect(['observed', 'inferred', 'stale', 'unknown']).toContain(obs.epistemicState);
    }
  });

  it('serializa el valor REAL de classifyEpistemicState, no una constante', async () => {
    // Directo al sitio de serialización (pre-gating): con el mock activo,
    // gpu → 'stale' y memory → 'observed'. Si el fix fuera "emitir constante"
    // (p.ej. siempre 'observed'), el primer expect falla.
    const items = analyzeForQuery(testSystem, ['gpu', 'ram']);

    const gpuItem = items.find(i => i.id === 'gpu-generic-driver');
    expect(gpuItem).toBeDefined();
    expect(gpuItem!.epistemicState).toBe('stale');

    const ramItem = items.find(i => i.id === 'ram-status');
    expect(ramItem).toBeDefined();
    expect(ramItem!.epistemicState).toBe('observed');

    // ageMs acompana la clasificación (E4.1)
    expect(typeof gpuItem!.ageMs).toBe('number');
    expect(gpuItem!.ageMs!).toBeGreaterThanOrEqual(0);
  });
});

describe('H6 — guard estructural del comentario anti-regresión', () => {
  it('el marcador NO eliminar sigue presente junto a classifyEpistemicState', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/core/diagnose.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('classifyEpistemicState se serializa por-observación');
    expect(source).toContain('NO eliminar: contrato E4.1 lo declara obligatorio');
  });
});
