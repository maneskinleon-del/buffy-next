# AUDIT — Execution Safety + Context Integrity
## Buffy Next | Focused Audit

**Date:** 2026-08-27
**Auditor:** Agent (static analysis, no live exploits)
**Scope:** `rawParams → shell` + `Observation → freshness`
**Rule:** No modifications, no commits, no live payloads.

---

## 1. Executive Verdict

```
Execution Safety:  SAFE_WITH_GUARD ⚠️
Context Integrity: INCOMPLETE ❌
```

### Execution Safety — SAFE_WITH_GUARD

The `rawParams` path is guarded by `sanitizeTarget()` (target-normalizer.ts:13), which strips shell metacharacters before the value reaches `execSync` concatenation. This is effective against command injection attempts. However, the guard is a **denylist-by-stripping** rather than an allowlist of known-valid package names, and there is **no sudoers validation** before `sudo` is invoked. The overall risk is low for accidental misuse, but the design relies on stripping rather than safe construction.

### Context Integrity — INCOMPLETE

`Observation` (types.ts:228) has **no** `observedAt`, `age_ms`, `freshness`, `source`, or `provenance` fields. Individual `CheckResult` objects (the older diagnostic type) also lack timestamps. The only temporal metadata in the system is `DoctorReport.timestamp` (a single top-level ISO string). This means every fact in the context package is timestamped only by the moment the report was generated — not by when each individual measurement was taken. The agent cannot distinguish a RAM reading taken 30 seconds ago from one taken 3 hours ago.

---

## 2. Execution Trace

```
caller (CLI / MCP / external agent)
  │
  │ process.argv[1] = "install-tool"
  │ rawParams       = "node" (string, no validation at call site)
  ▼
src/cli.ts:148  cmdAct()
  │ actionId  = "install-tool"  (looked up in registry — hardcoded set)
  │ rawParams = "node"          (passed through unchanged)
  ▼
src/core/pipeline.ts:409  executeWithGates()
  │ destructures { rawParams }
  │ calls assertNoDisallowedFields()  ← checks no test-only fields injected
  ▼
src/core/pipeline.ts:415  executeWithGatesInternal()
  │ actionDefs = getAllActions()     ← hardcoded ActionDefinition[]
  │ registry   = buildRegistry()     ← private executor map
  ▼
src/core/action-gate.ts:80  gate.execute("install-tool", "node")
  │
  ├─ action = registry.get("install-tool")   ← ActionDefinition (metadata only)
  ├─ level  = classifyAction(action)         ← "confirm"
  ├─ FORBIDDEN check: isForbidden(action)    ← false for install-tool
  ├─ request = normalizeTarget("install-tool", "node", "windows")
  │
  │   src/core/target-normalizer.ts:36  normalizeTarget()
  │     sanitized = sanitizeTarget("node")
  │       → "node"  (only \w, ., -, _ pass through)
  │     returns CanonicalRequest { requestId, actionId, target: "node", platform }
  │
  ├─ validateAction(action, "windows")   ← platform check: pass
  ├─ checkPrerequisites(action, [], {}) ← no prerequisites: pass
  ├─ requiresAuth(action)               ← true (level = "confirm")
  ├─ promptUser()                       ← prompts for "sí"/"si"/"y"
  ├─ authStore.issue()                   ← issues single-use token
  ├─ authStore.claim()                   ← claims token
  ├─ execStore.start()                   ← starts execution record
  │
  ▼
src/core/pipeline.ts:69  execInstallTool(request, adapter)
  │ CanonicalRequest.target = "node"   ← ALREADY SANITIZED
  ▼
src/core/pipeline.ts:70  const tool = request.target
  │ "node" (no re-validation, no re-sanitization)
  ▼
src/core/pipeline.ts:78  execSync(`winget install --id ${tool} ...`)
src/core/pipeline.ts:81  execSync(`sudo apt install -y ${tool}`)
  │                     ↑ template literal concatenation — shell interpretation
  ▼
  [shell process]  ← physical effect on OS
```

---

## 3. Security Findings

### FINDING E1 — install-tool: shell concatenation after sanitization

| Field | Value |
|---|---|
| **Severity** | MEDIUM (not critical — see reasoning) |
| **File** | `src/core/pipeline.ts` |
| **Line** | 70, 81–84 |
| **Function** | `execInstallTool` |
| **Source** | `rawParams` (CLI argument, user/agent-controlled) |
| **Sink** | `execSync()` template literal concatenation |
| **Validation** | `sanitizeTarget()` at target-normalizer.ts:13 |

