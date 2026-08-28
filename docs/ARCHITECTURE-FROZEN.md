# Buffy Next — Arquitectura Oficial (Congelada)

## Estado: FROZEN

**Fecha de congelación:** 2026-08-28
**Serie experimental:** E1–E4.2 (cerrada)
**Tests:** 528/528
**Stale relevante enviado como actual:** 0
**Refresh success:** 100%

---

## Componentes congelados

### 1. Task-adaptive selector

**Archivo:** `src/core/check-selector.ts`
**Función:** `selectChecks(query)`

Determina qué categorías de hardware son relevantes para la query del usuario.

### 2. Compact context

**Archivo:** `src/core/context.ts`
**Función:** `buildContext(report)`

Transforma `DoctorReport` en `BuffyContext` para el modelo.

### 3. On-demand refresh

**Archivo:** `src/core/freshness-gating.ts`
**Función:** `applyFreshnessGating()`

Cuando un campo es STALE + relevante, ejecuta refresh on-demand antes de enviar al contexto.

### 4. Freshness gating

**Archivo:** `src/core/freshness-gating.ts`

Reglas:
- OBSERVED + relevante → incluir
- STALE + irrelevante → omitir
- STALE + relevante → refresh
- UNKNOWN → omitir

### 5. Temporal observations

**Archivo:** `src/core/types.ts`

Todo `CheckResult` incluye:
- `observedAt: string` (ISO 8601)
- `source: string` (adapter + método)

Todo `Observation` incluye:
- `observedAt: string`
- `source: string`
- `epistemicState: EpistemicState`
- `ageMs?: number`

### 6. Freshness policy

**Archivo:** `src/core/freshness.ts`

Políticas por categoría:
- cpu: 60s (medium volatility)
- memory: 30s (high volatility)
- gpu: 300s (low volatility)
- temperature: 30s (high volatility)
- processes: 30s (high volatility)
- storage: 3600s (very-low volatility)
- network: 60s (medium volatility)

---

## Pipeline oficial

```
USER QUERY
    │
    ▼
Task-adaptive selector (check-selector.ts)
    │
    ▼
Context scoring (context-scorer.ts)
    │
    ▼
Adapter systemInfo() (platform adapter)
    │
    ▼
analyzeForQuery() (diagnose.ts)
    │
    ▼
Freshness gating (freshness-gating.ts)
    │
    ├── FRESH → incluir
    └── STALE + relevante → refresh → incluir
    │
    ▼
Observability check (diagnose.ts)
    │
    ▼
Action mapping (action-mapper.ts)
    │
    ▼
Diagnostic response
    │
    ▼
Build context (context.ts)
    │
    ▼
Model
```

---

## Lo que NO se modifica (congelado)

- TTL thresholds (valores actuales son correctos)
- Task-adaptive selector (funciona correctamente)
- Compact context (formato estable)
- On-demand refresh (mecanismo validado)
- Prompts del modelo
- Plugins/middleware
- ActionGate / execution safety

---

## Métricas de validación

| Métrica | Valor | Target |
|---------|-------|--------|
| Tests | 528/528 | 100% |
| Stale relevante como fresh | 0 | = 0 |
| Refresh success rate | 100% | ≥ 90% |
| Fresh context regression | 0 | = 0 |

---

## Decisiones experimentales que se congelan

1. **Freshness policy por categoría** — Los valores de maxAgeMs reflejan la física del sistema
2. **Refresh por systemInfo()** — Se rellama al adapter completo para consistencia
3. **Gating en diagnose** — Se integra después de analyzeForQuery, antes de mapActions
4. **Instrumentación** — Cada decisión de freshness se registra para debugging

---

## Próximos pasos (post-congelación)

1. ~~Congelar especificación~~ ✅
2. Auditar cpuPercent en Linux
3. Auditar SAFE_WITH_GUARD
4. Validación con consultas reales
5. Implementación productiva
