# E2-F1 Selection: Gate Analysis

## Results Summary

| Condition | T1 | T2 | T3 | T4 | T5 | Mean | Ctx Size | Reduction |
|-----------|----|----|----|----|----|----|----------|-----------|
| Full | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **1.00** | 4,801B | baseline |
| Task-adaptive | 1.00 | 0.89 | 1.00 | 1.00 | 1.00 | **0.98** | ~1,117B | **77%** |
| Minimal | 1.00 | 1.00 | 1.00 | 1.00 | 0.75 | **0.95** | ~169B | **96%** |
| High-value | 0.00 | 0.89 | 1.00 | 1.00 | 0.83 | **0.74** | 342B | 93% |

## Latency

| Condition | Mean | Min | Max |
|-----------|------|-----|-----|
| Full | 3,673ms | 1,549 | 9,168 |
| Task-adaptive | 3,072ms | 1,307 | 8,796 |
| Minimal | 2,983ms | 1,776 | 9,216 |
| High-value | 2,276ms | 1,422 | 4,950 |

## Gate Results

### Gate 1: Full vs High-value

```
Full (1.00) > High-value (0.74)  →  Δ = +0.26
```

**Interpretation**: High-value (OS/kernel + RAM + Disk) is NOT sufficient as a fixed subset. The missing GPU info causes T1 to score 0.0 (model correctly says "not in facts" — respecting context boundary, but user doesn't get the answer).

**Verdict**: ❌ Some additional fields matter for certain tasks.

### Gate 2: Task-adaptive vs High-value

```
Task-adaptive (0.98) > High-value (0.74)  →  Δ = +0.24
```

**Interpretation**: Selecting fields per task produces near-full accuracy. The dynamic selector adds real value over a fixed subset.

**Verdict**: ✅ Evidence for task-specific selector.

### Gate 3: Task-adaptive vs Full

```
Full (1.00) ≈ Task-adaptive (0.98)  →  Δ = +0.02
```

**Interpretation**: Task-adaptive achieves 98% of Full accuracy with 77% less context.

**Verdict**: ✅ Context is reducible with task-adaptive selection.

### Gate 4: Minimal vs Task-adaptive

```
Task-adaptive (0.98) > Minimal (0.95)  →  Δ = +0.03
```

**Interpretation**: Minimal loses slightly on T5 (diagnosis needs more context). But 95% with 96% reduction is remarkable.

**Verdict**: ⚠️ Minimal is close but loses on complex tasks.

## Key Findings

### 1. The "right" fixed subset doesn't exist

High-value (OS/kernel + RAM + Disk) was our best guess from E1 ablation. It fails because:
- T1 needs GPU (not in High-value)
- T5 needs broader context for diagnosis

**No single fixed subset works for all tasks.**

### 2. Task-adaptive is the winner

- 98% accuracy (vs 100% Full)
- 77% context reduction (4,801B → ~1,117B)
- 16% latency reduction (3,673ms → 3,072ms)

### 3. Minimal has a use case

- 95% accuracy with 96% reduction
- Works well for simple factual tasks (T1-T4)
- Fails on complex diagnosis (T5)

**Use case**: Quick factual queries where latency matters more than completeness.

### 4. Model respects context boundaries

When GPU info is missing (High-value T1), the model says "not in facts" instead of hallucinating. This is the correct behavior per our instructions and confirms E1 finding: the model uses context appropriately.

## Recommendation for Buffy Architecture

```text
                    Buffy Context
                         │
             ┌───────────┴───────────┐
             │                       │
        task-adaptive            minimal
        (complex tasks)          (simple queries)
             │                       │
      select fields             single field
      per task type             per question
             │                       │
             ▼                       ▼
        ~1,100B                  ~170B
        98% accuracy            95% accuracy
```

**Primary mode**: Task-adaptive selection
**Fast mode**: Minimal for simple factual queries
**Full context**: Only when task type is unknown or diagnosis is complex

## What Changed vs E1

E1 said: "OS/kernel is the most important field"
E2-F1 says: **"Importance depends on the task. No single field is universally most important."**

This is a stronger, more nuanced result.