**Evidence:**

```typescript
// pipeline.ts:70
const tool = request.target;  // ← CanonicalRequest.target, already sanitized

// pipeline.ts:81-84 (non-Windows path)
if (pm === 'apt') result = execSync(`sudo apt install -y ${tool}`, ...);
else if (pm === 'dnf') result = execSync(`sudo dnf install -y ${tool}`, ...);
else if (pm === 'pacman') result = execSync(`sudo pacman -S --noconfirm ${tool}`, ...);
else if (pm === 'zypper') result = execSync(`sudo zypper install -y ${tool}`, ...);
```

**Sanitization function (target-normalizer.ts:13):**

```typescript
export function sanitizeTarget(raw: string): string {
  const sanitized = raw.replace(/[^a-zA-Z0-9._\-/]/g, '');
  if (!sanitized || sanitized.length === 0 || sanitized.length > 100) {
    throw new Error(`Target inválido: "${raw}"`);
  }
  return sanitized;
}
```

**Impact analysis by payload type:**

| Input (`rawParams`) | After `sanitizeTarget` | Command executed | Result |
|---|---|---|---|
| `"node"` | `"node"` | `sudo apt install -y node` | Installs nodejs package — intended |
| `"foo; whoami"` | `"foowhoami"` | `sudo apt install -y foowhoami` | apt fails: package not found. **No injection.** |
| `"foo && rm -rf /"` | `"foo"` | `sudo apt install -y foo` | apt fails. **No injection.** |
| `"foo $(whoami)"` | `"foo"` | `sudo apt install -y foo` | Strips `$()`. **No injection.** |
| `"foo--option"` | `"foo--option"` | `sudo apt install -y foo--option` | apt treats `--option` as package name, fails. |
| `"gcc@12"` | `"gcc12"` | `sudo apt install -y gcc12` | Strips `@`, fails if package is `gcc-12`. **False negative on valid names.** |
| `"foo 2>/dev/null"` | `"foo devnull"` | `sudo apt install -y foo devnull` | apt treats `devnull` as second package. Wrong behavior, not injection. |

**Conclusion:** `sanitizeTarget` effectively blocks all shell metacharacter injection sequences because it strips them entirely rather than passing them to the shell. However:

1. **The mechanism is stripping, not escaping.** Valid package names containing stripped characters (e.g., `@types/node`, `gcc-12`) will be silently mangled and fail.
2. **No sudoers check.** If the user is not a sudoer, `sudo` will prompt for a password or fail. Buffy does not check this beforehand.
3. **No package existence check.** A user/agent can initiate a `sudo apt install` for any arbitrary package name.

**Not vulnerable to arbitrary command execution** due to `sanitizeTarget`. **Potentially surprising behavior** for valid package names with special characters.

**Classification: SAFE_WITH_GUARD** — guard is effective but relies on denylist-stripping rather than allowlist validation.

---

### FINDING E2 — No sudoers/privilege validation before install-tool

| Field | Value |
|---|---|
| **Severity** | LOW-MEDIUM |
| **File** | `src/core/pipeline.ts` |
| **Line** | 81–84 |
| **Function** | `execInstallTool` |

**Evidence:**

```typescript
// install-tool ActionDefinition has prerequisites: []
// checkPrerequisites() passes because prerequisites is empty

// No check: does user have sudo privileges?
// No check: is sudo passwordless?
// No check: will sudo prompt for password (blocking)?

if (pm === 'apt') result = execSync(`sudo apt install -y ${tool}`, ...);
```

**Impact:** `buffy act install-tool` on a Linux system where the user is not in sudoers will hang waiting for password input (if sudo is configured to ask), or fail immediately. There is no graceful degradation.

---

### FINDING E3 — Action availability: model/agent can invoke install-tool directly

| Field | Value |
|---|---|
| **Severity** | LOW (policy boundary, not technical vulnerability) |
| **File** | `src/cli.ts`, `src/actions/registry.ts` |
| **Line** | CLI:148, registry CATEGORY_TO_ACTIONS |

**Evidence:**

`install-tool` is **not** in `CATEGORY_TO_ACTIONS` (registry.ts:63–71):

