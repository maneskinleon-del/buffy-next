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
