# Buffy Next v0.1 — Auditoría: Spec v2.1 vs Código

> Generada: 2026-08-19 · Tipocheck: CLEAN · Tests: 16/16 · Líneas totales: 2,267

---

## Resumen ejecutivo

| Estado | Cantidad |
|---|---|
| ✅ Cumple spec | 7 secciones |
| ⚠️ Parcial | 4 secciones |
| ❌ No implementado | 2 secciones |

**Dead code detectado:** 4 archivos nunca importados (`exec.ts`, `format.ts`, `actions/types.ts`, `utils/exec.ts`)

---

## §1 Decisiones de diseño — ✅ Cumple

Las 7 decisiones están respetadas:
- Separación Context/Next ✓
- Motor de operaciones (no agente IA) ✓
- Core portable + adapters ✓
- JSON como contrato ✓
- Sin LLM en camino crítico ✓
- Windows + Android primera etapa ✓

## §2 Arquitectura — ✅ Cumple

El pipeline `CLI → Check Selector → Adapter → Diagnosis → Action Registry → Security → Executor → Verify → Presenter` existe en el código. `state.json` está fuera del camino crítico.

## §3 Modelo de seguridad — ⚠️ Parcial

| Regla | Estado |
|---|---|
| AUTO_SAFE = no destructivo | ✅ |
| CONFIRM requiere prompt | ✅ en cli.ts |
| FORBIDDEN se rechaza | ✅ |
| `buffy act` reval TODO | ⚠️ Revalida forbidden + auth, pero NO valida prerequisites |
| `validateAction` | ⚠️ Solo valida plataforma + forbidden, NO prerequisites |

**GAP:** `executor.ts` nunca verifica `action.prerequisites` contra las capacidades del adapter. `security.ts` solo los muestra en `buildAuthPrompt` (cosmético).

## §4 Tipos TypeScript — ✅ Cumple

Todos los tipos de la spec están definidos en `types.ts`. Los aliases backward-compatible (`ActionLevel`, `DiagnosticItem`, `OSInfo`, etc.) existen. `PlatformAdapter` tiene exactamente 4 métodos.

## §5 Módulos — ⚠️ Parcial

| Módulo | Archivo | Estado |
|---|---|---|
| CLI | `cli.ts` (219 líneas) | ✅ |
| Check Selector | `check-selector.ts` (42 líneas) | ✅ |
| Adapter Windows | `windows.ts` (207 líneas) | ✅ |
| Adapter Android | `android.ts` (175 líneas) | ✅ |
| Doctor | `doctor.ts` (110 líneas) | ✅ |
| Diagnose | `diagnose.ts` (115 líneas) | ✅ |
| Executor | `executor.ts` (67 líneas) | ⚠️ Sin prerequisite check |
| Security | `security.ts` (64 líneas) | ✅ |
| Action Registry | `registry.ts` (47 líneas) | ✅ |
| State | `store.ts` (45 líneas) | ⚠️ No llamado después de act |
| Presenter | `presenter.ts` (229 líneas) | ✅ |
| Capabilities | `capabilities.ts` | ❌ Eliminado (correcto) |

**Dead code:**
- `utils/exec.ts` (44 líneas) — nunca importado
- `utils/format.ts` (46 líneas) — nunca importado
- `actions/types.ts` (4 líneas) — nunca importado

## §6 Flujo `buffy act` — ⚠️ Parcial

| Paso del spec | Estado |
|---|---|
| Resolver action-id | ✅ `findActionById` |
| Validar plataforma | ✅ `validateAction` |
| **Validar prerequisites** | ❌ **No implementado** |
| Validar nivel seguridad | ✅ |
| dryRun → mostrar plan | ⚠️ cli.ts llama dryRun pero no en act |
| requiresAuth → promptUser | ✅ |
| execute(action) | ✅ |
| verify resultado | ✅ (executor llama `action.verify()`) |
| **Registrar en state.json** | ❌ **No se llama `updateState` en cmdAct** |
| render resultado | ✅ |

## §7 Flujo `buffy diagnose` — ✅ Cumple

`adapter.systemInfo()` → `selectChecks(query)` → `analyzeForQuery` → `findActionsForIssue` → propuestas. El match léxico simple con `CHECK_PATTERNS` funciona correctamente.

