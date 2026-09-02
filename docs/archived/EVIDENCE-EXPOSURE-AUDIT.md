# Buffy Next — Execution Evidence Exposure Audit

**Date:** 2026-09-02
**Branch:** `feat/mcp-integration`
**HEAD:** `8e36515`
**Read-only audit — no commit.**

---

## 1. Verdict

**EXPOSURE IS POSSIBLE BUT REQUIRES PROJECTION**

The existing `ExecutionEvidenceRecord` is computed for every successful `buffy act` execution but is never returned to the caller — it goes directly to the state ledger. The record is available in memory at the exact point where `--result-json` serializes its output. A minimal safe projection of the record could be attached to the `ActionResult` without changing the canonical type, by wrapping it in the CLI serialization layer.

However, the full record is NOT appropriate for external exposure. Several fields are internal bookkeeping. A projection of 3 fields (`level`, `observedAt`, `attempts`) is the smallest safe representation.

---

## 2. Existing Evidence Schema

### `ExecutionEvidenceRecord` (complete)

| Field | Type | Meaning | Safe to expose? |
|-------|------|---------|----------------|
| `actionId` | `string` | Which action | YES (already in ActionResult) |
| `surface` | `'self-action' \| 'self-delivery' \| 'external'` | Observation surface | INTERNAL — always `self-action` for `buffy act` |
| `level` | `ExecutionEvidenceLevel` | Evidence classification | **YES** — this is the key field |
| `observedAt` | `string` (ISO) | When evidence was examined | **YES** — agent needs timestamp |
| `source` | `string` | Evidence provenance | INTERNAL — always `action-gate` |
| `correlationId` | `string?` | Identity of emitting invocation | INTERNAL |
| `evidenceNote` | `string?` | Human-readable note | REQUIRES PROJECTION — useful but verbose |
| `postcondition` | `EvidencePostcondition?` | Independent verification result | NEVER POPULATED (see §6) |
| `executionId` | `string?` | execStore dedupe key | INTERNAL |
| `attempts` | `ExecutionAttempt[]?` | Per-attempt outcomes | **YES** — agent needs to know if attempts failed |

### `ExecutionAttempt` (complete)

| Field | Type | Meaning | Safe to expose? |
|-------|------|---------|----------------|
| `outcome` | `'success' \| 'failed' \| 'exception'` | What happened | YES |
| `detail` | `string?` | Attempt detail message | YES |

### `ExecutionEvidenceLevel` (7 levels)

| Level | Meaning | Reachable today? |
|-------|---------|------------------|
| `DELIVERED` | Buffy attests emission | NO (self-delivery, not built) |
| `OBSERVED_EXECUTED` | Executor completed, no independent verification | **YES — this is what all successful actions get** |
| `VERIFIED` | OBSERVED_EXECUTED + independent postcondition confirmed | NO (postcondition never provided) |
| `NOT_VERIFIED` | Evidence examined, execution not confirmed | YES (failed actions, gate rejections) |
| `UNKNOWN_UNOBSERVABLE` | External surface, no channel | NO (self-action only) |
| `UNKNOWN_NO_EVIDENCE` | Window expired / rotated | NO (self-action with compound path) |
| `UNKNOWN_CHANNEL_NOT_BUILT` | Delivery ledger pending | NO (self-delivery only) |

---

## 3. Current Lifecycle

```
gate.execute(action.id, rawParams)
    ↓ returns ActionResult
console.log(toJSON({ ...result, actionId }))    ← --result-json serializes HERE
    ↓
updateState({ actionHistory: ... })             ← persists action record
    ↓
classifyEvidence({ surface: 'self-action', ... })
    ↓ returns ExecutionEvidenceRecord            ← AVAILABLE IN MEMORY as evidenceRecord
updateState({ evidence: recordEvidence(...) })   ← persisted to ledger
    ↓
return result                                    ← returns ActionResult (WITHOUT evidence)
```

**The critical point:** `evidenceRecord` exists in memory at the same scope as `result`. It could be attached to the serialization output at the `console.log(toJSON(...))` line without any structural change.

