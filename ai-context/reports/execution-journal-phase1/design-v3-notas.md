# Notas de implementación — Execution Journal Fase 2 (sobre `design-v3.md`)  [revisión 2026-11-05]
> Revisión con reseña del operador (2026-11-05): la implementación pasó la revisión y
> se alineó el límite L2: ahora el gate libera la claim según `persisted` (entrada
> keyed) cuando hay key, y según `journalWritten` (entrada Fase 1) cuando no. Esto
> mitiga el caso descrito (clave keyed completada aunque la Fase 1 falle).
> `design-v3.md` sigue sin tocar.

> `design-v3.md` es la fuente de verdad y permanece **verbatim** (no se modifica).
> Este archivo registra dónde el código se aparta del texto y qué límites se
> aceptaron conscientemente. Cada desviación está también comentada en el punto
> exacto del código.

## 1. Desviaciones del diseño v3

| # | Lugar | Texto del v3 | Implementación | Motivo |
|---|-------|--------------|----------------|--------|
| D1 | `validateIdempotencyKey` (§3) | charset `^[\x21-\x7e]+$`, 1–256 | mismo charset **más** rechazo de `/` y `\` | §10-T3 exige `../x` y `a/b` → `invalid_key`. Las dos reglas del mismo documento solo son compatibles añadiendo el rechazo de separadores. La key nunca es nombre de archivo; el rechazo es defensa en profundidad. |
| D2 | `beginKey(key, ctx)` (§4) | "genera `executionId`" | acepta `ctx.executionId` (el gate le pasa `execRecord.executionId`) y solo genera uno nuevo si no viene | Mantiene la misma identidad en `execStore`, journal Fase 1 y entradas keyed; evita dos executionId para la misma ejecución real. Concurrency-safe: la generación ocurre dentro del lock. |
| D3 | gate, estado `cached` (§6.2) | devuelve el resultado cacheado; no habla de `execStore` | `execStore.fail(execRecord.executionId, result)` | Esta invocación **no ejecuta efecto**: su registro de ejecución termina como no-ejecutado para que la evidencia nunca la cuente como acción ejecutada (fail-closed en evidencia). El llamador recibe `success` + `details.state: 'cached'`. |

## 2. Límites conocidos (aceptados en esta fase)

| # | Límite | Detalle | Cubierto por |
|---|--------|---------|--------------|
| L1 | Misma fingerprint con **keys distintas** no se excluyen mutuamente | El claim solo serializa mientras el ganador lo retiene. Si la segunda key llega después de `releaseInflight`, el executor corre por segunda vez. Son operaciones lógicas distintas, así que es aceptable, pero **no** está listado en §11 del v3. T5 lo demuestra con delay de 4 s en el ganador → el segundo sale `aborted/claim_exists`. | T5 |
| L2 | Two-registro por ejecución con key — **mitigado en código** | Se escribe la entrada `execution` de Fase 1 y la entrada keyed. Si la keyed se persiste pero la de Fase 1 falla → antes el claim no se liberaba aunque la key estuviera completed; ahora el gate libera según `persisted` (entrada keyed) cuando hay key. Si falla la keyed → `execution/success` sin terminal keyed → claim liberado según `journalWritten`, key en needs_resolution. Recuperación: `buffy journal` (claim) + `journal resolve --key`. | # ; corregido |
| L3 | Sin `journal unlock` | Un `journal.lock` huérfano (p. ej. `kill -9` durante el append; el lock se toma con `O_EXCL` y se libera en `finally`, que no corre ante SIGKILL) bloquea todas las escrituras del journal hasta que se borre a mano. **No entra en esta fase.** Candidato Fase 3: `journal unlock --confirm-dead-pid` con liveness de 4 condiciones (reutiliza `startedOwnerAlive`). | no cubierto — deuda explícita |
| L4 | T4 acepta `in_progress` o `cached` para el perdedor | El orden depende del timing real de los dos procesos; la aserción garantiza "el executor corrió 1 vez", que es la garantía at-most-once, pero no distingue el estado del perdedor. | T4 |

## 3. Verificación de esta ronda

- `npx tsc --noEmit` → 0 errores.
- `npx vitest run tests/execution-journal-phase2.test.ts` → 17/17.
- `npx vitest run tests/journal-cli.test.ts` → 11/11 (5 Fase 1 + 6 nuevos de `--key`).
- Suite completa → 751/751 (49 archivos).
- Los avisos `[buffy:evidence]` de la consola **son preexistentes**: se reproducen en
  `093c62a` (`git switch --detach 093c62a && npx vitest run`, stderr con
  `No "recordEvidence" export is defined on the "../src/state/store.js" mock`).
