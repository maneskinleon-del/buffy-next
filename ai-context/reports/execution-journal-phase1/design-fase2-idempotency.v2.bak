# Execution Journal Fase 2 — Diseño de Idempotencia (at-most-once)

> Estado: **DISEÑO v2, SIN IMPLEMENTAR** (2026-11-04). Reescrito tras auditoría externa.
> Verificado con `git status` / `grep` sobre `src/` y `tests/`: no existe código de Fase 2 (`idempotencyKey`, `keys.jsonl`, `journal resolve` con key). Solo Fase 1 está en el repo (HEAD `093c62a`). `buffy journal resolve` de Fase 1 sí existe (`resolveClaim`, `src/cli.ts`), opera por fingerprint/claim.

## 1. Garantía (nombre correcto)

**At-most-once por `idempotencyKey`, con liveness manual.** Para una key dada el executor se invoca como máximo una vez, salvo que un humano declare explícitamente `efecto_ausente_confirmado` (§6). No hay "exactly-once": un crash entre `claimInflight` y `execute`, o entre `execute` y la escritura terminal, deja la key bloqueada hasta resolución humana.

## 2. Verificaciones contra el código (hechas)

- `target = sanitizeTarget(rawParams)`; `CanonicalRequest` es `Object.freeze` y los executors solo reciben `(request, adapter)`. **`rawParams` no puede afectar el efecto fuera de `target`**. El fingerprint `sha256({actionId,target,platform})` es suficiente para detectar conflicto de key (§4.3).
- `appendToJournal` (Fase 1) ya serializa con `journal.lock` (`wx`). `acquireJournalLock` detecta PID muerto pero **no** borra el lock (conservador). Fase 2 hereda esa política.
- `ActionGate.execute(actionId, rawParams?)` hoy no recibe key.

## 3. Clave y almacenamiento

- `idempotencyKey`: string 1–256 chars, provisto por el llamador. Se valida (`/^[\x21-\x7e]+$/`); inválida → error `invalid_key`, sin tocar disco.
- **Nunca se usa como nombre de archivo.** Identificador interno: `keyHash = sha256(key)`. La key original va dentro de cada entrada.
- **Única fuente de verdad: `journal.jsonl`.** Se elimina `keys.jsonl` y `idem/locks/*`: el índice es un `Map<keyHash, estado>` derivado en memoria leyendo el journal (last-write-wins por orden de línea; el orden lo fija el lock del journal). Sin segundo archivo no hay desincronización ni lock huérfano por key.
- Lectura sin lock: se lee el archivo completo; la última línea sin `\n` o con JSON inválido se ignora. Línea corrupta intermedia → se omite y se reporta en `diagnostics`; si afecta a la key consultada, fail-closed (`incierto`).
- Campos obligatorios en toda entrada con semántica idempotente: `type`, `fingerprint`, `actionId`, `target`, `platform`, `idempotencyKey`, `keyHash`, `status`, `timestamp`, `pid`, `hostname`, `requestId`, `executionId`. Entradas sin `idempotencyKey` (Fase 1) se ignoran para idempotencia.

## 4. Protocolo

### 4.1 Estados (registros append-only, `type: "idem"`)

| status | Significado | Efecto posible |
|---|---|---|
| `started` | Intención registrada y fsync **antes** de `execute` | desconocido |
| `completed` | Executor retornó (`success` true/false) y se persistió `result` | ocurrió |
| `aborted` | Falla **previa** a invocar el executor (claim_exists, error de persistencia antes de execute) | no ocurrió |
| `failed` | Executor lanzó excepción | posiblemente parcial |
| `incierto` | `started` sin terminal y dueño muerto; o terminal no persistible | desconocido |

`aborted` libera la key (reintento seguro). `completed`, `failed`, `incierto` bloquean la key.

### 4.2 Secuencia de `execute(actionId, rawParams, {idempotencyKey})`

1. Validar key; pasos 1–8 actuales del gate (sin efectos).
2. **`beginKey`** (una sola sección bajo `journal.lock`): leer journal → evaluar estado de la key →
   - sin registros o último `aborted` → append `started` (con fsync) y salir con `proceed`;
   - `completed` → `cached` (devuelve `result` guardado);
   - `started` con claim vivo (`isClaimOwnerAlive`) → error `in_progress` inmediato (sin espera; el cliente reintenta);
   - `started` con dueño muerto, `failed` o `incierto` → error `needs_resolution` (no reejecuta);
   - fingerprint distinto al registrado → `key_conflict`.
   La decisión y la reserva son atómicas: no hay TOCTOU, y el camino de lectura/caché **no** exige ningún lock de key.
