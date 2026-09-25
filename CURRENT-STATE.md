# CURRENT-STATE — Buffy Next

**Fecha:** 2026-09-11
**Rama:** master
**HEAD:** `d542a6d`
**HEAD remoto:** `d542a6d` (confirmado)
**Versión (package.json):** 0.2.2
**Tags presentes:** `v0.2.0-rc`, `v0.2.1`, `v0.2.2`
**Descripción Git:** `v0.2.2-9-gd542a6d`
**Commits locales por delante de origin:** 0

---

## Document status / Precedence

`CURRENT-STATE.md` is the canonical operational state for the repository.

`CONTINUE.md`, `docs/PROJECT-STATUS.md`, and `docs/ARCHITECTURE-FROZEN.md` are retained historical/architectural documents. They are not authoritative for current operational state when they conflict with this file.

Their eventual migration to an explicitly superseded/deprecated status is a separate operator-approved action.

---

## 0. Shizuku priv-checkpoint — B→C VERIFICADO

**Checkpoint:** 2026-09-11
**Estado:** B→C **VERIFICADO**
**Commit del patch:** `a2a02a0`

### Objetivo del checkpoint

Demostrar que `buffy doctor --json` distingue correctamente tres estados de Shizuku:
1. **no instalado** — `priv.shizuku === false`, `capabilities` no incluye `Shizuku (rish)` con `status === 'installed'`
2. **instalado pero no activo** — `priv.shizuku === false`, `capabilities` incluye `Shizuku (rish)` con `status === 'installed'`
3. **disponible** — `priv.shizuku === true`, `severity: "ok"`, `message: "Shizuku: disponible"`

### Implementación

#### `src/core/doctor.ts` (commit `a2a02a0`)
- Líneas 118-150: Lógica de tres estados para `priv-shizuku`
- `shizukuCap = capabilities.find(c => c.name === 'Shizuku (rish)')` calculada UNA sola vez antes del loop de privilegios
- `isShizukuInstalled = shizukuCap?.status === 'installed'`
- Rama `priv.shizuku === true` → `severity: "ok"`, `message: "Shizuku: disponible"`
- Rama `isShizukuInstalled === true` → `severity: "warning"`, `message: "Shizuku: instalado pero no activo"` con `explanation`
- Rama default → `severity: "warning"`, `message: "Shizuku: no instalado"`

#### `src/adapters/android.ts` (commit `d542a6d`)
- Línea 54: `shizuku = rishTest.includes('uid=') || rishTest.includes('gid=')`
- **Causa raíz del bug:** `execSync` con `RISH_APPLICATION_ID=com.termux` devuelve `gid=2000(shell)` pero no `uid=` cuando `rish` se invoca desde el código compilado
- El fallback `gid=` permite detectar correctamente la presencia de Shizuku
- **B→C VERIFICADO:** `buffy doctor --json` mostraba `priv-shizuku: {severity: "ok", message: "Shizuku: disponible"}` con `privileges.shizuku: true` al momento del checkpoint
- `rish -c "id"` con `RISH_APPLICATION_ID=com.termux` → `uid=2000(shell) gid=2000(shell)` → `includes('uid=') || includes('gid=')` → `true` ✅ (en el momento del checkpoint)

### Verificación dinámica (en momento del checkpoint)

- `buffy doctor --json` → `priv-shizuku: {severity: "ok", message: "Shizuku: disponible"}` ✅
- `rish -c "id"` con `RISH_APPLICATION_ID=com.termux` → `uid=2000(shell) gid=2000(shell)` ✅
- `detectPrivileges()` devolvía `shizuku: true` ✅

### Estado de persistencia / resiliencia (SIN VERIFICAR)

| Elemento | Estado | Nota |
|----------|--------|------|
| `bin/shizuku-watchdog.sh` | Existe | Usa `adb -s 127.0.0.1:5555` |
| `adb -s 127.0.0.1:5555 devices` | **NO CONECTADO** | Wireless Debugging no habilitado |
| `start.sh` en `/sdcard/Android/data/moe.shizuku.privileged.api/start.sh` | **NO EXISTE** | Método 3 de skill no disponible |
| `cmd -l | grep -i shizuku` | **SIN SERVICIO** | `shizuku_server` no es servicio `cmd` |
| Persistencia post-reboot | **SIN VERIFICAR** | No se ha probado tras reinicio |
| Watchdog ejecutado | **NO** | No se ha ejecutado |

### Tests

**Suite: 606/607** (1 fallo preexistente, no relacionado con Shizuku)
- Fallo único: `tests/buffy-tool.test.ts > Buffy Tool — JSON determinism > should produce identical JSON for same input`
- Causa: `latencyMs: 0` vs `latencyMs: 1` — diferencia de timing no determinista
- **Preexistente y no relacionado con Shizuku**
- No se modifica el test para hacerlo pasar

---

## 1. PRE-WATCHDOG ADB 5555 VERIFICATION — experimento ejecutado

**Checkpoint:** 2026-09-11
**Estado:** EXPERIMENTO EJECUTADO — STOP aplicado por protocolo
**Commit:** `d542a6d`
**Estado experimental previo:** C confirmado (Shizuku disponible en checkpoint B→C)

