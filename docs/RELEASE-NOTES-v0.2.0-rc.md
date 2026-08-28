# Buffy Next v0.2.0-rc — Release Notes

## Version

```
v0.2.0-rc
```

## Commit

```
2480cf9 release: Buffy Next v0.2.0 RC
```

## Tag

```
v0.2.0-rc (annotated)
```

## Date

2026-08-28

---

## What's New

### Frozen Architecture (E1–E4.2)

The complete diagnostic pipeline is now frozen after 6 experimental phases:

| Phase | Component | Status |
|-------|-----------|--------|
| E1 | SessionStart integration | ✅ Closed |
| E2 | Task-adaptive context selection | ✅ Frozen |
| E3 | Tool policy results | ✅ Closed |
| E4 | Stale context finding | ✅ Closed |
| E4.1 | Temporal contract | ✅ Frozen |
| E4.2 | Freshness gating | ✅ Frozen |

### Pipeline

```
Query → selectChecks → scoreContext → systemInfo → analyzeForQuery
      → freshnessGating → observability → mapActions → auditTrail
```

### Freshness Contract

Per-category TTL with physics-based thresholds:

| Category | TTL | Volatility |
|----------|-----|------------|
| cpu | 60s | medium |
| memory | 30s | high |
| gpu | 300s | low |
| temperature | 30s | high |
| processes | 30s | high |
| storage | 3600s | very-low |
| network | 60s | medium |

### Epistemic States

Every observation now includes:
- `observedAt` — when the measurement was taken
- `source` — which adapter/method produced it
- `epistemicState` — observed/stale/unknown

### Observability

- Health check: `buffy health`
- Metrics: `buffy metrics`
- Error taxonomy: 8 categories
- Audit trail per diagnosis

---

## Validation

### Tests

```
569/569 PASS (31 test files)
```

### Build

```
dist/cli.js — 130.2kb (esbuild, 8ms)
```

### Cross-Platform

| Platform | Adapter | Tests | Status |
|----------|---------|-------|--------|
| Linux | LinuxAdapter | 18/18 | ✅ |
| Windows | WindowsAdapter | 18/18 | ✅ |
| Android/Termux | AndroidTermuxAdapter | 18/18 | ✅ |

### Experiments

| Experiment | Result |
|------------|--------|
| E4.2 Freshness Gating | 0 stale violations, 100% refresh success |
| MiniMax Smoke | 15/15 runs passed |
| Operational Pilot | 25/25 queries passed, avg 138ms |
| Phase 3 Real-World | 10/10 scenarios passed |
| Platform Validation | All 3 platforms pass |

### Security

```
SAFE_WITH_GUARD
```

- `sanitizeTarget()` strips shell metacharacters
- `ActionGate` enforces 4-level classification
- `UNKNOWN` values never fabricated

---

## Models Validated

| Model/System | Verification | Status |
|--------------|-------------|--------|
| Buffy rule engine | Full pipeline | ✅ 569/569 tests |
| MiniMax | Smoke test (15 runs) | ✅ PASS |
| Gemma | E2 experiment (20 cases) | ✅ 90% correct |
| Claude Code | E1 experiment (10 cases) | ✅ 70% correct |

---

## Known Limitations

### Typecheck Errors (10)

| Error | File | Classification | Runtime Impact |
|-------|------|----------------|----------------|
| TS2322 | context.ts:23 | PREEXISTING-NONBLOCKING | None |
| TS2322 ×7 | context.ts:34-47 | FIXED-BY-CURRENT-CHANGES | HardwareField not constructed |
| TS2741 | doctor.ts:15 | FIXED-BY-CURRENT-CHANGES | generatedAt missing |
| TS2305 | telemetry.ts:5 | FIXED-BY-CURRENT-CHANGES | Wrong import path |

**Impact:** `buffy doctor --context` produces raw primitives instead of `HardwareField` objects. External agents get working data but without per-field timestamps.

**Plan:** Fix in post-RC patch.

### Other Limitations

- Linux `cpuPercent` in `list-processes` action
- No sudoers pre-check for `install-tool`
- Storage threshold (1 hour) is conservative
- Pilot sample size (25 queries) is small

---

## Architecture Frozen

The following components are FROZEN and will not change without justification:

- Task-adaptive selector
- Compact context builder
- On-demand refresh
- Freshness Contract
- Freshness Gating
- TTL/FRESHNESS_POLICY
- EpistemicState
- ActionGate
- Adapters
- Telemetry

### When to Reopen

Only when:
1. A reproducible failure is observed in real usage
2. A concrete functional need arises
3. New experimental evidence justifies it

---

## Files Changed

```
54 files changed, 9771 insertions(+), 28 deletions(-)
```

### Runtime Code (10 files)

- `src/core/errors.ts` (new)
- `src/core/freshness-gating.ts` (new)
- `src/core/freshness.ts` (new)
- `src/core/telemetry.ts` (new)
- `src/adapters/linux.ts` (modified)
- `src/cli.ts` (modified)
- `src/core/diagnose.ts` (modified)
- `src/core/types.ts` (modified)
- `src/tool.ts` (modified)

### Tests (8 files)

- `tests/buffy-tool.test.ts` (modified)
- `tests/cross-platform-validation.test.ts` (new)
- `tests/external-validation.test.ts` (new)
- `tests/freshness-gating.test.ts` (new)
- `tests/freshness.test.ts` (new)
- `tests/observability.test.ts` (new)
- `tests/production-integration.test.ts` (new)
- `tests/temporal-contract.test.ts` (new)

### Documentation (14 files)

- `AUDIT-EXECUTION-CONTEXT-INTEGRITY.md`
- `docs/ARCHITECTURE-FROZEN.md`
- `docs/CROSS-PLATFORM-VALIDATION.md`
- `docs/E4-1-TEMPORAL-CONTRACT.md`
- `docs/E4-2-FRESHNESS-GATING.md`
- `docs/EVIDENCE-INDEX.md`
- `docs/OBSERVABILITY.md`
- `docs/OPERATIONAL-HARDENING.md`
- `docs/OPERATIONAL-PILOT.md`
- `docs/OPERATIONS.md`
- `docs/PRODUCTION-INTEGRATION.md`
- `docs/PROJECT-STATUS.md`
- `docs/RELEASE-AUDIT.md`
- `docs/REPRODUCTION.md`

### Experiment Evidence (5 directories)

- `experiments/e4-2/`
- `experiments/minimax-smoke/`
- `experiments/operational-pilot/`
- `experiments/phase3-real-world/`
- `experiments/platform-validation/`

---

## Post-RC Plan

1. Fix typecheck errors (context.ts + doctor.ts + telemetry.ts)
2. Update version to 0.2.0
3. Tag release
4. Push

---

## STOP

No additional features until real-world usage produces a reproducible failure.
