# Buffy Next — Operational Hardening

## Estado: ✅ COMPLETADO

**Fecha:** 2026-08-28
**Tests:** 569/569

---

## Regresión Gate

Todo cambio futuro debe mantener:

```
all tests pass
stale relevant → current = 0
UNKNOWN → not factual
refresh success >= 95%
```

Una regresión en cualquiera de estos puntos bloquea el cambio.

---

## Failure Preservation

Cuando ocurra un fallo real:

1. NO corregir automáticamente
2. Registrar:
   - reproduction
   - environment
   - platform
   - model
   - input
   - expected
   - actual
   - trace
3. Clasificar el problema
4. Solo después corregir

---

## Performance Baseline

### Mediciones

| Métrica | Descripción |
|---------|-------------|
| observationLatencyMs | Latencia de lectura del sistema |
| selectionLatencyMs | Latencia de selección de checks |
| freshnessLatencyMs | Latencia de clasificación de frescura |
| refreshLatencyMs | Latencia de refresh on-demand |
| contextLatencyMs | Latencia de construcción de contexto |
| modelLatencyMs | Latencia del modelo |
| totalLatencyMs | Latencia total |

### Uso

```typescript
import { recordPerformanceBaseline, getAveragePerformanceBaseline } from './telemetry.js';

// Registrar medición
recordPerformanceBaseline({
  observationLatencyMs: 50,
  selectionLatencyMs: 10,
  freshnessLatencyMs: 5,
  refreshLatencyMs: 0,
  contextLatencyMs: 20,
  modelLatencyMs: 100,
  totalLatencyMs: 185,
});

// Obtener promedio
const baseline = getAveragePerformanceBaseline();
```

---

## Health Check

### Comando

```bash
buffy health
```

### Output

```json
{
  "timestamp": "2026-08-28T15:00:00.000Z",
  "platform": "linux",
  "adapter": "LinuxAdapter",
  "subsystems": {
    "observation": "ok",
    "freshness": "ok",
    "actions": "ok",
    "state": "ok"
  },
  "metrics": {
    "totalRequests": 100,
    "totalErrors": 0,
    "staleRate": 0.15,
    "averageLatencyMs": 150
  },
  "version": "2.4.0"
}
```

---

## Error Taxonomy

| Categoría | Acción |
|-----------|--------|
| OBSERVATION_ERROR | Reintentar lectura del sistema |
| FRESHNESS_ERROR | Usar freshness por defecto |
| REFRESH_ERROR | Marcar needsRefresh |
| SELECTION_ERROR | Usar checks por defecto |
| CONTEXT_ERROR | Retornar error al caller |
| MODEL_ERROR | Log + retornar error |
| PLATFORM_ERROR | Log + usar fallback |
| EXECUTION_ERROR | Log + retornar error |

---

## Tests

```
tests/observability.test.ts — 13 tests
Total: 569/569
```

---

## Próximos pasos

1. ~~Observability~~ ✅
2. ~~Operational hardening~~ ✅
3. Uso real con observabilidad activa
4. Monitoreo de métricas
5. Hardening basado en fallos reales
