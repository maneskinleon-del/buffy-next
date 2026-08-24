// Buffy Next — Diagnose (v0.8 canonical pipeline)
//
// SECURITY: diagnose = observe + recommend. NEVER executes actions.
// Execution is exclusively via cmdAct → executeWithGates.
//
// Pipeline:
//   query → selectChecks → scoreContext → systemInfo → analyzeForQuery → mapActions → DiagnosticResponse

import type {
  PlatformAdapter,
  CheckResult,
  CheckSelection,
  RecommendedAction,
  PlatformName,
  Observability,
  ObservabilityStatus,
} from './types.js';
import { selectChecks } from './check-selector.js';
import { scoreContext } from './context-scorer.js';
import { mapActions } from './action-mapper.js';
import { computeNextDiagnostic } from './diagnostic-router.js';

// ─── Output type ───────────────────────────────────────────

// Re-export Observability types from types.ts (canonical source)
export type { ObservabilityStatus, Observability } from './types.js';

export interface DiagnosticResponse {
  /** Original user query */
  query: string;
  /** v0.6: what checks were selected and why */
  selection: CheckSelection;
  /** Why observations may be empty — resolves the [] ambiguity */
  observability: Observability;
  /** Real system observations with severity */
  observations: CheckResult[];
  /** v0.8: recommended actions with instructions and confidence */
  actions: RecommendedAction[];
  /** Platform for instruction selection */
  platform: PlatformName;
  /** v0.9: next diagnostic recommendation (optional) */
  nextDiagnostic?: import('./types.js').DiagnosticRouting;
}

// ─── Canonical pipeline ────────────────────────────────────

export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosticResponse> {
  // 1. Lexical selection (v0.5-B)
  const lexicalChecks = selectChecks(query);

  // 2. Context scoring (v0.6) — refines selection with fragment splitting + entity binding
  const selection = scoreContext(query, lexicalChecks);

  // 3. System data (adapter) — real hardware measurements
  const systemInfo = await adapter.systemInfo();

  // 4. Observations — convert CheckName[] to CheckResult[] with real severity
  const observations = analyzeForQuery(systemInfo, selection.checks);

  // 5. Observability — why observations may be empty
  const observability = computeObservability(selection.checks, observations);

  // 6. Action mapping (v0.8) — eligibility + conflict resolution + instructions
  const platform = adapter.name as PlatformName;
  const actions = mapActions(observations, platform);

  // 7. Diagnostic routing (v0.9) — next best check recommendation
  const nextDiagnostic = computeNextDiagnostic(
    query, selection, observations, observability,
  );

  return { query, selection, observability, observations, actions, platform, nextDiagnostic };
}

// ─── Observability ────────────────────────────────────────
// Resolves the ambiguity of empty observations[]

/** Checks that analyzeForQuery can actually observe */
const OBSERVABLE_CHECKS = new Set([
  'cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes', 'network',
]);

function computeObservability(
  selectedChecks: string[],
  observations: CheckResult[],
): Observability {
  // No checks selected → non-diagnostic query
  if (selectedChecks.length === 0) {
    return {
      status: 'no_evidence',
      reason: 'Consulta no diagnóstica o sin patrones reconocidos.',
    };
  }

  // Some observations produced
  if (observations.length > 0) {
    // Check if any selected checks were NOT observable
    const unsupported = selectedChecks.filter(c => !OBSERVABLE_CHECKS.has(c));
    if (unsupported.length > 0 && observations.length < selectedChecks.length) {
      return {
        status: 'partial',
        reason: `Algunos checks no son observables: ${unsupported.join(', ')}.`,
        unsupportedChecks: unsupported,
      };
    }
    return {
      status: 'observed',
      reason: `${observations.length} observaciones producidas de ${selectedChecks.length} checks seleccionados.`,
    };
  }

  // Checks selected but NO observations produced
  const unsupported = selectedChecks.filter(c => !OBSERVABLE_CHECKS.has(c));
  if (unsupported.length > 0) {
    return {
      status: 'unsupported',
      reason: `Checks seleccionados no son observables por el adapter: ${unsupported.join(', ')}.`,
      unsupportedChecks: unsupported,
    };
  }

  // Checks selected, all observable, but none produced observations (unexpected)
  return {
    status: 'unsupported',
    reason: `Checks seleccionados (${selectedChecks.join(', ')}) no produjeron observaciones.`,
    unsupportedChecks: selectedChecks,
  };
}

