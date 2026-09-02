# Buffy Next — MCP Agent Usability Audit

**Branch:** `feat/mcp-integration`
**Commit:** `c0c5d40`
**Date:** 2026-09-02
**Auditor:** Buffy (automated)

---

## 1. EXECUTIVE VERDICT

**READY WITH DISCOVERY GAP**

The MCP adapter works correctly at the transport and execution level. All three tools (`buffy_context`, `buffy_capabilities`, `buffy_action`) return valid responses through stdio JSON-RPC. The adapter is secure (`execFile`), has explicit timeouts, and the thin-adapter architecture is sound.

However, there is a **critical discovery gap**: `buffy_capabilities` returns a list of *installed system tools* (Node.js, npm, git, Python, Docker, ADB, curl, wget), NOT the Buffy action catalog. An external agent calling `buffy_capabilities` to discover "what Buffy can do" will learn that Node.js is installed — it will NOT learn that `check-network`, `check-gpu-driver`, or any other action exists. The only way an agent can discover available actions is from the hardcoded example list embedded in the `buffy_action` tool description, which is fragile, incomplete, and not machine-readable. This is the single blocking issue for agent discoverability.

---

## 2. CURRENT MCP SURFACE

| Tool | Description (MCP) | CLI Command | Input Schema | Output | Agent Can Discover Actions? |
|------|-------------------|-------------|-------------|--------|---------------------------|
| `buffy_context` | "Get current system context from Buffy Next. Returns structured system observation data..." | `buffy doctor --context` | `{ query: string }` (optional) | JSON: `{ schema: "buffy.context/v1", timestamp, system: {...}, observations: [...] }` | N/A (observation tool) |
| `buffy_capabilities` | "List all available Buffy actions and their security levels. Use this to discover what actions are available before calling buffy_action." | `buffy capabilities --json` | `{}` (none) | JSON array of `{ name, status, version }` for *system tools*, e.g. `[{ name: "Node.js", status: "installed", version: "v26.8.1" }, ...]` | **NO — returns wrong data** |
| `buffy_action` | "Execute a Buffy action through the ActionGate. Valid action IDs: check-gpu-driver, check-network, ..." | `buffy act <id> [args]` | `{ actionId: string, args?: string }` | CLI stdout (text or JSON depending on action) | Only from hardcoded description examples |

### `buffy_context` Output Schema

```json
{
  "schema": "buffy.context/v1",
  "timestamp": "2026-09-02T...",
  "platform": { "name": "linux", "os": "...", "version": "...", "arch": "..." },
  "system": {
    "cpu": { "cores": 16, "model": "...", "usagePercent": 5.2 },
    "memory": { "totalMB": 31911, "usedMB": 12483, "percent": 39.1 },
    "gpu": { "driver": "...", "gpu": "..." },
    "disk": [...],
    "battery": null,
    "temperature": null
  },
  "observations": [
    { "category": "cpu", "severity": "ok", "fact": "CPU usage is normal (5.2%)" },
    ...
  ]
}
```

**Agent usability: GOOD.** An agent can understand the current system state from this output.

### `buffy_capabilities` Actual Output

```json
[
  { "name": "Node.js", "status": "installed", "version": "v26.8.1" },
  { "name": "npm", "status": "installed", "version": "12.0.2" },
  { "name": "git", "status": "installed", "version": "git version 2.55.0" },
  { "name": "Python", "status": "installed", "version": "Python 3.14.7" },
  { "name": "GCC", "status": "installed", "version": "..." },
  { "name": "Make", "status": "installed", "version": "..." },
  { "name": "Docker", "status": "installed", "version": "..." },
  { "name": "ADB", "status": "installed", "version": "..." },
  { "name": "curl", "status": "installed", "version": "..." },
  { "name": "wget", "status": "installed", "version": "..." }
]
```

**Agent usability: CRITICAL FAILURE.** The description says "List all available Buffy actions and their security levels" but it returns installed system tools. Zero actions are discoverable from this output.

### `buffy_action` Error/Success Handling

- **Invalid action:** Exits non-zero, returns error message
- **Valid action:** Exits 0, returns text (e.g., `"🔧 Red funcionando correctamente (ping + DNS + gateway OK)\n✅ Listo."`)
- **No structured result envelope:** Output is raw CLI text, not structured JSON with status/evidence fields

---

## 3. AGENT DISCOVERY TEST

Simulating an external agent that has ONLY the MCP tools and no Buffy source code knowledge:

