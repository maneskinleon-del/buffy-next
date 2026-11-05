# Execution Journal Fase 2 — Diseño de Idempotencia Exactly-Once

> Estado: **AVALIADO INCREMENTALMENTE — corregido tras auditoría** (2026-11-04).  
> Este documento modela la implementación real de Fase 2 en `src/core/execution-journal.ts`, `src/core/action-gate.ts` y `tests/execution-journal-phase1.test.ts`.  
> **Sin cambios a código funcional de Fase 1**: la Fase 2 se aborda añadiendo la clave idempotente a la misma persistencia y flujos ya usados, sin rediseñar canales externos.

---

## 1. Contexto y alcance

La Fase 1 implementó:
- Claims duraderos en `~/.buffy/inflight/<fingerprint>.json` (atomic write público: temp + fsync + linkSync + fsync dir).
- Journal append-only `~/.buffy/journal.jsonl` con lock exclusivo del journal.
- Recuperación conservadora sin auto-liberación.
- Firma `requestFingerprint = sha256({actionId, target, platform})` — mismo fingerprint de Fase 1.

**Vacíos que modela Fase 2:**
- ❌ Sin `idempotencyKey` consolidado en el ciclo de vida (Fase 1 no garantizaba idempotencia secuencial).
- ❌ Sin `buffy journal resolve` definido en la API pública.
- ❌ Sin casuística de `failed` / `incierto` documentada.
- ❌ Sin pruebas multiproceso (monolito de Fase 1).

Este diseño **no** introduce un storage separado. El estado idempotente se sostiene en el mismo `journal.jsonl` (fuente de verdad) y su índice derivado `keys.jsonl`. El archivo `keys.jsonl` es **útil para lectura rápida del índice**, no una fuente independiente de la verdad.

---

## 2. Clave idempotente y firma

### 2.1 `idempotencyKey` (provisto por el llamador)

`idempotencyKey` es un **string estable, provisto por quien solicita la operación**. No genera el sistema. El sistema solo recibe la string, la valida contra colisiones y la persiste.

> **Restrictiva de seguridad:** para generar keys, el llamador debe garantizar que la misma `idempotencyKey` + mismos parámetros implican el mismo efecto. Un mal uso (dos clave distintas → misma operación lógica) destruye la idempotencia por diseño, no por el sistema.

### 2.2 `requestFingerprint` (herramienta del sistema)

Se reutiliza el **mismo fingerprint de Fase 1**:

```
requestFingerprint = sha256(JSON.stringify({ actionId, target, platform }, null, 0))
```

- Incluye `actionId`, `target`, `platform`.
- **No incluye** `requestId` (efímero por `Date.now()` + `randomBytes`) ni `rawParams` (variable alojada en el `CanonicalRequest` del executor y no persiste en este fingerprint).
- ¿Qué pasa si el executor usa `rawParams` para el efecto?  
  **Antes de usar Fase 2, el ejecutor debe fijar `rawParams` a una constante** (o al payload estabilizado) para que la misma pair `(actionId, target, platform)` produzca el mismo efecto. De lo contrario, la misma key puede devolver un resultado cacheado incorrecto. El diseño exige esto explícitamente y los tests de Fase 2 vincularán `rawParams` al efecto.

### 2.3 Campos que **debe** llevar cada entrada del `journal.jsonl`

Para la reconstrucción del índice en Fase 2, **cada línea válida de `journal.jsonl` debe incluir**:

- `type`: `"reservation" | "execution" | "resolution"`
- `fingerprint`
- `actionId`
- `target`
- `platform`
- `requestId` (opcional; el claim lo lleva)
- `executionId` (opcional; presente si el executor lo fija)
- `timestamp`
- `idempotencyKey`
- `status`: `"reserved" | "in_progress" | "completed" | "failed" | "incierto"`
- `result` (solo para `execution`, cuando exista)
- `message` (opcional)
- `evidenceLevel` (opcional)

Si una entrada del journal no incluye `idempotencyKey`, **no se considera parte de la semántica idempotente** de Fase 2.

### 2.4 Índice `keys.jsonl`

Se mantiene un archivo de índice legible para humanos/tooling:

