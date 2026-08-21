// Buffy Next — Core Types
// All interfaces used across the project
// Includes backward-compatible aliases for pre-existing code

// ─── Platform ──────────────────────────────────────────────

export type PlatformName = 'windows' | 'android-termux' | 'linux';

export interface PlatformInfo {
  name: PlatformName;
  os: string;
  version: string;
  arch: string;
}

// ─── System ────────────────────────────────────────────────

/** Sub-types for backward compatibility (old android-termux.ts, etc.) */
export type OSInfo = { name: string; version: string; arch: string };
export type CPUInfo = { model: string; cores: number; usage?: number };
export type MemoryInfo = { totalGB: number; availableGB: number; usedPercent: number };
export type GPUInfo = { name: string; driver: string; isGeneric: boolean };
export type StorageInfo = { devices: StorageDevice[] };
export type TempInfo = { cpuCelsius: number };

export interface SystemInfo {
  os: OSInfo;
  cpu: CPUInfo;
  memory: MemoryInfo;
  gpu: GPUInfo;
  /** Storage devices — new code uses this array directly */
  storage: StorageDevice[];
  /** Backward compat: old code accesses system.storage.devices */
  devices?: StorageDevice[];
  temperature: TempInfo | null;
  processes: ProcessInfo[];
  /** Platform-level privileges detected at runtime */
  privileges?: PlatformCapabilities;
}

export interface StorageDevice {
  mount: string;
  totalGB: number;
  freeGB: number;
  usedPercent: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMB: number;
}

// ─── Capabilities ──────────────────────────────────────────

/** Platform-level privileges detected at runtime (read-only, never auto-elevated) */
export interface PlatformCapabilities {
  /** Basic shell access (Termux /proc, df, ps, etc.) */
  shell: boolean;
  /** Shizuku elevated shell via rish */
  shizuku: boolean;
  /** Full root access (su) */
  root: boolean;
  /** ADB connection available */
  adb: boolean;
}

export interface Capability {
  name: string;
  status: 'installed' | 'missing' | 'unknown';
  version?: string;
  /** Backward compat: old code uses description */
  description?: string;
}

// ─── Security ──────────────────────────────────────────────

export type SecurityLevel = 'auto_safe' | 'confirm' | 'forbidden';
/** Backward compat alias */
export type ActionLevel = SecurityLevel;
export type DiagnosticSeverity = CheckResult['severity'];
export type CheckName = string;

// ─── Actions ───────────────────────────────────────────────

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  level: SecurityLevel;
  reversible: boolean;
  rollback?: () => Promise<void>;
  /** Backward compat: old code uses verify */
  verify?: () => Promise<boolean>;
  platforms: PlatformName[];
  prerequisites: string[];
  execute: () => Promise<ActionResult>;
  dryRun?: () => Promise<string>;
}

export interface ActionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Check Selector ────────────────────────────────────────

export interface CheckResult {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  suggestion?: string;
  /** Backward compat: old code uses explanation */
  explanation?: string;
  actionId?: string;
  /** Backward compat: old code uses suggestedAction */
  suggestedAction?: string;
}

/** Backward compat alias */
export type DiagnosticItem = CheckResult;

// ─── Context Scoring (v0.6) ──────────────────────────────

export type Confidence = 'high' | 'medium' | 'low';

/**
 * Result of context scoring (v0.6).
 * selectChecks() returns CheckName[] (v0.5-B behavior).
 * scoreContext() wraps it into CheckSelection with ambiguity/confidence.
 */
export interface CheckSelection {
  /** Checks selected by the lexical selector */
  checks: CheckName[];
  /** True when no sufficient evidence to select specific checks */
  ambiguous: boolean;
  /** Confidence level in the selection */
  confidence: Confidence;
}

export type ObservabilityStatus =
  | 'observed'      // checks selected AND observations produced
  | 'no_evidence'   // no checks selected (non-diagnostic query)
  | 'unsupported'   // checks selected but can't observe them
  | 'partial';      // some checks produced observations, others didn't

export interface Observability {
  /** Overall diagnostic coverage */
  status: ObservabilityStatus;
  /** Human-readable reason for the status */
  reason: string;
  /** Checks that could not be performed */
  unsupportedChecks?: string[];
}

// ─── Action Grounding (v0.7) ──────────────────────────────

/**
 * Instruction verification status.
 * Controls output behavior — NOT just metadata.
 *
 * - verified:    steps verified for this platform → show steps
 * - partial:     generic or partially verified steps → show with caveat
 * - unsupported: no verified procedure → DO NOT invent steps
 */
