# Buffy Next — Operations Runbook

## 1. Health Check

### Command

```bash
buffy health
```

### Output

```
🏥 Buffy Health Status

  Platform: linux
  Adapter: LinuxAdapter
  Version: 2.4.0

  Subsystems:
    Observation: ✅
    Freshness: ✅
    Actions: ✅
    State: ✅

  Metrics:
    Total requests: 25
    Total errors: 0
    Stale rate: 0.0%
    Avg latency: 138ms
```

### Interpretation

| Subsystem | Status | Meaning |
|-----------|--------|---------|
| Observation | ✅ | Adapter can read system data |
| Freshness | ✅ | Freshness policy working |
| Actions | ✅ | Action registry loaded |
| State | ✅ | State file accessible |

**Critical condition:** If `Observation` or `Freshness` is ❌, exit with code 1.

---

## 2. Metrics

### Command

```bash
buffy metrics
```

### Output

```
📊 Buffy Metrics

  Total requests: 25
  Avg latency: 138ms
  P50 latency: 133ms
  P95 latency: 164ms
  Avg context bytes: 1024
  Stale fields detected: 0
  Refresh requested: 0
  Refresh success: 0
  Refresh rate: N/A%

  Freshness patterns:
    Stale rate: 0.0%

  Errors: 0
```

### Interpretation

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Stale rate | < 10% | 10-30% | > 30% |
| Refresh success | ≥ 95% | 90-95% | < 90% |
| Avg latency | < 500ms | 500-1000ms | > 1000ms |
| P95 latency | < 1000ms | 1000-2000ms | > 2000ms |
| Errors | 0 | 1-5 | > 5 |

---

## 3. Diagnose

### Command

```bash
buffy diagnose "your question"
```

### Pilot Mode

```bash
buffy diagnose "your question" --pilot
```

**Output includes:**
- Diagnostic response
- Pilot audit summary (fields, stale, refresh, latency, context bytes)

### JSON Mode

```bash
buffy diagnose "your question" --json
```

---

## 4. Pilot / Normal Mode

### Normal Mode

```bash
buffy diagnose "query"
```

- No telemetry recorded
- No audit trail
- Fastest execution

### Pilot Mode

```bash
buffy diagnose "query" --pilot
```

- Records request metrics to telemetry
- Shows audit summary
- Enables health/metrics commands

**When to use pilot:**
- Initial deployment
- Validation phases
- Debugging issues

**When to use normal:**
- Production with established baseline
- Performance-critical paths

---

## 5. Logs / Audit Trail

### Audit Trail Fields

Each `diagnose()` response includes:

```typescript
interface AuditTrail {
  selectedFields: string[];      // Fields selected for context
  staleFields: string[];         // Fields detected as stale
  refreshRequired: string[];     // Fields needing refresh
  refreshPerformed: string[];    // Fields actually refreshed
  latencyMs: number;             // Total latency
  contextBytes: number;          // Context size
  finalCorrect: boolean;         // Response correctness
  unsupportedClaims: number;     // Claims without evidence
}
```

### State File

Location: `~/.buffy/state.json`

Contains:
- Last scan timestamp
- Platform info
- Action history

---

## 6. Error Detection

### How to detect errors

1. **Check health:** `buffy health` — look for ❌ subsystems
2. **Check metrics:** `buffy metrics` — look for errors > 0
3. **Check telemetry:** Review `ErrorRecord` entries in memory
4. **Check audit trail:** Look for `unsupportedClaims > 0`

### Error Taxonomy

| Category | Description | Action |
|----------|-------------|--------|
| OBSERVATION_ERROR | Failed to read system data | Retry adapter call |
| FRESHNESS_ERROR | Failed to classify freshness | Use default freshness |
| REFRESH_ERROR | Failed to refresh stale data | Mark needsRefresh |
| SELECTION_ERROR | Failed to select checks | Use default checks |
| CONTEXT_ERROR | Failed to build context | Return error to caller |
| MODEL_ERROR | Model returned invalid response | Log + return error |
| PLATFORM_ERROR | Platform-specific failure | Log + use fallback |
| EXECUTION_ERROR | Failed to execute action | Log + return error |

---

## 7. Freshness Interpretation

### Epistemic States

| State | Meaning | Action |
|-------|---------|--------|
| `observed` | Fresh measurement, within TTL | Include in context |
| `stale` | Measurement exceeded TTL | Refresh if relevant |
| `unknown` | Could not obtain data | Omit from context |

### Freshness Policy

| Category | TTL | Volatility |
|----------|-----|------------|
| cpu | 60s | medium |
| memory | 30s | high |
| gpu | 300s | low |
| temperature | 30s | high |
| processes | 30s | high |
| storage | 3600s | very-low |
| network | 60s | medium |

### Refresh Failures

When refresh fails:
1. Field is marked `needsRefresh`
2. Field is NOT included as current
3. Failure is recorded in audit trail
4. User sees `freshness: "stale"` in context