### Q1: What is Buffy?
**Answer from MCP:** The tool descriptions say "Buffy Next" and "system diagnostics and actions." The `buffy_context` tool description says "Returns structured system observation data (CPU, RAM, GPU, storage, temperature, processes, network, OS) with freshness metadata."
**Verdict: PARTIALLY discoverable.** An agent can infer Buffy is a Linux system diagnostics tool. But the README says it is also for "Windows and Android/Termux" — the MCP surface doesn't convey this.

### Q2: What capabilities does Buffy expose?
**Answer from MCP:** Call `buffy_capabilities`. Returns: Node.js installed, npm installed, git installed, Python installed, GCC installed, Make installed, Docker installed, ADB installed, curl installed, wget installed.
**Verdict: DISCOVERY FAILURE.** An agent learns nothing about Buffy's actual capabilities. It learns what system tools are installed on the machine.

### Q3: What can I ask Buffy to do?
**Answer from MCP:** The only source of action IDs is the hardcoded string in `buffy_action`'s description: `"check-gpu-driver, check-network, check-system-temp, check-disk-space, list-processes, install-tool, change-power-plan, check-shizuku, check-driver-status"`.
**Verdict: FRAGILE.** Actions are discoverable only by parsing a human-readable string embedded in a tool description. If a new action is added to the registry but the MCP adapter's `ACTION_ID_EXAMPLES` constant is not updated, the agent will never discover it.

### Q4: Which tool should I call for a given task?
**Answer from MCP:** For "check my network," an agent might try `buffy_action` with `actionId: "check-network"`. But there's no mapping from natural language to action IDs. The agent must guess from the 9 example strings.
**Verdict: WORKS WITH LUCK.** For tasks that happen to match an example ID name, trial-and-error may succeed. For tasks with non-obvious action IDs (e.g., `check-shizuku`), the agent has no guidance.

### Q5: What arguments does that tool require?
**Answer from MCP:** `buffy_action` schema says `{ actionId: string, args?: string }`. The `args` field is described as "Optional arguments for the action (e.g., tool name for 'install-tool')." This is the only hint.
**Verdict: INSUFFICIENT.** An agent doesn't know which actions accept `args`, what format they expect, or what values are valid. For `install-tool`, the agent would need to know to pass a tool name — but there's no schema or enumeration.

### Q6: What should I expect in the result?
**Answer from MCP:** The tool returns JSON with a `message` field (or parsed JSON). But the format varies by action — `check-network` returns `"🔧 Red funcionando correctamente..."`, `list-processes` returns `"🔧 15 procesos top por CPU..."`. No consistent envelope.
**Verdict: UNPREDICTABLE.** An agent cannot reliably parse action results without knowing each action's specific output format.

### Q7: How can I distinguish success from failure?
**Answer from MCP:** Error cases return `{ isError: true }` in the MCP response. Success cases return `{ isError: false/absent }`. Within the text content, `✅ Listo.` appears on success and `❌` appears on failure. But there's no structured status code or evidence field.
**Verdict: PARTIALLY WORKS.** MCP-level errors (transport failure, CLI crash) are clear. But action-level semantics (did the check find a problem? is the data stale?) are lost.

---

## 4. `buffy_capabilities` FINDING

### What it exposes

`buffy capabilities --json` calls `buffy capabilities --json` on the CLI. The CLI implementation checks which system executables are installed (Node.js, npm, git, Python, GCC, Make, Docker, ADB, curl, wget) and returns their installation status and version strings.

### What it does NOT expose

The actual Buffy action catalog, which lives in `src/actions/registry.ts` and contains 9 `ActionDefinition` objects:

| ID | Name | Level | Platforms | Reversible |
|----|------|-------|-----------|------------|
| `check-gpu-driver` | Verificar driver de GPU | auto_safe | windows, android-termux, linux | false |
| `check-driver-status` | — | auto_safe | — | — |
| `check-system-temp` | — | auto_safe | — | — |
| `list-processes` | Listar procesos activos | auto_safe | windows, android-termux, linux | false |
| `install-tool` | — | confirm | — | — |
| `change-power-plan` | — | confirm | — | — |
| `check-shizuku` | — | auto_safe | — | — |
| `check-network` | Verificar estado de red | auto_safe | windows, android-termux, linux | false |
| `check-disk-space` | — | auto_safe | — | — |

Each `ActionDefinition` has: `id`, `name`, `description`, `level` (SecurityLevel), `reversible`, `platforms` (PlatformName[]), `prerequisites`, and optionally `verifiable`.

**None of this metadata is accessible through MCP.**

### Is it sufficient?

**No.** An agent cannot derive an action plan from the capabilities output. The output answers "what system tools are installed on this machine?" — a question about the host, not about Buffy.

---