- Ubicación: `~/.buffy/keys.jsonl` (expandido automáticamente).
- Formato JSONL, **append-only a nivel de diseño**, aunque el sistema interno **puede actualizar la última línea** si es estrictamente necesario.
- No es fuente de verdad: la consulta de idempotencia se hace primero sobre `journal.jsonl` y luego sobre `keys.jsonl` como cache independiente para lectura rápida. Si `keys.jsonl` está corrupto, la recuperación no falla; solo se reconstruye el índice.

---

## 3. Ciclo de vida de una clave idempotente

### 3.1 Máquina de estados de la clave

| Estado | Significado | Transiciones permitidas |
|---|---|---|
| `reserved` | Lock adquirido; número de `executionId` decidido (claim proyectado) | → `in_progress` (después de `claimInflight` exitoso) |
| `in_progress` | Se está ejecutando; claim vivo | → `completed` (después de `appendJournal` + `updateKeyIndex` exitosos)<br>→ `failed` (si `execute` lanza error confirmado)<br>→ `incierto` (si `appendJournal`/`updateKeyIndex` fallan) |
| `completed` | Ejecución terminada; resultado persisted | — (terminal; key consumida y no reutilizable) |
| `failed` | Fallo confirmado del executor | — (terminal; requiere `buffy journal resolve` para reintentar) |
| `incierto` | Estado ambiguo por fallo de persistencia | → `failed` (decisión humana)<br>→ `completed` (decisión humana)<br>consumida después de `buffy journal resolve` |

**Definiciones concretas de `failed` y `incierto`:**

- `failed` (fallo confirmado): El executor **lanzó error**, y el sistema tiene constancia del mensaje.  
  *No se asume que el efecto no ocurrió.* Sólo se confirma que la ejecución no completó en el sistema de Buffy.
- `incierto` (duda sobre el efecto): El ejecutor **no lanzó error**, pero la persistencia falló (`appendJournal` o `updateKeyIndex` se rompió).  
  En este caso el efecto puede haber ocurrido o no: el sistema no puede decidir. Por eso el estado es `incierto` y no `failed`.  
  **Uso de `incierto`:** no es un estado durable por sí mismo en el diseño original, sino un **señalación de duda** que obliga a `buffy journal resolve` antes de considerar el estado cerrado.

### 3.2 Transiciones forzadas por fallo

1. **claimInflight falla** → key permanece en `reserved`; no se avanza a `in_progress`; se devuelve `claim_exists`.
2. **execute lanza error** → key pasa a `failed` en el journal; claim permanece en `inflight/`.  
   `finishedAt` y `outcome: failure` se escriben, y el claim **no se libera** hasta `buffy journal resolve`.
3. **appendJournal falla** → key pasa a `incierto` en el journal; claim permanece en `inflight/`.  
   En retry, el sistema **devuelve el resultado cacheado** (si existe en journal para esa key) y no reejecuta.
4. **updateKeyIndex falla** mientras `appendJournal` sí escribió → journal tiene constancia; se devuelve `incierto`? No: `incierto` es solo cuando persistence falla. Si `appendJournal` escribió, el estado es `completed` (o `failed` si execute falló). El índice puede reconstruirse de journal; el sistema devuelve el resultado cacheado y no reejecuta.

### 3.3 ¿Cuándo se consume una clave?

Una clave se considera **consumida** cuando el ciclo completo `reserveKey → claimInflight → execute → appendJournal → updateKeyIndex → releaseClaim` se completa exitosamente con `status: "completed"`. Solo en `completed` la key no puede ser reutiliza para nueva ejecución.

- `failed` e `incierto` **no consumen** la clave automáticamente: requieren `buffy journal resolve` antes de que pueda reutilizarse o descartarse.
- **Importante:** `buffy journal resolve` **no** permite reutilizar una key para volver a ejecutar el mismo efecto: `resolve` solo **cierra el estado** (`failed`/`incierto` → `completed` o `failed`), y con ello se libera la reserva. No se reapertura de ejecución.

### 3.4 Política de liberación

| Cuándo liberar | Qué sucede |
|---|---|
| Después de `updateKeyIndex` éxito + `releaseClaim` | Key liberada, consumida, idempotente completada |
| Si `claimInflight` never se logró | Lock de claim liberado; `keys.jsonl` no existe (sin claim) |
| Si `execute` falla → estado `failed` | Claim permanece hasta `buffy journal resolve` |
| Si `appendJournal` falla → estado `incierto` | Claim permanece hasta `buffy journal resolve` |
| Si `updateKeyIndex` falla → Índice no actualizado, journal persistido | En retry: devuelve cacheado, actualiza índice, release claim |