3. `claimInflight` (Fase 1). Si falla → append `aborted` (reason `claim_exists`) y devolver error.
4. `execute`. Excepción → append `failed`; éxito → append `completed` con `result`.
5. Si el append terminal falla: **no** se libera el claim; el estado derivado queda `needs_resolution` (key bloqueada, no reejecutar). **No se escribe `status: "incierto"` en journal**, el estado es detectable únicamente por `beginKey` al ver `started` sin entry terminal + claim huérfano. Retorna el resultado al llamador marcando `persisted:false`.
6. Solo tras el append terminal exitoso: `releaseInflight`. Orden de adquisición: journal-record `started` → claim; liberación inversa: claim ← (el registro es permanente).

### 4.3 Concurrencia entre keys

- Misma fingerprint, keys distintas: serializa el claim de Fase 1; el perdedor registra `aborted` y devuelve `claim_exists`.
- Misma key, fingerprint distinta: `key_conflict`, sin ejecutar.

### 4.4 Lock huérfano del journal

Política Fase 1 conservada: no se borra automáticamente. `buffy journal unlock --confirm-dead-pid <pid>` queda como trabajo de implementación (verifica `isProcessAlive` + hostname, registra auditoría). La ventana de lock es de milisegundos (solo append/lectura), por lo que el riesgo es bajo y acotado.

## 5. API (nombres canónicos, únicos en todo el documento)

- `ActionGate.execute(actionId, rawParams?, opts?: { idempotencyKey?: string })` — sin key, comportamiento Fase 1 intacto.
- `beginKey(key, ctx): BeginResult` (`proceed | cached | in_progress | needs_resolution | key_conflict`).
- `finishKey(key, ctx, outcome)` — append terminal (`completed | failed | aborted`).
- `lookupKey(key): KeyState` — lectura sin lock; usada por `buffy journal key <key>` (solo lectura).
- `resolveKey(key, resolution, {reason, resolvedBy})` — extiende `resolveClaim`; CLI: `buffy journal resolve --key <key> --resolution ... --reason ...`.
- Reconstrucción del índice = `lookupKey` sobre el journal; no existe archivo de índice que reconstruir.

## 6. `buffy journal resolve` por key

Requiere `reason` no vacío y dueño del claim no vivo (reglas de Fase 1). Registra `type:"resolution"` con `idempotencyKey`, y **solo después** libera el claim si existe.

| resolution | Efecto sobre la key |
|---|---|
| `efecto_confirmado` | Pasa a `completed` (sin `result` real; marca `resolved:true`). Cacheada en adelante. |
| `efecto_ausente_confirmado` | Única vía que reabre la key (equivale a `aborted`). Es aserción humana auditada. |
| `abandonada_sin_determinar` | La key queda bloqueada definitivamente como `incierto` (nunca reabre). |

Así `incierto` no se reejecuta salvo prueba humana explícita de ausencia de efecto.

## 7. Tests (todos dentro de `npm test`)

Inyección de fallos: `BUFFY_FAULT_POINT=<punto>` leído por un hook en `execution-journal.ts`/`action-gate.ts`; el punto hace `process.exit(137)` (simula `kill -9` determinista). Los tests lanzan un hijo con `child_process.spawnSync` sobre `tsx`. **Los cuatro puntos de inyección producen `needs_resolution` en `beginKey` en el reintento**.

| Punto de fault | Estado observable `beginKey` | ¿Efecto ocurrió? | Resultado del reintento |
|---|---|---|---|
| `after_started` | `needs_resolution` | No (execute exige claim previo; crasheó antes) | `resolve` con `efecto_ausente_confirmado` reabre la key; sin claim viejo, no hay `claim_exists` |
| `after_claim` | `needs_resolution` | Probablemente no, pero **indistinguible** del siguiente | `resolve` libera claim huérfano; key reabre para nuevo intento |
| `after_execute` | `needs_resolution` | **Pudo ocurrir** (effects parciales) | Igual que anterior; el sistema no distingue `after_execute` de `before_terminal_append` |
| `before_terminal_append` | `needs_resolution` | **Mismo caso que `after_execute`** (started sin entry terminal + claim huérfano) | Igual; test debe afirmar el mismo resultado |
| T13 | Línea corrupta intermedia sobre la key consultada → fail-closed |
| T14 | `resolve` con las 3 resoluciones: cierre, reapertura, bloqueo permanente; rechazo con dueño vivo o sin `reason` |
| T15 | `aborted` por `claim_exists` → reintento posterior permitido |
| T16 | Ejecución sin key → idéntico a Fase 1 (la suite existente sigue verde) |

## 9. Reglas de `resolve` (apend-only, sin modificar entradas del journal)

Todas las reglas solo agregan entradas `type: "resolution"` al journal. **Nunca** se modifican ni reemplazan entradas existentes (principio append-only estricto). **`status: "aborted"` nunca se escribe en el journal** como consecuencia de `resolve`; el estado `aborted` solo puede aparecer por colisión de fingerprint (ver §11).