```typescript
const CATEGORY_TO_ACTIONS: Record<ObservationCategory, string[]> = {
  cpu: [],
  gpu: ['check-gpu-driver', 'check-driver-status'],
  temperature: ['check-system-temp'],
  processes: ['list-processes'],
  memory: ['list-processes'],
  storage: ['check-disk-space'],
  network: ['check-network'],
  // install-tool NOT listed → diagnose won't auto-suggest it
};
```

However, any agent with access to the CLI can call:

```bash
buffy act install-tool <any-package-name>
```

This is by design (`buffy act` requires explicit action ID), but the policy boundary exists: a model with access to the CLI can trigger package installation without going through `diagnose`.

**Classification: accepted risk** given the CLI design, but should be documented.

---

### FINDING E4 — execCheckShizuku: RISH_APPLICATION_ID from process.env

| Field | Value |
|---|---|
| **Severity** | VERY LOW (environment, not CLI input) |
| **File** | `src/core/pipeline.ts` |
| **Line** | 116–124 |
| **Function** | `execCheckShizuku` |

**Evidence:**

```typescript
const appId = process.env.RISH_APPLICATION_ID ?? 'com.termux';
// ...
result = execSync('rish -c "id"', { encoding: 'utf-8', timeout: 10_000,
  env: { ...process.env, RISH_APPLICATION_ID: appId }
});
```

`RISH_APPLICATION_ID` is read from `process.env` (not from CLI arguments), set to default `'com.termux'` if absent, and then passed explicitly to `rish`. The environment is not user-controlled through the Buffy CLI interface. The spread of `process.env` followed by explicit override of `RISH_APPLICATION_ID` means the override wins — no injection possible through this path.

**Classification: SAFE** — no external input reaches shell.

---

### FINDING E5 — execCheckNetwork: hardcoded target (not user-controlled)

| Field | Value |
|---|---|
| **Severity** | NONE (no user input) |
| **File** | `src/core/pipeline.ts` |
| **Line** | 240–244 |
| **Function** | `execCheckNetwork` |

**Evidence:**

```typescript
const target = process.platform === 'win32' ? '8.8.8.8' : '8.8.8.8';  // hardcoded
const countFlag = process.platform === 'win32' ? '-n 3' : '-c 3';
execSync(`ping ${countFlag} -W 2 ${target}`, ...);
```

No user input reaches this command. The previous audit flagging this as a bug was incorrect — it's a design limitation (what if 8.8.8.8 is blocked but the user has internet?), not a security issue.

**Classification: SAFE** — no injection surface.

---

### Security Summary Table

| Action | Input | Sink | Validation | Risk |
|---|---|---|---|---|
| `install-tool` | `rawParams` (CLI) | `execSync` template literal | `sanitizeTarget()` strips metacharacters | **SAFE_WITH_GUARD** — effective but stripping-based |
| `change-power-plan` | none (GUID hardcoded) | `execSync` hardcoded string | N/A | **SAFE** |
| `check-shizuku` | `process.env` | `execSync` hardcoded + `RISH_APPLICATION_ID` | env not user-controllable via CLI | **SAFE** |
| `check-gpu-driver` | none | `execSync` platform detection strings | N/A | **SAFE** |
| `check-driver-status` | none | `execSync` platform detection strings | N/A | **SAFE** |
| `list-processes` | none | `execSync` for Windows: hardcoded PS; Linux: `ps` + `cat /proc/` | N/A | **SAFE** |
| `check-system-temp` | none | `execSync` read-only file reads | N/A | **SAFE** |
| `check-network` | none | `execSync` hardcoded ping/target | N/A | **SAFE** |
| `check-disk-space` | none | `execSync` read-only `df`/`Get-PSDrive` | N/A | **SAFE** |

---

## 4. Observation Trace