---

## 8. UNKNOWN Diagnosis

### When UNKNOWN occurs

- Adapter cannot read specific data
- Permission denied
- File not found
- Command failed

### How to diagnose

1. Check adapter implementation
2. Verify permissions (e.g., `/sys/class/thermal` requires root on some systems)
3. Check if command exists (e.g., `lspci` for GPU)
4. Review adapter logs

### Resolution

- UNKNOWN is **omitted** from context (never fabricated)
- This is correct behavior — better to have no data than wrong data
- Fix: address root cause in adapter

---

## 9. Adapter Failure Detection

### Symptoms

- `Observation` subsystem shows ❌ in health check
- Specific categories return UNKNOWN
- Latency spikes for specific queries

### Diagnosis

1. Check adapter-specific logs
2. Verify platform detection: `buffy doctor --json | grep platform`
3. Test adapter directly: `buffy capabilities`
4. Check system permissions

### Resolution

1. **Permission issue:** Grant required permissions
2. **Missing command:** Install required tool
3. **Platform mismatch:** Verify correct adapter is selected
4. **Adapter bug:** Report with reproduction steps

---

## 10. Regression Gate

### Mandatory Checklist

Every change must pass ALL of the following:

```bash
# 1. All tests pass
npm test
# Expected: 569/569 passed

# 2. No stale relevant sent as current
# (verified via freshness-gating tests)
npx vitest run tests/freshness-gating.test.ts
# Expected: stale relevant → current = 0

# 3. UNKNOWN integrity preserved
# (verified via external-validation tests)
npx vitest run tests/external-validation.test.ts
# Expected: UNKNOWN never treated as factual

# 4. Refresh success >= 95%
# (verified via production-integration tests)
npx vitest run tests/production-integration.test.ts
# Expected: refresh success >= 95%

# 5. No adapter corruption
# (verified via cross-platform tests)
npx vitest run tests/cross-platform-validation.test.ts
# Expected: all platforms pass

# 6. Audit trail complete
# (verified via observability tests)
npx vitest run tests/observability.test.ts
# Expected: all audit fields present
```

### Gate Result

If ANY check fails:

```
CHANGE = BLOCKED
```

Do not proceed. Fix the failure first.

---

## 11. Failure Policy

### When a new failure occurs

```
NEW FAILURE
    ↓
capture evidence
    ↓
classify
    ↓
reproduce
    ↓
determine root cause
    ↓
minimal fix
    ↓
regression tests
```

### Rules

1. **Never resolve failures via silent behavior changes**
   - Document the failure
   - Classify it
   - Fix with minimal, targeted change
   - Add regression test

2. **Preserve evidence**
   - Keep raw output
   - Record environment
   - Note platform/model/version
   - Save exact reproduction steps

3. **Classify before fixing**
   - Is it a Buffy bug?
   - Is it a platform limitation?
   - Is it a model issue?
   - Is it expected behavior?

4. **Minimal fix**
   - Change only what's necessary
   - Don't refactor while fixing
   - Don't add features while fixing
   - One fix per failure

5. **Regression test**
   - Add test that reproduces the failure
   - Verify fix passes the test
   - Verify existing tests still pass

### Prohibited

- ❌ Changing behavior to hide the failure
- ❌ Adding try/catch that swallows errors
- ❌ Changing thresholds to make failure go away
- ❌ Removing tests that fail
- ❌ "Fixing" by changing the expected output

---

## 12. Troubleshooting

### "Stale rate is high"

1. Check freshness policy TTLs
2. Verify adapter is returning fresh timestamps
3. Check if queries are slow (causing staleness)
4. Review `FreshnessInstrumentation` in audit trail

### "Refresh fails repeatedly"

1. Check adapter connectivity
2. Verify system permissions
3. Check for platform-specific issues
4. Review error taxonomy for specific category

### "UNKNOWN for specific field"

1. Check adapter implementation for that field
2. Verify system has the data available
3. Check permissions (e.g., thermal zone access)
4. Test adapter directly

### "Latency is high"

1. Check adapter performance (systemInfo() call time)
2. Review freshness gating overhead
3. Check context size (contextBytes)
4. Profile specific stages

### "Audit trail incomplete"

1. Verify telemetry is enabled (pilot mode)
2. Check memory limits (1000 records per category)
3. Review error records for failures

---

## 13. Maintenance

### Regular checks

- [ ] Weekly: `buffy health` + `buffy metrics`
- [ ] Monthly: Review error taxonomy trends
- [ ] Quarterly: Review freshness policy thresholds

### When to investigate

- Stale rate > 10% for extended period
- Refresh success < 95%
- New error categories appearing
- Latency growing over time

### When to escalate

- Any CRITICAL condition in health check
- Data corruption (wrong values in context)
- Security boundary violation
- Reproducible crash
