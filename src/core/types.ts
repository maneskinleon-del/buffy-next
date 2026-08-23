// Buffy Next — Core Types (v2.2 — Action Gate)
// ActionDefinition is metadata-only. Physical execution is exclusively via ActionGate.

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
  storage: StorageDevice[];
  /** Backward compat: old code accesses system.storage.devices */
  devices?: StorageDevice[];
  temperature: TempInfo | null;
  processes: ProcessInfo[];
  processGroups?: ProcessGroup[];
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

export interface ProcessGroup {
  name: string;
  processCount: number;
  totalMemoryMB: number;
  totalCpuPercent: number;
  pids: number[];
}

// ─── Capabilities ──────────────────────────────────────────

export interface PlatformCapabilities {
  shell: boolean;
  shizuku: boolean;
  root: boolean;
  adb: boolean;
}

export interface Capability {
  name: string;
  status: 'installed' | 'missing' | 'unknown';
  version?: string;
  description?: string;
}

// ─── Security ──────────────────────────────────────────────

export type SecurityLevel = 'auto_safe' | 'confirm' | 'forbidden';
/** Backward compat alias */
export type ActionLevel = SecurityLevel;
export type DiagnosticSeverity = CheckResult['severity'];
export type CheckName = string;

// ─── Actions (metadata only — no execute/dryRun/rollback/verify) ──

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  level: SecurityLevel;
  reversible: boolean;
  platforms: PlatformName[];
  prerequisites: string[];
}

export interface ActionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Canonical Request ─────────────────────────────────────

/**
 * Immutable request produced by TargetNormalizer.
 * After creation, rawParams must never be read again.
 */
export interface CanonicalRequest {
  /** Unique ID for this request instance */
  readonly requestId: string;
  /** Action ID from the registry */
  readonly actionId: string;
  /** Normalized target (e.g., sanitized tool name, or empty string) */
  readonly target: string;
  /** Platform where this will execute */
  readonly platform: PlatformName;
}

// ─── Authorization Token ───────────────────────────────────

export type AuthorizationTokenState = 'issued' | 'claimed' | 'consumed' | 'expired';

/**
 * Single-use authorization token bound to identity + action + target + platform.
 * Lifecycle: issued → claimed → consumed (or expired).
 */
