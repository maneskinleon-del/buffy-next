# Execution Journal Fase 2 — Diseño de idempotencia (at-most-once) v3

Estado: solo diseño. No existe código de Fase 2. Sustituye a v2; v2 y v2.bak se conservan sin tocar.

## 1. Garantía

At-most-once por `idempotencyKey`, con liveness manual. Para una key dada el executor se invoca como máximo una vez, salvo que un humano declare `efecto_ausente_confirmado` (§8). No es exactly-once: un crash entre `beginKey` y el append terminal deja la key bloqueada hasta resolución humana. La key protege la invocación del executor, no el efecto físico.

## 2. Verificado contra el código (Fase 1)

- `normalizeTarget` pasa `rawParams` por `sanitizeTarget` y entrega un `CanonicalRequest` congelado; los executors reciben `(request, adapter)`.
- El fingerprint es `computeFingerprint(actionId, target, platform)` (`execution-journal.ts`), sin `rawParams`.
- `acquireJournalLock` detecta PID muerto pero no borra el lock. Fase 2 hereda esa política.
- Grep sobre `src/actions` y `src/core/executor*` (patrón `process.env|Date.now|new Date|fs\.|fetch|child_process|os\.|randomBytes|Math\.random|requestId`): exit 1, sin coincidencias.
- NO verificado: lo que hacen los adapters (`src/adapters`), que sí leen `process.env`. El efecto puede depender del entorno aunque la key sea idéntica.

## 3. Clave y almacenamiento

- `idempotencyKey`: string de 1 a 256 caracteres, validado con `/^[\x21-\x7e]+$/`; inválida → `invalid_key`, sin tocar disco.
- Nunca es nombre de archivo. Identificador interno: `keyHash = sha256(key)`; la key original va dentro de cada entrada.
- Única fuente de verdad: `journal.jsonl`. No hay `keys.jsonl` ni locks por key.
- Lectura sin lock: última línea sin `\n` o con JSON inválido se ignora; línea corrupta intermedia que afecta a la key consultada → `needs_resolution` (fail-closed) y se reporta en diagnostics.
- Entradas sin `idempotencyKey` (Fase 1) se ignoran para idempotencia.

## 4. Entradas del journal y estados derivados

Entradas escritas (append-only): `started`, `completed`, `failed`, `aborted`, `resolution`.
Campos comunes: `type`, `idempotencyKey`, `keyHash`, `fingerprint`, `actionId`, `target`, `platform`, `executionId`, `requestId`, `ts`.
`started` añade: `pid`, `hostname`, `bootId`, `starttime`.
`resolution` añade: `resolution`, `reason`, `evidence`, `resolvedBy`.

Estados derivados (nunca se escriben): `proceed`, `cached`, `in_progress`, `needs_resolution`, `key_conflict`, `incierto` (etiqueta informal de `needs_resolution` cuando hay `started` sin terminal).

`aborted` solo se escribe cuando falla `claimInflight` (`claim_exists`) o la validación previa al executor, y siempre después de un `started` ya persistido. Si falla el append de `started` no hay nada que abortar: el llamador recibe el error y la key queda sin entradas.

## 5. `beginKey` (atómico bajo `journal.lock`)

Relee el journal dentro del lock, toma la última entrada de la key y decide. Si hay fingerprint registrado y difiere del de la solicitud → `key_conflict` (se evalúa primero, también tras una reapertura).

| Última entrada de la key | Resultado |
|---|---|
| ninguna, `aborted`, o `resolution: efecto_ausente_confirmado` | `proceed`: append `started` con fsync, genera `executionId` |
| `completed`, o `resolution: efecto_confirmado` | `cached` (en el segundo caso `{resolved: true, result: null}`) |
| `failed`, o `resolution: abandonada_sin_determinar` | `needs_resolution` |
| `started`, dueño vivo (§7) | `in_progress` (error inmediato, sin espera) |
| `started`, dueño muerto | `needs_resolution` |

## 6. Secuencia de `execute(actionId, rawParams, {idempotencyKey})`

1. Validar key y pasos previos del gate (sin efectos).
2. `beginKey`. Solo con `proceed` se continúa.
3. `claimInflight(…, {executionId})` (Fase 1). Si falla → append `aborted` (`claim_exists`) y error.
4. `execute`. Excepción → append `failed`; retorno → append `completed` con `result`.
5. Si el append terminal falla: no se libera el claim, se devuelve el resultado con `persisted:false` y la key queda `needs_resolution` en el siguiente intento.
6. Tras el append terminal exitoso: `releaseInflight`. Orden de adquisición: `started` → claim. Liberación: solo el claim (el registro es permanente).

Colisión de fingerprint: dos keys con la misma fingerprint se serializan por el claim; el perdedor escribe `aborted` (con su fingerprint) y devuelve `claim_exists`. No cuenta como intento ejecutado.

## 7. Liveness (una sola regla)

El dueño de un `started` está vivo si y solo si coinciden las cuatro condiciones:
a. `hostname` guardado == hostname actual.
b. `bootId` guardado == `/proc/sys/kernel/random/boot_id` actual.
c. `process.kill(pid, 0)` no falla.
d. `starttime` actual de ese PID (campo 22 de `/proc/<pid>/stat`, cortando tras el último `)`) == `starttime` guardado.