## §8 Setup — ⚠️ Parcial

| Paso del spec | Estado |
|---|---|
| detectar plataforma | ✅ `adapter.detect()` |
| verificar que Buffy funciona | ✅ |
| crear ~/.buffy/ | ✅ `ensureBuffyDir()` |
| crear state.json inicial | ✅ `loadState()` |
| **mostrar capacidades** | ❌ **No lista acciones/checks disponibles** |

## §9 MVP — Acciones — ⚠️ Parcial

| Action ID | Estado |
|---|---|
| `check-gpu-driver` | ✅ Implementada y testeada |
| `install-tool` | ❌ **No implementada** |
| `list-processes` | ❌ **No implementada** |

Existe `check-driver-status` y `check-system-temp` que no están en el spec §9.3 pero son útiles.

## §10 Estructura de archivos — ⚠️ Parcial

La spec define:
```
src/actions/gpu-driver.ts         → existe como catalog/check-gpu-driver.ts ✓
src/actions/install-tool.ts       → ❌ no existe
src/actions/list-processes.ts     → ❌ no existe
```

El directorio `catalog/` es una mejora orgánica (agrupa acciones) que la spec no preveía.

## §11 Tamaño estimado — ✅ Cumple

Spec estimaba ~1,180 líneas. Implementación actual: **2,267** (más del doble, pero incluye tests, adapters reales y acciones no-MVP). El ratio core/action es razonable.

## §12 Reglas no negociables — ⚠️

| Regla | Estado |
|---|---|
| Core NO conoce plataforma | ✅ |
| `buffy act` SIEMPRE revalida | ⚠️ Valida forbidden + auth, NO prerequisites |
| Rollback solo cuando se pueda garantizar | ⚠️ `change-power-plan` usa variable global `previousPlan` |
| AUTO_SAFE no es "solo lectura" | ✅ |
| Setup NO instala nada | ✅ |
| Sin LLM en camino crítico | ✅ |
| buffy-context intacto | ✅ |

**Problema de rollback** (señalado por ChatGPT): `previousPlan` en `change-power-plan.ts:8` es una variable del módulo. Si el proceso termina, se pierde. Debería viajar en `ActionResult.details` y persistirse en `state.json`.

## §13 Definición de Done — Checklist

| Item | Estado |
|---|---|
| `buffy doctor` ejecuta en Windows y Termux | ⚠️ Code existe, no probado en vivo |
| `buffy diagnose "mi GPU usa driver genérico"` | ⚠️ Code existe, no probado en vivo |
| `buffy act check-gpu-driver` ejecuta | ⚠️ Code existe, no probado en vivo |
| `buffy act install-tool node` instala | ❌ Acción no implementada |
| `buffy --json doctor` produce JSON | ⚠️ Code existe, no probado en vivo |
| `buffy setup` crea ~/.buffy/ y state.json | ⚠️ Code existe, no probado en vivo |
| Tests pasan | ✅ 16/16 |
| `npm run typecheck` sin errores | ✅ CLEAN |
| `npm run build` produce dist/cli.js | ⚠️ No verificado (esbuild postinstall falló) |

---

## Acciones correctivas priorizadas

### P0 — Antes de crecer

1. **Prerequisite enforcement** en `executor.ts` — validar `action.prerequisites` contra `adapter.capabilities()` antes de ejecutar
2. **Rollback state** — sacar `previousPlan` de variable global, persistir en `ActionResult.details` + `state.json`
3. **`updateState` después de `act`** — registrar en state.json cuando se ejecuta una acción

### P1 — Para MVP funcional

4. **Acción `list-processes`** (AUTO_SAFE, lista procesos por CPU/RAM)
5. **Acción `install-tool`** (CONFIRM, instala vía winget/pkg)
6. **Setup reporta capacidades** — listar checks y acciones disponibles
7. **Limpiar dead code** — eliminar `exec.ts`, `format.ts`, `actions/types.ts`

### P2 — Para madurez

8. **Tests faltantes** — `checks.test.ts`, `executor.test.ts`, `diagnose.test.ts`
9. **Verificar `npm run build`** en entorno con esbuild funcional
10. **Probar en vivo** — `buffy doctor` en Termux real
