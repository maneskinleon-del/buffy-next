# Buffy Next — Verified Evidence Capability Audit

**Date:** 2026-09-02
**Branch:** `feat/mcp-integration`
**HEAD:** `4f8765e`
**Read-only — no files modified, no commit created.**

---

## VERIFIED Path Requirements

The classifier (`classifyEvidence()` in `src/core/execution-evidence.ts`) requires ALL of:

1. `input.surface === 'self-action'`
2. `input.finalOutcome === 'success'` (executor returned `success: true`)
3. `input.postcondition` is provided
4. `postcondition.matched === true`
5. `postcondition.source !== 'action-gate'` (self-attestation guard)

The self-attestation guard (condition 5) is the critical constraint: even if an executor re-reads the system state after performing an action (as `change-power-plan` does), the observation source is still `'action-gate'` because it comes from the same executor. VERIFIED requires an **independent** observation channel.

---

## Action-by-Action Table

| Action | Deterministic postcondition | Independently observable | Existing verifier | Legitimately VERIFIED today |
|--------|---------------------------|------------------------|-------------------|---------------------------|
| `check-network` | Network health (ping + DNS + gateway) | Theoretically yes — could re-ping from adapter | **NO** — no re-observation | **NO** |
| `check-gpu-driver` | GPU driver type (generic vs official) | Theoretically yes — could re-read lspci from adapter | **NO** — no re-observation | **NO** |
| `check-driver-status` | GPU driver type | Same as above | **NO** | **NO** |
| `check-system-temp` | CPU temperature | Theoretically yes — could re-read thermal zone | **NO** — no re-observation | **NO** |
| `list-processes` | Process list | N/A — informational, no state change to verify | **NO** | **NO** |
| `check-disk-space` | Disk usage | Theoretically yes — could re-run df | **NO** — no re-observation | **NO** |
| `install-tool` | Tool installed | YES — could run `which <tool>` or `command -v <tool>` | **NO** — executor doesn't verify installation | **NO** |
| `change-power-plan` | Power plan is high-performance | YES — could re-read `powercfg /getactivescheme` | **PARTIAL** — executor re-reads, but source is `'action-gate'` (self-attestation) | **NO** |
| `check-shizuku` | Shizuku responds | N/A — check, not state change | **NO** | **NO** |

---

## Detailed Analysis

### `change-power-plan` — closest to VERIFIED

This is the only action that performs a post-execution re-read:

```typescript
execSync('powercfg /setactive ...');           // perform action
const active = execSync('powercfg /getactivescheme');  // re-read
const isHighPerf = active.includes(HIGH_PERF_GUID);
return { success: isHighPerf, ... };
```

However, this re-read is inside the **same executor** (`execChangePowerPlan`). When `classifyEvidence()` receives the evidence:

- `attempts[].outcome` = `'success'` (executor said success)
- `postcondition` = `undefined` (never provided by pipeline)

Even if we set `verifiable: true` on `change-power-plan`, the pipeline would still pass `postcondition: undefined` to `classifyEvidence()` because the pipeline doesn't currently construct postcondition objects. The re-read inside the executor is invisible to the evidence system — it's just part of the executor's internal logic.

**To make this genuinely VERIFIED, the pipeline would need to:**
1. Know the expected postcondition (declared in `ActionDefinition`)
2. Perform an independent re-observation after execution (via adapter, not executor)
3. Construct an `EvidencePostcondition` with `source !== 'action-gate'`
4. Pass it to `classifyEvidence()`

None of this infrastructure exists today.

### `install-tool` — verifiable in principle

After installing a tool, `command -v <tool>` could verify it exists. But:
- No such verification exists in the executor
- The package manager's exit code 0 is self-attestation
- The pipeline doesn't perform independent verification

### `check-*` actions — informational, no state change

These actions observe system state but don't change it. There's nothing to "verify" in the sense of confirming a postcondition. The `VERIFIED` concept applies to actions that change world-state and need confirmation.

---

## Evidence: postcondition is never provided

```bash
$ grep -rn 'postcondition' src/core/pipeline.ts
(no output)

$ grep -rn 'postcondition' src/core/pipeline.test-harness.ts
(no output)

$ grep -rn 'postcondition' tests/
(no output)
```

The `postcondition` field on `EvidenceInput` is never populated by any code path. It exists in the type definition and is handled by the classifier, but no caller provides it.

---

## Verdict

**B. VERIFIED not currently achievable**

No existing canonical action has a legitimate independent postcondition verifier. The reasons are structural:

1. **No action has `verifiable: true`** in its `ActionDefinition`
2. **No postcondition is ever provided** to `classifyEvidence()`
3. **No adapter performs independent re-observation** after action execution
4. **The self-attestation guard** (`source !== 'action-gate'`) prevents the closest candidate (`change-power-plan`) from qualifying

The `VERIFIED` level exists in the evidence model as a design target, not as a currently achievable state.

### Smallest future capability required

To make `VERIFIED` achievable for `change-power-plan`:

1. Set `verifiable: true` on the `change-power-plan` `ActionDefinition`
2. After `gate.execute()` returns, have the pipeline call `adapter.systemInfo()` or a dedicated re-observation method
3. Compare the observed power plan against the expected postcondition
4. Construct an `EvidencePostcondition` with `source: 'adapter:<name>'` (independent of `'action-gate'`)
5. Pass it to `classifyEvidence()`

This would require ~20 lines of pipeline changes + adapter support, and only applies to state-changing actions with observable postconditions.

---

## Files Inspected

| File | Purpose |
|------|---------|
| `src/core/execution-evidence.ts` | Evidence levels, classifier, VERIFIED path |
| `src/core/pipeline.ts` | All 9 executor implementations, evidence call site |
| `src/core/pipeline.test-harness.ts` | Test harness (mirrors production) |
| `src/core/types.ts` | `ActionDefinition.verifiable`, `ActionResult` |
| `src/actions/registry.ts` | Action catalog |
| `src/actions/catalog/*.ts` | Individual action definitions |
| `src/adapters/*.ts` | Platform adapters |
| `src/core/diagnose.ts` | Diagnostic system |
| `tests/*.test.ts` | Existing tests |

## Confirmation

- **Files modified:** NONE
- **Commit created:** NONE
- **VERIFIED reachable today:** NO
- **Reason:** No independent postcondition observation channel exists