// ─── Observation builder ───────────────────────────────────
// Converts CheckName[] (from selector) into CheckResult[] (with real system data).
// This function is unchanged from the previous version.

function analyzeForQuery(
  system: Awaited<ReturnType<PlatformAdapter['systemInfo']>>,
  checks: string[],
): CheckResult[] {
  const items: CheckResult[] = [];

  if (checks.includes('cpu')) {
    const cpuOk = !system.cpu.usage || system.cpu.usage < 80;
    items.push({
      id: 'cpu-status',
      severity: cpuOk ? 'ok' : 'warning',
      category: 'CPU',
      message: `CPU: ${system.cpu.model} (${system.cpu.cores} cores)`,
    });
  }

  if (checks.includes('ram')) {
    const ramSeverity = system.memory.usedPercent > 90 ? 'error'
      : system.memory.usedPercent > 75 ? 'warning' : 'ok';
    items.push({
      id: 'ram-status',
      severity: ramSeverity,
      category: 'RAM',
      message: `RAM: ${system.memory.availableGB} GB disponibles (${system.memory.usedPercent}% usado)`,
    });
  }

  if (checks.includes('gpu')) {
    if (system.gpu.isGeneric) {
      items.push({
        id: 'gpu-generic-driver',
        severity: 'warning',
        category: 'GPU',
        message: `GPU: ${system.gpu.name} — driver genérico`,
        explanation: 'Un driver genérico limita el rendimiento en juegos y apps gráficas.',
      });
    } else {
      items.push({
        id: 'gpu-driver-ok',
        severity: 'ok',
        category: 'GPU',
        message: `GPU: ${system.gpu.name} (driver: ${system.gpu.driver})`,
      });
    }
  }

  if (checks.includes('temperature') && system.temperature?.cpuCelsius) {
    const temp = system.temperature.cpuCelsius;
    items.push({
      id: 'temperature-status',
      severity: temp > 80 ? 'error' : temp > 65 ? 'warning' : 'ok',
      category: 'Temperatura',
      message: `Temperatura CPU: ${temp}°C`,
    });
  }

  if (checks.includes('storage')) {
    for (const device of system.storage) {
      const severity = device.usedPercent > 95 ? 'error'
        : device.usedPercent > 85 ? 'warning' : 'ok';
      items.push({
        id: `storage-${device.mount}`,
        severity,
        category: 'Almacenamiento',
        message: `Disco ${device.mount}: ${device.freeGB} GB libres / ${device.totalGB} GB`,
      });
    }
  }

  if (checks.includes('processes')) {
    const heavy = system.processes.filter(p => p.cpuPercent > 50);
    if (heavy.length > 0) {
      items.push({
        id: 'heavy-processes',
        severity: 'warning',
        category: 'Procesos',
        message: `Procesos consumiendo mucho CPU: ${heavy.map(p => p.name).join(', ')}`,
      });
    } else {
      items.push({
        id: 'processes-ok',
        severity: 'ok',
        category: 'Procesos',
        message: 'Sin procesos anómalos detectados',
      });
    }
  }

  if (checks.includes('network')) {
    // Network check is informational — adapter reports what it can observe.
    // No real-time connectivity test here; that would be an action, not a check.
    items.push({
      id: 'network-status',
      severity: 'ok',
      category: 'Red',
      message: 'Verificación de red solicitada — ejecuta `buffy act check-network` para diagnóstico detallado',
    });
  }

  return items;
}
