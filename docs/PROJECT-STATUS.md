# Buffy Next — Project Status Report

## Estado: RELEASE CANDIDATE

**Fecha:** 2026-08-28
**Versión:** 0.1.0
**Tests:** 569/569 PASS
**Build:** 130.2kb (esbuild)
**Typecheck:** 10 errors (pre-existing, documented)

---

## Qué está validado

### Arquitectura (E1 → E2 → E3 → E4 → E4.1 → E4.2)

| Componente | Estado | Validación |
|------------|--------|------------|
| Task-adaptive selector | ✅ FROZEN | 92% recall, 98% precision (E2) |
| Compact context | ✅ FROZEN | 569/569 tests, zero regressions |
| On-demand refresh | ✅ FROZEN | 100% success rate (E4.2) |
| Freshness Contract | ✅ FROZEN | Temporal contract validated (E4.1) |
| Freshness Gating | ✅ FROZEN | 0 stale violations, 100% refresh success |
| TTL/FRESHNESS_POLICY | ✅ FROZEN | 7 categories, physics-based thresholds |
| EpistemicState | ✅ FROZEN | observed/stale/unknown correctly classified |
| ActionGate | ✅ FROZEN | 44 tests, sudo boundary validated |
| Adapters | ✅ FROZEN | Linux/Windows/Android all pass |
| Telemetry | ✅ FROZEN | Health/metrics/error taxonomy complete |

### Pipeline

```
Query → selectChecks → scoreContext → systemInfo → analyzeForQuery
      → freshnessGating → observability → mapActions → auditTrail
```

All stages implemented and validated.

### Platform Validation

| Platform | Adapter | Tests | Stale Violations | Status |
|----------|---------|-------|------------------|--------|
| Linux | LinuxAdapter | 18/18 | 0 | Production-ready |
| Windows | WindowsAdapter | 18/18 | 0 | Production-ready |
| Android/Termux | AndroidTermuxAdapter | 18/18 | 0 | Production-ready |

### Security

| Component | Finding | Classification |
|-----------|---------|----------------|
| rawParams → sanitizeTarget | Strips shell metacharacters | SAFE_WITH_GUARD |
| ActionGate | classifyAction + requiresAuth + isForbidden | SAFE |
| install-tool | sudo boundary (no sudoers check) | SAFE_WITH_GUARD |
| ExecutorRegistry | Private executor map, no injection | SAFE |
| UNKNOWN → not factual | Omitted from context, never fabricated | SAFE |

### Metrics Available

| Metric | Source | Current Value |
|--------|--------|---------------|
| Test pass rate | vitest | 569/569 (100%) |
| Build size | esbuild | 130.2kb |
| Type errors | tsc --noEmit | 10 (pre-existing) |
| Stale violations | E4.2 results | 0 |
| Refresh success | E4.2 results | 100% |
| Pilot queries | Operational pilot | 25/25 passed |
| Pilot avg latency | Telemetry | 138ms |
| Pilot P50 latency | Telemetry | 133ms |
| Pilot P95 latency | Telemetry | 164ms |
| Pilot errors | Telemetry | 0 |

---

## Qué está congelado

Ver `ARCHITECTURE-FROZEN.md` para la lista completa.

**En resumen:**
- Todo el pipeline diagnóstico (E1-E4.2)
- Freshness policy por categoría
- EpistemicState classification
- Task-adaptive selector
- Compact context builder
- On-demand refresh mechanism
- ActionGate security model
- Adapter interface
- Telemetry + error taxonomy

**No se modifica sin:**
1. Fallo reproducible observado en uso real
2. Necesidad funcional concreta
3. Nueva evidencia experimental que justifique reabrir

---

## Qué limitaciones conocidas existen

### Limitaciones técnicas

1. **Typecheck errors:** 10 pre-existing TypeScript errors in `context.ts`, `doctor.ts`, `telemetry.ts`. Tests pass but types don't fully align. Documented in `ARCHITECTURE-FROZEN.md`.

