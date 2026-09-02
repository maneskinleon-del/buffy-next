# Execution Evidence Infrastructure — CLOSED

**Date:** 2026-09-02
**Branch:** `feat/mcp-integration`
**Final commit:** `4f8765e`

---

## What was built

| Round | Commit | What |
|-------|--------|------|
| MCP adapter | `c0c5d40` | Generic MCP server adapter (`integrations/mcp/`) |
| Discovery fix | `7d01b82` | `buffy_capabilities` returns real action catalog via `buffy actions --json` |
| Test fix | `d166369` | Corrected capabilities test for missing tools |
| Result preservation | `8e36515` | `--result-json` flag for structured `ActionResult` output |
| Evidence exposure | `4f8765e` | `classifyEvidence()` moved before serialization; evidence projected into `--result-json` |

## What the agent receives today

```json
{
  "success": true,
  "message": "...",
  "details": { ... },
  "actionId": "check-network",
  "evidence": {
    "level": "OBSERVED_EXECUTED",
    "observedAt": "2026-09-02T20:46:34.547Z",
    "attempts": [{ "outcome": "success", "detail": "..." }]
  }
}
```

## Evidence levels — current reachability

| Level | Reachable? | How |
|-------|-----------|-----|
| `OBSERVED_EXECUTED` | YES | All successful `buffy act` executions |
| `NOT_VERIFIED` | YES | Failed executions, gate rejections |
| `VERIFIED` | NO | Requires `verifiable: true` + independent postcondition observation |

## Future candidate: `change-power-plan` → VERIFIED

Archived at: `docs/archived/VERIFIED-EVIDENCE-FUTURE-CANDIDATE.md`

Summary: ~41-line change across 4 files. Pipeline runs `powercfg /getactivescheme` independently after execution, constructs `EvidencePostcondition` with `source: 'pipeline'`, classifier produces `VERIFIED`. Windows-only. No interface changes required.

## Audits completed

| Audit | File | Verdict |
|-------|------|---------|
| MCP usability | `MCP-USABILITY-AUDIT.md` | Discovery gap → fixed |
| Discovery fix | `MCP-DISCOVERY-FIX-REPORT.md` | PASS |
| Execution evidence gap | `EVIDENCE-EXPOSURE-AUDIT.md` | Exposure possible → implemented |
| Success semantics | `SUCCESS-SEMANTICS-AUDIT.md` | Action-dependent (diagnostic vs state-changing) |
| Verified capability | `VERIFIED-EVIDENCE-AUDIT.md` | Not achievable today |
| First verified design | `VERIFIED-EVIDENCE-FUTURE-CANDIDATE.md` | Minimal and safe (future) |

## Infrastructure status

**CLOSED.** The Execution Evidence pipeline is functional:

```
Action executor
    → ActionResult
    → classifyEvidence() (with postcondition when available)
    → ExecutionEvidenceRecord
    → --result-json (projected: level, observedAt, attempts)
    → MCP adapter (verbatim forward)
    → external agent
```

The only gap is `VERIFIED` (requires `verifiable: true` on actions). This is a catalog curation task, not an infrastructure task.
