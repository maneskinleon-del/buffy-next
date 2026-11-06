# Fase 3 — Alcance cerrado: L3 `journal unlock --confirm-dead-pid`

**Estado:** alcance decidido, **sin implementar** (este documento es el único artefacto).
**Rama:** `execution-journal-fase3-l3`, desde `master` en `f97c1f4`.
**Deuda que cierra:** L3 de `ai-context/reports/execution-journal-phase1/design-v3-notas.md`.

## 1. Problema

`journal.lock` se toma con `openSync(path, 'wx')` y se libera en `finally`. Ante `SIGKILL` (o caída del proceso entre la toma y la liberación) el fichero queda huérfano y **toda** escritura del journal falla con `EEXIST` durante 5 s y luego aborta. Hoy la única salida es borrar `~/.buffy/journal.lock` a mano, sin auditoría ni verificación de que el dueño esté muerto.

`acquireJournalLock` (`src/core/execution-journal.ts:160-183`) ya detecta el caso —lee el lock, comprueba el pid— pero deliberadamente no actúa (`:174`). Falta la acción explícita y auditada, no la detección.

## 2. Contrato del comando

```
buffy journal unlock --confirm-dead-pid <pid> [--json]
```

- `--confirm-dead-pid <pid>` es **obligatorio** y debe coincidir con el `pid` registrado en el lock. Es la validación de identidad: el humano confirma qué proceso murió, no "el que sea".
- Sin el flag, el comando no hace nada (exit 1 + uso). No existe modo implícito ni `--yes`.
- `--json` emite `{unlocked, pid, hostname, diagnostics, auditWritten, lockPath}`.
- Exit 0 solo si el lock fue verificado como huérfano **y** eliminado. Cualquier rechazo es exit 1 y **no modifica el fichero**.

## 3. Condiciones de rechazo

| Caso | Mensaje | Exit |
|------|---------|------|
| No existe `journal.lock` | `No hay journal.lock: nada que liberar` | 1 |
| JSON corrupto o truncado | `Lock ilegible; inspecciona <ruta> a mano` (no se borra nada) | 1 |
| Lock sin `pid` válido | `Lock sin pid verificable; revisión manual` | 1 |
| `pid` del lock ≠ `--confirm-dead-pid` | `El lock pertenece al pid N, no a M` | 1 |
| `hostname` distinto del local | `Lock de otro host; no verificable localmente` | 1 |
| Proceso vivo (`kill(pid,0)` OK o `EPERM`) | `El proceso N sigue vivo; no se libera` | 1 |

Nota de semántica: `startedOwnerAlive` devuelve `alive:false` para `hostname_distinto` porque para *claims* "no verificable" equivale a "recuperable". Para **unlock** esa lectura sería destructiva: otro host nunca se trata como muerto, se rechaza.

## 4. Decisión: liveness con `bootId` + `starttime` (opción B)

### Comparación

| | A: solo `hostname` + `pid` | B: `hostname` + `bootId` + `pid` + `starttime` |
|---|---|---|
| Cambio en el escritor del lock | ninguno | **1 línea** en `tryAcquireLock`: usar `{...currentLivenessFields(), acquiredAt}` (ya existe en `:622`) |
| Coste por adquisición | 0 | 2 lecturas de `/proc` (`boot_id`, `/proc/self/stat`), microsegundos frente al `fsync` del append |
| Reutilización de PID tras reinicio | **punto ciego**: un pid reciclado por un proceso vivo hace que el lock huérfano parezca vivo → rechazo permanente | `bootId` distinto prueba que el dueño original ya no existe → se libera |
| Lock huérfano tras reiniciar la máquina (el escenario que genera el problema) | puede quedar **irrecuperable** | recuperable |
| Legacy (locks sin los campos) | funciona | requiere trato explícito |
| Superficie de error nueva | 0 | fallo de `/proc` → campos `null` → liveness reducida (fail-closed) |

### Recomendación: B, con degradación explícita

A es gratis pero falla justo en el caso que motiva L3: el huérfano nace de un crash y lo normal es que la máquina se reinicie antes de que alguien lo note. Sin `bootId`, un pid reciclado convierte el lock en un bloqueo permanente que el comando rechazaría para siempre.

B cuesta una línea porque `currentLivenessFields()` ya construye exactamente ese objeto y `startedOwnerAlive` ya consume esos campos. No hay lógica de liveness nueva que escribir ni que testear dos veces.

**Legacy:** un lock sin `bootId`/`starttime` se acepta con `hostname` local + pid muerto, registrando `liveness_reducida` en la auditoría. Es exactamente el contrato que ya documenta `design-fase2-idempotency.v2.md` §4.4 ("verifica `isProcessAlive` + hostname"); B no lo rompe, solo añade protección a los locks nuevos.

## 5. Decisión: orden de la auditoría

