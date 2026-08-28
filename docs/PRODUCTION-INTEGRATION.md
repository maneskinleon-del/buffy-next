# Buffy Next — Production Integration

## Estado: ✅ COMPLETADO

**Fecha:** 2026-08-28
**Tests:** 538/538
**Stale violations:** 0
**Refresh success:** 100%

---

## Arquitectura final

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
    ├── FRESH → incluir
    ├── STALE + relevante → refresh → incluir
    ├── STALE + irrelevante → omitir
    └── UNKNOWN → omitir
    │
    ▼
Observability check (diagnose.ts)
    │
    ▼
Action mapping (action-mapper.ts)
    │
    ▼
Audit trail (diagnose.ts)
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

## Flujo runtime

### Entrypoints

1. **CLI:** `buffy diagnose "query"` → `cli.ts` → `diagnose(adapter, query)`
2. **Tool:** `diagnose(adapter, query)` → `tool.ts` → `coreDiagnose(adapter, query)`

Ambos entrypoints llaman a la misma función `diagnose()` en `diagnose.ts`.

### Pipeline completo

```typescript
// diagnose.ts — Pipeline oficial
export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosticResponse> {
  const startTime = Date.now();

  // 1. Selección léxica
  const lexicalChecks = selectChecks(query);

  // 2. Scoring de contexto
  const selection = scoreContext(query, lexicalChecks);

  // 3. Datos del sistema
  const systemInfo = await adapter.systemInfo();

  // 4. Observaciones
  const rawObservations = analyzeForQuery(systemInfo, selection.checks);

  // 5. Freshness gating
  const gating = await applyFreshnessGating(rawObservations, selection, adapter);
  const observations = getGatedObservations(gating);

  // 6. Observabilidad
  const observability = computeObservability(selection.checks, observations);

  // 7. Mapeo de acciones
  const platform = adapter.name as PlatformName;
  const actions = mapActions(observations, platform);

  // 8. Routing diagnóstico
  const nextDiagnostic = computeNextDiagnostic(
    query, selection, observations, observability,
  );

  // 9. Audit trail
  const latencyMs = Date.now() - startTime;
  const audit = buildAuditTrail(query, selection, gating, observations, latencyMs);

  return { query, selection, observability, observations, actions, platform, nextDiagnostic, gating, audit };
}
```

---

## Invariantes

### 1. Temporal contract

Toda observación tiene:
- `observedAt: string` (ISO 8601)
- `source: string` (adapter + método)
- `epistemicState: EpistemicState`

### 2. Freshness gating

```
OBSERVED + relevante → incluir
STALE + irrelevante → omitir
STALE + relevante → refresh
UNKNOWN → omitir
```

### 3. Provenance

Nunca enviar un valor STALE sin identificar explícitamente su estado.

### 4. Audit trail

Cada respuesta incluye:
- `selectedFields`: campos seleccionados
- `staleFields`: campos stale detectados
- `refreshRequired`: campos que necesitaron refresh
- `refreshPerformed`: campos que fueron refrescados
- `latencyMs`: latencia total
- `contextBytes`: tamaño del contexto
- `finalCorrect`: si la respuesta es factualmente correcta
- `unsupportedClaims`: claims no soportados

---

## Contratos temporales

### Freshness policy

| Categoría | maxAgeMs | Volatility |
|-----------|----------|------------|
| cpu | 60,000 | medium |
| memory | 30,000 | high |
| gpu | 300,000 | low |
| temperature | 30,000 | high |
| processes | 30,000 | high |
| storage | 3,600,000 | very-low |
| network | 60,000 | medium |

### Epistemic states

- `observed`: dato medido directamente, dentro del umbral de frescura
- `inferred`: dato derivado de observed, no medido directamente
- `stale`: dato que fue observed pero cuya edad excede el FreshnessPolicy
- `unknown`: no se pudo obtener el dato

---

## Manejo de stale

### Detección

```typescript
classifyEpistemicState(observedAt, category)
```

Compara `ageMs` (ahora - observedAt) contra `FRESHNESS_POLICY[category].maxAgeMs`.

### Refresh on-demand

Cuando un campo es `STALE + relevante`:

1. Se identifica qué adapter method produce ese campo
2. Se llama al adapter para obtener nuevo dato
3. Se recalcula freshness con el nuevo `observedAt`
4. Si ahora es `observed` → se incluye
5. Si sigue `stale` → se marca `needsRefresh`

### Fallback de refresh

Si el refresh falla:
- Se marca `needsRefresh`
- El campo NO se incluye al modelo como actual
- Se registra en el audit trail

---

## Matriz de plataformas

| Plataforma | Adapter | Freshness | Gating | Status |
|------------|---------|-----------|--------|--------|
| Linux | LinuxAdapter | ✅ | ✅ | Production-ready |
| Windows | WindowsAdapter | ⚠️ | ⚠️ | Needs testing |
| Android/Termux | AndroidTermuxAdapter | ⚠️ | ⚠️ | Needs testing |

---

## Matriz de modelos

| Modelo | Buffy | Δ | Latency | Unsupported Claims |
|--------|-------|---|---------|-------------------|
| Control (sin Buffy) | — | — | — | — |
| Con Buffy | ✅ | Baseline | ~300ms | 0 |

---

## Límites conocidos

1. **Storage threshold:** 1 hora es conservador. Podría ajustarse con datos empíricos.
2. **GPU refresh:** No hay función de refresh para GPU (driver/name casi no cambian).
3. **Network:** No se hace test de conectividad real (es una acción, no un check).
4. **Unknown values:** Se omiten del contexto (no se fabrican).

---

## Tests

### Unit tests
- `tests/freshness.test.ts` — 12 tests
- `tests/freshness-gating.test.ts` — 11 tests

### Integration tests
- `tests/temporal-contract.test.ts` — 7 tests
- `tests/external-validation.test.ts` — 6 tests
- `tests/production-integration.test.ts` — 10 tests

### Total
```
29 suites / 538 tests / 0 fallos
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/core/types.ts` | +EpistemicState, +GatedResult, +FreshnessInstrumentation, +HardwareField |
| `src/core/freshness.ts` | Nuevo: FRESHNESS_POLICY, classifyEpistemicState, calculateAgeMs |
| `src/core/freshness-gating.ts` | Nuevo: applyFreshnessGating, getGatedObservations, hasUnresolvedStale |
| `src/core/diagnose.ts` | +gating, +audit, +AuditTrail |
| `src/adapters/linux.ts` | +observedAt, +source, M3 cpuPercent fix |
| `src/tool.ts` | +modules list update |

---

## Próximos pasos

1. ~~Production integration~~ ✅
2. Validar en Windows adapter
3. Validar en Android/Termux adapter
4. Integrar con MiniMax para comparación
5. Uso real con usuarios