### Objetivo

Determinar si el transporte ADB `127.0.0.1:5555` está actualmente disponible y permite operar sobre el dispositivo. Sin modificar nada.

### Comprobaciones ejecutadas (en orden)

1. `adb devices` → Lista de dispositivos vacía
2. `adb -s 127.0.0.1:5555 devices` → Lista de dispositivos vacía
3. `adb -s 127.0.0.1:5555 shell id` → `adb: device '127.0.0.1:5555' not found`
4. `adb -s 127.0.0.1:5555 shell pidof shizuku_server` → `adb: device '127.0.0.1:5555' not found`
5. `RISH_APPLICATION_ID=com.termux MANAGER_APPLICATION_ID=moe.shizuku.privileged.api ~/bin/rish -c "id"` → `Server is not running` (exit 1)
6. `buffy doctor --json` → `priv-shizuku: {severity: "warning", message: "Shizuku: instalado pero no activo", explanation: "El binario rish existe pero el servicio Shizuku no responde..."}`

### Evidencia nueva

- En el checkpoint B→C, Shizuku estaba **disponible** (`priv.shizuku: true`, `severity: "ok"`)
- Al ejecutar la fase PRE-WATCHDOG, Shizuku **ya no está disponible** (`priv.shizuku: false`, `severity: "warning"`, `message: "instalado pero no activo"`)
- `rish` responde `Server is not running`
- El transporte ADB `127.0.0.1:5555` no está disponible

### Reglas de cierre aplicadas

**Regla 1 aplicada:** `127.0.0.1:5555` **NO está conectado** → STOP inmediato.
- No se intentó recuperación
- No se ejecutó watchdog
- No se hizo reboot
- No se cambió Wireless Debugging
- No se ejecutó `adb tcpip 5555`
- No se hicieron modificaciones de archivos/repositorio

### Hipótesis (SIN DEMOSTRAR)

Esto NO demuestra por qué cayó Shizuku.

SÍ demuestra que:
- El watchdog no puede operar sin el transporte `5555`
- `127.0.0.1:5555` no está disponible actualmente
- La pérdida de Shizuku es observable desde `rish` y `buffy doctor`
- La hipótesis de que el watchdog pueda proporcionar recuperación automática **queda sin probar**
- **No se debe afirmar** que "Wireless Debugging se cayó" — el experimento no comprobó directamente ese estado

### Estado experimental actual

| Campo | Valor |
|-------|-------|
| Estado C (checkpoint B→C) | Confirmado — Shizuku disponible |
| PRE-WATCHDOG ejecutado | ✅ Sí |
| ADB 5555 disponible | ❌ No |
| Shizuku actualmente | Caído |
| rish funcionando | ❌ `Server is not running` |
| Buffy doctor | `instalado pero no activo` |
| Watchdog ejecutado | ❌ No |
| Recuperación aplicada | ❌ Ninguna |
| Estado de Wireless Debugging | **NO VERIFICADO** — no comprobado directamente |

### Siguiente acción

**NINGUNA** — congelar este estado experimental antes de tocar el dispositivo. Decidir intervención manual mínima para recuperar `5555`/Wireless Debugging **después** de commit + push verificados.

---

## 2. Identity

| Campo                  | Valor                                      |
|------------------------|--------------------------------------------|
| Fecha de este estado   | 2026-09-11                                 |
| Rama                   | master                                     |
| HEAD exacto            | d542a6df8cbc8d6e02e82d4f203adb5344662f6c   |
| Versión package.json   | 0.2.2                                      |
| Tags                   | v0.2.0-rc, v0.2.1, v0.2.2                 |
| Commits desde v0.2.2   | 9 (último: fix Shizuku detectPrivileges)  |

---

## 3. What Buffy Next is now

Buffy Next es un motor de operaciones de sistema con las siguientes capacidades reales y presentes en el código:

- Diagnóstico task-adaptive (selección de checks según la query).
- Adapters multiplataforma (Windows, Linux, Android/Termux) detrás de la interfaz `PlatformAdapter`.
- Freshness / estado epistémico (`EpistemicState`: observed | inferred | stale | unknown) con políticas de TTL y gating on-demand.
- `ActionGate` como **única** API pública capaz de iniciar un efecto físico.
- Ejecución de acciones catalogadas (9 acciones con definición + executor privado).
- Emisión observacional de `ExecutionEvidence` después de que una acción cruza el gate.

Buffy Next **no es**:
- un agente autónomo;
- un orquestador de agentes;
- una Capability Layer abstracta;
- un sistema de memoria global;
- un framework que impone arquitectura al agente consumidor.

La integración con agentes externos ocurre vía CLI o vía adapter MCP externo (fuera de este repositorio). Los contratos documentales (`BUFFY-AGENT-CONTRACT*.md`) son mecanismos de discovery/comprehension externos.

---

## 4. Effective capability

### Acciones ejecutables catalogadas (canónicas)

Fuente: `src/actions/registry.ts` + `src/actions/catalog/*.ts`

