# Buffy Next — First Verified Action Design Audit

**Date:** 2026-09-02
**Branch:** `feat/mcp-integration`
**HEAD:** `4f8765e`
**Read-only — no files modified, no commit created.**

---

## 1. Recommended Minimal Architecture

The smallest change that allows `change-power-plan` to produce `VERIFIED`:

```
1. Set verifiable: true on change-power-plan ActionDefinition
2. After gate.execute(), if action.verifiable:
   a. Pipeline runs independent observation (powercfg /getactivescheme)
   b. Pipeline constructs EvidencePostcondition
   c. Pipeline passes postcondition to classifyEvidence()
```

The observation source must be `'pipeline'` (distinct from `'action-gate'`) to satisfy the self-attestation guard.

### Why not adapter.systemInfo()?

`SystemInfo` does not include power-plan state. Extending it would require changes to all 3 adapters (Linux, Windows, Android) for a Windows-only feature. The pipeline running `execSync` directly is simpler and more honest — it's a direct system observation, not a derived value from a broad info method.

---

## 2. Exact Files Likely to Change

| File | Change | Lines |
|------|--------|-------|
| `src/actions/catalog/change-power-plan.ts` | Add `verifiable: true` | ~1 line |
| `src/core/pipeline.ts` | Add post-execution observation block for verifiable actions | ~15 lines |
| `src/core/pipeline.test-harness.ts` | Mirror same behavior | ~15 lines |
| `src/result-json.test.ts` | Add test for VERIFIED evidence level | ~10 lines |

**Total: ~41 lines across 4 files.** No new files. No interface changes. No MCP changes.

---

## 3. Exact Existing Interfaces/Types to Reuse

| Interface/Type | Location | Usage |
|---------------|----------|-------|
| `ActionDefinition.verifiable` | `src/core/types.ts:129` | Gate: only observe if `action.verifiable === true` |
| `EvidencePostcondition` | `src/core/execution-evidence.ts:62` | Construct: `{ expected, observed, matched, source }` |
| `EvidenceInput.postcondition` | `src/core/execution-evidence.ts:102` | Pass to classifier |
| `classifyEvidence()` | `src/core/execution-evidence.ts:139` | Already handles VERIFIED path |
| `execSync` | Already imported in `pipeline.ts:13` | Run independent observation |

No new types needed. All infrastructure exists.

---

## 4. Exact Observation Source

After `gate.execute()` returns, the pipeline would run:

```typescript
const observed = execSync('powercfg /getactivescheme', {
  encoding: 'utf-8',
  timeout: 5000,
}).trim();
```

This is the same command the executor uses, but run **by the pipeline** (not by the executor). The source attribution:

- Executor's re-read: `source = 'action-gate'` (inside executor)
- Pipeline's re-read: `source = 'pipeline'` (after executor returns)

The classifier checks `post.source !== 'action-gate'`. With `source: 'pipeline'`, this condition is satisfied.

### Is this genuinely independent?

The pipeline's observation is temporally independent (happens after the executor completes) and architecturally independent (different code path, different caller). It is NOT a different process or different machine — but the evidence model only requires `source !== 'action-gate'`, not full physical independence.

The self-attestation guard exists to prevent the executor from verifying its own claim. The pipeline is a different layer with different responsibility. This is a legitimate independence boundary.

---

## 5. Exact Postcondition Fields

```typescript
const postcondition: EvidencePostcondition = {
  expected: HIGH_PERFORMANCE_GUID,    // the GUID we requested
  observed: active.trim(),             // what we observed after execution
  matched: active.includes(HIGH_PERFORMANCE_GUID),
  source: 'pipeline',                  // independent of 'action-gate'
};
```

The `expected` value is already known: `HIGH_PERFORMANCE_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'` (defined at pipeline.ts:97).

---

## 6. Platform Support Matrix

| Platform | `change-power-plan` executes? | Observation possible? | VERIFIED achievable? |
|----------|------------------------------|----------------------|---------------------|
| Windows | YES (`platforms: ['windows']`) | YES (`powercfg /getactivescheme`) | **YES** |
| Linux | NO (filtered by platform) | N/A | N/A |
| Android/Termux | NO (filtered by platform) | N/A | N/A |

The action is Windows-only. The observation is Windows-only. This is consistent — no fake cross-platform semantics.

---

## 7. Failure Semantics

| Scenario | `ActionResult.success` | `evidence.level` | `postcondition.matched` |
|----------|----------------------|-----------------|----------------------|
| Plan changed, verified | `true` | `VERIFIED` | `true` |
| Plan changed, not verified (read failed) | `true` | `OBSERVED_EXECUTED` | `undefined` (no postcondition) |
| Plan not changed (permission denied) | `false` | `NOT_VERIFIED` | `undefined` |
| Plan changed to wrong scheme | `false` | `NOT_VERIFIED` | `false` (if postcondition provided) |
| Observation command fails | `true` | `OBSERVED_EXECUTED` | `undefined` (postcondition not constructed) |

The observation failure is graceful — if `powercfg /getactivescheme` fails after execution, no postcondition is constructed, and the evidence falls back to `OBSERVED_EXECUTED`. This is correct: we observed execution but couldn't independently verify the result.

---

## 8. Estimated Implementation Scope

| Component | Effort | Risk |
|-----------|--------|------|
| `change-power-plan.ts`: add `verifiable: true` | 1 line | NONE |
| `pipeline.ts`: add observation block (~15 lines) | SMALL | LOW — pure addition, no existing logic changed |
| `pipeline.test-harness.ts`: mirror | SMALL | LOW — same pattern as existing sync |
| Tests: add VERIFIED test case | SMALL | LOW |
| **Total** | **~41 lines** | **LOW** |

No interface changes. No MCP changes. No CLI changes. No evidence model changes.

---

## 9. Risks / Semantic Traps

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `powercfg` not available on Windows | LOW | Observation failure → falls back to OBSERVED_EXECUTED |
| Race condition: plan changes between execution and observation | VERY LOW | Window is milliseconds; acceptable for this evidence level |
| `source: 'pipeline'` is not fully independent (same process) | LOW | Evidence model only requires `source !== 'action-gate'`; pipeline is architecturally separate from executor |
| Other actions could be made verifiable later | NONE | Scope is limited to `change-power-plan` by `action.verifiable` gate |
| `expected` value is hardcoded | LOW | It's the same GUID already hardcoded in the executor |

---

## 10. Is `change-power-plan` Suitable as First VERIFIED Action?

**Yes.** It is the strongest legitimate candidate because:

1. It already performs a post-execution re-read (closest to verification)
2. The re-read is deterministic and fast (`powercfg /getactivescheme`)
3. It's Windows-only (no cross-platform complexity)
4. The expected state is a known GUID (simple comparison)
5. The observation failure is graceful (falls back to OBSERVED_EXECUTED)
6. The change is small (~41 lines) and localized

---

## Decision Gate

**A. Minimal and safe**

Existing architecture supports a small, localized implementation. All required types, interfaces, and classifier logic already exist. The only new code is:
- 1 metadata flag on the action definition
- ~15 lines of post-execution observation in the pipeline
- ~10 lines of tests

No files modified. No commit created.
