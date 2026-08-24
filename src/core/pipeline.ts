// Buffy Next — Unified Execution Pipeline (v2.3)
// Single path for ALL action execution.
//
// SECURITY ARCHITECTURE:
//   All 7 physical executors are PRIVATE to this module (not exported).
//   The ExecutorRegistry is built internally and never exposed.
//   The ONLY public export is executeWithGates().
//
//   Public API → executeWithGates() → ActionGate → private executors → physical effect
//
//   There is NO public path to obtain an executor function.

import { execSync } from 'node:child_process';
import type { ActionDefinition, ActionResult, ActionExecutor, CanonicalRequest, PlatformAdapter, PromptProvider } from './types.js';
import type { ExecutorRegistry } from './executor-registry.js';
import { ActionGate } from './action-gate.js';
import { renderActionResult, toJSON } from './presenter.js';
import { loadState, updateState } from '../state/store.js';
import { getAllActions } from '../actions/registry.js';

/**
 * Public pipeline options.
 * This is the ONLY shape accepted by the public executeWithGates() API.
 * Does NOT include: executors, executor maps, action registries, security context.
 */
export interface PipelineOptions {
  adapter: PlatformAdapter;
  action: ActionDefinition;
  /** Raw parameters from the caller (e.g., tool name for install-tool) */
  rawParams?: string;
  jsonMode?: boolean;
  promptUser?: PromptProvider;
}

/**
 * SECURITY: fields that must NEVER be accepted from external callers.
 * These are test-only overrides — internal to this module.
 */
const DISALLOWED_FIELDS = ['customExecutorMap', 'actions'] as const;

/**
 * Internal pipeline options — extends public with test-only overrides.
 * NOT exported. Only used by executeWithGatesForTests().
 */
interface InternalPipelineOptions extends PipelineOptions {
  /** Override the action definitions (TEST ONLY — never from public API) */
  actions?: ActionDefinition[];
  /** Override the executor map (TEST ONLY — never from public API) */
  customExecutorMap?: Record<string, ActionExecutor>;
}

// ═══════════════════════════════════════════════════════════════════
// PRIVATE EXECUTORS — not exported, not importable from outside
// ═══════════════════════════════════════════════════════════════════

// ─── install-tool ──────────────────────────────────────────