export interface AuthorizationToken {
  readonly tokenId: string;
  readonly identity: Identity;
  readonly actionId: string;
  readonly canonicalTarget: string;
  readonly platform: PlatformName;
  state: AuthorizationTokenState;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

// ─── Execution Record ──────────────────────────────────────

export type ExecutionState = 'started' | 'completed' | 'failed' | 'unknown';

/**
 * Tracks the lifecycle of a single action execution.
 * If crash occurs between STARTED and result → state is UNKNOWN.
 */
export interface ExecutionRecord {
  readonly executionId: string;
  readonly tokenId: string;
  readonly actionId: string;
  state: ExecutionState;
  readonly startedAt: Date;
  completedAt?: Date;
  result?: ActionResult;
}

// ─── Identity ──────────────────────────────────────────────

export interface Identity {
  readonly session: string;
  readonly caller: string;
}

// ─── Prompt Provider ───────────────────────────────────────

/**
 * Function that asks the user for confirmation.
 * Must return the exact user response — never a default.
 */
export type PromptProvider = () => Promise<string>;

// ─── Action Executor ───────────────────────────────────────

/**
 * Physical executor for an action.
 * Receives a CanonicalRequest and the adapter (for system access).
 * The ActionGate is the ONLY caller of executors.
 */
export type ActionExecutor = (
  request: CanonicalRequest,
  adapter: PlatformAdapter,
) => Promise<ActionResult>;

// ─── Check Selector ────────────────────────────────────────

export interface CheckResult {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  suggestion?: string;
  explanation?: string;
  actionId?: string;
  suggestedAction?: string;
}

/** Backward compat alias */
export type DiagnosticItem = CheckResult;

// ─── Context Scoring (v0.6) ──────────────────────────────

export type Confidence = 'high' | 'medium' | 'low';

export interface CheckSelection {
  checks: CheckName[];
  ambiguous: boolean;
  confidence: Confidence;
}

export type ObservabilityStatus =
  | 'observed'
  | 'no_evidence'
  | 'unsupported'
  | 'partial';

export interface Observability {
  status: ObservabilityStatus;
  reason: string;
  unsupportedChecks?: string[];
}

// ─── Action Grounding (v0.7) ──────────────────────────────

export type InstructionStatus = 'verified' | 'partial' | 'unsupported';

export interface PlatformInstructions {
  platform: PlatformName;
  ui_path: string | null;
  command: string | null;
  requires: string[];
  status: InstructionStatus;
}

export interface RecommendedAction {
  id: string;
  observed: string;
  inferred: string;
  recommended: string;
  instructions: PlatformInstructions[];
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
  preferences?: { language: string };
}

export interface ActionRecord {
  actionId: string;
  timestamp: string;
  success: boolean;
  message: string;
}

// ─── Context Package ───────────────────────────────────────

export interface BuffyContext {
  schema: 'buffy.context/v1';
  buffy_version: string;
  generated_at: string;
  platform: {
    os: string;
    os_name: string;
    os_version: string | null;
    kernel: string | null;
    architecture: string;
  };
  hardware: {
    cpu: string | null;
    cpu_cores: number | null;
    ram_gb: number | null;
    ram_available_gb: number | null;
    gpu: string | null;
    gpu_driver: string | null;
    gpu_is_generic: boolean | null;
    storage: Array<{
      mount: string;
      total_gb: number;
      free_gb: number;
      used_percent: number;
    }>;
    temperature_c: number | null;
    process_groups?: Array<{
      name: string;
      count: number;
      total_memory_mb: number;
    }>;
  };
  environment: {
    shell: string | null;
    node_version: string | null;
  };
  tools: Array<{
    name: string;
    available: boolean;
    version: string | null;
  }>;
  privileges: {
    shell: boolean;
    shizuku: boolean;
    root: boolean;
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

// ─── Platform Adapter (no execute — detection only) ────────

export interface PlatformAdapter {
  readonly name: string;
  detect(): Promise<PlatformInfo>;
  systemInfo(): Promise<SystemInfo>;
  capabilities(): Promise<Capability[]>;
}

// ─── Model Feasibility (v0.9) ─────────────────────────────

export type FeasibilityLevel = 'fit' | 'constrained' | 'unfit';

export interface ModelSpec {
  name: string;
  estimatedRamGB: number;
  minCpuCores: number;
  requiresGpu: boolean;
  minVramGB?: number;
  maxContext: number;
}

export interface ExecutionLimits {
  maxContext: number;
  concurrency: number;
  monitorMemory: boolean;
  timeout: number;
}

export interface ModelAlternative {
  model: string;
  reason: string;
  estimatedRamGB: number;
  expectedLevel: FeasibilityLevel;
}

export interface ModelFeasibility {
  level: FeasibilityLevel;
  reason: string;
  limits?: ExecutionLimits;
  alternatives?: ModelAlternative[];
}

// ─── Diagnostic Router (v0.9) ─────────────────────────────

export interface NextDiagnostic {
  domain: string;
  check: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  requiredEvidence: string[];
}

export interface EvidenceGap {
  domain: string;
  importance: 'critical' | 'useful' | 'optional';
  reason: string;
}

export interface DiagnosticConclusions {
  supported: string[];
  uncertain: string[];
  unsupported: string[];
}

export interface DiagnosticRouting {
  symptomDomain: string;
  nextDiagnostic: NextDiagnostic;
  evidenceGaps: EvidenceGap[];
  currentConclusion: DiagnosticConclusions;
}
