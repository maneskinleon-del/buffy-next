// Buffy Next — Core Types (v2.4 — Freshness Gating E4.2)
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
export type CPUInfo = { model: string; cores: number; usage: number | null };
export type MemoryInfo = { totalGB: number | null; availableGB: number | null; usedPercent: number };
export type GPUInfo = { name: string; driver: string; isGeneric: boolean | null };
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
/**
 * Closed set of check names — only checks with real implementations.
 * Adding a new check requires updating this type AND buildObservations().
 */
export type CheckName =
  | 'cpu'
  | 'ram'
  | 'gpu'
  | 'temperature'
  | 'processes'
  | 'storage'
  | 'network';

/**
 * Closed set of observation categories.
 * Using a union type prevents typos (e.g. 'memroy') and makes
 * CATEGORY_TO_ACTIONS exhaustive at compile time.
 */
export type ObservationCategory =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'temperature'
  | 'processes'
  | 'storage'
  | 'network';

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
  /** Momento en que la medición fue tomada (E4.1) */
  observedAt?: string;
  /** Fuente de la medición (E4.1) */
  source?: string;
}

/** Backward compat alias */
export type DiagnosticItem = CheckResult;

// ─── Epistemic State (E4.1) ───────────────────────────────

/**
 * Estado epistémico de una observación.
 *
 * OBSERVED  — dato medido directamente del sistema, dentro del umbral de frescura.
 * INFERRED  — dato derivado de OBSERVED, no medido directamente.
 * STALE     — dato que fue OBSERVED pero cuya edad excede el FreshnessPolicy.
 * UNKNOWN   — no se pudo obtener el dato; se omite el value.
 */
export type EpistemicState = 'observed' | 'inferred' | 'stale' | 'unknown';

// ─── Observation & Inference (remote v0.4.0 → v2.3 E4.1) ─

/** A measured fact from the system — pure data, no interpretation */
export interface Observation {
  /** Human-readable fact string */
  fact: string;
  /** Numeric value if applicable */
  value?: number;
  /** Unit (%, °C, cores, GB, etc.) */
  unit?: string;
  /** Category — closed union, prevents typos and ensures exhaustive registry */
  category: ObservationCategory;
  /** Thresholds that were applied for classification */
  threshold?: {
    warning: number;
    error: number;
  };
  /** Severity: ok = within range, warning = exceeded threshold, error = critical */
  severity: 'ok' | 'warning' | 'error' | 'unknown';

  /** Momento en que la medición fue tomada (ISO 8601) */
  observedAt: string;
  /** Fuente que produjo la medición (e.g., "LinuxAdapter.detectCpu") */
  source: string;
  /** Estado epistémico resuelto por Buffy */
  epistemicState: EpistemicState;
  /** Edad en ms desde observedAt hasta "ahora" (calculada al compactar) */
  ageMs?: number;
}

/** An inference derived from observations — possible cause, not confirmed */
export interface Inference {
  /** Which observations this inference is based on */
  basedOn: string[];
  /** Human-readable inference statement */
  statement: string;
  /** Whether this is a possible cause (always true for MVP) */
  possible: boolean;
}

// ─── Context Scoring (local v0.6) ─────────────────────────

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

// ─── Action Grounding (local v0.7) ────────────────────────

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
  observations: Observation[];
  inferences: Inference[];
  suggestedActions: SuggestedAction[];
}

export interface SuggestedAction {
  action: ActionDefinition;
  reason: string;
}

// ─── Freshness Gating (E4.2) ─────────────────────────────

/**
 * Resultado del freshness gating.
 * Separa observaciones frescas de las que necesitan refresh.
 */
export interface GatedResult {
  /** Observaciones frescas que entran al contexto */
  included: CheckResult[];
  /** Campos stale que fueron refrescados exitosamente */
  refreshed: CheckResult[];
  /** IDs de campos stale que se omitieron (irrelevantes) */
  omittedStale: string[];
  /** IDs de campos que necesitan refresh pero no se pudieron refrescar */
  needsRefresh: string[];
  /** Instrumentación por campo para debugging */
  instrumentation: FreshnessInstrumentation[];
}

/**
 * Instrumentación de una decisión de freshness.
 * Registra el estado antes/después y si se realizó refresh.
 */
export interface FreshnessInstrumentation {
  /** Nombre del campo (e.g., "ram", "cpu", "temperature") */
  field: string;
  /** Estado epistémico antes del gating */
  epistemicStateBefore: string;
  /** Si se solicitó refresh */
  refreshRequired: boolean;
  /** Si se ejecutó refresh */
  refreshPerformed: boolean;
  /** Estado epistémico después del gating */
  epistemicStateAfter: string;
  /** Edad en ms después del refresh (si aplica) */
  ageMsAfter: number;
  /** Si最终 entró al contexto */
  includedInContext: boolean;
}

export interface DoctorReport {
  platform: PlatformInfo;
  system: SystemInfo;
  capabilities: Capability[];
  privileges?: PlatformCapabilities;
  items: CheckResult[];
  /** Momento en que se generó el reporte completo (E4.1) */
  generatedAt: string;
  /** @deprecated Use generatedAt */
  timestamp?: string;
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

// ─── Hardware Field (E4.1) ─────────────────────────────────

/**
 * Campo de hardware con metadata temporal.
 * Reemplaza valores primitivos en BuffyContext.hardware.
 */
export interface HardwareField {
  /** El valor. null solo si epistemicState === 'unknown' */
  value: number | string | boolean | null;
  /** Para valores numéricos */
  unit?: string;
  /** Momento en que se midió */
  observedAt: string;
  /** Edad en ms desde observedAt */
  ageMs: number;
  /** Estado epistémico resuelto por Buffy */
  freshness: 'observed' | 'stale' | 'unknown';
  /** Fuente de la medición (adapter + método) */
  source: string;
}

// ─── Context Package (v2 → E4.1) ──────────────────────────

export interface BuffyContext {
  schema: 'buffy.context/v1' | 'buffy.context/v2';
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
    cpu: HardwareField | null;
    cpu_cores: number | null;
    ram_gb: HardwareField | null;
    ram_available_gb: HardwareField | null;
    gpu: HardwareField | null;
    gpu_driver: HardwareField | null;
    gpu_is_generic: HardwareField | null;
    storage: Array<{
      mount: string;
      total_gb: number;
      free_gb: number;
      used_percent: number;
    }>;
    temperature_c: HardwareField | null;
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
