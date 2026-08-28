# E4.2 — External Validation Results

## Execution Date

2026-08-28

## Scenario

Real-world stale detection: fresh → system changes → stale → query → detect → refresh

## Tests

| Test | Status |
|------|--------|
| detect stale data using applyFreshnessGating directly | ✅ |
| not send stale data as fresh to the model | ✅ |
| maintain fresh context behavior when data is current | ✅ |
| handle rapid successive queries correctly | ✅ |
| include freshness metadata in context output | ✅ |
| detect staleness after time passes | ✅ |

## Key Test: Real-world Stale Detection

```typescript
// Create stale observation (from T+0, 5 minutes ago)
const staleObservation: CheckResult = {
  id: 'ram-status',
  category: 'RAM',
  severity: 'warning',
  message: 'RAM: 8 GB disponibles (50% usado)',
  observedAt: '2026-08-28T12:00:00.000Z', // 5 minutes ago
  source: 'LinuxAdapter.systemInfo.memory',
};

// Apply freshness gating
const result = await applyFreshnessGating([staleObservation], selection, adapter);

// Assertions
expect(result.instrumentation[0].epistemicStateBefore).toBe('stale');
expect(result.instrumentation[0].refreshRequired).toBe(true);
expect(result.instrumentation[0].refreshPerformed).toBe(true);
expect(result.instrumentation[0].epistemicStateAfter).toBe('observed');
expect(result.instrumentation[0].includedInContext).toBe(true);
```

## Metrics

| Metric | Value |
|--------|-------|
| Total tests | 528 |
| Passed | 528 |
| Failed | 0 |
| Stale sent as fresh | 0 |
| Refresh success rate | 100% |

## Verdict

### ✅ PASS

All criteria met:
- 0 cases of stale relevant data sent as fresh
- Refresh mechanism works correctly
- Fresh context behavior maintained
- No regressions

## Architecture Validated

```
Observation (may be stale from cache/previous call)
    ↓
Freshness classification (classifyEpistemicState)
    ↓
Task-adaptive selection (what's relevant)
    ↓
STALE + relevante?
   ├── NO → excluir
   └── SÍ → refresh on-demand
              ↓
          nueva Observation (fresh)
              ↓
            Compact
              ↓
            Model (receives fresh data)
```

## Files

- `tests/external-validation.test.ts` — 6 integration tests
- `EXTERNAL-VALIDATION.md` — This file
