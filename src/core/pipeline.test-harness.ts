// Buffy Next — Pipeline Test Harness (v2.3)
// Test-only utilities for injecting custom executors and action definitions.
// NOT part of the public API. Only importable by test files.

import { execSync } from 'node:child_process';
import type { ActionDefinition, ActionResult, ActionExecutor, CanonicalRequest, PlatformAdapter, PromptProvider } from './types.js';
import type { ExecutorRegistry } from './executor-registry.js';
import { ActionGate } from './action-gate.js';
import { classifyEvidence } from './execution-evidence.js';
import { renderActionResult, toJSON } from './presenter.js';
import { loadState, updateState, recordEvidence } from '../state/store.js';
import { getAllActions } from '../actions/registry.js';

// ═══════════════════════════════════════════════════════════════════
// PRIVATE EXECUTORS — copied from pipeline.ts for test isolation
// ═══════════════════════════════════════════════════════════════════

function detectLinuxPackageManager(): 'apt' | 'dnf' | 'pacman' | 'zypper' | null {
  try { execSync('command -v apt', { encoding: 'utf-8', timeout: 2000 }); return 'apt'; } catch { /* */ }
  try { execSync('command -v dnf', { encoding: 'utf-8', timeout: 2000 }); return 'dnf'; } catch { /* */ }
  try { execSync('command -v pacman', { encoding: 'utf-8', timeout: 2000 }); return 'pacman'; } catch { /* */ }
  try { execSync('command -v zypper', { encoding: 'utf-8', timeout: 2000 }); return 'zypper'; } catch { /* */ }
  return null;
}

const execInstallTool: ActionExecutor = async (request: CanonicalRequest): Promise<ActionResult> => {
  const tool = request.target;
  if (!tool) {
    return { success: false, message: 'No se especificó qué herramienta instalar' };
  }
  try {
    const { execSync } = await import('child_process');
    let result = '';
    if (request.platform === 'windows') {
      result = execSync(`winget install --id ${tool} --accept-source-agreements --accept-package-agreements`, { encoding: 'utf-8', timeout: 120_000 });
    } else {
      const pm = detectLinuxPackageManager();
      if (pm === 'apt') result = execSync(`sudo apt install -y ${tool}`, { encoding: 'utf-8', timeout: 120_000 });
      else if (pm === 'dnf') result = execSync(`sudo dnf install -y ${tool}`, { encoding: 'utf-8', timeout: 120_000 });
      else if (pm === 'pacman') result = execSync(`sudo pacman -S --noconfirm ${tool}`, { encoding: 'utf-8', timeout: 120_000 });
      else if (pm === 'zypper') result = execSync(`sudo zypper install -y ${tool}`, { encoding: 'utf-8', timeout: 120_000 });
      else result = execSync(`pkg install -y ${tool}`, { encoding: 'utf-8', timeout: 120_000 });
    }
    return { success: true, message: `${tool} instalado correctamente`, details: { tool, platform: request.platform } };
  } catch (error) {
    return { success: false, message: `Error instalando ${tool}: ${error instanceof Error ? error.message : String(error)}`, details: { tool } };
  }
};

const HIGH_PERFORMANCE_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

