# Buffy Next — agent contract (compact)

Buffy Next = **environment specialist for AI agents**: observes the live
system, diagnoses problems, executes authorized actions. It is not the main
agent, not a model, not memory, not a general shell.

**Use for:** current system state, hardware, available capabilities,
freshness-aware observations, diagnostics, authorized system actions.

**Never for:** codebase exploration, general reasoning, persistent project
memory, arbitrary shell execution.

**Interfaces:**

- context → `buffy doctor --context` → `buffy.context/v1` JSON (platform,
  hardware, tools, privileges, freshness)
- capabilities → `buffy capabilities --json`
- action → `buffy act <action-id> [args]` (MCP: `buffy_context`,
  `buffy_capabilities`, `buffy_action`)

**Safety:** all physical actions pass through ActionGate
(`auto_safe` | `confirm` | `forbidden`). Authorized catalog actions only —
never a shell. Buffy observes and recommends; the agent reasons and decides.