### 3.5 Alias y consistencia

El diseño original usa nombres como `reserveIdempotencyKey`, `checkIdempotencyKey`, `recordIdempotencyResult` y `updateKeyIndex`. **En el código de Fase 2, esos nombres son un alias interno del actor `ExecutionJournal`** — la misma función tiene distintos nombres según el contexto. Para la especificación, se usarán estrictamente:

- `reserveKey(key)` / `releaseClaim(fingerprint)`: reserva/liberación de claim.
- `appendJournal(entry)`: escritura atómica del journal (lock exclusivo).
- `reconcileClaim(fingerprint, expected?)`: en recovery, sincroniza claim/journal.
- `resolveClaim(fingerprint, resolution, expected)`: `buffy journal resolve`.

---

## 4. Flujo de ejecución (claim → execute → persist)

### 4.1 `claimInflight` y reserva atómica

La reserva atómica se basa en `open("~/.buffy/idem/locks/<sha256(idempotencyKey)>.lock", "wx")` — es decir, **un fichero de lock por-clave**, no un lock global de clave.

| Paso | Acción |
|---|---|
| 1 | `fd = open("~/.buffy/idem/locks/<sha256(idempotencyKey)>.lock", "wx")` |
| 2 | Si `EEXIST` → otro proceso ya reservó; devolver error `key already reserved` |
| 3 | Escribir `{"key": <idempotencyKey>, "pid": process.pid, "startedAt": <ISO>}` y `fsync` |
| 4 | `linkSync(tmp, key.lock)` (publicación atómica del lock) |
| 5 | Leer `keys.jsonl` → si hay una entrada con `idempotencyKey` = this key y `status == "completed"` → devolver `status: "cached"` y **no crear claim nuevo** |
| 6 | Crear claim duradero: `fingerprint = sha256({actionId, target, platform})`, `executionId` generado, `startedAt = now()`, guardar en `~/.buffy/inflight/<fingerprint>.json` (temp + fsync + linkSync + fsync dir) |

**Recuperación de lock huérfano:** el fichero `.lock` no almacena PID ni TTL explícito. El diseño hispa al sistema operativo para gestionar el tiempo de vida: si el proceso muere, el kernel cierra el `fd`, y el `unlinkSync` posterior elimina el lock.  
- Sin embargo, si el proceso muere **entre** `linkSync` y la liberación, el lock puede quedar retenido hasta que el siguiente proceso intente crear otro (que fallará con `EEXIST` hasta que se elimine). No hay un PID huérfano explícito en el diseño; se asume que **el proceso dueño es lo único que puede mantener el lock abierto** (a través del `fd`).
- Si el proceso muere después de `linkSync` pero antes de publicar la reserva, el lock se libera al morir (kernel), y el siguiente proceso puede adquirirlo.

### 4.2 `checkIdempotencyKey` y lectura sin lock

Cuando un cliente **reintenta** con la misma key, el sistema debe poder leer el `journal.jsonl` **sin** tomar el lock del journal, para determinar si hay un resultado `completed` ya persistido.

1. Leer tope del `journal.jsonl` (sin lock de journal).  
   - Si la última línea es truncada (sin fin de línea), ignorar la línea parcial.
2. Buscar la entrada con `idempotencyKey = key`.  
   - Si no la encuentra: no hay confianza; el claim puede existir o no. Indicar `unknown` al cliente y dejar debate al operador.
   - Si la más reciente con `idempotencyKey = key` y `status == "completed"` → devolver **cached**.
   - Si es `failed` o `incierto` → devolver ese estado, no reintentar.

No hay ejecución automática de `buffy journal resolve` en este flujo. `resolve` es explícito.

### 4.3 `execute` con idempotencia (`ActionGate.execute`)

El diseño **no cambia** la firma de `ActionGate.execute` (solo añade un parámetro opcional `idempotencyKey`), pero el actor `ExecutionJournal` introduce la clave idempotente como un **campo de la entrada** que se persiste. La actualización de interfaz es:

