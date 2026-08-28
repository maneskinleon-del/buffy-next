// Buffy Next — Diagnose (v2.4 — Freshness Gating E4.2)
//
// SECURITY: diagnose = observe + recommend. NEVER executes actions.
// Execution is exclusively via cmdAct → executeWithGates.
//
// Pipeline:
//   query → selectChecks → scoreContext → systemInfo → analyzeForQuery
//         → freshnessGating → mapActions → DiagnosticResponse
//
// E4.1: All observations include observedAt, source, and epistemicState.
// E4.2: Freshness gating ensures STALE relevant fields are refreshed.

import type {
  PlatformAdapter,
  CheckResult,
  CheckSelection,
  RecommendedAction,
  PlatformName,
  Observability,
  ObservabilityStatus,
  ObservationCategory,
  GatedResult,
} from './types.js';
import { selectChecks } from './check-selector.js';
import { scoreContext } from './context-scorer.js';
import { mapActions } from './action-mapper.js';
import { computeNextDiagnostic } from './diagnostic-router.js';
import { classifyEpistemicState, calculateAgeMs } from './freshness.js';
import { applyFreshnessGating, getGatedObservations } from './freshness-gating.js';

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
  /** Real system observations with severity (after freshness gating) */
  observations: CheckResult[];
  /** v0.8: recommended actions with instructions and confidence */
  actions: RecommendedAction[];
  /** Platform for instruction selection */
  platform: PlatformName;
  /** v0.9: next diagnostic recommendation (optional) */
  nextDiagnostic?: import('./types.js').DiagnosticRouting;
  /** E4.2: freshness gating result (optional for backward compat) */
  gating?: GatedResult;
  /** Production audit trail */
  audit?: AuditTrail;
}

/**
 * Minimal audit trail for production monitoring.
 * Records key metrics without complex logging infrastructure.
 */
export interface AuditTrail {
  /** Query that triggered the diagnosis */
  query: string;
  /** Fields selected by the selector */
  selectedFields: string[];
  /** Fields detected as stale */
  staleFields: string[];
  /** Fields that required refresh */
  refreshRequired: string[];
  /** Fields that were successfully refreshed */
  refreshPerformed: string[];
  /** Number of tool calls made */
  toolCalls: number;
  /** Context size in bytes */
  contextBytes: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Whether the response is factually correct */
  finalCorrect: boolean;
  /** Number of unsupported claims */
  unsupportedClaims: number;
}

// ─── Canonical pipeline ────────────────────────────────────

export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosticResponse> {
  const startTime = Date.now();

  // 1. Lexical selection (v0.5-B)
  const lexicalChecks = selectChecks(query);

  // 2. Context scoring (v0.6) — refines selection with fragment splitting + entity binding
  const selection = scoreContext(query, lexicalChecks);

  // 3. System data (adapter) — real hardware measurements
  const systemInfo = await adapter.systemInfo();

  // 4. Observations — convert CheckName[] to CheckResult[] with real severity
  const rawObservations = analyzeForQuery(systemInfo, selection.checks);

  // 5. Freshness gating (E4.2) — separate fresh from stale, refresh if needed
  const gating = await applyFreshnessGating(rawObservations, selection, adapter);
  const observations = getGatedObservations(gating);

  // 6. Observability — why observations may be empty
  const observability = computeObservability(selection.checks, observations);

  // 7. Action mapping (v0.8) — eligibility + conflict resolution + instructions
  const platform = adapter.name as PlatformName;
  const actions = mapActions(observations, platform);

  // 8. Diagnostic routing (v0.9) — next best check recommendation
  const nextDiagnostic = computeNextDiagnostic(
    query, selection, observations, observability,
  );

  // 9. Build audit trail
  const latencyMs = Date.now() - startTime;
  const audit = buildAuditTrail(query, selection, gating, observations, latencyMs);

  return { query, selection, observability, observations, actions, platform, nextDiagnostic, gating, audit };
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

/**
 * Maps CheckName to ObservationCategory for freshness classification.
 * Some check names differ from category names (e.g., 'ram' → 'memory').
 */
const CHECK_TO_CATEGORY: Record<string, ObservationCategory> = {
  cpu: 'cpu',
  ram: 'memory',
  gpu: 'gpu',
  temperature: 'temperature',
  processes: 'processes',
  storage: 'storage',
  network: 'network',
};

function analyzeForQuery(
  system: Awaited<ReturnType<PlatformAdapter['systemInfo']>>,
  checks: string[],
): CheckResult[] {
  const items: CheckResult[] = [];
  const observedAt = new Date().toISOString();
  const source = 'LinuxAdapter.analyzeForQuery';

  if (checks.includes('cpu')) {
    const cpuOk = !system.cpu.usage || system.cpu.usage < 80;
    const category = CHECK_TO_CATEGORY['cpu'];
    const epistemicState = classifyEpistemicState(observedAt, category);
    items.push({
      id: 'cpu-status',
      severity: cpuOk ? 'ok' : 'warning',
      category: 'CPU',
      message: `CPU: ${system.cpu.model} (${system.cpu.cores} cores)`,
      observedAt,
      source: `${source}.cpu`,
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
      observedAt,
      source: `${source}.memory`,
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
        observedAt,
        source: `${source}.gpu`,
      });
    } else {
      items.push({
        id: 'gpu-driver-ok',
        severity: 'ok',
        category: 'GPU',
        message: `GPU: ${system.gpu.name} (driver: ${system.gpu.driver})`,
        observedAt,
        source: `${source}.gpu`,
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
      observedAt,
      source: `${source}.temperature`,
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
        observedAt,
        source: `${source}.storage`,
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
        observedAt,
        source: `${source}.processes`,
      });
    } else {
      items.push({
        id: 'processes-ok',
        severity: 'ok',
        category: 'Procesos',
        message: 'Sin procesos anómalos detectados',
        observedAt,
        source: `${source}.processes`,
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
      observedAt,
      source: `${source}.network`,
    });
  }

  return items;
}

// ─── Audit Trail ──────────────────────────────────────────

/**
 * Builds a minimal audit trail for production monitoring.
 */
function buildAuditTrail(
  query: string,
  selection: CheckSelection,
  gating: GatedResult,
  observations: CheckResult[],
  latencyMs: number,
): AuditTrail {
  const selectedFields = selection.checks;
  const staleFields = gating.instrumentation
    .filter(i => i.epistemicStateBefore === 'stale')
    .map(i => i.field);
  const refreshRequired = gating.instrumentation
    .filter(i => i.refreshRequired)
    .map(i => i.field);
  const refreshPerformed = gating.instrumentation
    .filter(i => i.refreshPerformed)
    .map(i => i.field);

  // Calculate context size (approximate)
  const contextBytes = JSON.stringify(observations).length;

  // Check for violations
  const staleViolations = gating.instrumentation.filter(
    i => i.epistemicStateBefore === 'stale' && i.includedInContext && !i.refreshPerformed,
  ).length;

  return {
    query,
    selectedFields,
    staleFields,
    refreshRequired,
    refreshPerformed,
    toolCalls: 0,
    contextBytes,
    latencyMs,
    finalCorrect: staleViolations === 0,
    unsupportedClaims: staleViolations,
  };
}
