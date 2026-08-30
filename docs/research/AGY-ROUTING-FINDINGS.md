# Agy Routing Experiment — Findings

**Date:** 2026-08-29
**Harness:** Agy (Gemini CLI / Antigravity 3.x)
**Evidence repo:** `https://github.com/maneskinleon-del/agy-routing-experiment` (commit `eefc310`)

---

## Abstract

T0–T4 experiment established that the *effective routing surface* for tool
selection is not the MCP registration, nor the lazy skill — it is the active
instruction surface (`AGENTS.md` at project root) injected into the agent's
context on every load.

## Result Matrix

| Test | MCP | Skill lazy | Regla activa | Selection | Execution |
| ---- | --: | ---------: | -----------: | --------: | --------- |
| T0   | ❌  | ❌         | ❌           | ❌        | `run_command` |
| T1   | ❌  | ✅         | ❌           | ❌        | `run_command` |
| T2   | ✅  | ❌         | ❌           | ❌        | `run_command` |
| T3   | ✅  | ✅         | ❌           | ❌        | `run_command` |
| T4   | ✅  | ❌         | ✅           | ✅        | `buffy_context` |

## Findings

1. **MCP registration** = mechanical presence. The tools exist and are
   invocable, but the agent does not select them spontaneously during a
   diagnostic task.

2. **Lazy skill** (`.agents/skills/<name>/SKILL.md`) = comprehension on
   demand. When asked directly, the agent reads and describes the skill
   accurately — but it does *not* load the full content spontaneously in a
   real task (progressive disclosure: only `name` + `description` are
   injected; full content requires an explicit `Read`).

3. **Active routing rule** (`AGENTS.md`) = routing in the moment of
   decision. When a minimal imperative rule was placed in `AGENTS.md`, the
   agent reproduced it verbatim and in T4 explicitly cited it as its
   reason for choosing `buffy_context` over `run_command`.

## What is demonstrated / not demonstrated

- **Demonstrated (Agy only):** `AGENTS.md` active rule modifies tool
  selection; lazy skill does not activate spontaneously; MCP alone does not
  produce selection.
- **Not established:** that all harnesses require an active surface
  equivalent to `AGENTS.md`.
- **Hypothesis:** each harness has its own effective routing surface, which
  must be discovered and verified experimentally.

## Principle (candidate theory)

```
AUTOREPORT   → candidate hypothesis
MECHANICAL PROBE → verified surface
BEHAVIORAL PROBE → effective routing behavior
```

`candidate ≠ verified`. Self-reported agent configuration is unreliable
(twice in this experiment: `settings.json` vs the real `mcp_config.json`;
`.agents/` root vs `.agents/skills/<name>/SKILL.md`).

## Scope limitation

N=1 harness (Agy). N=1 per phase. Same model throughout (Gemini 3.7 Flash).
**Do not** generalize "active routing = AGENTS.md" to a universal rule
without per-harness verification.