Currently, the evidence is:
1. Computed ✓
2. Persisted ✓
3. Returned to caller ✗ — `return result` returns only `ActionResult`

---

## 4. External Exposure Recommendation

### Smallest safe projection

Expose 3 fields from `ExecutionEvidenceRecord`:

```json
{
  "success": true,
  "message": "...",
  "details": {},
  "actionId": "check-network",
  "evidence": {
    "level": "OBSERVED_EXECUTED",
    "observedAt": "2026-09-02T16:00:00.000Z",
    "attempts": [
      { "outcome": "success", "detail": "Red funcionando correctamente..." }
    ]
  }
}
```

### Fields NOT exposed

| Field | Why not |
|-------|---------|
| `surface` | Always `self-action` for `buffy act` — redundant |
| `source` | Always `action-gate` — implementation detail |
| `correlationId` | Internal bookkeeping |
| `executionId` | Internal dedupe key |
| `evidenceNote` | Verbose, internal — can be added later if needed |
| `postcondition` | Never populated today |

### Implementation path (NOT implementing)

The evidence record is available as `evidenceRecord` in the same scope where `--result-json` serializes. The projection could be computed at that point:

```typescript
// In executeWithGatesInternal, after classifyEvidence:
if (resultJsonMode) {
  const evidenceProjection = evidenceRecord ? {
    level: evidenceRecord.level,
    observedAt: evidenceRecord.observedAt,
    attempts: evidenceRecord.attempts,
  } : undefined;
  console.log(toJSON({ ...result, actionId: action.id, evidence: evidenceProjection }));
}
```

This requires:
- Changing only the `--result-json` serialization block (~5 lines)
- NOT changing `ActionResult` type
- NOT changing MCP adapter (it already receives JSON)
- NOT changing the evidence model

---

## 5. Semantic Sufficiency

### Does the existing 7-level model solve the distinction?

**Partially.** For self-action executions, only 2 levels are reachable today:

| Level | When | Agent can conclude |
|-------|------|-------------------|
| `OBSERVED_EXECUTED` | Executor returned `success: true` | "The executor ran and reported success" |
| `NOT_VERIFIED` | Executor returned `success: false` or threw | "The executor did not confirm success" |

The model is **semantically correct** — `OBSERVED_EXECUTED` explicitly means "Buffy observed its own executor complete" and `VERIFIED` requires independent postcondition confirmation. But since no actions set `verifiable: true` and no postconditions are provided, `VERIFIED` is unreachable.

### What the model already provides that `success` alone does not

| Information | `success` alone | With evidence level |
|-------------|----------------|-------------------|
| "Executor ran" | INFERRED (from ✅ marker) | STATED (`OBSERVED_EXECUTED`) |
| "Effect verified" | NOT EXPRESSIBLE | EXPRESSIBLE (`VERIFIED` — when implemented) |
| "Execution failed" | INFERRED (from ❌/isError) | STATED (`NOT_VERIFIED`) |
| "Attempt details" | NOT AVAILABLE | AVAILABLE (per-attempt outcomes) |
| "When observed" | NOT AVAILABLE | AVAILABLE (`observedAt`) |

### The precise missing semantic

The existing model already captures the distinction between "observed execution" and "verified effect." What's missing is:

1. **No action sets `verifiable: true`** — so VERIFIED is unreachable
2. **No postcondition is provided** — so even if an action were verifiable, the classifier can't confirm it
3. **The evidence record isn't returned** — so the agent can't see the level

The model is sufficient. The gap is exposure, not semantics.

---

## 6. Action Coverage Matrix

| Action | Evidence generated? | Typical level | Evidence basis | `postcondition` ever provided? | Can reach VERIFIED? |
|--------|-------------------|---------------|----------------|-------------------------------|-------------------|
| `check-network` | YES | `OBSERVED_EXECUTED` | executor success + compound path | NO | NO (no `verifiable`) |
| `check-gpu-driver` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `check-driver-status` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `check-system-temp` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `list-processes` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `check-disk-space` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `install-tool` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `change-power-plan` | YES | `OBSERVED_EXECUTED` | same | NO | NO |
| `check-shizuku` | YES | `OBSERVED_EXECUTED` | same | NO | NO |

