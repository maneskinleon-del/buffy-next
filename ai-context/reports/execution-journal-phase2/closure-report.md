# Informe de cierre — Execution Journal Fase 2 (idempotencia at-most-once)

**Fecha de cierre:** 2026-11-06
**Estado:** CERRADA — integrada en `master` y publicada.

## A. Identificación

| Dato | Valor |
|------|-------|
| Repositorio | `~/proyectos/buffy-next` |
| Rama de desarrollo | `ejecution-journal-fase2-idempotencia` (14 commits) |
| Base de integración | `093c62a` — merge Phase 1 |
| Commit de merge | `2b7b56e` — `merge --no-ff` |
| HEAD al cerrar | `eb000f8` (este informe) |
| Publicación | `origin/master` = `eb000f8`, sin divergencia (0/0) |
| Diseño canónico | `ai-context/reports/execution-journal-phase1/design-v3.md` (verbatim de `0718c45`) |
| Documento de desviaciones | `ai-context/reports/execution-journal-phase1/design-v3-notas.md` |

## B. Alcance entregado

Idempotencia **at-most-once** por `idempotencyKey` sobre el journal de Fase 1, con una sola fuente de verdad (`journal.jsonl`) y sin archivos de índice secundarios.

- **Journal keyed** (`src/core/execution-journal.ts`): entradas `started | completed | failed | aborted | resolution`; `beginKey` / `finishKey` / `lookupKey` / `resolveKey`; `deriveKeyState` con precedencia `key_conflict > in_progress (started vivo) / needs_resolution (started muerto) > cached (completed) > needs_resolution (failed) > proceed (aborted)`.
- **Liveness de propietario** (`startedOwnerAlive`): hostname → bootId → `kill(pid, 0)` → starttime (campo 22 de `/proc/<pid>/stat`), fail-closed ante incapacidad de verificar.
- **Wiring en la puerta única** (`src/core/action-gate.ts`): `execute(actionId, rawParams?, opts?: { idempotencyKey? })`; estados con key devuelven `success:false` + `details.state`, salvo `cached`, que devuelve el resultado previo con `success` heredado.
- **Persistencia y claims**: `ActionResult.persisted?: boolean` cuando el append terminal falla → el claim no se libera y la key queda `needs_resolution` (no se reejecuta).
- **CLI** (`src/cli.ts`): `buffy journal resolve --key <key> <resolution> <motivo...> [--evidence "<texto>"] [--json]`, con validación de reason/evidence y exit 1 en rechazos.
- **Validador de keys**: 1–256 caracteres ASCII imprimibles, **sin `/` ni `\`** (evita rutas), ver D1.

## C. Cambios integrados

14 archivos, +2486 / −36 respecto de `093c62a`.

| Archivo | Tipo | Contenido |
|---------|------|-----------|
| `src/core/execution-journal.ts` | M | Journal keyed, liveness, `resolveKey`, fault points |
| `src/core/action-gate.ts` | M | `idempotencyKey`, criterio de liberación de claim, `persisted` |
| `src/core/types.ts` | M | Tipos de estado/resultado con key |
| `src/cli.ts` | M | `journal resolve --key`, `--json`, fix de parseo de motivo |
| `tests/execution-journal-phase2.test.ts` | A | T1–T17 (17 tests) |
| `tests/journal-cli.test.ts` | M | +6 tests de subprocess para `--key` |
| `tests/fixtures/phase2-runner.ts` | A | Runner hijo con `@@RESULT@@{json}` y crashes reales |
| `ai-context/CONTINUE.md` | M | Estado y continuidad |
| `ai-context/reports/.../design-v3.md` | A | Diseño canónico, verbatim |
| `ai-context/reports/.../design-v3-notas.md` | A | D1–D3, L1–L4 |
| `ai-context/reports/.../design-fase2-idempotency{,.v2,.v2.bak}.md` | A | Diseño previo conservado |
| `ai-context/research/execution-journal-phase2-who-reads-fail.md` | A | Evidencia de D3 |

## D. Pruebas

Ejecutadas sobre el **estado integrado** en `master`, no solo sobre la rama:

| Prueba | Resultado | Evidencia |
|--------|-----------|-----------|
| `git diff 2ab502f HEAD` | árbol idéntico | vacío: el merge no alteró contenido |
| `npx tsc --noEmit` | PASS | 0 errores |
| `npx vitest run` | PASS | **49 archivos, 751 tests** (728 previos + 17 Fase 2 + 6 CLI) |
| `tests/execution-journal-phase2.test.ts` | PASS | 17/17 |
| `tests/journal-cli.test.ts` | PASS | 11/11 (5 previos + 6 nuevos) |

Los avisos `[buffy:evidence]` en stderr son **preexistentes** y reproducibles en `093c62a`; no afectan al resultado.

## E. Garantías verificadas

| Afirmación | Clasificación | Evidencia |
|------------|---------------|-----------|
| El executor corre **una sola vez** por key, incluso con dos procesos simultáneos | DEMOSTRADO | T4 (un `proceed`, el otro `in_progress`/`cached`), T5, T7 |
| Reintento secuencial con la misma key devuelve el resultado previo sin efecto | DEMOSTRADO | T1, T3 |
| Claim liberado solo si la entrada terminal quedó persistida | DEMOSTRADO | T9 + corrección `5ca01e0` (criterio `persisted`) |
| `started` sin entrada terminal → `needs_resolution`, no reejecutable | DEMOSTRADO | T2, T13 |
| Recuperación humana auditada (`resolve`) y rechazo con dueño vivo | DEMOSTRADO | T17 |
| Una key inválida no crea estado ni claim | DEMOSTRADO | T6 |
| `journal.jsonl` como única fuente de verdad (sin índice secundario) | DEMOSTRADO | Diseño y ausencia de archivos de índice |
| Un intento `cached` nunca se registra como ejecutado | DEMOSTRADO | D3 + research (`outcome: 'exception'` → `NOT_VERIFIED`) |
| Fase 1 intacta: ejecuciones sin key se comportan igual | DEMOSTRADO | T16 + suite previa verde |

## F. Desviaciones del diseño y límites aceptados

**Desviaciones documentadas** (`design-v3-notas.md`):

- **D1** — keys con `/` o `\` rechazadas (el v3 no lo prohibía; evita rutas y separadores).
- **D2** — `lookupKey`/`resolveKey` fallan-cerrado ante línea corrupta que mencione la key consultada.
- **D3** — el path `cached` termina el registro de ejecución como **no ejecutado** (`execStore.fail`) para que la evidencia no cuente un efecto que no ocurrió. Efecto real en telemetría: `allRecords()` clasifica `failed` como `outcome: 'exception'` → compuesto `NOT_VERIFIED`, nunca `OBSERVED_EXECUTED`. La etiqueta `exception` es imprecisa para un cache hit y se acepta en esta fase.

**Límites aceptados:**

- **L1** — misma fingerprint con keys distintas no se excluye más allá del claim (operaciones lógicas distintas; no bloqueante).
- **L2** — doble registro por ejecución con key (`execution` + keyed); mitigado en código, recuperable con `journal resolve`.
- **L3** — sin `journal unlock`: un `journal.lock` huérfano bloquea escrituras hasta borrado manual. **Deuda prioritaria para Fase 3.**
- **L4** — T4 acepta `in_progress` o `cached` para el perdedor; intencional (la garantía es "el executor corrió una vez").

## G. Ronda de revisión previa al merge

Cuatro correcciones aplicadas antes de integrar, cada una en su commit:

| Corrección | Commit | Efecto |
|------------|--------|--------|
| `design-v3.md` restaurado verbatim desde `0718c45` | `6f521e1` | Diseño canónico sin la "§13 Nota operativa" que lo sustituía; diff contra `0718c45` vacío |
| `else` inalcanzable eliminado del criterio de liberación de claim | `7c49aa1` | Sin código muerto ni comentario inexacto |
| Notas sin atribuciones no verificadas | `8fd394a` | Cabecera y L4 corregidas |
| D3 con el efecto real en telemetría | `8fd394a` / `bec70ab` | Research con líneas verificadas; sin hipótesis especulativas |

## H. Estado de Git

```
master          eb000f8  (publicado)
origin/master   eb000f8  (0 adelante / 0 detrás)
merge           2b7b56e  --no-ff desde ejecution-journal-fase2-idempotencia
rama            conservada en 2ab502f
working tree    limpio
```

## I. Conclusión

**FASE 2 CERRADA.** La idempotencia at-most-once está implementada, documentada con sus desviaciones declaradas y verificada por 751 pruebas sobre el árbol integrado. El diseño canónico del usuario permanece verbatim y las correcciones de la revisión están en historia separada y reversible.

**Trabajo futuro** (no bloquea este cierre):

1. **L3 — `journal unlock --confirm-dead-pid`** (candidata a Fase 3): es la única deuda que puede dejar el sistema bloqueado sin intervención.
2. **L1 — exclusión por fingerprint con keys distintas**: ventana de concurrencia acotada, abordable por separado.
3. **Evaluación global del hito**: revisar si el journal cumple los objetivos previstos una vez cerrada L3.
