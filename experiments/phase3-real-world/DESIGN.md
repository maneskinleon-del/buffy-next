# Phase 3 — Real-World Operational Validation

## Estado: EJECUTANDO

**Fecha de inicio:** 2026-08-28
**Objetivo:** Validar arquitectura congelada en escenarios reales

---

## Configuración INMUTABLE

```
Task-adaptive selector
→ Context scoring
→ systemInfo()
→ analyzeForQuery()
→ Freshness gating
→ refresh on-demand
→ Compact context
→ Model
```

## Escenarios (15 total)

### Static (5)
Consultas abiertas sin cambio de sistema previo.

### Dynamic (5)
Consultas con cambio real del sistema antes de la segunda query.

### Stale (5)
Consultas donde datos relevantes están stale y deben refrescarse.

## Adversarial (8)
Casos A1-A8 que intentan romper el contrato temporal.

## Métricas

1. Factual correctness
2. Unsupported-claim rate
3. Stale-context violations
4. Freshness-decision correctness
5. Refresh success rate
6. Tool calls
7. Latency
8. Context bytes
9. Fields selected
10. Fields omitted

## Criterios de PASS

- stale-context violation = 0
- refresh success ≥ 0.95
- freshness decision accuracy ≥ 0.90
- unsupported claims ≤ 0.05