```
┌─────────────────────────────────────────────────────────────┐
│  ADAPTER (platform-specific)                                 │
│                                                             │
│  WindowsAdapter.systemInfo()     → SystemInfo               │
│  AndroidTermuxAdapter.systemInfo() → SystemInfo            │
│  LinuxAdapter.systemInfo()       → SystemInfo              │
│                                                             │
│  Each populates: cpu, memory, gpu, storage, temperature,    │
│  processes, privileges — all WITHOUT timestamps             │
└──────────────────────────┬──────────────────────────────────┘
                           │ SystemInfo (no temporal metadata)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DIAGNOSE PIPELINE (diagnose.ts)                           │
│                                                             │
│  analyzeForQuery(system, checks) → CheckResult[]           │
│    Each CheckResult: { id, category, severity, message }    │
│    ❌ NO timestamp field on CheckResult                     │
│    ❌ NO source field                                       │
│    ❌ NO observedAt                                         │
│    ❌ NO freshness indication                               │
│                                                             │
│  DiagnosticResponse: { observations, inferences, actions }  │
│    observations: Observation[]                              │
│      Observation: { fact, value, unit, category,            │
│                    threshold, severity }                    │
│      ❌ NO observedAt  ❌ NO age  ❌ NO freshness           │
└──────────────────────────┬──────────────────────────────────┘
                           │ DiagnosticResponse (no per-obs timestamps)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CONTEXT BUILDER (context.ts)                              │
│                                                             │
│  buildContext(report: DoctorReport) → BuffyContext          │
│                                                             │
│  DoctorReport: { platform, system, capabilities,           │
│                  privileges, items, timestamp }            │
│    timestamp: new Date().toISOString()   ← ONLY timestamp   │
│    items: CheckResult[]                 ← no timestamps     │
│                                                             │
│  BuffyContext: { generated_at, platform, hardware,           │
│                  environment, tools, privileges }           │
│    generated_at = report.timestamp    ← ONE timestamp for   │
│                                          ALL hardware data  │
│    hardware: { cpu, cpu_cores, ram_gb, ram_available_gb,    │
│                gpu, gpu_driver, storage[], temperature_c,   │
│                process_groups }                             │
│      ❌ NO per-field timestamps                             │
│      ❌ NO per-field source/provenance                      │
│      ❌ NO freshness indicator                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ BuffyContext (context package)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  EXTERNAL CONSUMER (agent / model)                         │
│                                                             │
│  Receives:                                                  │
│    { generated_at: "2026-08-27T18:30:00.000Z",              │
│      hardware: { ram_available_gb: 4.2, ... },             │
│      temperature_c: 43, ... }                             │
│                                                             │
│  ❌ Cannot know if ram_available_gb was measured at         │
│     18:30:00 or 16:00:00 or any other time                 │
│  ❌ Cannot know which adapter produced the data             │
│  ❌ Cannot know if temperature_c is current or stale        │
│  ❌ Cannot distinguish OBSERVED vs INFERRED vs STALE        │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Freshness Gap

### Why `observedAt = absent`, `age = absent`, `freshness = absent`

**`Observation` interface (types.ts:228):**

```typescript
export interface Observation {
  fact: string;
  value?: number;
  unit?: string;
  category: ObservationCategory;
  threshold?: { warning: number; error: number };
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  // ❌ NO: observedAt
  // ❌ NO: age_ms
  // ❌ NO: freshness
  // ❌ NO: source (which adapter/platform call produced this)
  // ❌ NO: provenance
}
```

**`CheckResult` interface (the older diagnostic type, types.ts:213):**

```typescript
export interface CheckResult {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  suggestion?: string;
  explanation?: string;
  actionId?: string;
  suggestedAction?: string;
  // ❌ NO: timestamp
  // ❌ NO: observedAt
  // ❌ NO: source
}
```

**`DiagnosticResult` (types.ts:301):**

```typescript
export interface DiagnosticResult {
  observations: Observation[];      // no timestamps inside
  inferences: Inference[];         // no timestamps
  suggestedActions: SuggestedAction[];
}
```

**`DoctorReport` (types.ts:318):**

```typescript
export interface DoctorReport {
  platform: PlatformInfo;
  system: SystemInfo;
  capabilities: Capability[];
  privileges?: PlatformCapabilities;
  items: CheckResult[];           // no timestamps on items
  timestamp: string;             // ONE timestamp for entire report
}
```

**`BuffyContext` (types.ts:340):**

```typescript
export interface BuffyContext {
  schema: 'buffy.context/v1';
  buffy_version: string;
  generated_at: string;          // ONE timestamp for entire context
  platform: { ... };
  hardware: {                    // all hardware fields timestamped only
    cpu: string | null;          // by generated_at
    cpu_cores: number | null;
    ram_gb: number | null;
    ram_available_gb: number | null;
    gpu: string | null;
    gpu_driver: string | null;
    gpu_is_generic: boolean | null;
    storage: Array<{ ... }>;
    temperature_c: number | null;
    process_groups?: Array<{ ... }>;
  };
  // ❌ NO per-field timestamps
  // ❌ NO per-field source
  // ❌ NO freshness indicator
}
```

### How staleness becomes invisible

1. `runDoctor()` (doctor.ts:9) calls `adapter.systemInfo()` and records `timestamp: new Date().toISOString()` at the **end** of the call — not per-measurement.
2. `diagnose()` (diagnose.ts:47) takes the `system` object and produces `CheckResult[]` with **no timestamps**.
3. `buildContext()` (context.ts:9) transforms `DoctorReport` into `BuffyContext` with a **single** `generated_at`.
4. The context package is sent to the model.

**What the agent sees:**

```json
{
  "generated_at": "2026-08-27T18:30:00.000Z",
  "hardware": {
    "ram_available_gb": 4.2,
    "temperature_c": 43
  }
}
```

**What the agent cannot know:**
- Was `ram_available_gb` measured at 18:30:00 or at 16:00:00 (when the doctor ran)?
- Was `temperature_c` measured in the last call to `systemInfo()` or is it from a cached object?
- Is `temperature_c = 43` from a fresh reading or from a result that was stored in memory for 10 minutes?
- Which specific syscall or WMI query produced each value?

**Why this enables E4 behavior:**

```
T+0:   runDoctor() → DoctorReport { ram: 4.2GB, temp: 43°C, timestamp: T+0 }
T+0:   buildContext() → BuffyContext { generated_at: T+0, ram: 4.2GB, temp: 43°C }
T+0:   Agent receives context, sees 4.2GB RAM free
T+5:   Agent runs heavy workload, RAM drops to 0.5GB
T+10:  Agent asks Buffy about RAM problem
T+10:  runDoctor() → DoctorReport { ram: 4.2GB (unchanged), timestamp: T+10 }
        ↑ But the Agent still has old context from T+0 showing 4.2GB
        ↑ The Agent cannot know its context is stale