**All 9 actions** receive evidence classification through the compound path (attempts + finalOutcome). All successful executions get `OBSERVED_EXECUTED`. All failures get `NOT_VERIFIED`. No action can reach `VERIFIED` because:

1. No action has `verifiable: true` in its `ActionDefinition`
2. No postcondition is ever passed to `classifyEvidence()`

---

## 7. Contract Impact

Exposing evidence requires:

| Change | Required? | Scope |
|--------|-----------|-------|
| Changing `ActionResult` type | **NO** | — |
| Changing CLI serialization | **YES** | ~5 lines in `--result-json` block |
| Changing MCP adapter | **NO** | Already receives JSON from CLI |
| Adding a projection | **YES** | 3-field projection at serialization point |
| Changing evidence model | **NO** | Model is sufficient |
| Changing action registry | **NO** | — |

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `VERIFIED` always absent (no `verifiable` actions) | LOW | Expected — agent sees `OBSERVED_EXECUTED` which is truthful |
| `evidenceNote` varies by failure mode | LOW | Not exposed in minimal projection |
| `surface` always `self-action` | NONE | Not exposed — redundant |
| Evidence computed after CLI output | **MEDIUM** | The `--result-json` serialization happens BEFORE `classifyEvidence()`. The evidence record doesn't exist yet at serialization time. |

### Critical timing issue

Looking at the actual code order in `executeWithGatesInternal`:

```typescript
const result = await gate.execute(action.id, rawParams);

if (resultJsonMode) {
  console.log(toJSON({ ...result, actionId: action.id }));  // ← serializes HERE
} else {
  console.log(renderActionResult(result));
}

// ... actionHistory update ...

// Evidence classification happens AFTER serialization
classifyEvidence({ ... });
updateState({ evidence: ... });

return result;
```

**The `--result-json` serialization happens BEFORE `classifyEvidence()` is called.** The evidence record does not exist yet at the point where the CLI outputs JSON.

This means the minimal fix is NOT as simple as "attach evidenceRecord at serialization time." Either:

1. **Move `classifyEvidence()` before serialization** — but this changes execution order (evidence was designed to be "strictly AFTER gate.execute returns; never alters the execution flow")
2. **Classify early, serialize late** — compute evidence before serialization but persist after
3. **Serialize evidence separately** — return `ActionResult` first, then evidence as a second JSON object on stdout (breaking change for MCP adapter)

This is a genuine architectural constraint, not a trivial fix. The evidence system was intentionally designed to be post-execution and non-interfering.

---

## 9. Recommended Next Implementation

**Move `classifyEvidence()` to execute immediately after `gate.execute()` returns, BEFORE the CLI serialization.**

This is safe because:
- `classifyEvidence()` is pure and deterministic (no side effects)
- It doesn't modify `result` or any shared state
- It only reads from `execRecords` (already complete) and `result`
- The `updateState()` call (side effect) stays in its current position
- The existing comment "strictly AFTER gate.execute returns" is already satisfied

Then attach the 3-field projection to the `--result-json` output.

Estimated change:
- `pipeline.ts`: Move `classifyEvidence()` call up (~5 lines moved, 0 new logic)
- `pipeline.ts`: Add projection to `--result-json` block (~3 lines)
- `pipeline.test-harness.ts`: Mirror the same move (sync debt)
- Tests: Add test verifying evidence field in `--result-json` output

This preserves the architecture, uses the existing evidence model, and requires no new types.

---

## 10. Evidence Discipline

All findings verified against current repository state at `8e36515`:
- `src/core/execution-evidence.ts` — evidence types and classifier
- `src/core/pipeline.ts` — execution and evidence call site
- `src/core/types.ts` — ActionResult definition
- `integrations/mcp/buffy-mcp-server.js` — MCP adapter

No earlier reports used as evidence. Read-only audit — no commit.