## 5. DELIVERY → EXECUTION GAP

The MCP contract currently allows distinguishing only two states:

| State | How Detected |
|-------|-------------|
| **FAILED** (transport/CLI error) | `isError: true` in MCP response |
| **OBSERVED_EXECUTED** (CLI ran, produced output) | `isError: false` + text content |

The following states are **not distinguishable** through MCP:

| State | Can MCP Express? | Where Information Is Lost |
|-------|-----------------|--------------------------|
| **VERIFIED** (result confirmed by independent re-observation) | **NO** | The `ActionDefinition.verifiable` property exists in the source (`core/types.ts:129`) but is not exposed via MCP. An agent cannot know whether a result was independently verified or merely observed. |
| **UNKNOWN_UNOBSERVABLE** (action ran but result cannot be confirmed) | **NO** | Same as above. The distinction between `verifiable: true` and `verifiable: false` actions is invisible. |
| **OBSERVED_EXECUTED vs VERIFIED** | **NO** | The MCP adapter does not propagate evidence metadata. `buffy_action` returns raw CLI stdout — no evidence envelope, no verification status. |

**Concrete example:** `check-network` returns `"🔧 Red funcionando correctamente (ping + DNS + gateway OK)"`. An agent receiving this cannot determine whether this was:
- A fresh, independently verified observation, or
- A cached/stale result, or
- An optimistic report from a check that didn't actually probe the network

The `verifiable` property on `ActionDefinition` is the mechanism designed to express this, but it's not surfaced through MCP.

---

## 6. MINIMUM FIX

The smallest change that makes Buffy MCP genuinely discoverable and agent-usable:

**Add a new CLI command `buffy actions --json` that returns the action catalog from `src/actions/registry.ts`, and expose it through MCP as the real implementation of `buffy_capabilities`.**

This is a 3-part change:

### Part 1: CLI addition (`src/cli.ts`)
Add a `buffy actions --json` subcommand that calls `getAllActions()` and serializes the `ActionDefinition[]` array to JSON. This is ~15 lines of code.

### Part 2: MCP adapter update (`integrations/mcp/buffy-mcp-server.js`)
Change `buffy_capabilities` to call `buffy actions --json` instead of `buffy capabilities --json`. Zero architecture change — still thin adapter → CLI → core.

### Part 3: Leave `buffy capabilities --json` as-is
The system-tool check is useful for other purposes. Don't remove it. Just stop using it as the action discovery mechanism.

**Why this is the minimum:**
- It addresses the single blocking issue (discovery gap)
- It preserves the architecture (MCP → CLI → core)
- It adds zero MCP-level schema changes
- It adds ~15 lines to the CLI, ~2 lines to the adapter
- It exposes existing, validated metadata (`ActionDefinition`) that already includes: `id`, `name`, `description`, `level`, `reversible`, `platforms`, `prerequisites`, `verifiable`
- An agent calling `buffy_capabilities` would then receive the full action catalog with security levels, platform constraints, and verification semantics

---

## 7. OPTIONS COMPARISON

### Option A: Improve only `buffy_capabilities` (CLI-side)

| Dimension | Assessment |
|-----------|-----------|
| Implementation | ~15 lines in `cli.ts` + ~2 lines in adapter |
| Architectural impact | None — same thin adapter pattern |
| Backwards compatibility | `buffy capabilities --json` output changes; callers expecting system-tool list will break |
| Test burden | Low — add one CLI test, update adapter test |
| Agent discoverability | **HIGH** — full catalog with metadata |
| Truthfulness | **HIGH** — single source of truth (`ActionDefinition[]`) |
| Duplication risk | **NONE** — adapter stays thin, catalog lives in core |

### Option B: Add `buffy actions --json` as new command + expose via MCP

| Dimension | Assessment |
|-----------|-----------|
| Implementation | ~15 lines in `cli.ts` + ~2 lines in adapter (same as A, but keeps `capabilities` unchanged) |
| Architectural impact | None |
| Backwards compatibility | **BEST** — `buffy capabilities --json` unchanged, new command added |
| Test burden | Low |
| Agent discoverability | **HIGH** |
| Truthfulness | **HIGH** |
| Duplication risk | **NONE** |

### Option C: Modify MCP tool descriptions/schemas only

| Dimension | Assessment |
|-----------|-----------|
| Implementation | Update description strings in `buffy-mcp-server.js` |
| Architectural impact | None |
| Backwards compatibility | Best — no CLI change |
| Test burden | Zero |
| Agent discoverability | **LOW** — still can't discover actions programmatically; agent must parse free text |
| Truthfulness | **LOW** — description could list all 9 IDs, but that's fragile and not machine-readable |
| Duplication risk | **HIGH** — action catalog duplicated as hardcoded string in adapter |