Cualquier discrepancia → dueño muerto. No hay ramas por "PID actual" ni umbrales de tiempo. Fuera de Linux (sin `/proc`): solo `hostname` + `kill(pid,0)`, protección reducida y anotada en diagnostics.

## 8. `resolveKey(key, resolution, {reason, evidence, resolvedBy})`

Corre bajo `journal.lock` y relee el estado.
1. Solo actúa si el estado derivado es `needs_resolution`.
2. Con `in_progress` → `owner_alive`, sin escribir nada. Con `proceed` o `cached` → `not_resolvable`.
3. Escribe la entrada `resolution` (append-only). Después intenta liberar el claim, y solo si su `executionId` coincide con el de `started`; si no, devuelve `claim_not_released`.
4. `efecto_confirmado`: key pasa a `cached` con `result: null`; libera claim.
5. `efecto_ausente_confirmado`: exige `reason` y `evidence`; reabre la key (`proceed` en el siguiente `beginKey`); libera claim.
6. `abandonada_sin_determinar`: exige `reason`; la key queda bloqueada para siempre y el claim se conserva. Consecuencia: también bloquea a cualquier otra key con la misma fingerprint.
7. Si escribir la resolución funciona pero liberar el claim falla, la key ya no es `needs_resolution`; el claim huérfano se limpia con el `journal resolve` por claim de Fase 1.

## 9. Fault injection

`BUFFY_FAULT_POINT` solo actúa si la variable está definida. Hace `process.exit(137)` en un proceso hijo (`spawnSync` sobre `tsx`), nunca dentro del runner.

| Punto | Journal | `inflight/` | Reintento | ¿Efecto? |
|---|---|---|---|---|
| `after_started` | `started` | sin claim | `needs_resolution` | no |
| `after_claim` | `started` | claim huérfano | `needs_resolution` | probablemente no |
| `after_execute` y `before_terminal_append` | `started` | claim huérfano | `needs_resolution` | pudo ocurrir |

Los dos últimos puntos producen el mismo estado observable; el test afirma el mismo resultado.

## 10. Tests (T1–T17, todos en `npm test`)

| ID | Caso |
|---|---|
| T1 | Primera ejecución → `completed`; segunda → `cached`, executor invocado 1 vez |
| T2 | Misma key, fingerprint distinta → `key_conflict`, sin ejecutar |
| T3 | Keys peligrosas (`../x`, `a/b`, mayús/minús, >256, vacía) → `invalid_key`; nada fuera de `BUFFY_DIR` |
| T4 | Dos procesos simultáneos, misma key → un `proceed`, el otro `in_progress` o `cached`; executor 1 vez |
| T5 | Dos keys distintas, misma fingerprint, concurrentes → un `completed`, el otro `aborted`/`claim_exists` |
| T6 | Crash `after_started` → `needs_resolution`; executor 0 veces |
| T7 | Crash `after_claim` → `needs_resolution`; executor 0 veces |
| T8 | Crash `after_execute` y `before_terminal_append` → mismo resultado, `needs_resolution`, no reejecuta |
| T9 | Fallo simulado (ENOSPC/EIO) del append terminal → claim retenido, `persisted:false`, reintento `needs_resolution`; nada de `incierto` escrito |
| T10 | Fallo del append `started` → executor no se invoca, error al llamador, sin entradas; reintento = `proceed` |
| T11 | Executor lanza → `failed`; reintento → `needs_resolution` |
| T12 | Línea truncada al final → ignorada; otras keys intactas |
| T13 | Línea corrupta intermedia sobre la key consultada → fail-closed |
| T14 | `resolve`: las 3 resoluciones; rechazo sin `reason`/`evidence`; rechazo con estado no `needs_resolution` |
| T15 | `aborted` por `claim_exists` → reintento posterior permitido (`proceed`) |
| T16 | Ejecución sin key → idéntica a Fase 1; la suite existente sigue verde |
| T17 | `resolve` con dueño vivo → `owner_alive`, sin entrada nueva en el journal ni cambio en el claim |

## 11. Límites conocidos

- `journal unlock --confirm-dead-pid` no existe: un `journal.lock` huérfano bloquea todo el sistema. Severidad alta; decidir si entra en Fase 2.
- `beginKey` lee todo el journal bajo lock global: O(n). Sin cifra de referencia; medir con 10k y 100k líneas antes de comprometerse.
- `prune` está fuera de alcance: borrar entradas `completed` borra la memoria de la key y rompe at-most-once.
- Los adapters dependen del entorno (`process.env`); el fingerprint no lo cubre.
- Reutilización de PID: mitigada por `bootId` + `starttime`; sin `/proc` queda solo PID + hostname.

## 13. Nota operativa

Este archivo es un alias de trabajo del diseño canon que vive en `ai-context/reports/execution-journal-phase1/design-v3.md` dentro del tree compartido de la sesión. Su contenido es idéntico al canon para esta rama; si el canon cambia, se sincroniza aquí. No modificar directamente — editar siempre el canon.