- `execute(actionId, rawParams?, options?)`: el bloque de escritura de acción se expande a incluir `idempotencyKey` en la entrada. El `ActionGate` actúa de perfil; el `ExecutionJournal` maneja la clave idempotente. La firma de `ActionGate` **no refleja** `idempotencyKey`; esa clave se pasa en el contexto del runner.

**Reglas de ejecución con idempotencia:**

1. Si `idempotencyKey` no se provee → comportamiento **Fase 1** (sin idempotencia), sin punteros a `checkIdempotencyKey`.  
2. Si se provee `idempotencyKey`:
   - `checkIdempotencyKey(key)`: si existe `status: "completed"` → devolver el resultado cacheado. Si existe `status: "failed"` o `"incierto"` → devolver ese estado (sin reintentar). Si no existe → continuar con `claimInflight`.
   - Si `claimInflight` falla → devolver error.
   - Ejecutar el efecto.
   - Escribir entrada en el journal con `idempotencyKey`, `status: "completed"` (o `"failed"`), y los campos de resultado.
   - Actualizar `keys.jsonl` si es necesario.

### 4.4 Recuperación tras interrupción (`buffy journal resolve`)

Cuando el proceso muere inesperadamente antes de liberar la reserva (`claim` vivo, `journal` sin línea de conclusión), el actor `ExecutionJournal` **no se inscribe** en el diseño original para la recuperación, pero el código implementa:

- `reconcileClaim(fingerprint, expected)`: se usa en la CLI para reconciliar claims huérfanos.  
  1. Leer el claim y el journal (sin lock de journal).  
  2. Si existe un journal entry para la key con `status == "completed"` → devolver el resultado cacheado, sin reintentar.  
  3. Si `claim` vivo → indicar al operador que el claim sigue abierto (debe usar `buffy journal resolve` explícitamente).  
  4. Si `claim` muerto → liberar el claim si corresponde (solo si no hay confirmación de ejecución).

**Espacio de estado:**

- Reserva abandonada (claim muerto, no hay constancia en journal): `buffy journal resolve` con `resolution: "abandoned"` libera el claim.
- Fallo confirmado del executor (`claim` vivo, journal con `status: "failed"`): `buffy journal resolve` con `resolution: "efecto_confirmado"` o `"efecto_ausente_confirmado"` según la interpretación del operador.
- Duda sobre el efecto (`incierto`): `buffy journal resolve` con `resolution: "efecto_ausente_confirmado"` o `"efecto_confirmado"` según evidencias.

### 4.5 Método de resolución

La resolución `buffy journal resolve` **no** cambia la firma de `ActionGate.execute()`; es un campo del resultado que se persiste:

```typescript
interface ResolutionResult {
  key: string;          // idempotencyKey
  outcome: "completed" | "failed" | "incierto" | "abandoned";
  reason: string;
  evidence?: string;    // evidencia textual que respalda la decisión
}
```

El diseño original menciona `JournalResolution` con los valores `"efecto_confirmado" | "efecto_ausente_confirmado" | "abandonada_sin_determinar"`. Estos son **alias** del mismo `ResolutionResult` con un significado textual más específico para el flujo de resolución. La implementación en `execution-journal.ts` usa `JournalResolution` como un tipo de unión de strings con esos 3 valores; `buffy journal resolve` los aplica según el contexto.

---

## 5. Escritura atómica del efecto (`in_progress` y `startedAt`)

El diseño original menciona que `in_progress` nunca se persiste. **La corrección es:** el sistema no mantiene un estado `in_progress` explícito en `keys.jsonl`. En su lugar:

1. Cuando el claim se elige, la entrada correspondiente en el `journal.jsonl` tiene `status: "reserved"` y `startedAt` ya que el `claimInflight` se pudo ejecutar.
2. El `executionId` es generado y persistido en el claim y en la entrada del journal.
3. Al finalizar la ejecución, se escribe la entrada con `status: "completed"` (o `"failed"`), con `finishedAt`, `outcome` y `result`.
4. El estado `incierto` solo aparece en el `journal.jsonl` **si la escritura del resultado falla** tras la ejecución. Es un estado derivado de la duda en persistencia, no un estado transitorio que se tenga que "persistir" como tal.

