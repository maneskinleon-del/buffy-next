# ¿Quién lee `execStore.fail`? — evidencia de la decisión D3 (`cached`)

**Momento:** 2026-11-06 · revisión de cierre Fase 2. Sustituye al borrador del 2026-11-05,
que describía el efecto del `cached` en telemetría de forma imprecisa (decía "intento
fallido"; el mapeo real es `outcome: 'exception'`).

## Quién escribe FAIL

`src/core/action-gate.ts` llama a `this.execStore.fail(...)` en 7 puntos (líneas verificadas):

| Línea | Situación |
|-------|-----------|
| 216 | `beginError`: no se pudo iniciar la key |
| 229 | **`cached`** (la invocación no ejecuta efecto) |
| 238 | `invalid_key` |
| 253 | `in_progress` / `needs_resolution` / `key_conflict` |
| 286 | claim fallido (`claimExists`) |
| 299 | solver no encontrado |
| 345 | error del executor |

## Qué es `fail` (no es un sink)

`src/core/action-execution-store.ts:65-73`:

```ts
fail(executionId, result) {
  const record = this.records.get(executionId);
  if (!record) return;
  if (record.state !== 'started') return;   // solo started → failed
  record.state = 'failed';
  record.completedAt = new Date();
  record.result = result;
}
```

`records` es un `Map<string, ExecutionRecord>` en memoria del gate (`:22`). No escribe
journal, no emite evento, no notifica: es estado interno del gate.

## Quién lee ese estado

1. **`src/core/pipeline.ts:477`** — `gate.getExecutionStore().allRecords()`. Mapea los
   registros a `attempts` (líneas 479-483): un registro con `state === 'failed'` se
   clasifica como `outcome: 'exception'`; el resto, por `result.success`.
   `finalOutcome` es el `outcome` del **último** registro insertado (línea 485), y se pasa
   a `classifyEvidence({ surface: 'self-action', ... })`.
2. **`src/core/pipeline.test-harness.ts:245`** — mismo bloque duplicado (el propio archivo
   lo advierte en `pipeline.ts:470-473`: "SYNC: this block is DUPLICATED").
3. **`src/core/execution-evidence.ts:189-215`** — con `surface: 'self-action'` y compound
   path, el nivel deriva del `finalOutcome`: `'success'` → `OBSERVED_EXECUTED` (o
   `VERIFIED` con postcondición independiente); cualquier otro valor → `NOT_VERIFIED` con
   nota `final outcome: <valor>`. El comentario del archivo (`:188-189`) lo fija: "failed
   attempts never become OBSERVED_EXECUTED; failures are preserved in `attempts[]`".
4. **`recoverUnknowns()`** — solo mueve `started → unknown` al arranque; no lee `failed`.

## Consecuencia real para `cached` (D3)

- La invocación cacheada hace `fail(execRecord.executionId, result)` con
  `result.details.state = 'cached'` y `result.success` heredado del resultado previo.
- Al mapear, `state === 'failed'` gana sobre `result.success`, así que el intento entra en
  `attempts` como **`outcome: 'exception'`**, no como `'failed'`.
- Como ese registro es el último insertado para esa ejecución, `finalOutcome` es
  `'exception'` y `classifyEvidence` devuelve **`NOT_VERIFIED`**
  (`evidenceNote: "final outcome: exception"`). Un `cached` **nunca** se registra como
  `OBSERVED_EXECUTED`, que es exactamente lo que D3 busca: no se contó un efecto que no
  ocurrió.
- Efecto lateral conocido y aceptado: la etiqueta `exception` describe mal el caso (no hubo
  excepción, hubo cache hit). Es telemetría, no corrección: el llamador sigue recibiendo
  `success: true` + `details.state: 'cached'`, y el journal keyed registra `cached`. Se deja
  así en esta fase; renombrar el mapeo tocaría la semántica de pipeline y no es necesario
  para la garantía at-most-once.
- `observedExecuted` no aumenta en ningún caso: el nivel lo decide el `finalOutcome`, y solo
  `'success'` llega a `OBSERVED_EXECUTED`.

## Decisión

Mantener `cached` → `execStore.fail` (D3 en `design-v3-notas.md`), con el matiz de que en
telemetría aparece como `exception` / `NOT_VERIFIED`, no como "intento fallido".

## Evidencia consultada

- `src/core/action-gate.ts:216,229,238,253,286,299,345` (escrituras), `:221-231` (rama `cached`).
- `src/core/action-execution-store.ts:22` (Map), `:65-73` (`fail`).
- `src/core/pipeline.ts:470-497` (`allRecords` → `attempts` → `classifyEvidence`).
- `src/core/execution-evidence.ts:188-215` (compound path, `finalOutcome` → nivel).
- `src/core/pipeline.test-harness.ts:245` (bloque duplicado).
