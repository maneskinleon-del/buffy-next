# Buffy Next — Success Semantics Audit

**Date:** 2026-09-02
**Branch:** `feat/mcp-integration`
**HEAD:** `8e36515`

---

## 1. Verdict

**SEMANTICS ACTION-DEPENDENT**

`ActionResult.success` does not have a single universal meaning across all 9 actions. It represents two distinct concepts depending on the action category:

- **Diagnostic/check actions** (6 of 9): `success` means "the check completed without crashing." The actual domain result (network healthy, driver good, temperature normal) lives in `details`, not in `success`.
- **State-changing actions** (3 of 9): `success` means "the intended effect was achieved." The domain result IS the success value.

There is no documentation defining this contract. The distinction is implicit in the executor implementations.

---

## 2. Canonical meaning

The strongest meaning that can safely be assigned to `ActionResult.success` based strictly on the code:

> **"The executor completed its execution path without throwing an unhandled exception."**

This is equivalent to:

> B. executor completed without throwing

It is NOT equivalent to:

- D. requested condition was observed
- E. intended external effect was verified

For diagnostic actions, the domain result is in `details`, not in `success`. For state-changing actions, `success` happens to align with the domain result, but this is a coincidence of implementation, not a guaranteed contract.

---

## 3. Action matrix

| Action | `success=true` means | `details` contains domain result? | `details.ok` exists? | Independent effect verification? |
|--------|---------------------|----------------------------------|---------------------|--------------------------------|
| `check-network` | Check completed (outer try didn't throw) | YES — `results[]`, `ok`, `failed` | **YES** | NO |
| `check-gpu-driver` | Check completed | YES — `gpuName`, `driverVersion`, `isGeneric` | NO (uses `isGeneric`) | NO |
| `check-driver-status` | Check completed | YES — `raw`, `isGeneric` | NO (uses `isGeneric`) | NO |
| `check-system-temp` | Check completed | YES — `celsius`, `severity`, `available` | NO (uses `available`) | NO |
| `list-processes` | Check completed | YES — `count`, `processes[]` | NO | NO |
| `check-disk-space` | Check completed | YES — `mount`, `totalGB`, `freeGB`, `usedPercent`, `severity` | NO (uses `severity`) | NO |
| `install-tool` | **Tool was installed** | YES — `tool`, `platform` | NO | NO |
| `change-power-plan` | **Power plan changed to high-performance** | YES — `active`, `previous` | NO | NO |
| `check-shizuku` | **Shizuku responded successfully** | YES — `uid`, `identity`, `rawOutput` | NO | NO |

### Key pattern

For the 6 diagnostic actions, `success` is always `true` inside the outer try block. The actual diagnostic result (healthy/unhealthy, generic/official, available/unavailable) is encoded in `details`, not in `success`.

For the 3 state-changing actions, `success` reflects whether the intended state change actually occurred.

---

## 4. `check-network` finding

### Why `success: true` + `details.ok: false` occurs

The executor has two layers:

```typescript
try {
  // Outer try: if this completes, success = true
  const results = [];

  // Individual checks — each has its own try/catch
  try { execSync('ping ...'); results.push({ok: true}); }
  catch { results.push({ok: false}); }

  try { execSync('nslookup ...'); results.push({ok: true}); }
  catch { results.push({ok: false}); }

  try { execSync('ip route ...'); results.push({ok: hasGateway}); }
  catch { results.push({ok: false}); }

  const failed = results.filter(r => !r.ok);
  const ok = failed.length === 0;

  return {
    success: true,              // ← always true if outer try completes
    message: ok ? 'Red funcionando correctamente...' : 'Problemas de red detectados...',
    details: { results, ok, failed: failed.length },
  };
} catch (error) {
  return { success: false, message: 'Error verificando red: ...' };
}
```

`success: true` means "all three checks ran and produced results" — not "all checks passed."

`details.ok: false` means "one or more checks failed" — the actual network health.

This is **intentional**. The executor separates "could I run the checks?" from "did the checks pass?" But this distinction is invisible to an agent that only reads `success`.

### Which field answers "is the network healthy?"

**`details.ok`**, not `success`.

An agent reading only `success: true` would incorrectly conclude the network is healthy when it might not be.

---

## 5. Agent interpretation

### If an external agent receives `success: true`, what may it safely conclude?

> "The executor completed its execution path without throwing an unhandled exception."

That is ALL it may conclude. Specifically:

- For diagnostic actions: the checks ran. The domain result is in `details`.
- For state-changing actions: the intended effect was achieved. (But this is action-specific, not a universal contract.)

### What may it NOT conclude?

- "The network is healthy" — `success: true` does not mean this
- "The GPU driver is official" — `success: true` does not mean this
- "The temperature is normal" — `success: true` does not mean this
- "All checks passed" — `success: true` does not mean this

The agent must inspect `details` to determine the domain result.

---

## 6. Contract gap

There are three distinct concepts that are currently conflated under `success`:

| Concept | Where it lives | Currently called |
|---------|---------------|-----------------|
| **Execution success** — the executor ran without crashing | `ActionResult.success` (for all 9 actions) | `success` |
| **Domain success** — the intended condition was observed/achieved | `details.ok` / `details.isGeneric` / `details.severity` / etc. (action-specific) | scattered across `details` fields |
| **Verified effect** — the outcome was confirmed by independent observation | Nowhere | not implemented |

The gap: an agent receiving `success: true` cannot distinguish "executor ran" from "condition is true" without inspecting `details`. And even `details` only reports what the executor observed — not what was independently verified.

### Specific contradictions

| Case | `success` | `details` | Agent's likely (wrong) conclusion |
|------|-----------|-----------|----------------------------------|
| Network has no DNS | `true` | `ok: false, failed: 1` | "Network is healthy" |
| GPU uses generic driver | `true` | `isGeneric: true` | "Driver is OK" |
| Temperature unavailable | `true` | `available: false` | "Temperature is normal" |
| Disk at 95% usage | `true` | `severity: 'crítico'` | "Disk is fine" |

---

## 7. Recommendation

The minimum architectural recommendation for the next phase:

**Do not change `ActionResult.success`.** It is used by the pipeline, state persistence, and evidence system. Changing its semantics would be a breaking change.

Instead, the next implementation phase should:

1. **Define a canonical `domainResult` field** (or equivalent) on `ActionResult` that explicitly expresses the domain-level outcome, separate from execution status. This would be the field agents should inspect.

2. **Populate it consistently** across all 9 actions. For diagnostic actions, it would encode the health check result. For state-changing actions, it would mirror `success`.

3. **Surface it through MCP** so agents receive both `success` (execution status) and `domainResult` (domain outcome) as separate, clearly labeled fields.

This preserves backwards compatibility while giving agents an unambiguous signal for domain questions.

---

## 8. Evidence discipline

All findings in this report are sourced from:

- `src/core/pipeline.ts` — executor implementations (lines 65-344)
- `src/core/types.ts` — `ActionResult` interface (line 132)
- `src/core/action-gate.ts` — gate rejection paths
- `src/core/presenter.ts` — rendering (reads `success`, doesn't modify)
- `src/cli.ts` — CLI passes `success` through without modification
- `integrations/mcp/buffy-mcp-server.js` — MCP adapter receives JSON from CLI

No earlier agent reports were used as evidence. Every claim was verified against the current repository state at commit `8e36515`.

**This round is read-only. No commit required.**