El append de auditoría necesita el lock que se está liberando. No es un deadlock real: mientras el fichero existe, ningún otro proceso puede adquirirlo, y el dueño registrado está probado muerto.

**Orden: auditar antes de borrar.**

1. Verificar (§3). Si algo falla → exit 1, sin tocar nada.
2. `writeEntryLine({ type: 'lock_release', at, lock: {...}, confirmedPid, liveness: { diagnostics }, resolvedBy: 'human' })` — append sin lock, con `fsync`.
3. `unlinkSync(journal.lock)`.

- Si (2) falla → **no se borra** el lock, exit 1. Fail-closed: sin rastro no hay acción.
- Si (2) funciona y (3) falla → exit 1 con `auditWritten: true`; la entrada queda y es inofensiva (journal append-only), el lock sigue ahí y se reintenta.

Auditar antes deja el journal siempre coherente con la realidad; al revés, un fallo del append después del `unlink` dejaría una liberación sin rastro.

## 6. Fuera de alcance

- **L1** (fingerprint con keys distintas): tarea independiente.
- `state.lock`: comparte `tryAcquireLock` pero no bloquea el journal; se decide en otra tarea (la nota L3 habla solo de `journal.lock`).
- Auto-recovery: el unlock sigue siendo explícito y humano.
- TTL / expiración de locks.
- Reducir el `busy-wait` de 5 s con spin de 10 ms, y el `auto-delete` dentro de `acquireJournalLock`.
- `--force` para saltarse la verificación.

## 7. Plan de implementación

| # | Commit | Contenido |
|---|--------|-----------|
| 1 | `feat(execution-journal): registrar bootId y starttime en journal.lock` | `tryAcquireLock` usa `currentLivenessFields()`; helper `readLockInfo()` que devuelve `{info, error}` sin lanzar |
| 2 | `feat(cli): journal unlock --confirm-dead-pid` | Verificación §3, auditoría §5, `--json`, exit codes |
| 3 | `test(journal-unlock): rechazos y liberación auditada` | T18–T26 |
| 4 | `docs(notes): L3 cerrada y CONTINUE` | `design-v3-notas.md` fila L3 → "cubierto por T18–T26"; `CONTINUE.md` |

Archivos: `src/core/execution-journal.ts`, `src/cli.ts`, `tests/journal-unlock.test.ts` (nuevo), `tests/journal-cli.test.ts` (uso), `ai-context/CONTINUE.md`, `design-v3-notas.md`.

## 8. Tests

| # | Caso | Esperado |
|---|------|----------|
| T18 | sin lock | exit 1, mensaje claro |
| T19 | JSON corrupto | exit 1, fichero intacto |
| T20 | pid del lock ≠ flag | exit 1, fichero intacto |
| T21 | hostname ajeno | exit 1, fichero intacto |
| T22 | dueño vivo (pid del propio test) | exit 1, fichero intacto |
| T23 | huérfano real (pid inexistente, hostname local) | exit 0, lock borrado, entrada `lock_release` en el journal |
| T24 | `bootId` distinto, pid vivo reciclado | exit 0 (dueño original probado muerto) |
| T25 | `starttime` distinto con pid vivo | exit 0 (PID reutilizado) |
| T26 | append de auditoría falla | exit 1, lock **no** borrado |

Mecanismo: lock escrito a mano en un `BUFFY_DIR` temporal (`freshDir()`), sin `kill -9` real ni esperas largas; verificación de las entradas del journal leyendo el JSONL. Los casos de CLI, por subprocess, siguiendo `tests/journal-cli.test.ts`.

## 9. Criterios de aceptación

1. `npx tsc --noEmit` → 0 errores.
2. `npx vitest run` → 751 previos + T18–T26 en verde.
3. Recorrido manual: crear `journal.lock` con un pid inexistente → una escritura del journal falla → `buffy journal unlock --confirm-dead-pid <pid>` → exit 0 → la siguiente escritura funciona y el journal contiene la entrada `lock_release`.
4. Ningún camino borra el lock sin entrada de auditoría escrita antes.
5. Lock de otro host, pid distinto o proceso vivo: exit 1 y fichero intacto (verificado por test, no por inspección visual).

## 10. Riesgos

- **Namespace de PID distinto** (contenedor) con el mismo hostname: `kill` da `ESRCH` y el lock parecería huérfano. `bootId` no lo resuelve (los `/proc` son distintos). Mitigación: el `hostname` real de contenedores suele diferir; se documenta como límite conocido y el `--confirm-dead-pid` obliga a una confirmación humana explícita del pid.
- **Escritura parcial del lock** si el proceso muere dentro de `tryAcquireLock` entre `openSync` y `writeAll`: lock presente con JSON truncado → cae en el rechazo "lock ilegible". Correcto (fail-closed), pero conviene que el mensaje sugiera inspección manual.
- El unlock no repara un journal corrupto; solo libera el lock.
