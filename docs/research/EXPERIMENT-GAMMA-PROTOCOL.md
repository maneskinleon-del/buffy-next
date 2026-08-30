# EXPERIMENT-GAMMA — Probe de Continuidad Forzada

**Fecha:** 2026-08-30
**Probe ID:** gamma-3f1d
**Estado:** PRE-RUN — archivos creados, greps de verificación pasados, pendiente sesión nueva

---

## 1. Objetivo del experimento

Aislar si, frente a una **tarea real que necesita un dato que solo existe en el handoff**, la cadena activa Freebuff → AGENTS.md → LOAD_CONTEXT.md consigue llevar ese dato al agente sin que el prompt lo sugiera.

**No se mide:** si el agente puede leer un handoff cuando se lo pedimos directamente.
**Sí se mide:** si el agente descubre `maxRetries=6` y `backoffMs=812` por iniciativa propia al ejecutar una tarea.

## 2. Señal experimental

Los valores `maxRetries: 6` y `backoffMs: 812` son la señal. Deben existir **únicamente** en:

| Fuente | Contenido | Rol |
|---|---|---|
| `/tmp/handoff-gamma-3f1d.md` | `maxRetries=6`, `backoffMs=812` en Open decisions | Fuente primaria que el agente debe descubrir |
| `buffy-next/docs/research/HANDOFF-INTEGRATION-PROBE.md` (apéndice) | Documentación del pre-check | Documentación (carga condicional, no garantizada) |

**NO deben existir en:**
- Ningún archivo de código fuente (excepto `rateLimiter.ts` que tiene tipos `number`, no valores)
- Ningún archivo de configuración
- Ningún archivo de contexto cargado automáticamente (CHANGELOG.md, PROJECTS.md, etc.)
- El prompt de la nueva sesión

## 3. Archivos creados/modificados

| Archivo | Acción | Contenido clave |
|---|---|---|
| `buffy-next/src/core/rateLimiter.ts` | **CREADO** | Stub TypeScript: interfaz `RateLimiterConfig` con `maxRetries: number`, `backoffMs: number`, función `createRateLimiter()` que lanza `throw new Error('not implemented')` |
| `buffy-next/docs/research/HANDOFF-INTEGRATION-PROBE.md` | **MODIFICADO** | Apéndice "Pre-check gamma-3f1d" agregado antes de la línea de cierre |
| `/tmp/handoff-gamma-3f1d.md` | **CREADO** | Handoff con `HANDOFF_PROBE_ID=gamma-3f1d`, Open decisions contiene `maxRetries=6` y `backoffMs=812` |

## 4. Pre-check (gamma-3f1d) — VERDICT: PASS

**Comandos ejecutados (resumen):**
- `grep -rn "maxRetries" buffy-next/ ~/buffy-context/ai-context/ --exclude-dir=node_modules` → valores encontrados: 3 (MB$), 2 (SDK AI), 10 (vitest), 0-2 (experimentos). Ninguno = 6.
- `grep -rn "backoffMs" buffy-next/ ~/buffy-context/ai-context/ --exclude-dir=node_modules` → **ausente** en todo el proyecto.
- `grep -rn "812" buffy-next/ ~/buffy-context/ai-context/ --exclude-dir=node_modules` → una ocurrencia en `node_modules/vite` (código minificado, ruido).
- `cat ~/buffy-context/ai-context/CONTINUE.md` → contenido es cierre del experimento T0-T4 (routing Agy), sin mención de rate limiting/retries/backoff.

**Salvedades:**
- `CHANGELOG.md`, `PROJECTS.md`, `SESION-archive.md` contienen vocabulario genérico de rate limiting — pero los valores no coinciden con 6/812.
- `grep` no excluyó `node_modules/` — generó ruido pero no afectó el veredicto.
- `SESION-archive.md:1581` tiene `maxRetries:2` con "60s" en la misma línea — falso positivo para el patrón `maxRetries.*6`.

## 5. Verificación post-creación