T+10:  Agent diagnoses "RAM is fine" based on stale data
```

The `generated_at` tells the agent **when the context was built**, not **when each individual hardware value was measured**. If the context was built at T+0 and the agent receives it at T+10, the agent knows the context is 10 seconds old, but does not know that the **RAM measurement inside it** was taken at T+0 and may have changed since.

---

## 6. Minimal Required Changes

### MUST FIX (affects correctness / epistemic safety)

#### M1 — Add `observedAt` to `Observation` and `CheckResult`

**File:** `src/core/types.ts`

Add to `Observation` (line ~228):
```typescript
export interface Observation {
  // ... existing fields ...
  /** When this observation was measured (ISO 8601) */
  observedAt: string;
  /** Source of this observation (e.g., "WindowsAdapter", "LinuxAdapter", "AndroidTermuxAdapter") */
  source: string;
}
```

Add to `CheckResult` (line ~213):
```typescript
export interface CheckResult {
  // ... existing fields ...
  observedAt?: string;
  source?: string;
}
```

**Rationale:** Without per-observation timestamps, no consumer can determine whether a specific measurement is current or stale. The top-level `generated_at` in `BuffyContext` only tells you when the context was assembled, not when each individual fact was measured.

#### M2 — Propagate timestamps from adapters through diagnose pipeline

**Files:** `src/adapters/windows.ts`, `src/adapters/android.ts`, `src/adapters/linux.ts`, `src/core/diagnose.ts`, `src/core/doctor.ts`

Each adapter's `systemInfo()` should record `observedAt` per measurement or at minimum per `SystemInfo` object. The `diagnose()` function must preserve these timestamps through `analyzeForQuery()` into the resulting `CheckResult[]` / `Observation[]`.

**Rationale:** The timestamps must originate at the measurement site (the adapter). If they are not added at the adapter level, they cannot appear later.

#### M3 — Fix Linux `list-processes` CPU measurement

**File:** `src/core/pipeline.ts`
**Line:** ~205

```typescript
// CURRENT (pipeline.ts:205):
return { pid, name: parts[parts.length - 1] ?? '?', cpuPercent: 0, memoryMB };
//                                                               ↑ always 0