- **Regla A: `efecto_confirmado` con `started` en journal.** Cuando el operador declara `efecto_confirmado` y `beginKey` ve `started` (con `executionId`):
  - Se agrega una entrada `type: "resolution"` con `resolution: "efecto_confirmado"`, `reason`, `resolvedBy`, y el `executionId` del `started`.
  - La key pasa a `completed` (el cambio de estado se comunica al llamador, no reescribiéndose en journal como `status: "completed"`; la key ya tenía `status: "started"` y ahora se considera `completed` para todos los efectos de caché y reintento).
  - El claim de `inflight/` **se libera** (porque el `executionId` coincide y no hay constancia contradictoria en journal).
  - La caché devuelve `{ status: "cached", resolved: true, result: null }`.
  - **Sentido:** el executor corrió pero no hubo constancia persistente; la decisión humana cierra el ciclo.

- **Regla B: `efecto_ausente_confirmado` siempre reabre la key (append-only, sin escribir `aborted`).** Cuando el operador declara `efecto_ausente_confirmado`:
  - `reason` es **obligatorio** (debe contener una explicación textual del porqué el sistema considera que no hubo efecto).
  - Se agrega una entrada `type: "resolution"` con `resolution: "efecto_ausente_confirmado"`, `reason` (obligatorio), `resolvedBy`.
  - **Nunca** se modifica ni reemplaza la entrada `started` existente (principio append-only).
  - **Nunca** se escribe `status: "aborted"` en el journal como consecuencia de esta resolución (ese estado solo puede aparecer por colisión de fingerprint, §11).
  - La key queda **disponible** para nuevo `beginKey → proceed` (el sistema considera que la key no está consumida, ya que no hubo ejecución efectiva).
  - **Sentido:** aserción humana auditada de que el efecto no ocurrió, aunque el claim estuviera vivo. Al no escribir `aborted` en journal, la key queda disponible para reintentar más adelante.

- **Regla C: `abandonada_sin_determinar` bloquea para siempre (append-only).** Cuando el operador declara `abandonada_sin_determinar`:
  - Se agrega una entrada `type: "resolution"` con `resolution: "abandonada_sin_determinar"`, `reason` **obligatorio**, `resolvedBy`.
  - La key queda en estado `incierto` permanentemente (el estado `incierto` es **derivado** por `beginKey` al ver claim huérfano + resolución `abandonada_sin_determinar`; **no** se escribe `status: "incierto"` en journal para preservar el principio append-only).
  - El claim **se conserva** en `inflight/` (ningún humano interviene para decir si ocurrió o no).
  - La key **nunca** se reabre automáticamente. Solo un humano podría decidir borrar el claim manualmente.
  - **Sentido:** parálisis segura cuando no hay evidencia.

- **Regla D: `resolve` exige `executionId` coincidente y dueño muerto para liberar claim.** `resolveKey(key, resolution, {reason, resolvedBy})` **solo** libera el claim si:
  - El `executionId` del claim en `inflight/` coincide con el `executionId` guardado en la entrada `started` de la key.
  - **Adicional:** `beginKey` comprueba liveness (usando hostname, bootId, `process.kill(pid,0)`, starttime; ver §10). Si el dueño del claim está vivo, `resolve` **no** libera el claim y devuelve `owner_alive` en el resultado.
  - **Caso contrario** (executionId distinto o claim de otra ejecución, o dueño muerto): `resolve` **no** libera el claim, pero sí registra la resolución con `executionId` observado y devuelve `claim_not_released` en el resultado, informando al operador que hay un claim huérfano de distinta ejecución.
  - Esto evita que una colisión de fingerprint cause liberación indebida de un claim ajeno, y garantiza que solo un operativo humano con dueño muerto puede reabrir la key.

## 10. Detección de liveness desde `started` (sin necesidad de claim)

El diseño usa el propio registro `started` para saber si el dueño está vivo, sin necesidad de leer `inflight/`. Esto permite que `beginKey` funcione inmediatamente después de `after_started` (cuando aún no hay claim).

**Campos en `started`:**
- `pid`: number
- `hostname`: string
- `bootId`: string (de `/proc/sys/kernel/random/boot_id`; `undefined` fuera de Linux)
- `starttime`: number (campo 22 de `/proc/<pid>/stat`, time en jiffies desde el boot)

**Para determinar si el dueño está vivo al leer `started`:**
1. Si `pid` es el PID actual: 
   - Ejecutar `process.kill(pid, 0)` sin error.
   - El `hostname` guardado debe coincidir con el hostname actual de la máquina.
   - El `starttime` actual leído de `/proc/<pid>/stat` campo 22 debe ser igual que el `starttime` guardado.
   - Si las tres condiciones se cumplen → `in_progress` (mismo proceso vivo, ejecución legítima continua).