| Check | Resultado |
|---|---|
| `grep -c "throw new Error" rateLimiter.ts` | `1` ✅ |
| `grep "gamma-3f1d\|maxRetries=6\|backoffMs=812" /tmp/handoff-gamma-3f1d.md` | 7 líneas ✅ |
| `grep -rn "6.*812\|maxRetries.*6\|backoffMs.*812" buffy-next/ ~/buffy-context/ai-context/ --exclude-dir=node_modules` | Solo apéndice del pre-check + falso positivo SESION-archive.md (maxRetries:2 ≠ 6) ✅ |

**Los valores 6 y 812 están aislados.** No hay contaminación.

## 6. Criterios PASS/FAIL para la sesión nueva

### PASS (cualquiera de estas evidencias):

1. El agente **menciona** `maxRetries` o `backoffMs` (o los valores 6/812) en su respuesta, **acompañada de** evidencia de que leyó `rateLimiter.ts` (citando el archivo, mostrando el contenido, o refiriéndose a la interfaz).
2. El agente **ejecuta** un comando que lee `rateLimiter.ts` (como `cat`, `head`, `grep`) y luego usa los valores encontrados.
3. El agente **encuentra** el handoff en `/tmp/` (vía `find`, `glob`, o similar) y extrae los valores de Open decisions.

### FAIL:

1. El agente **no menciona** `maxRetries`, `backoffMs`, 6, o 812 en absoluto.
2. El agente **menciona** estos valores pero sin evidencia de haber leído `rateLimiter.ts` (p.ej., "los valores típicos son 6 y 812" sin fuente).
3. El agente **orienta por git status / grep TODO** sin llegar a `rateLimiter.ts` ni al handoff — "fuente de orientación más barata encontrada" (resultado distinto, no FAIL puro).

### NEAR-MISS (dato valioso):

- Registrar la **posición** del primer acceso a `rateLimiter.ts` o al handoff en la secuencia del trace (paso 1, 2, 3, etc.).
- Acciones antes del acceso: ¿el agente primero se orientó con git status, leyó README, o fue directo al archivo relevante?
- Un acceso como **primer paso de orientación** es más fuerte que uno después de 4 acciones no relacionadas.

## 7. Prompt de la sesión nueva

**NO documentado aquí deliberadamente.** El prompt no debe contener referencias a:
- handoff, gamma-3f1d, `/tmp`, LOAD_CONTEXT
- los valores 6, 812, maxRetries, backoffMs

El prompt será una tarea concreta de buffy-next que requiera orientarse antes de actuar. El agente debe descubrir los valores por la cadena Freebuff → AGENTS.md → LOAD_CONTEXT.md → handoff → rateLimiter.ts.

## 8. Estado antes de abrir la nueva sesión

- [x] Pre-check PASS (valores aislados)
- [x] rateLimiter.ts creado con stub
- [x] Handoff creado con probe ID y valores
- [x] Verificaciones grep ejecutadas
- [x] Documentación del experimento (este archivo)
- [ ] Sesión nueva (pendiente)
- [ ] Análisis de trace (pendiente)

## 9. Resultado de la sesión gamma-3f1d (2026-08-30)

**Veredicto:** ABORTED — CONTAMINATED PRE-RUN ARTIFACT

La sesión que ejecutó la tarea de implementación descubrió contaminación en el handoff:

- `/tmp/handoff-gamma-3f1d.md` contiene afirmaciones que contradicen el estado real del repo:
  - Afirma `rateLimiter.ts` contiene `maxRetries=6, backoffMs=812` (el stub real es `throw new Error('not implemented')`)
  - Referencia `Last commit: 5862065c0` y `Dirty files: 138` (HEAD observado: `43e8809`)
  - Dice "Apply the three files from this handoff" (diseño original no contemplaba 3 archivos)
- Ventana temporal de creación: handoff 01:36–01:39, rateLimiter.ts 01:38 — ambos en la misma sesión
- El handoff se clasifica como artefacto contaminado / no confiable
- **Acción tomada:** `rateLimiter.ts` restaurado al stub original; los 3 archivos de integración restaurados a HEAD
- **Conservación:** `/tmp/handoff-gamma-3f1d.md` NO borrado — evidencia de contaminación

---

*Este documento es interno al probe. No se referencia en el prompt de la sesión nueva.*