### Option D: Add a `buffy_help` MCP tool that returns a curated agent-facing summary

| Dimension | Assessment |
|-----------|-----------|
| Implementation | ~30 lines in adapter + ~15 lines in CLI |
| Architectural impact | Adds a new tool surface |
| Backwards compatibility | Good — additive |
| Test burden | Medium — new tool needs tests |
| Agent discoverability | **MEDIUM** — human-readable but not structured |
| Truthfulness | Depends on whether it reads from the registry |
| Duplication risk | **MEDIUM** — risk of maintaining a parallel summary |

### Recommendation

**Option B** is the smallest, safest, most truthful solution. It adds a new CLI command (`buffy actions --json`), wires it into the existing `buffy_capabilities` MCP tool, preserves backwards compatibility, and exposes the real `ActionDefinition` catalog with zero architectural changes.

---

## 8. IMPLEMENTATION GATE

**PROCEED — implement the minimum fix**

The discovery gap is real, blocking, and has a clear, low-risk fix: add `buffy actions --json` to the CLI and rewire `buffy_capabilities` to use it. This is the prerequisite for any meaningful agent discoverability test.

---

## 9. EVIDENCE

### Commands Executed

```bash
# CLI capabilities output
node dist/cli.js capabilities --json
# Returns: array of 10 system tools (Node.js, npm, git, Python, GCC, Make, Docker, ADB, curl, wget)
# NOT action catalog

# Real action execution
node dist/cli.js act check-network
# Returns: "🔧 Red funcionando correctamente (ping + DNS + gateway OK)"

node dist/cli.js act list-processes
# Returns: "🔧 15 procesos top por CPU: systemd(0%/14MB)..."

# Invalid action
node dist/cli.js act invalid-action-nonexistent
# Returns: exit code 1, error message
```

### Files Inspected

| File | Key Finding |
|------|-------------|
| `integrations/mcp/buffy-mcp-server.js` | 3 tools: buffy_context, buffy_capabilities, buffy_action. Clean adapter. |
| `integrations/mcp/README.md` | Documents the debt. |
| `src/actions/registry.ts` | 9 `ActionDefinition` objects with `id`, `name`, `description`, `level`, `reversible`, `platforms`, `prerequisites`, `verifiable`. |
| `src/actions/catalog/check-network.ts` | Example action: `{ id: 'check-network', name: 'Verificar estado de red', level: 'auto_safe', platforms: ['windows', 'android-termux', 'linux'] }` |
| `src/actions/catalog/check-gpu-driver.ts` | Example action: `{ id: 'check-gpu-driver', name: 'Verificar driver de GPU', level: 'auto_safe' }` |
| `src/actions/catalog/list-processes.ts` | Example action: `{ id: 'list-processes', name: 'Listar procesos activos', level: 'auto_safe' }` |
| `src/core/types.ts` | `ActionDefinition` interface (lines 115-130): includes `verifiable?: boolean` with documentation about evidence ceiling. `SecurityLevel = 'auto_safe' | 'confirm' | 'forbidden'`. `PlatformName = 'windows' | 'android-termux' | 'linux'`. |
| `src/cli.ts` | Imports `findActionById` from `./actions/registry.js`. No `actions --json` command exists. |
| `src/tool.ts` | Imports `getActionIds` from `./core/action-registry.js` — a separate registry (known debt). |

### Tests Executed

- CLI smoke test: 5/5 PASS (via `integrations/mcp/smoke.sh`)
- Direct MCP protocol test: 6/6 PASS (via `test-mcp-direct.mjs`)
- Full test suite: 607/607 PASS (via `npm test`)
- Typecheck: PASS (via `npm run typecheck`)
- Build: PASS (via `npm run build`, 135.7kb output)

### Commit/Ref

- Branch: `feat/mcp-integration`
- HEAD: `c0c5d40`
- Remote: `https://github.com/maneskinleon-del/buffy-next.git`
- Base: `e4a9354`

### Key Discovery

The `ActionDefinition` interface already has a `verifiable?: boolean` property (types.ts:129) with the comment:

> "Whether the action's expected postcondition is independently observable via adapter re-observation (ExecutionEvidence VERIFIED path). When false or absent, the evidence ceiling is OBSERVED_EXECUTED — a property of the action, not an evidence-system bug."

This means the evidence semantics are already modeled in the core. They just aren't surfaced through MCP. The fix (Option B) would expose this metadata, allowing an agent to distinguish VERIFIED from OBSERVED_EXECUTED actions.
