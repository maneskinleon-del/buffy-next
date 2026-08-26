# A/B/C Evaluation v0.8 — External Black-Box Report

**Date:** 2026-08-21
**Buffy:** 4ac9f68 (FROZEN)
**Gemma:** 2B via Ollama (localhost:11434)
**Adapter:** Mock (Linux, AMD Ryzen 5, 16GB, Firefox at 65% CPU)

## Protocol

- 10 queries, none derived from Buffy's internal benchmarks
- Buffy frozen during entire experiment
- Modes: A (Gemma solo), B (Buffy solo), C (Gemma + Buffy)
- Raw outputs preserved in `abc-evaluation-v0.8.json`

## Results

| # | Query | B: Buffy | A: Gemma | C: Gemma+Buffy | Winner |
|---|-------|----------|----------|----------------|--------|
| 01 | "El mouse se mueve solo." | ✅ [] | ❌ inventa causa | ✅ respeta incertidumbre | **C** |
| 02 | "PC lenta + Chrome pegado" | ✅ 2 actions | ⚠️ pregunta vaga | ✅ actions + contexto | **C** |
| 03 | "Impresora colores raros" | ⚠️ DEFAULT | ✅ entiende | ✅ respeta límites | **A** |
| 04 | "Laptop se calienta" | ✅ 2 actions | ⚠️ pregunta vaga | ✅ actions + contexto | **C** |
| 05 | "Disco lleno" | ⚠️ 0 actions | ✅ pide info | ✅ reconoce contradicción | empate |
| 06 | "Gracias" | ✅ [] | ✅ pregunta | ✅ [] | empate |
| 07 | "Algo anda mal" | ✅ 2 actions | ⚠️ pregunta vaga | ✅ 3 errores detallados | **C** |
| 08 | "Internet se corta" | ⚠️ sin data red | ⚠️ no resuelve | ❌ expone JSON crudo | **A** |
| 09 | "RAM + temperatura" | ✅ 2 actions | ⚠️ parcial | ✅ actions + datos | **C** |
| 10 | "Estoy frustrado" | ✅ [] (v0.5-B) | ✅ buen UX | ⚠️ seco | **A** |

**Score:** B=5, A=3(+1❌), **C=7**

## Key Findings

### 1. Grounding funciona (CASE-01)

Gemma sola inventa causa y solución para un mouse que "se mueve solo".
Con Buffy, conserva la incertidumbre. Esto valida la hipótesis central.

### 2. 0 observations ≠ no problem (CASE-08)

Cuando `observations = []` puede significar:
- No hay problema real
- El check no está soportado
- El adapter no pudo obtener el dato
- El check fue seleccionado pero sin evidencia

Gemma no tiene forma de distinguir estas situaciones. **Esto es un contrato ambiguo, no un bug de prompt.**

### 3. Fuera de cobertura (CASE-03)

Buffy no tiene patrón para "impresora" → cae a DEFAULT.
Gemma sola entiende el problema. Con Buffy, respeta los límites.
**Buffy aporta grounding, Gemma aporta conocimiento del dominio.**

### 4. UX gap (CASE-10)

"Estoy frustrado" → v0.5-B retorna [] → Gemma+Buffy dice "no hay problemas".
Gemma sola pregunta "¿qué te preocupa?" → mejor UX.
**El intent gate es técnicamente correcto pero UX-pobre para consultas emocionales.**

## What NOT to do

- Do NOT modify Buffy to fix these 4 gaps
- Do NOT adapt benchmarks to match these results
- Do NOT optimize Mode C prompt yet

## What to do next

1. Freeze this result as external evaluation v0.8
2. Run second blind evaluation with 10-20 NEW queries
3. Improve Mode C contract: explicit handling of unsupported/unknown/empty
4. Compare A vs C across both evaluations
5. Only then decide if Buffy has measurable value as grounding layer

## Files

- `abc-evaluation-v0.8.json` — raw outputs (A, B, C for all 10 cases)
- `abc-experiment-gemma-results.json` — same data, original filename
- `abc-experiment.ts` — Mode B runner
- `abc-run-gemma-fast.ts` — Modes A+C runner
- `abc-experiment-evaluation.md` — rubric and framework