const execChangePowerPlan: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    const previousPlan = execSync('powercfg /getactivescheme', { encoding: 'utf-8', timeout: 5000 }).trim();
    execSync(`powercfg /setactive ${HIGH_PERFORMANCE_GUID}`, { encoding: 'utf-8', timeout: 5000 });
    const active = execSync('powercfg /getactivescheme', { encoding: 'utf-8', timeout: 5000 }).trim();
    const isHighPerf = active.includes(HIGH_PERFORMANCE_GUID);
    return {
      success: isHighPerf,
      message: isHighPerf ? 'Plan de energía cambiado a "Alto rendimiento"' : 'No se pudo cambiar el plan de energía',
      details: { active, previous: previousPlan, previousPlan },
    };
  } catch (error) {
    return { success: false, message: `Error cambiando plan de energía: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const execCheckShizuku: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    const appId = process.env.RISH_APPLICATION_ID ?? 'com.termux';
    const result = execSync('rish -c "id"', { encoding: 'utf-8', timeout: 10_000, env: { ...process.env, RISH_APPLICATION_ID: appId } }).trim();
    const uidMatch = result.match(/uid=(\d+)\(([^)]+)\)/);
    const uid = uidMatch?.[1] ?? 'unknown';
    const identity = uidMatch?.[2] ?? 'unknown';
    return { success: true, message: `Shizuku funcional — UID: ${uid} (${identity})`, details: { rawOutput: result, uid, identity, rishApplicationId: appId } };
  } catch (error) {
    return { success: false, message: `Shizuku no responde: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const GENERIC_GPU_PATTERNS = ['Microsoft Basic Display', 'Microsoft Basic Render', 'Standard VGA', 'Microsoft Generic'];
function isGenericGpu(name: string): boolean {
  return GENERIC_GPU_PATTERNS.some((p) => name.toLowerCase().includes(p.toLowerCase()));
}

const execCheckGpuDriver: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let gpuName = 'Unknown'; let driverVersion = 'unknown';
    if (process.platform === 'win32') {
      try { const raw = execSync('powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,DriverVersion | ConvertTo-Json -Compress"', { encoding: 'utf-8', timeout: 10_000 }); const gpu = JSON.parse(raw); gpuName = gpu.Name ?? 'Unknown'; driverVersion = gpu.DriverVersion ?? 'unknown'; } catch { /* */ }
    } else {
      try { gpuName = execSync('cat /sys/class/kgsl/kgsl-3d0/gpu_model 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5_000 }).trim(); } catch { /* */ }
      if (!gpuName) { try { gpuName = execSync('dumpsys SurfaceFlinger 2>/dev/null | grep -i "GLES" | head -1 | sed "s/^GLES: //"', { encoding: 'utf-8', timeout: 5_000 }).trim(); } catch { /* */ } }
      if (!gpuName) gpuName = 'Unknown';
    }
    const isGeneric = isGenericGpu(gpuName);
    return { success: true, message: isGeneric ? `Driver genérico detectado: ${gpuName}. Tu GPU no está usando el driver oficial.` : `Driver OK: ${gpuName} (${driverVersion})`, details: { gpuName, driverVersion, isGeneric, platform: process.platform === 'win32' ? 'windows' : 'android-termux' } };
  } catch (error) {
    return { success: false, message: `No se pudo verificar el driver: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const execCheckDriverStatus: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let gpuInfo = '';
    if (process.platform === 'win32') {
      gpuInfo = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController) | Select-Object Name, DriverVersion | ConvertTo-Json"', { encoding: 'utf-8', timeout: 10000 });
    } else {
      gpuInfo = execSync('dumpsys SurfaceFlinger 2>/dev/null | grep -i GLES | head -1 || echo "GPU info not available"', { encoding: 'utf-8', timeout: 10000 });
    }
    const isGeneric = /Basic Display|Microsoft|Standard|Generic/i.test(gpuInfo);
    return { success: true, message: isGeneric ? 'Driver genérico detectado — tu GPU no está usando el driver oficial' : 'Driver oficial detectado — tu GPU tiene un driver correcto', details: { raw: gpuInfo.trim(), isGeneric } };
  } catch (error) {
    return { success: false, message: `No se pudo verificar el driver: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const execListProcesses: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let output = '';
    if (process.platform === 'win32') {
      output = execSync('powershell -NoProfile -NonInteractive -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name,@{N=\'CPU(s)\';E={[math]::Round($_.CPU,1)}},@{N=\'RAM(MB)\';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress"', { encoding: 'utf-8', timeout: 10_000 });
      const processes = JSON.parse(output);
      const list = Array.isArray(processes) ? processes : [processes];
      return { success: true, message: `${list.length} procesos top por CPU: ${list.map((p: any) => `${p.Name}(${p['CPU(s)']}s/${p['RAM(MB)']}MB)`).join(', ')}`, details: { count: list.length, processes: list.map((p: any) => ({ name: p.Name, cpu: p['CPU(s)'], memoryMB: p['RAM(MB)'] })) } };
    } else {
      output = execSync('ps -A 2>/dev/null | head -16', { encoding: 'utf-8', timeout: 5_000 });
      const lines = output.trim().split('\n');
      const processes = lines.filter(line => /^\s*\d+/.test(line)).map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[0] ?? '0', 10);
        let memoryMB = 0;
        try { const status = execSync(`cat /proc/${pid}/status 2>/dev/null | grep VmRSS`, { encoding: 'utf-8', timeout: 2_000 }); const rssKB = parseInt(status.match(/VmRSS:\s+(\d+)/)?.[1] ?? '0', 10); memoryMB = Math.round(rssKB / 1024); } catch { /* */ }
        return { pid, name: parts[parts.length - 1] ?? '?', cpuPercent: 0, memoryMB };
      });
      return { success: true, message: `${processes.length} procesos top por CPU: ${processes.map(p => `${p.name}(${p.cpuPercent}%/${p.memoryMB}MB)`).join(', ')}`, details: { count: processes.length, processes } };
    }
  } catch (error) {
    return { success: false, message: `No se pudieron listar procesos: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const execCheckSystemTemp: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let temp: number | null = null;
    if (process.platform === 'win32') {
      try { const output = execSync('powershell -NoProfile -Command "(Get-CimInstance MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentTemperature"', { encoding: 'utf-8', timeout: 10000 }); const raw = parseInt(output.trim(), 10); if (!isNaN(raw)) temp = Math.round((raw - 2732) / 10); } catch { /* */ }
    } else {
      try { const output = execSync('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }); const raw = parseInt(output.trim(), 10); if (!isNaN(raw)) temp = raw > 1000 ? Math.round(raw / 1000) : raw; } catch { /* */ }
    }
    if (temp === null) return { success: true, message: 'Temperatura no disponible en este sistema', details: { available: false } };
    const severity = temp > 80 ? 'crítica' : temp > 65 ? 'elevada' : 'normal';
    return { success: true, message: `Temperatura CPU: ${temp}°C (${severity})`, details: { celsius: temp, severity, available: true } };
  } catch (error) {
    return { success: false, message: `No se pudo leer la temperatura: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ════════════════════════════════════════════════════════════════════
// PRIVATE EXECUTOR MAP — all executors are internal
// ════════════════════════════════════════════════════════════════════

const PRIVATE_EXECUTOR_MAP: Record<string, ActionExecutor> = {
  'install-tool': execInstallTool,
  'change-power-plan': execChangePowerPlan,
  'check-shizuku': execCheckShizuku,
  'check-gpu-driver': execCheckGpuDriver,
  'check-driver-status': execCheckDriverStatus,
  'list-processes': execListProcesses,
  'check-system-temp': execCheckSystemTemp,
};

// ═══════════════════════════════════════════════════════════════════
// PRIVATE REGISTRY BUILDER — creates the immutable registry
// ═══════════════════════════════════════════════════════════════════

function buildRegistry(overrides?: Record<string, ActionExecutor>): ExecutorRegistry {
  const map = overrides
    ? { ...PRIVATE_EXECUTOR_MAP, ...overrides }
    : PRIVATE_EXECUTOR_MAP;
  return {
    get: (id: string) => map[id],
    has: (id: string) => id in map,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TEST-ONLY INTERNAL EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function executeWithGatesInternal(options: {
  adapter: PlatformAdapter;
  action: ActionDefinition;
  rawParams?: string;
  jsonMode?: boolean;
  resultJsonMode?: boolean;
  promptUser?: PromptProvider;
  actionDefs: ActionDefinition[];
  registry: ExecutorRegistry;
}): Promise<ActionResult> {
  const { adapter, action, rawParams, jsonMode = false, resultJsonMode = false, promptUser, actionDefs, registry } = options;

  const gate = new ActionGate({
    adapter,
    actionDefinitions: actionDefs,
    executorRegistry: registry,
    promptUser,
  });

  if (jsonMode) {
    const preview = gate.getAction(action.id);
    console.log(toJSON({ action: preview, platform: adapter.name, message: 'Modo JSON: ejecución simulada' }));
    return { success: true, message: 'JSON mode: plan shown' };
  }

  const result = await gate.execute(action.id, rawParams);

  if (resultJsonMode) {
    console.log(toJSON({ ...result, actionId: action.id }));
  } else {
    console.log(renderActionResult(result));
  }

  if (result.success) {
    updateState({
      actionHistory: [
        ...loadState().actionHistory,
        { actionId: action.id, timestamp: new Date().toISOString(), success: result.success, message: result.message },
      ].slice(-50),
    });
  }

  // ExecutionEvidence — observational emission (Wiring Gate). Mirrors the
  // production block in pipeline.ts so tests exercise the same path.
  // SYNC: this block is DUPLICATED from pipeline.ts — any change there MUST
  // be mirrored here (TECH DEBT named, not scheduled: the harness keeps its
  // own copy of executeWithGatesInternal for test isolation).
  try {
    const execRecords = gate.getExecutionStore().allRecords();
    if (execRecords.length > 0) {
      const attempts = execRecords.map((r) => ({
        outcome: r.state === 'failed'
          ? ('exception' as const)
          : r.result?.success ? ('success' as const) : ('failed' as const),
        detail: r.result?.message,
      }));
      const finalOutcome = attempts[attempts.length - 1]?.outcome;
      const evidenceRecord = classifyEvidence({
        surface: 'self-action',
        actionId: action.id,
        observedAt: new Date().toISOString(),
        executionId: execRecords[execRecords.length - 1]?.executionId,
        attempts,
        finalOutcome,
        windowCoversAction: true,
      });
      updateState({ evidence: recordEvidence(loadState(), evidenceRecord).evidence });
    }
  } catch (error) {
    // Same contract as the production block: never break the flow, never
    // fail silently.
    console.error('[buffy:evidence] emission failed — ledger gap possible:', error);
  }

  return result;
}

/**
 * TEST HELPER: execute with custom executors and action definitions.
 * NOT part of the public API. Only importable by test files.
 *
 * @internal
 */
export async function executeWithGatesForTests(options: {
  adapter: PlatformAdapter;
  action: ActionDefinition;
  rawParams?: string;
  jsonMode?: boolean;
  promptUser?: PromptProvider;
  actions?: ActionDefinition[];
  customExecutorMap?: Record<string, ActionExecutor>;
}): Promise<ActionResult> {
  const { actions: actionOverrides, customExecutorMap, ...rest } = options;
  const actionDefs = actionOverrides ?? getAllActions();
  const registry = buildRegistry(customExecutorMap);
  return executeWithGatesInternal({ ...rest, actionDefs, registry });
}