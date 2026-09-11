# CURRENT-STATE — Buffy Next

**Fecha:** 2026-09-10  
**Rama:** master  
**HEAD:** `e4a9354cc00aff1139580ba667231991d940518e`  
**Versión (package.json):** 0.2.2  
**Tags presentes:** `v0.2.0-rc`, `v0.2.1`, `v0.2.2`  
**Descripción Git:** `v0.2.2-8-ge4a9354`

---

## Document status / Precedence

`CURRENT-STATE.md` is the canonical operational state for the repository.

`CONTINUE.md`, `docs/PROJECT-STATUS.md`, and `docs/ARCHITECTURE-FROZEN.md` are retained historical/architectural documents. They are not authoritative for current operational state when they conflict with this file.

Their eventual migration to an explicitly superseded/deprecated status is a separate operator-approved action.

---

## 1. Identity

| Campo                  | Valor                                      |
|------------------------|--------------------------------------------|
| Fecha de este estado   | 2026-09-10                                 |
| Rama                   | master                                     |
| HEAD exacto            | e4a9354cc00aff1139580ba667231991d940518e  |
| Versión package.json   | 0.2.2                                      |
| Tags                   | v0.2.0-rc, v0.2.1, v0.2.2                 |
| Commits desde v0.2.2   | 8 (último: ExecutionEvidence wiring)       |

---

## 2. What Buffy Next is now

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

## 3. Effective capability

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

## 4. Known debt

| Elemento | Clasificación | Notas |
|----------|---------------|-------|
| Dual action registry (`src/actions/registry.ts` vs `src/core/action-registry.ts`) | no bloqueante | El primero alimenta el Gate/pipeline; el segundo alimenta el mapper de sugerencias. |
| Duplicación del bloque de emisión de evidence entre `pipeline.ts` y `pipeline.test-harness.ts` | no bloqueante | Comentario SYNC explícito en ambos archivos. |
| Documentación de estado (`CONTINUE.md`, `PROJECT-STATUS.md`, `ARCHITECTURE-FROZEN.md`) parcialmente desactualizada | no bloqueante | Contienen información histórica útil; no son fuente canónica del estado operativo actual. |

Ninguna de estas deudas se convierte automáticamente en tarea.

---

## 5. Explicit non-goals (alcance actual)

Fuera del alcance operativo actual (decisión vigente, no prohibición permanente):

- Capability Layer abstracta
- Introducción de nuevos patrones formales (Observer, Decorator, Chain of Responsibility, Strategy formal, Singleton)
- Sistema de checkpoint / handoff / lease dentro de Buffy
- Integración de MCP, Contract o Skill como parte del core de Buffy Next
- Activación de `VERIFIED` (marcar acciones como `verifiable: true` o diseñar experimentos) mientras no exista una necesidad operativa concreta

---

## 6. Current open decision

Ninguna.

La pregunta «¿Es VERIFIED realmente necesario en este momento?» quedó **cerrada el 2026-09-10** con la conclusión:

> VERIFIED no resuelve ningún problema operativo concreto que `OBSERVED_EXECUTED` no resuelva ya. Se mantiene como infraestructura futura inactiva.

Se reabrirá solo si aparece simultáneamente:
1. una acción con postcondición observable independientemente, y
2. un consumidor que necesite el claim más fuerte.

---

## 7. Operational baseline

- HEAD con ExecutionEvidence wiring (`e4a9354`) constituye el baseline actual.
- Cualquier cambio arquitectónico o de capacidad debe partir de este documento y de la evidencia del código en este HEAD.
- La complejidad debe seguir siendo proporcional a la tarea real.
