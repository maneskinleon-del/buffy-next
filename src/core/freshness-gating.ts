// Buffy Next — Freshness Gating (E4.2)
// Integrates EpistemicState + observedAt + ageMs with Task-adaptive selector.
//
// Rule: STALE + relevante → refresh on-demand, nunca enviar como actual.

import type {
  CheckResult,
  CheckSelection,
  PlatformAdapter,
  GatedResult,
  FreshnessInstrumentation,
} from './types.js';
import { classifyEpistemicState, calculateAgeMs } from './freshness.js';

// ─── CheckName → Category mapping ──────────────────────────

/**
 * Maps check IDs to ObservationCategory for freshness classification.
 * Check IDs follow patterns like: cpu-status, ram-status, gpu-driver-ok, etc.
 */
const CHECK_ID_TO_CATEGORY: Record<string, string> = {
  'cpu-status': 'cpu',
  'ram-status': 'memory',
  'gpu-generic-driver': 'gpu',
  'gpu-driver-ok': 'gpu',
  'temperature-status': 'temperature',
  'heavy-processes': 'processes',
  'processes-ok': 'processes',
  'network-status': 'network',
};

/**
 * Extracts category from a check ID.
 * Falls back to checking if the ID starts with a known prefix.
 */
function extractCategory(checkId: string): string | undefined {
  // Direct lookup
  if (CHECK_ID_TO_CATEGORY[checkId]) {
    return CHECK_ID_TO_CATEGORY[checkId];
  }

  // Prefix matching for storage (storage-/ mount)
  if (checkId.startsWith('storage-')) {
    return 'storage';
  }

  return undefined;
}

// ─── Field → Refresh mapping ───────────────────────────────

/**
 * Maps check IDs to the adapter method that produces them.
 * Used to determine which fields need refresh.
 */
const FIELD_REFRESH_MAP: Record<string, (adapter: PlatformAdapter) => Promise<CheckResult[]>> = {
  'cpu-status': async (adapter) => {
    const info = await adapter.systemInfo();
    return [{
      id: 'cpu-status',
      category: 'CPU',
      severity: !info.cpu.usage || info.cpu.usage < 80 ? 'ok' : 'warning',
      message: `CPU: ${info.cpu.model} (${info.cpu.cores} cores)`,
      observedAt: new Date().toISOString(),
      source: `${adapter.name}.systemInfo.cpu`,
    }];
  },
  'ram-status': async (adapter) => {
    const info = await adapter.systemInfo();
    const severity = info.memory.usedPercent > 90 ? 'error'
      : info.memory.usedPercent > 75 ? 'warning' : 'ok';
    return [{
      id: 'ram-status',
      category: 'RAM',
      severity,
      message: `RAM: ${info.memory.availableGB} GB disponibles (${info.memory.usedPercent}% usado)`,
      observedAt: new Date().toISOString(),
      source: `${adapter.name}.systemInfo.memory`,
    }];
  },
  'temperature-status': async (adapter) => {
    const info = await adapter.systemInfo();
    if (!info.temperature) return [];
    const temp = info.temperature.cpuCelsius;
    return [{
      id: 'temperature-status',
      category: 'Temperatura',
      severity: temp > 80 ? 'error' : temp > 65 ? 'warning' : 'ok',
      message: `Temperatura CPU: ${temp}°C`,
      observedAt: new Date().toISOString(),
      source: `${adapter.name}.systemInfo.temperature`,
    }];
  },
  'heavy-processes': async (adapter) => {
    const info = await adapter.systemInfo();
    const heavy = info.processes.filter(p => p.cpuPercent > 50);
    if (heavy.length === 0) {
      return [{
        id: 'processes-ok',
        category: 'Procesos',
        severity: 'ok',
        message: 'Sin procesos anómalos detectados',
        observedAt: new Date().toISOString(),
        source: `${adapter.name}.systemInfo.processes`,
      }];
    }
    return [{
      id: 'heavy-processes',
      category: 'Procesos',
      severity: 'warning',
      message: `Procesos consumiendo mucho CPU: ${heavy.map(p => p.name).join(', ')}`,
      observedAt: new Date().toISOString(),
      source: `${adapter.name}.systemInfo.processes`,
    }];
  },
  'processes-ok': async (adapter) => {
    const info = await adapter.systemInfo();
    return [{
      id: 'processes-ok',
      category: 'Procesos',
      severity: 'ok',
      message: 'Sin procesos anómalos detectados',
      observedAt: new Date().toISOString(),
      source: `${adapter.name}.systemInfo.processes`,
    }];
  },
};