1. `check-gpu-driver`
2. `check-driver-status`
3. `check-system-temp`
4. `list-processes`
5. `install-tool`
6. `change-power-plan`
7. `check-shizuku`
8. `check-network`
9. `check-disk-space`

Total: **9 acciones**.

### Freshness

- Tipo: `EpistemicState = 'observed' | 'inferred' | 'stale' | 'unknown'`
- Implementación: `src/core/freshness.ts` + `src/core/freshness-gating.ts`
- Campos temporales en observaciones: `observedAt`, `source`, `ageMs`, `epistemicState`
- Gating on-demand de campos STALE relevantes: presente

### ExecutionEvidence

- Archivo: `src/core/execution-evidence.ts`
- Niveles definidos:
  - `DELIVERED`
  - `OBSERVED_EXECUTED`
  - `VERIFIED`
  - `NOT_VERIFIED`
  - `UNKNOWN_UNOBSERVABLE`
  - `UNKNOWN_NO_EVIDENCE`
  - `UNKNOWN_CHANNEL_NOT_BUILT`
- Wiring: emisión post-retorno de `gate.execute` en `src/core/pipeline.ts`
- Superficie actual cableada: `self-action`
- Techo práctico actual: **`OBSERVED_EXECUTED`**
- Campo `verifiable?: boolean` existe en `ActionDefinition`
- Acciones que declaran `verifiable: true`: **0**

### Capacidad demostrable hoy

Buffy puede observar el sistema, diagnosticar, ejecutar las 9 acciones catalogadas a través de ActionGate y registrar evidencia de nivel `OBSERVED_EXECUTED` (o inferior) para sus propias acciones.

`VERIFIED` existe como infraestructura pero está **inactiva**: no hay acciones marcadas como verificables y no se ha identificado un problema operativo concreto que `OBSERVED_EXECUTED` no resuelva ya.

---

## 5. Known debt

| Elemento | Clasificación | Notas |
|----------|---------------|-------|
| Dual action registry (`src/actions/registry.ts` vs `src/core/action-registry.ts`) | no bloqueante | El primero alimenta el Gate/pipeline; el segundo alimenta el mapper de sugerencias. |
| Duplicación del bloque de emisión de evidence entre `pipeline.ts` y `pipeline.test-harness.ts` | no bloqueante | Comentario SYNC explícito en ambos archivos. |
| Documentación de estado (`CONTINUE.md`, `PROJECT-STATUS.md`, `ARCHITECTURE-FROZEN.md`) parcialmente desactualizada | no bloqueante | Contienen información histórica útil; no son fuente canónica del estado operativo actual. |

Ninguna de estas deudas se convierte automáticamente en tarea.

---

## 6. Explicit non-goals (alcance actual)

Fuera del alcance operativo actual (decisión vigente, no prohibición permanente):

- Capability Layer abstracta
- Introducción de nuevos patrones formales (Observer, Decorator, Chain of Responsibility, Strategy formal, Singleton)
- Sistema de checkpoint / handoff / lease dentro de Buffy
- Integración de MCP, Contract o Skill como parte del core de Buffy Next
- Activación de `VERIFIED` (marcar acciones como `verifiable: true` o diseñar experimentos) mientras no exista una necesidad operativa concreta

---

## 7. Current open decision

Ninguna.

La pregunta «¿Es VERIFIED realmente necesario en este momento?» quedó **cerrada el 2026-09-10** con la conclusión:

> VERIFIED no resuelve ningún problema operativo concreto que `OBSERVED_EXECUTED` no resuelva ya. Se mantiene como infraestructura futura inactiva.

Se reabrirá solo si aparece simultáneamente:
1. una acción con postcondición observable independientemente, y
2. un consumidor que necesite el claim más fuerte.

---

## 8. Operational baseline

- HEAD con `d542a6d` (fix Shizuku detectPrivileges `uid || gid`) constituye el baseline operativo actual.
- El checkpoint B→C (Sección 0) y el experimento PRE-WATCHDOG (Sección 1) forman parte del estado operativo documentado.
- Cualquier cambio arquitectónico o de capacidad debe partir de este documento y de la evidencia del código en este HEAD.
- La complejidad debe seguir siendo proporcional a la tarea real.

---

## 9. AGY routing selection round — CLOSED (2026-09-23)

**Conclusión:** selección de `buffy_context` estable hoy (9/9 PASS: workspaces poblados y vacíos), alcance limitado (solo selección, AGY 1.1.19, GPT-OSS 120B Medium, prompt de análisis de entorno), **sin RAG ni contrato de discovery nuevo** — los FAIL del 14 sep no se reprodujeron y no hay fallo observable que justifique capas nuevas.

- **Checkpoint:** `docs/research/AGY-BUFFY-ROUTING-C3R-RESULT-2026-09-23.md`
- **Evidencia:** `~/docs/experiments/2026-09-23-c3r-transcripts/` (30 archivos, sha256 30/30 OK)
- **Reabrir solo con:** un disparador real — otro modelo, o un fallo de selección en uso normal.
