# E4.2 — Freshness Gating

## Estado del documento

- **Experimento:** E4.2
- **Tipo:** Implementación
- **Predecesor:** E4.1 (Temporal Contract), E4 (stale context)
- **Estado:** Implementando

---

## T1 — Auditoría del flujo actual

### Flujo existente (antes de E4.2)

```
query
  ↓
selectChecks(query)           → CheckName[]
  ↓
scoreContext(query, checks)   → CheckSelection { checks, confidence }
  ↓
adapter.systemInfo()          → SystemInfo (sin timestamps)
  ↓
analyzeForQuery(system, checks) → CheckResult[] (con observedAt, source desde E4.1)
  ↓
mapActions(observations)      → RecommendedAction[]
  ↓
DiagnosticResponse            → { observations, actions, ... }
```

### Dónde vive la decisión de qué entra al contexto

**Archivo:** `src/core/diagnose.ts`
**Función:** `diagnose(adapter, query)`
**Líneas:** 40-70

**Input:** `query: string`, `adapter: PlatformAdapter`
**Output:** `DiagnosticResponse`

El selector (`selectChecks` + `scoreContext`) determina qué **categorías** se verifican.
`analyzeForQuery` produce `CheckResult[]` con `observedAt` y `source` (desde E4.1).

**Gap identificado:** No hay verificación de freshness después de `analyzeForQuery`.
Los `CheckResult[]` pasan directamente a `mapActions` sin validar si son stale.

### Flujo de contexto (compact)

**Archivo:** `src/core/context.ts`
**Función:** `buildContext(report)`
**Líneas:** 15-60

**Input:** `DoctorReport`
**Output:** `BuffyContext`

El contexto compact transforma `SystemInfo` en `BuffyContext.hardware`.
Actualmente `hardware.ram_gb` es `number | null` — sin metadata temporal.

**Decisión E4.1:** `ram_gb` pasará a ser `HardwareField | null` con `observedAt`, `ageMs`, `freshness`, `source`.

---

## T2 — Freshness Gating

### Diseño

El gating se integra en `diagnose.ts` después de `analyzeForQuery`:

```
analyzeForQuery(system, checks) → CheckResult[]
  ↓
applyFreshnessGating(observations) → GatedResult
  ↓
  ├── fresh observations → incluir
  ├── stale + relevante → solicitar refresh
  ├── stale + irrelevante → omitir
  └── unknown → omitir
  ↓
refreshStaleFields(staleFields, adapter) → CheckResult[]
  ↓
mergeResults(fresh, refreshed) → CheckResult[]
  ↓
mapActions(merged)
```

### Reglas

1. **OBSERVED + relevante** → incluir tal cual
2. **STALE + irrelevante** → omitir del contexto
3. **STALE + relevante** → solicitar refresh on-demand
4. **UNKNOWN** → omitir (no inventar)
5. **INFERRED** → conservar solo si el selector ya soporta inferencias

---

## T3 — ContextSelectionResult

```typescript
interface GatedResult {
  /** Observaciones frescas que entran al contexto */
  included: CheckResult[];
  /** Campos stale que fueron refrescados */
  refreshed: CheckResult[];
  /** Campos stale que se omitieron (irrelevantes) */
  omittedStale: string[];
  /** Campos que necesitan refresh pero no se pudieron refrescar */
  needsRefresh: string[];
  /** Instrumentación por campo */
  instrumentation: FreshnessInstrumentation[];
}

interface FreshnessInstrumentation {
  field: string;
  epistemicStateBefore: string;
  refreshRequired: boolean;
  refreshPerformed: boolean;
  epistemicStateAfter: string;
  ageMsAfter: number;
  includedInContext: boolean;
}
```

---

## T4 — On-demand refresh

Cuando `STALE + relevante`:

1. Identificar qué adapter method produce ese campo
2. Llamar al adapter para obtener nuevo dato
3. Recalcular freshness con el nuevo `observedAt`
4. Si ahora es OBSERVED → incluir
5. Si sigue STALE → marcar `needs_refresh` en el contexto

### Refresh mapping

| Campo | Adapter method |
|-------|---------------|
| cpu | systemInfo().cpu |
| ram | systemInfo().memory |
| gpu | systemInfo().gpu |
| temperature | systemInfo().temperature |
| processes | systemInfo().processes |
| storage | systemInfo().storage |
| network | systemInfo() (no real-time test) |

**Decisión:** El refresh se hace llamando `adapter.systemInfo()` nuevamente.
Es simple y garantiza consistencia (todos los campos se actualizan juntos).

---

## T5 — Protección del contrato epistemológico

El contexto que recibe el modelo incluirá:

```json
{
  "ram_gb": {
    "value": 7.9,
    "unit": "GB",
    "observedAt": "2026-08-28T12:00:00.000Z",
    "ageMs": 1234,
    "freshness": "observed",
    "source": "LinuxAdapter.systemInfo.memory"
  }
}
```

Para campos stale que no se pudieron refrescar:

```json
{
  "ram_gb": {
    "value": 4.2,
    "unit": "GB",
    "observedAt": "2026-08-28T11:58:00.000Z",
    "ageMs": 183420,
    "freshness": "stale",
    "source": "LinuxAdapter.systemInfo.memory"
  }
}
```

El modelo recibe `freshness: "stale"` explícitamente. No necesita interpretar timestamps.

---

## T6 — Tests

### Fresh

```typescript
it('should include fresh observations', async () => {
  // relevante + OBSERVED → incluido
});
```

### Stale irrelevante

```typescript
it('should omit stale irrelevant fields', async () => {
  // irrelevante + STALE → omitido
});
```

### Stale relevante

```typescript
it('should refresh stale relevant fields', async () => {
  // relevante + STALE → refresh → nuevo dato → incluido
});
```

### Unknown

```typescript
it('should not fabricate unknown values', async () => {
  // UNKNOWN → no inventar / no tratar como observed
});
```

### Sin regresión

```typescript
it('should not regress fresh context behavior', async () => {
  // Task-adaptive + Compact sigue funcionando con campos frescos
});
```

---

## T7 — Mini validation

### Setup

```
5 fresh cases (all observations < 30s old)
5 stale cases (observations > 60s old)
3 runs each
```

### Métricas

- `refreshSuccessRate` ≥ 0.90
- `staleRelevantSentAsFresh` = 0
- `freshContextBehavior` ≈ baseline E2

---

## T8 — Instrumentación

Cada ejecución de `diagnose` registra:

```json
{
  "field": "ram",
  "epistemicStateBefore": "STALE",
  "refreshRequired": true,
  "refreshPerformed": true,
  "epistemicStateAfter": "OBSERVED",
  "ageMsAfter": 1234,
  "includedInContext": true
}
```

---

## Criterio de éxito

### PASS

- 0 casos: STALE relevante → enviado al modelo como actual
- refreshSuccess ≥ 0.90
- fresh-context behavior ≈ baseline E2
- No unsupported claims derivados de datos stale

### FAIL

- STALE relevante → entra al Compact sin refresh
- Refresh solicitado pero no ejecutado
- Fresh cases sufren regresión importante