export type InstructionStatus = 'verified' | 'partial' | 'unsupported';

/**
 * Platform-specific instruction for an action.
 */
export interface PlatformInstructions {
  platform: PlatformName;
  /** UI navigation path (if applicable) */
  ui_path: string | null;
  /** CLI command (if applicable) */
  command: string | null;
  /** Prerequisites (admin, root, shizuku, etc.) */
  requires: string[];
  /** Verification status — controls output behavior */
  status: InstructionStatus;
}

/**
 * A recommended action with full grounding chain:
 * observed → inferred → recommended → instruction
 *
 * Each level has its own confidence.
 * action can exist WITHOUT instruction (unsupported).
 */
export interface RecommendedAction {
  id: string;
  /** What we observed (from diagnosis, measured) */
  observed: string;
  /** What we infer (with evidence) */
  inferred: string;
  /** What we recommend (high-level action) */
  recommended: string;
  /** Platform-specific instructions (may be unsupported) */
  instructions: PlatformInstructions[];
  /** Confidence in the recommendation */
  confidence: Confidence;
}

// ─── Diagnosis ─────────────────────────────────────────────

export interface DiagnosticResult {
  items: CheckResult[];
  suggestedActions: SuggestedAction[];
}

export interface SuggestedAction {
  action: ActionDefinition;
  reason: string;
}

export interface DoctorReport {
  platform: PlatformInfo;
  system: SystemInfo;
  capabilities: Capability[];
  privileges?: PlatformCapabilities;
  items: CheckResult[];
  timestamp: string;
}

// ─── State ─────────────────────────────────────────────────

export interface BuffyState {
  lastScan?: string;
  platform?: string;
  system?: Partial<SystemInfo>;
  actionHistory: ActionRecord[];
  /** Backward compat: old code uses preferences */
  preferences?: { language: string };
}

export interface ActionRecord {
  actionId: string;
  timestamp: string;
  success: boolean;
  message: string;
}

// ─── Context Package (对外 — consumed by external agents) ──

/**
 * BuffyContext — stable JSON contract for external consumers.
 * Generated by `buffy doctor --context`.
 *
 * Rules:
 *  - null = data not available on this platform (NOT 0, NOT "")
 *  - tools[].available = adapter found binary + retrieved version (status='installed')
 *  - schema is versioned; v2 may add fields, never remove
 *  - processes[], items[], checks are intentionally excluded
 */
export interface BuffyContext {
  /** Contract version — always present */
  schema: 'buffy.context/v1';

  /** Buffy version that generated this context */
  buffy_version: string;

  /** ISO 8601 timestamp */
  generated_at: string;

  /** Platform identification */
  platform: {
    /** Internal ID: 'windows' | 'android-termux' | 'linux' */
    os: string;
    /** Human-readable: "Windows 10 LTSC" / "Android" / "EndeavourOS" */
    os_name: string;
    /** OS version: "10.0.19045" / "13" / null if unavailable */
    os_version: string | null;
    /** Kernel version: "6.18.42-1-lts" / null if unavailable */
    kernel: string | null;
    /** Architecture: "x64" / "arm64-v8a" / "x86_64" */
    architecture: string;
  };

  /** Detected hardware */
  hardware: {
    /** CPU model: "AMD Ryzen 5 3400G" / "MT6765" / null */
    cpu: string | null;
    /** Physical cores */
    cpu_cores: number | null;
    /** Total RAM in GB */
    ram_gb: number | null;
    /** Available RAM in GB */
    ram_available_gb: number | null;
    /** GPU name: "Adreno 610" / "RX 550" / null */
    gpu: string | null;
    /** GPU driver: "amdgpu" / "27.20.12029.1000" / "bundled" / null */
    gpu_driver: string | null;
    /** Is this a generic/default driver? */
    gpu_is_generic: boolean | null;
    /** Storage devices */
    storage: Array<{
      mount: string;
      total_gb: number;
      free_gb: number;
      used_percent: number;
    }>;
    /** CPU temperature in °C, or null if unavailable */
    temperature_c: number | null;
  };

  /** Execution environment */
  environment: {
    /** Available shell: "bash" / "powershell" / "zsh" / null */
    shell: string | null;
    /** Node.js version */
    node_version: string | null;
  };

