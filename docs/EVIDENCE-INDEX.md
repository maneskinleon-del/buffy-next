# Buffy Next — Evidence Index

## Summary

| Evidence | Result | Artefact |
|----------|--------|----------|
| E1 (SessionStart) | PASS | 7/10 correct (70%), 0 invasions |
| E2 (Context Selection) | PASS | 18/20 correct (90%), 0 invasions |
| E3 (Policy Results) | PASS | Tool policy validated |
| E4 (Stale Context) | FINDING | Stale context used as current — root cause identified |
| E4.1 (Temporal Contract) | PASS | Per-observation timestamps implemented |
| E4.2 (Freshness Gating) | PASS | 0 stale violations, 100% refresh success |
| Phase 3 (Real-World) | PASS | 10/10 scenarios passed |
| Production Integration | PASS | Full pipeline validated, 538/538 tests |
| Cross-Platform | PASS | Linux/Windows/Android all pass |
| MiniMax Smoke | PASS | 15/15 runs passed |
| Operational Pilot | PASS | 25/25 queries passed |
| Security Audit | SAFE_WITH_GUARD | sanitizeTarget effective, sudo boundary documented |

---

## Detailed Evidence

### E1 — SessionStart Experiment

**Question:** Does Buffy add value to an agent with large context?

| Condition | Correct | Inventions |
|-----------|---------|------------|
| Control (Gemma alone) | 3/10 (30%) | 3/10 |
| Buffy+Gemma | 7/10 (70%) | 0/10 |

**Result:** Buffy eliminates invasions and improves accuracy.

**Artefact:** `experiments/sessionstart-e1/`

---

### E2 — Context Selection Experiment

**Question:** Does task-adaptive selection improve context quality?

| Condition | Correct | Inventions |
|-----------|---------|------------|
| Full context | baseline | baseline |
| Task-adaptive | 18/20 (90%) | 0/20 |

**Result:** Task-adaptive works, eliminates invasions.

**Artefact:** `experiments/e2-context-selection/`

---

### E4 — Stale Context Finding

**Finding:** Model used stale context as current data.

**Root cause:** No per-observation timestamps, no freshness policy, no epistemic differentiation.

**Artefact:** `AUDIT-EXECUTION-CONTEXT-INTEGRITY.md`

---

### E4.1 — Temporal Contract

**What was implemented:**
- `EpistemicState` type (observed/stale/unknown)
- `observedAt` on `Observation` and `CheckResult`
- `source` field for provenance
- `HardwareField` with temporal metadata
- `FRESHNESS_POLICY` per category
- `classifyEpistemicState()` function

**Result:** Per-observation timestamps working.

**Tests:** 569/569 pass

---

### E4.2 — Freshness Gating

**Setup:** 5 fresh + 5 stale scenarios × 3 runs = 30 total

| Metric | Value | Target |
|--------|-------|--------|
| Stale relevant sent as fresh | 0 | = 0 |
| Refresh success | 100% | ≥ 90% |
| Fresh context regression | 0 | = 0 |

**Result:** PASS — all criteria met.

**Artefact:** `experiments/e4-2/results/validation.json`

---

### Phase 3 — Real-World Validation

**Setup:** 10 scenarios (5 static + 3 stale + 2 adversarial)

| Category | Scenarios | Passed |
|----------|-----------|--------|
| Static | 5 | 5 |
| Stale | 3 | 3 |
| Adversarial | 2 | 2 |

**Result:** PASS — 0 stale violations.

**Artefact:** `experiments/phase3-real-world/results/quick-validation.json`

---

### Production Integration

**What was validated:**
- Full pipeline (selectChecks → scoreContext → systemInfo → analyzeForQuery → freshnessGating → mapActions)
- Temporal contract
- Audit trail
- Observability

**Tests:** 538/538 → 569/569

**Result:** PASS

**Artefact:** `docs/PRODUCTION-INTEGRATION.md`

---

### Cross-Platform Validation

**Platforms:** Linux, Windows, Android/Termux

| Platform | Adapter | Tests | Stale Violations |
|----------|---------|-------|------------------|
| Linux | LinuxAdapter | 18/18 | 0 |
| Windows | WindowsAdapter | 18/18 | 0 |
| Android | AndroidTermuxAdapter | 18/18 | 0 |

**Result:** PASS — all platforms work correctly.

**Artefact:** `docs/CROSS-PLATFORM-VALIDATION.md`

---

### MiniMax Smoke Test

**Setup:** 5 scenarios × 3 runs = 15 total

| Scenario | Runs | Passed |
|----------|------|--------|
| Factual (RAM) | 3 | 3 |
| Dynamic (CPU) | 3 | 3 |
| Stale (Processes) | 3 | 3 |
| Unknown (GPU Temp) | 3 | 3 |
| Open (Performance) | 3 | 3 |

**Result:** PASS — 15/15 passed.

**Artefact:** `experiments/minimax-smoke/results/smoke.json`

---

### Operational Pilot

**Setup:** 25 queries across 5 categories

| Category | Queries | Passed |
|----------|---------|--------|
| Factual | 5 | 5 |
| Dynamic | 5 | 5 |
| Performance | 5 | 5 |
| Hardware | 5 | 5 |
| Diagnostics | 5 | 5 |

**Metrics:**
- Avg latency: 138ms
- P50 latency: 133ms
- P95 latency: 164ms
- Errors: 0

**Result:** PASS — 25/25 passed.

**Artefact:** `experiments/operational-pilot/results/pilot.json`

---

### Security Audit

**Components reviewed:**
- `rawParams` → `sanitizeTarget()` — strips shell metacharacters
- `ActionGate` — classifyAction + requiresAuth + isForbidden
- `install-tool` — sudo boundary (no sudoers check)
- `ExecutorRegistry` — private executor map
- `UNKNOWN` → never fabricated

**Classification:** SAFE_WITH_GUARD

**What it guarantees:**
- No arbitrary command execution via rawParams
- Action classification enforced
- FORBIDDEN actions blocked
- UNKNOWN values never fabricated

**What it does NOT guarantee:**
- sudoers validation (hangs on non-sudoer systems)
- Package existence (any name can be attempted)
- Allowlist-based validation (uses stripping)

**Artefact:** `AUDIT-EXECUTION-CONTEXT-INTEGRITY.md`

---

## Test Results Summary

| Test Suite | Tests | Status |
|------------|-------|--------|
| action-gate-security.test.ts | 44 | ✅ PASS |
| context.test.ts | 30 | ✅ PASS |
| buffy-tool.test.ts | 13 | ✅ PASS |
| diagnose.test.ts | 21 | ✅ PASS |
| pipeline.test.ts | 20 | ✅ PASS |
| flow.test.ts | 20 | ✅ PASS |
| cross-platform-validation.test.ts | 18 | ✅ PASS |
| checks.test.ts | 15 | ✅ PASS |
| observability.test.ts | 13 | ✅ PASS |
| freshness.test.ts | 12 | ✅ PASS |
| freshness-gating.test.ts | 11 | ✅ PASS |
| production-integration.test.ts | 10 | ✅ PASS |
| external-validation.test.ts | 6 | ✅ PASS |
| temporal-contract.test.ts | 7 | ✅ PASS |
| All other suites | 328 | ✅ PASS |
| **Total** | **569** | **✅ PASS** |

---

## How to verify

```bash
cd buffy-next
npm test                    # All 569 tests
npm run build               # Build succeeds
npx vitest run tests/freshness-gating.test.ts    # Freshness
npx vitest run tests/cross-platform-validation.test.ts  # Cross-platform
npx vitest run tests/observability.test.ts       # Observability
```