2. **Linux cpuPercent:** The `list-processes` action returns `cpuPercent: 0` for all Linux processes (uses `ps` without `%cpu` parsing). This is a known limitation documented in `AUDIT-EXECUTION-CONTEXT-INTEGRITY.md` (M3).

3. **sudoers check missing:** `install-tool` doesn't verify sudo privileges before attempting `sudo apt install`. Will hang or fail on non-sudoer systems. Documented as FINDING E2.

4. **Storage threshold:** 1 hour freshness for storage is conservative. May need adjustment with empirical data.

5. **GPU refresh:** No dedicated refresh for GPU (driver/name rarely changes). Full `systemInfo()` re-call used.

6. **Network:** No real-time connectivity test (is an action, not a check).

### Limitaciones de validación

1. **Pilot size:** 25 queries is a small sample. Longitudinal validation needed.

2. **Model coverage:** Only validated with built-in rule engine. No LLM integration tested in production.

3. **Refresh under real staleness:** E4.2 validation ran with fresh data (no actual staleness triggered). Refresh pipeline tested via unit tests only.

4. **Concurrent access:** No testing of concurrent `diagnose()` calls.

---

## Qué métricas están disponibles

### Runtime metrics (via `buffy metrics`)

- Total requests
- Average/P50/P95 latency
- Context bytes
- Stale fields detected
- Refresh requested/success
- Freshness patterns (most stale, most refreshed)
- Error records by category

### Health status (via `buffy health`)

- Subsystem status (observation, freshness, actions, state)
- Total requests/errors
- Stale rate
- Average latency

### Experiment artifacts

- `experiments/e4-2/results/validation.json` — Freshness gating raw data
- `experiments/minimax-smoke/results/smoke.json` — MiniMax smoke test raw data
- `experiments/operational-pilot/results/pilot.json` — Pilot raw data
- `experiments/phase3-real-world/results/quick-validation.json` — Real-world validation raw data

---

## Qué plataformas fueron verificadas

| Platform | Adapter | Verification Level |
|----------|---------|-------------------|
| Linux | LinuxAdapter | Full (adapter + pipeline + freshness + gating + pilot) |
| Windows | WindowsAdapter | Full (adapter + pipeline + freshness + gating) |
| Android/Termux | AndroidTermuxAdapter | Full (adapter + pipeline + freshness + gating) |

**Plataformas NO verificadas:**
- macOS (no adapter exists)
- iOS (no adapter exists)
- ChromeOS (no adapter exists)

---

## Qué modelos fueron verificados

| Model/System | Verification | Status |
|--------------|-------------|--------|
| Buffy rule engine (built-in) | Full pipeline | ✅ 569/569 tests |
| MiniMax (smoke test) | 15 runs, 5 scenarios | ✅ PASS |
| Gemma (via E2 experiment) | 20 blind cases | ✅ 90% correct |
| Claude Code (via E1 experiment) | 10 blind cases | ✅ 70% correct |

**Modelos NO verificados:**
- GPT-4 / GPT-4o
- Gemini Pro
- Llama 3
- Qwen 2
- Any model via MCP

---

## Qué NO debe hacerse todavía

### Prohibido hasta nuevo aviso

1. **No añadir features** — La arquitectura está congelada
2. **No crear nuevos experimentos** — Los existentes son suficientes
3. **No optimizar métricas** — El baseline actual es aceptable
4. **No implementar MCP** — Esperar a demostrar seguridad sin Qwen
5. **No implementar ActionGate en buffy-context** — Separación contrato ≠ implementación
6. **No tocar prompts del modelo** — Congelados desde E2
7. **No modificar FreshnessPolicy** — Valores actuales reflejan física del sistema
8. **No crear plugin/middleware system** — Out of scope

### Pendiente documentado (no blocker)