2. Si `pid` es distinto al PID actual:
   - Leer `/proc/<pid>/stat` (si existe). Hacer parse cuidadoso: el campo 1 es el PID, el campo 22 es `starttime`; el nombre `comm` (campo 1) puede contener espacios, así que cortar el renglón después del último `)`.
   - Comparar cuatro condiciones estrictas:
     a. `hostname` guardado debe coincidir con el hostname actual.
     b. `bootId` guardado (si está definido) debe coincidir con el valor actual de `/proc/sys/kernel/random/boot_id`.
     c. `process.kill(pid, 0)` sin error (el proceso con ese PID sigue vivo).
     d. El `starttime` actual leído debe ser igual que el `starttime` guardado.
   - Si las cuatro coinciden → el dueño es vivo (`in_progress`).
   - Si hay cualquier discrepancia (hostname distinto, bootId distinto, proceso muerto, starttime diferente) → `needs_resolution` (dueño muerto o PID reutilizado con starttime distinto).
3. Si `/proc` no existe (otras plataformas fuera de Linux): fallback a solo PID + hostname + `process.kill(pid, 0)`.
   - Si el PID es el actual y `process.kill(pid, 0)` no hay error → `in_progress`.
   - Si el PID es distinto y `process.kill(pid, 0)` falla → `needs_resolution`.
   - Anotar en diagnostics que la protección de liveness es reducida (solo PID+hostname, sin bootId/starttime).

**Ventaja:** elimina cualquier umbral arbitrario de minutos o wall-clock time. La reutilización de PID se detecta por discrepancia en las cuatro condiciones (hostname, bootId, alive check, starttime), no por tiempo transcurrido. Se evita así falsos `needs_resolution` en ejecuciones largas legítimas.

## 11. `aborted` por colisión de fingerprint

Cuando dos keys distintas tienen la misma fingerprint (mismo `actionId`, `target`, `platform`), el diseño ya especifica:

- El perdedor registra `aborted` en journal y devuelve error `claim_exists`.
- `beginKey` debe **ignorar** esa combinación `started` + `aborted` como intento ejecutado previo.
- Si la última entrada de la key es `status: "aborted"` (por colisión de fingerprint), `beginKey` debe volver a `proceed` (reserva fresca), **no** contar como key consumida.

Esto evita que `aborted` por colisión cuente como intento ejecutado y bloquee la key injustamente.

## 12. `beginKey` y `cached`: solo `completed` devuelve caché

> **Regla estricta:** `beginKey` devuelve `state: "cached"` **solo** cuando la última entrada de la key tiene `status: "completed"`. Para `status: "failed"` o una entrada `started` sin terminal persistente, devuelve `state: "needs_resolution"` (key bloqueada, no reejecutar).

Esto evita que una key fallida o sin constancia persistente se presente al cliente como éxito.

## 13. `key_conflict`: comparar fingerprint guardado vs fingerprint de la solicitud

- `beginKey` debe leer el `fingerprint` de la entrada `started` (o de la entrada `resolution` más reciente) y compararlo con `sha256({actionId, target, platform})` de la solicitud actual.
- Si son distintos → `state: "key_conflict"`, **sin ejecutar**.
- Si son iguales → proceder con la lógica de estado (`proceed | cached | in_progress | needs_resolution`).

## 14. `executionId` guardado en `started`

- La entrada `started` debe incluir `executionId: <string>` generado en `beginKey` (o por `claimInflight` si la secuencia es `beginKey → claimInflight → execute`).
- El `executionId` es el que `resolve` compara para decidir liberación de claim (Regla D).
- Si `beginKey` se llama sin `claimInflight` previo (escenario `after_started` con crash), el `executionId` es el del proceso que crasheó, y se usa para liveness y resolución.

## 15. Checklist de implementación (estado real: **nada hecho**)

- [ ] Hook de fault-injection
- [ ] `beginKey` / `finishKey` / `lookupKey` / `resolveKey` en `execution-journal.ts`
- [ ] Parámetro `opts.idempotencyKey` en `ActionGate.execute()`
- [ ] CLI `journal resolve --key`, `journal key`
- [ ] Tests T1–T16 en `tests/idempotency.test.ts`
- [ ] `npx tsc --noEmit` y `npx vitest run` en verde

## 16. Límites

- Efectos externos de los executors no son transaccionales; la key protege la invocación, no el efecto físico.
- Si el journal se pierde o trunca antes de una `started`, el sistema no puede saber que hubo intento.
- Locks del journal abandonados requieren intervención humana (§4.4).
- Sistemas de ficheros remotos: garantías de `wx`/`fsync` dependientes del FS.