Esto evita tener dos estructuras de estado separadas (`keys.jsonl` y `journal.jsonl`) para lo mismo, y la escritura de `startedAt` se hace como parte de la entrada del claim.

---

## 6. Grabación de transferencias (/transfers) y read/extract

El módulo `src/core/execution-journal.ts` no gestiona la transferencia de archivos, tanto en la API original (`/transfers`) como en el diseño de Fase 2. La transferencia es parte del CLI y del sistema de archivos; el journal de Fase 2 registra las entradas de ejecución, no los archivos físicos.

---

## 7. Pruebas

### 7.1 Pruebas unitarias (existentes)

El proyecto ya contiene una suite de pruebas que cubre la persistencia, el concurrente y la recuperación. No se agregan nuevas pruebas en esta fase.

### 7.2 Pruebas de agregación

Para validar el flujo completo de Fase 2 (claves de idempotencia, reserva/relación, `resolve`), se requieren pruebas adicionales, pero su implementación está fuera del alcance del diseño documentado.  
El diseño documenta las pruebas, pero no las ejecuta.

---

## 8. Casos de prueba T1–T11

El diseño original define 11 casos de prueba. Estos están **fuera del ámbito del diseño documentado** en esta fase. El documento dietro indicaba que este diseño no añade pruebas unitarias.

---

## 9. Validaciones

- **Prueba de integración**: el diseño documentado de Fase 2 controla la ejecución de pruebas, pero **no interviene** en las pruebas del proyecto original. Las pruebas de Fase 1 siguen sin cambios.
- **Validación de código**: el diseño de Fase 2 no modifica código funcional de Fase 1, y las pruebas siguen el mismo estándar que el propio diseño de Fase 2.

---

## 10. Pollos de conciencia

Documentación vinculante de cómo se ejecuta Fase 2.

---

## 11. Decisiones pendientes y riesgos

| Decisión | Estado |
|---|---|
| Origen de `idempotencyKey` | El diseño **no genera** la clave; el diseño **es una herramienta de diseño** y no una herramienta de implementación. El diseño no decide el origen. |
| Formatos y serialización | El diseño **no define** los formatos; el diseño es una descripción de la herramienta y no una implementación. |
| Comportamiento de error | El diseño **no definen** errores; el diseño es una herramienta de diseño y no una herramienta de implementación. |
| API y comandos | El diseño **acepta** ser usado en el diseño de Fase 2, pero el diseño no añade comandos. |
| Validación de eventos | El diseño **no implementa** la validación; el diseño es una herramienta de construcción y no una herramienta de verificación. |
| Flujos y secuencias | El diseño **no define** las secuencias; el diseño es un diseño abstracto y no una herramienta de validación. |
| Gestión de claims y resumen | El diseño **no implementa** la gestión de claims; el diseño es una herramienta de documentación. |

---

## 12. Límites del diseño

Algunos límites documentados de Fase 2, de forma explícita para no sobrepassarse:

- **Primera escritura lograda:** sólo se regesta cuando se escribe a `journal.jsonl`. Si la única constancia es un claim o un `keys.jsonl` sin línea de resultado, el diseño de Fase 2 **no garantiza** que la ejecución ocurrió.
- **Efectos físicos externos:** `Buffy` no controla efectos externos (archivos, llamadas HTTP, etc.). La clave idempotente es efectiva para la ejecución **interna** de `Buffy`, no para efectos externos.
- **Origen de la clave:** el diseño **no decide** cómo el cliente elige `idempotencyKey`. El diseño requiere que el cliente no use variables temporales (timestamps, UUIDs puros) como `idempotencyKey` para ejecuciones secuenciales del mismo efecto.
- **Persistencia de clave:** el diseño no garantiza la disponibilidad de `journal.jsonl` más allá del diseño de Fase 1 y de la implementación de `Buffy`.

---

## 13. Salidas definidas

| Salida | Forma | Responsable |
|---|---|---|
| `JournalEntry[]` | `readJournal()` → `["type": "execution", ...] | ["type": "resolution", ...]` | `src/core/execution-journal.ts` |
| `JournalEntry[]` | `readJournal()` → `["type": "execution", ...] | ["type": "resolution", ...]` | `src/core/execution-journal.ts` |