// ─── Main gating function ──────────────────────────────────

/**
 * Aplica freshness gating a las observaciones.
 *
 * Reglas:
 * - OBSERVED + relevante → incluir
 * - STALE + irrelevante → omitir
 * - STALE + relevante → solicitar refresh
 * - UNKNOWN → omitir
 *
 * @param observations - CheckResult[] del diagnose pipeline
 * @param selection - CheckSelection del selector (qué categorías son relevantes)
 * @param adapter - PlatformAdapter para refresh on-demand
 * @returns GatedResult con observaciones gated e instrumentación
 */
export async function applyFreshnessGating(
  observations: CheckResult[],
  selection: CheckSelection,
  adapter: PlatformAdapter,
): Promise<GatedResult> {
  const included: CheckResult[] = [];
  const refreshed: CheckResult[] = [];
  const omittedStale: string[] = [];
  const needsRefresh: string[] = [];
  const instrumentation: FreshnessInstrumentation[] = [];

  // Build set of relevant check IDs from selection
  const relevantChecks = new Set(
    selection.checks.map(c => `${c}-status`).concat(
      selection.checks.includes('processes') ? ['heavy-processes', 'processes-ok'] : [],
      selection.checks.includes('gpu') ? ['gpu-generic-driver', 'gpu-driver-ok'] : [],
    ),
  );

  for (const obs of observations) {
    if (!obs.observedAt) {
      // Legacy observation without timestamp — include but mark as observed
      included.push(obs);
      continue;
    }

    const category = extractCategory(obs.id) ?? obs.category.toLowerCase();
    const ageMs = calculateAgeMs(obs.observedAt);
    const epistemicState = classifyEpistemicState(obs.observedAt, category as any);
    const isRelevant = relevantChecks.has(obs.id);

    const instr: FreshnessInstrumentation = {
      field: obs.id,
      epistemicStateBefore: epistemicState,
      refreshRequired: false,
      refreshPerformed: false,
      epistemicStateAfter: epistemicState,
      ageMsAfter: ageMs,
      includedInContext: false,
    };

    if (epistemicState === 'observed') {
      // Fresh data — always include
      included.push(obs);
      instr.includedInContext = true;
    } else if (epistemicState === 'stale') {
      if (!isRelevant) {
        // Stale + irrelevant → omit
        omittedStale.push(obs.id);
      } else {
        // Stale + relevant → refresh on-demand
        instr.refreshRequired = true;

        const refreshFn = FIELD_REFRESH_MAP[obs.id];
        if (refreshFn) {
          try {
            const newObs = await refreshFn(adapter);
            if (newObs.length > 0) {
              const freshObs = newObs[0];
              const newAgeMs = calculateAgeMs(freshObs.observedAt!);
              const newState = classifyEpistemicState(freshObs.observedAt!, category as any);

              if (newState === 'observed') {
                // Refresh succeeded — use new data
                refreshed.push(freshObs);
                instr.refreshPerformed = true;
                instr.epistemicStateAfter = 'observed';
                instr.ageMsAfter = newAgeMs;
                instr.includedInContext = true;
              } else {
                // Refresh happened but still stale (very fast degradation)
                needsRefresh.push(obs.id);
                instr.epistemicStateAfter = newState;
                instr.ageMsAfter = newAgeMs;
              }
            } else {
              needsRefresh.push(obs.id);
            }
          } catch {
            needsRefresh.push(obs.id);
          }
        } else {
          // No refresh function available — mark as needs refresh
          needsRefresh.push(obs.id);
        }
      }
    } else {
      // UNKNOWN — omit, don't fabricate
      omittedStale.push(obs.id);
    }

    instrumentation.push(instr);
  }

  return {
    included,
    refreshed,
    omittedStale,
    needsRefresh,
    instrumentation,
  };
}

// ─── Utility: Get all observations after gating ────────────

/**
 * Returns all observations that should be included in the context,
 * combining included + refreshed observations.
 */
export function getGatedObservations(result: GatedResult): CheckResult[] {
  return [...result.included, ...result.refreshed];
}

// ─── Utility: Check if any stale relevant fields exist ─────

/**
 * Checks if there are any stale relevant fields that couldn't be refreshed.
 * Used to determine if the model should be warned about stale data.
 */
export function hasUnresolvedStale(result: GatedResult): boolean {
  return result.needsRefresh.length > 0;
}