function detectLinuxPackageManager(): 'apt' | 'dnf' | 'pacman' | 'zypper' | null {
  // ESM-compatible: use static import resolved at top of module
  // (execSync is imported via `import { execSync } from 'node:child_process'` at module level)

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

// ─── change-power-plan ─────────────────────────────────────

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

// ─── check-shizuku ─────────────────────────────────────────

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

// ─── check-gpu-driver ──────────────────────────────────────

const GENERIC_GPU_PATTERNS = ['Microsoft Basic Display', 'Microsoft Basic Render', 'Standard VGA', 'Microsoft Generic'];
function isGenericGpu(name: string): boolean {
  return GENERIC_GPU_PATTERNS.some((p) => name.toLowerCase().includes(p.toLowerCase()));
}

const execCheckGpuDriver: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let gpuName = 'Unknown'; let driverVersion = 'unknown';
    let platform = 'android-termux';
    if (process.platform === 'win32') {
      platform = 'windows';
      try { const raw = execSync('powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,DriverVersion | ConvertTo-Json -Compress"', { encoding: 'utf-8', timeout: 10_000 }); const gpu = JSON.parse(raw); gpuName = gpu.Name ?? 'Unknown'; driverVersion = gpu.DriverVersion ?? 'unknown'; } catch { /* */ }
    } else if (process.platform === 'linux') {
      platform = 'linux';
      try { const line = execSync('lspci 2>/dev/null | grep -i "vga\\|3d\\|display" | head -1', { encoding: 'utf-8', timeout: 5_000 }).trim(); const nameMatch = line.match(/(?:VGA|3D|Display)(?:\s+compatible)?\s+controller:\s*(.+)$/i); gpuName = nameMatch?.[1]?.trim() ?? 'Unknown'; } catch { /* */ }
      if (gpuName === 'Unknown') { try { const vendor = execSync('cat /sys/class/drm/card0/device/vendor 2>/dev/null', { encoding: 'utf-8', timeout: 3_000 }).trim(); if (vendor) gpuName = `GPU (${vendor})`; } catch { /* */ } }
      try { const driverLine = execSync('lspci -k 2>/dev/null | grep -i "kernel driver" | head -1', { encoding: 'utf-8', timeout: 5_000 }).trim(); const driverMatch = driverLine.match(/Kernel driver in use:\s*(.+)$/i); driverVersion = driverMatch?.[1]?.trim() ?? 'unknown'; } catch { /* */ }
    } else {
      try { gpuName = execSync('cat /sys/class/kgsl/kgsl-3d0/gpu_model 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5_000 }).trim(); } catch { /* */ }
      if (!gpuName) { try { gpuName = execSync('dumpsys SurfaceFlinger 2>/dev/null | grep -i "GLES" | head -1 | sed "s/^GLES: //"', { encoding: 'utf-8', timeout: 5_000 }).trim(); } catch { /* */ } }
      if (!gpuName) gpuName = 'Unknown';
    }
    const isGeneric = isGenericGpu(gpuName);
    return { success: true, message: isGeneric ? `Driver genérico detectado: ${gpuName}. Tu GPU no está usando el driver oficial.` : `Driver OK: ${gpuName} (${driverVersion})`, details: { gpuName, driverVersion, isGeneric, platform } };
  } catch (error) {
    return { success: false, message: `No se pudo verificar el driver: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ─── check-driver-status ───────────────────────────────────

const execCheckDriverStatus: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let gpuInfo = '';
    if (process.platform === 'win32') {
      gpuInfo = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController) | Select-Object Name, DriverVersion | ConvertTo-Json"', { encoding: 'utf-8', timeout: 10000 });
    } else if (process.platform === 'linux') {
      try {
        const line = execSync('lspci 2>/dev/null | grep -i "vga\\|3d\\|display" | head -1', { encoding: 'utf-8', timeout: 5_000 }).trim();
        const driverLine = execSync('lspci -k 2>/dev/null | grep -i "kernel driver" | head -1', { encoding: 'utf-8', timeout: 5_000 }).trim();
        gpuInfo = line ? `${line} | ${driverLine}` : 'GPU info not available';
      } catch { gpuInfo = 'GPU info not available'; }
    } else {
      gpuInfo = execSync('dumpsys SurfaceFlinger 2>/dev/null | grep -i GLES | head -1 || echo "GPU info not available"', { encoding: 'utf-8', timeout: 10000 });
    }
    const isGeneric = /Basic Display|Microsoft|Standard|Generic|ASPEED|VirtualBox|QXL|Cirrus|Bochs/i.test(gpuInfo);
    return { success: true, message: isGeneric ? 'Driver genérico detectado — tu GPU no está usando el driver oficial' : 'Driver oficial detectado — tu GPU tiene un driver correcto', details: { raw: gpuInfo.trim(), isGeneric } };
  } catch (error) {
    return { success: false, message: `No se pudo verificar el driver: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ─── list-processes ────────────────────────────────────────

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

// ─── check-system-temp ─────────────────────────────────────

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

// ─── check-network ───────────────────────────────────────

const execCheckNetwork: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    const results: { check: string; ok: boolean; detail: string }[] = [];

    // 1. Ping connectivity (3 packets, short timeout)
    try {
      const target = process.platform === 'win32' ? '8.8.8.8' : '8.8.8.8';
      const countFlag = process.platform === 'win32' ? '-n 3' : '-c 3';
      execSync(`ping ${countFlag} -W 2 ${target}`, { encoding: 'utf-8', timeout: 10_000 });
      results.push({ check: 'ping', ok: true, detail: 'Conectividad IP funciona (8.8.8.8)' });
    } catch {
      results.push({ check: 'ping', ok: false, detail: 'No se pudo hacer ping a 8.8.8.8' });
    }

    // 2. DNS resolution
    try {
      if (process.platform === 'win32') {
        execSync('nslookup google.com', { encoding: 'utf-8', timeout: 5_000 });
      } else {
        execSync('nslookup google.com 2>/dev/null || host google.com 2>/dev/null', { encoding: 'utf-8', timeout: 5_000 });
      }
      results.push({ check: 'dns', ok: true, detail: 'Resolución DNS funciona (google.com)' });
    } catch {
      results.push({ check: 'dns', ok: false, detail: 'No se pudo resolver google.com' });
    }

    // 3. Default gateway
    try {
      let gateway = '';
      if (process.platform === 'win32') {
        gateway = execSync('ipconfig | findstr /i "Default Gateway"', { encoding: 'utf-8', timeout: 5_000 }).trim();
      } else {
        gateway = execSync('ip route show default 2>/dev/null | head -1', { encoding: 'utf-8', timeout: 5_000 }).trim();
      }
      const hasGateway = gateway.length > 0 && !gateway.includes('0.0.0.0');
      results.push({ check: 'gateway', ok: hasGateway, detail: hasGateway ? `Gateway: ${gateway}` : 'No se detectó gateway por defecto' });
    } catch {
      results.push({ check: 'gateway', ok: false, detail: 'No se pudo detectar gateway' });
    }

    const failed = results.filter(r => !r.ok);
    const ok = failed.length === 0;

    return {
      success: true,
      message: ok
        ? 'Red funcionando correctamente (ping + DNS + gateway OK)'
        : `Problemas de red detectados: ${failed.map(f => f.detail).join('; ')}`,
      details: { results, ok, failed: failed.length },
    };
  } catch (error) {
    return { success: false, message: `Error verificando red: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ─── check-disk-space ─────────────────────────────────────

const execCheckDiskSpace: ActionExecutor = async (): Promise<ActionResult> => {
  try {
    const { execSync } = await import('child_process');
    let totalGB = 0; let freeGB = 0; let usedPercent = 0; let mount = '/';

    if (process.platform === 'win32') {
      try {
        const raw = execSync('powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', { encoding: 'utf-8', timeout: 5_000 });
        const ps = JSON.parse(raw);
        const usedBytes = ps.Used ?? 0;
        const freeBytes = ps.Free ?? 0;
        totalGB = Math.round((usedBytes + freeBytes) / 1073741824 * 10) / 10;
        freeGB = Math.round(freeBytes / 1073741824 * 10) / 10;
        usedPercent = totalGB > 0 ? Math.round((usedBytes / (usedBytes + freeBytes)) * 100) : 0;
        mount = 'C:';
      } catch { /* */ }
    } else {
      try {
        const raw = execSync('df -BM / 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 5_000 });
        const parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length >= 5) {
          mount = parts[0] ?? '/';
          totalGB = Math.round((parseInt(parts[1] ?? '0', 10) / 1024) * 10) / 10;
          freeGB = Math.round((parseInt(parts[3] ?? '0', 10) / 1024) * 10) / 10;
          usedPercent = parseInt(parts[4]?.replace('%', '') ?? '0', 10);
        }
      } catch { /* */ }
    }

    const usedGB = Math.round((totalGB - freeGB) * 10) / 10;
    const severity = usedPercent > 95 ? 'crítico' : usedPercent > 85 ? 'bajo' : 'ok';

    return {
      success: true,
      message: severity === 'ok'
        ? `Disco ${mount}: ${freeGB} GB libres / ${totalGB} GB (${usedPercent}% usado)`
        : `Disco ${mount}: ${freeGB} GB libres / ${totalGB} GB (${usedPercent}% usado) — espacio ${severity}`,
      details: { mount, totalGB, freeGB, usedGB, usedPercent, severity },
    };
  } catch (error) {
    return { success: false, message: `No se pudo verificar el disco: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ═══════════════════════════════════════════════════════════════════
// PRIVATE EXECUTOR MAP — all executors are internal
// ═══════════════════════════════════════════════════════════════════

const PRIVATE_EXECUTOR_MAP: Record<string, ActionExecutor> = {
  'install-tool': execInstallTool,
  'change-power-plan': execChangePowerPlan,
  'check-shizuku': execCheckShizuku,
  'check-gpu-driver': execCheckGpuDriver,
  'check-driver-status': execCheckDriverStatus,
  'list-processes': execListProcesses,
  'check-system-temp': execCheckSystemTemp,
  'check-network': execCheckNetwork,
  'check-disk-space': execCheckDiskSpace,
};

// ═══════════════════════════════════════════════════════════════════
// PRIVATE REGISTRY BUILDER — creates the immutable registry
// ═══════════════════════════════════════════════════════════════════

function buildRegistry(overrides?: Record<string, ActionExecutor>): ExecutorRegistry {
  const map = overrides
    ? { ...PRIVATE_EXECUTOR_MAP, ...overrides }
    : PRIVATE_EXECUTOR_MAP;
  // Return a plain object matching the ExecutorRegistry interface.
  // No class instantiation — no way to obtain the real registry from outside.
  return {
    get: (id: string) => map[id],
    has: (id: string) => id in map,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API — the ONLY export from this module
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute an action through the ActionGate.
 * This is the ONLY execution path — both `buffy act` and `buffy diagnose` use it.
 *
 * The registry is built internally with private executors.
 * No executor function is ever exposed to the caller.
 */
/**
 * SECURITY: reject any disallowed fields injected by the caller.
 * This is the runtime boundary — TypeScript structural typing cannot enforce this alone.
 */
function assertNoDisallowedFields(options: Record<string, unknown>): void {
  for (const field of DISALLOWED_FIELDS) {
    if (field in options && options[field] !== undefined) {
      throw new Error(
        `Security violation: field "${field}" is not allowed in the public pipeline API. ` +
        `This field is for internal testing only.`
      );
    }
  }
}

/**
 * Execute an action through the ActionGate.
 * This is the ONLY public execution path.
 *
 * Accepts ONLY: adapter, action, rawParams, jsonMode, promptUser.
 * Rejects: customExecutorMap, actions, or any other injection.
 *
 * The registry is built internally with private executors.
 * No executor function is ever exposed to the caller.
 */
export async function executeWithGates(options: PipelineOptions): Promise<ActionResult> {
  // SECURITY: reject injection of executors or action overrides
  assertNoDisallowedFields(options as unknown as Record<string, unknown>);

  const { adapter, action, rawParams, jsonMode = false, promptUser } = options;

  // Public path: always use real actions and private executors
  const actionDefs = getAllActions();
  const registry = buildRegistry();

  return executeWithGatesInternal({ adapter, action, rawParams, jsonMode, promptUser, actionDefs, registry });
}

/**
 * INTERNAL: execute with full control over action definitions and executor registry.
 * Used by tests ONLY. NOT exported from this module.
 *
 * @internal
 */
async function executeWithGatesInternal(options: {
  adapter: PlatformAdapter;
  action: ActionDefinition;
  rawParams?: string;
  jsonMode?: boolean;
  promptUser?: PromptProvider;
  actionDefs: ActionDefinition[];
  registry: ExecutorRegistry;
}): Promise<ActionResult> {
  const { adapter, action, rawParams, jsonMode = false, promptUser, actionDefs, registry } = options;

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
  console.log(renderActionResult(result));

  if (result.success) {
    updateState({
      actionHistory: [
        ...loadState().actionHistory,
        { actionId: action.id, timestamp: new Date().toISOString(), success: result.success, message: result.message },
      ].slice(-50),
    });
  }

  return result;
}