  /**
   * Detected tools.
   *
   * available semantics (congelado):
   *  - The adapter checks: (1) binary exists via `command -v` / `Get-Command`
   *    AND (2) version command succeeds. Both must pass for status='installed'.
   *  - BuffyContext maps status='installed' → available=true.
   *  - This means: the tool was found AND its version was retrieved.
   *  - It does NOT mean the tool is configured correctly for a specific task.
   *
   * Example: ADB may be installed (available=true) but no device connected.
   * The agent should check prerequisites per-action, not rely solely on this field.
   */
  tools: Array<{
    name: string;
    /** true = adapter found binary + retrieved version (status === 'installed') */
    available: boolean;
    version: string | null;
  }>;

  /** Platform privileges detected at runtime */
  privileges: {
    /** Basic shell access */
    shell: boolean;
    /** Shizuku (rish) — Android only */
    shizuku: boolean;
    /** Full root access (su) */
    root: boolean;
    /** ADB connection available */
    adb: boolean;
  };
}

// ─── Exec utilities ────────────────────────────────────────

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

// ─── Platform Adapter ──────────────────────────────────────

export interface PlatformAdapter {
  readonly name: string;

  /** Identificar plataforma */
  detect(): Promise<PlatformInfo>;

  /** Info del sistema (CPU, RAM, GPU, etc.) */
  systemInfo(): Promise<SystemInfo>;

  /** Herramientas disponibles en esta plataforma */
  capabilities(): Promise<Capability[]>;

  /** Ejecutar una acción definida */
  execute(action: ActionDefinition): Promise<ActionResult>;
}

// ─── Model Feasibility (v0.9) ─────────────────────────────

/** Feasibility level for running a model on this system */
export type FeasibilityLevel = 'fit' | 'constrained' | 'unfit';

/** Model specification for feasibility check */
export interface ModelSpec {
  /** Model name (e.g., 'gemma-2b-q4') */
  name: string;
  /** Estimated RAM in GB */
  estimatedRamGB: number;
  /** Minimum CPU cores required */
  minCpuCores: number;
  /** Does this model require GPU? */
  requiresGpu: boolean;
  /** Minimum VRAM in GB (if GPU required) */
  minVramGB?: number;
  /** Maximum context length */
  maxContext: number;
}

/** Execution limits when model is CONSTRAINED */
export interface ExecutionLimits {
  /** Maximum context length (reduced from model max) */
  maxContext: number;
  /** Maximum concurrent requests */
  concurrency: number;
  /** Whether to monitor memory during execution */
  monitorMemory: boolean;
  /** Execution timeout in seconds */
  timeout: number;
}

/** Alternative model when current model is UNFIT */
export interface ModelAlternative {
  /** Alternative model name */
  model: string;
  /** Why this alternative */
  reason: string;
  /** Estimated RAM requirement */
  estimatedRamGB: number;
  /** Expected feasibility level */
  expectedLevel: FeasibilityLevel;
}

/** Model feasibility assessment result */
export interface ModelFeasibility {
  /** Feasibility level */
  level: FeasibilityLevel;
  /** Reason for this assessment */
  reason: string;
  /** Execution limits (if CONSTRAINED) */
  limits?: ExecutionLimits;
  /** Alternative models (if UNFIT) */
  alternatives?: ModelAlternative[];
}

// ─── Diagnostic Router (v0.9) ─────────────────────────────

/** Next diagnostic recommendation */
export interface NextDiagnostic {
  /** Domain the symptom concerns */
  domain: string;
  /** Specific check to run */
  check: string;
  /** Why this check */
  reason: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** What evidence this check would produce */
  requiredEvidence: string[];
}

/** Evidence gap */
export interface EvidenceGap {
  /** Domain with missing evidence */
  domain: string;
  /** Importance of this gap */
  importance: 'critical' | 'useful' | 'optional';
  /** Why this gap matters */
  reason: string;
}

/** Current diagnostic conclusions */
export interface DiagnosticConclusions {
  /** Things we can affirm based on observations */
  supported: string[];
  /** Things we cannot determine yet */
  uncertain: string[];
  /** Things we have no evidence for */
  unsupported: string[];
}

/** Diagnostic routing result */
export interface DiagnosticRouting {
  /** The symptom domain the user is concerned about */
  symptomDomain: string;
  /** What check should be executed next */
  nextDiagnostic: NextDiagnostic;
  /** What evidence is still missing */
  evidenceGaps: EvidenceGap[];
  /** What can be concluded right now */
  currentConclusion: DiagnosticConclusions;
}