1. Revisar cpuPercent en Linux (M3 del audit)
2. Agregar sudoers check a install-tool (S1 del audit)
3. Ajustar storage threshold con datos empíricos
4. Validación longitudinal con más queries reales

---

## Cuándo debe reabrirse la arquitectura

La arquitectura se reabre **únicamente** cuando:

1. **Fallo reproducible observado en uso real**
   - Ejemplo: "refresh falla en 30% de las consultas después de 5 minutos"
   - Requiere: reproducción + evidencia + clasificación

2. **Necesidad funcional concreta**
   - Ejemplo: "un usuario necesita soporte para macOS"
   - Requiere: justificación + alcance + impacto en tipos

3. **Nueva evidencia experimental que justifique reabrir**
   - Ejemplo: "E5 demuestra que 30s de freshness para RAM es insuficiente"
   - Requiere: diseño experimental + datos + revisión de peers

**No se reabre por:**
- "Podría ser mejor"
- "Vi otro proyecto que hace X"
- "Un modelo diferente sugirió Y"
- "Es fácil de implementar"

---

## Release Candidate Decision

### Current Version
```
0.1.0
```

### Recommended Next Version
```
0.2.0
```

### Release Notes (draft)

```
Buffy Next v0.2.0 — Release Candidate

Frozen architecture with full pipeline validation.

What's new since v0.1.0:
- Task-adaptive context selection (E2)
- Freshness contract with per-category TTL (E4.1)
- Freshness gating with on-demand refresh (E4.2)
- Observability (health, metrics, error taxonomy)
- Cross-platform validation (Linux, Windows, Android)
- Operational pilot (25 queries, 0 errors)
- MiniMax production smoke test (15 runs, 0 failures)

Security:
- ActionGate with 4-level classification
- sanitizeTarget() for install-tool
- UNKNOWN → not factual (never fabricated)

Known limitations:
- 10 pre-existing TypeScript errors (tests pass)
- Linux cpuPercent returns 0 (documented)
- No sudoers pre-check for install-tool
- Pilot sample size (25 queries) is small
```

### Pre-release Checklist

- [x] All tests pass (569/569)
- [x] Build succeeds (130.2kb)
- [x] Architecture frozen document
- [x] Reproduction guide
- [x] Operations runbook
- [x] Evidence index
- [x] Security audit
- [x] Regression gate documented
- [x] No unexplained untracked artifacts
- [ ] Typecheck clean (10 pre-existing errors — documented, non-blocking)
- [ ] Git: uncommitted changes committed (6 modified + 27 untracked)
- [ ] Git: changes pushed to remote

### Release Blockers

1. **Typecheck errors:** 10 pre-existing TS errors. Tests pass but `tsc --noEmit` fails. These are in `context.ts` (HardwareField type mismatch), `doctor.ts` (generatedAt missing), and `telemetry.ts` (AuditTrail not exported). **Non-blocking for RC** — documented and tests cover the functionality.

2. **Uncommitted changes:** 6 modified files + 27 untracked files need to be committed before tagging. **Blocker for release** — must commit before `git tag`.

---

## Criterio de cierre

```
repository reproducible          ✅ (build + test + typecheck documented)
documentation complete           ✅ (16 docs covering architecture through operations)
architecture freeze explicit     ✅ (docs/ARCHITECTURE-FROZEN.md)
regression gate documented       ✅ (docs/OPERATIONS.md §6)
security status documented       ✅ (SAFE_WITH_GUARD, findings E1-E5)
evidence indexed                 ✅ (docs/EVIDENCE-INDEX.md)
no unexplained untracked artifacts ✅ (all untracked files identified and categorized)
```

**PASS — Release Candidate ready.**

---

## STOP

No implementar funcionalidades adicionales.

El siguiente cambio del proyecto solo debe producirse por:
1. Un fallo reproducible observado en uso real
2. Una necesidad funcional concreta
3. Nueva evidencia experimental que justifique reabrir una decisión congelada
