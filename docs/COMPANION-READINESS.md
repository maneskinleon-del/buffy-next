# COMPANION-READINESS — Buffy Next + Buffy Context

**Fecha:** 2026-08-29 · **Baseline:** v0.2.2 (`f44ae06`) · **Auditoría base:** `~/experiments/buffy-next-vs-context/RESULTS.md`

## Resumen de estado

```text
Buffy Next standalone       PASS
Buffy Context optional      PASS
Runtime coupling            NONE
Recommended integration     Agent-level
Auto-install                DEFERRED
Auto-injection              DEFERRED
```

## Verificación de cada línea

### Buffy Next standalone — PASS

El README documenta la sección "Optional companion: Buffy Context" dejando claro
que Buffy Next es autosuficiente (`README.md`: "Buffy Next funciona perfectamente
solo. No depende de ningún otro proyecto ni de LLMs"). Verificado por auditoría:
cero referencias a buffy-context en `src/`; la suite completa pasa sin que Buffy
Context exista o no (los tests no conocen ningún path del companion).

### Buffy Context optional — PASS

Sección README con rol, cuándo conviene, independencia de repos y enlace
(<https://github.com/maneskinleon-del/buffy-context>). Contrato de la
arquitectura en `docs/COMPANION-ARCHITECTURE.md`. Ningún flujo de instalación
o runtime de Buffy Next lo menciona como requisito.

### Runtime coupling — NONE

- Cero imports de código de buffy-context en Buffy Next (grep exhaustivo, auditoría §F).
- Cero dependencias npm entre repos.
- Cero shared database / shared state directory (`~/.buffy/state.json` vs `~/ai-context/` + `~/.buffy/memories/`).
- Sin sincronización bidireccional ni auto-injection.
- ActionGate, Task-adaptive, Compact, Freshness, On-demand y adapters: intactos
  (este trabajo es 100% documentación; `git diff` solo toca README y docs/).

### Recommended integration — Agent-level

La composición ocurre en el agente: Buffy Context aporta memoria/knowledge/skills
(lectura de archivos al iniciar sesión), Buffy Next aporta estado actual del
sistema y acciones seguras (CLI / MCP `buffy-tools`). Válida la evidencia C+
(cross-model PASS) para la vía Buffy Next. Detalle: `docs/COMPANION-ARCHITECTURE.md` §"Modelo".

### Auto-install — DEFERRED

Prompt `[y/N]` propuesto al final de `buffy setup` (lugar correcto: es el último
paso del onboarding oficial y ya dispone de `promptUser`; default `N`; solo
imprime instrucciones, nunca ejecuta). No implementado: requiere tocar
`src/cli.ts` (runtime) y la regla vigente es no modificar runtime sin los
criterios de reentrada. Sketch y decisión: `docs/COMPANION-ARCHITECTURE.md` §"Experiencia de instalación".

### Auto-injection — DEFERRED

Fuera de alcance por diseño (lista de no-implementar del proyecto). La inyección
de contexto persistente en el prompt del agente es responsabilidad del agente
(p.ej. vía `~/.AGENTS.md`), no de Buffy Next.

## Detección de Buffy Context (evaluación)

| Criterio | Resultado |
|---|---|
| ¿Trivial? | Sí — 3 `existsSync` sobre rutas públicas convencionales, función pura |
| ¿Altera arquitectura? | No — solo existencia, nunca contenido; ausencia = sin cambio de comportamiento |
| ¿Implementada? | **No — DEFERRED** (cualquier implementación toca runtime) |
| Sketch | `docs/COMPANION-ARCHITECTURE.md` §"Detección del companion" |

Restricciones si se implementa en el futuro: solo `existsSync` (nunca leer
contenido de archivos del companion), resultado exclusivamente informativo
(`buffy capabilities` / `buffy setup`), ninguna lógica core condicionada a él.

## Verificación de integridad (este cambio)

Cambios: `README.md` (modificado), `docs/COMPANION-ARCHITECTURE.md` (nuevo),
`docs/COMPANION-READINESS.md` (nuevo). **Cero cambios de código** (`src/`,
`tests/`, `package.json` intactos).

Nota: los tests de docs (`tests/docs-install.test.ts`) validan el contenido del
README, por lo que la suite se ejecutó como verificación tras editar:

```text
npx tsc --noEmit   → 0 errores
npm test           → 575/575 PASS
npm run build      → PASS (dist/cli.js)
```

(El test `buffy-tool.test.ts:175` "JSON determinism" es flaky preexistente en
v0.2.2 por comparar `audit.latencyMs` — issue de mantenimiento futuro ya
registrado; no relacionado con este cambio.)

## Git

Sin push, sin tag, sin commit (pendiente de decisión del mantenedor):

```bash
git status          # README.md modificado + 2 docs nuevos
git diff            # solo contenido documental
git diff --check    # sin errores de whitespace
```