// SHOULD: parse /proc/stat or use `ps` with %cpu
```

**Rationale:** `cpuPercent: 0` on every Linux process is a false fact. Buffy reports "no heavy processes" even when processes are consuming CPU, because the measurement is broken. This directly affects context quality and diagnostic correctness.

---

### SHOULD FIX (design quality / reliability)

#### S1 — Add sudoers check to `install-tool`

**File:** `src/core/pipeline.ts` or new function in `src/core/security.ts`

Before attempting `sudo apt install`, verify the user can run `sudo` without a password prompt (e.g., `sudo -n true 2>&1`). If not, return a clear error before attempting the install.

**Rationale:** Currently `sudo apt install` on a non-sudoer machine will either prompt for password (blocking) or fail. A proactive check gives a better UX and prevents confusing blocking behavior.

#### S2 — Define freshness thresholds per observation category

**File:** `src/core/types.ts` (new type) or a constants file

```typescript
export const FRESHNESS_THRESHOLDS: Record<ObservationCategory, number> = {
  // milliseconds — max age before data is considered stale
  cpu: 60_000,       // 1 minute
  memory: 30_000,     // 30 seconds — RAM can change rapidly
  gpu: 300_000,      // 5 minutes
  temperature: 30_000, // 30 seconds — can spike fast
  processes: 30_000,  // 30 seconds
  storage: 3_600_000, // 1 hour — disk usage changes slowly
  network: 60_000,    // 1 minute
};
```

**Rationale:** Without defined freshness thresholds, even with `observedAt` timestamps, the agent has no programmatic way to determine whether a given measurement is still valid. This is a prerequisite for any staleness detection.

#### S3 — Differentiate OBSERVED / INFERRED / STALE / UNKNOWN epistemic states

**File:** `src/core/types.ts`

Currently `severity: 'unknown'` is the only "epistemic uncertainty" marker. This conflates:
- "I tried to measure X but couldn't" (UNKNOWN)
- "X was measured but may have changed since" (STALE)
- "X is measured but I inferred the cause" (INFERRED)

Add an explicit epistemic status:

```typescript
export type EpistemicStatus = 'observed' | 'inferred' | 'stale' | 'unknown';
```

**Rationale:** A model consuming Buffy context needs to know not just "is this fact OK?" but "how much trust should I place in this fact right now?" STALE and UNKNOWN require different handling than OBSERVED.

---

### OPTIONAL (future extensibility)

- O1: Package allowlist for `install-tool` (instead of stripping)
- O2: Audit log file (`~/.buffy/audit.log`) for execution history
- O3: Rollback support for CONFIRM-level actions
- O4: Plugin system for actions
- O5: Middleware hooks (before/after execution)

**None of these should be started before M1, M2, M3, S1, S2, S3 are resolved.**

---

## 7. Relationship to E4

The E4 finding (stale Buffy context used as current) is **directly enabled** by this gap:

```
Architecture gap          →  E4 symptom
observedAt absent         →  Cannot determine when measurement was taken
generated_at only         →  Knows context assembly time, not measurement age
no freshness threshold   →  Cannot programmatically detect staleness
no epistemic status      →  Cannot distinguish fresh observation from stale one
```

Fixing M1+M2+S2+S3 does not automatically fix E4 (the model still needs to check freshness), but it **enables the model to fix itself** by providing the necessary metadata. Without these fields, no amount of model instruction can make the agent reliably detect stale context — the information simply isn't in the data.

---

## 8. Verdict by Lens

```
              BUFFY NEXT
                   │
        ┌──────────┴──────────┐
        ▼                      ▼
Execution Safety         Context Integrity
        │                      │
 ActionGate: ✅ solid    Observation: ❌ no timestamps
 sanitizeTarget: ✅ works  CheckResult:  ❌ no timestamps
 execSync concat: ⚠️ strip DoctorReport: ⚠️ one timestamp
 sudo check:    ❌ missing BuffyContext:  ⚠️ one timestamp
 install-tool:  ⚠️ guarded     freshness:  ❌ undefined
                            epistemic:   ❌ undifferentiated
```

**Conclusion:**

- **Execution Safety is acceptable** — the guards work, but should be hardened with sudoers checks and consider allowlist-based package validation.
- **Context Integrity is incomplete** — no per-observation timestamps, no freshness, no epistemic differentiation. This is the more fundamental gap because it affects every diagnostic output, not just one action.

The priority order should be:

```
M1 + M2  (timestamps at source)
    →
M3       (fix broken CPU measurement)
    →
S2 + S3  (freshness thresholds + epistemic states)
    →
S1       (sudoers check for install-tool)
```

Until M1 and M2 are resolved, the context package cannot support reliable staleness detection, and the E4 class of failures will remain possible.
