// Buffy Next — Diagnose
// Directed diagnosis based on user query
// Produces Observations (facts) and Inferences (possible causes) separately

import type { PlatformAdapter, Observation, Inference, ActionDefinition, DiagnosticResult, CheckName } from './types.js';
import { selectChecks } from './check-selector.js';
import { findActionsForIssue } from '../actions/registry.js';

export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosticResult> {
  const checks = selectChecks(query);
  const systemInfo = await adapter.systemInfo();
  const observations = buildObservations(systemInfo, checks);
  const inferences = deriveInferences(observations);
  const suggestedActions = findActionsForIssue(observations, adapter.name);

  return { observations, inferences, suggestedActions };
}

function buildObservations(
  system: Awaited<ReturnType<PlatformAdapter['systemInfo']>>,
  checks: CheckName[],
): Observation[] {
  const obs: Observation[] = [];

  if (checks.includes('cpu')) {
    // CPU identity is always known (model, cores).
    // Usage is a runtime metric that may be unavailable.
    // Severity reflects the hardware identification, not the usage metric.
    const cpuSeverity = system.cpu.usage != null && system.cpu.usage >= 80
      ? 'warning'
      : 'ok';
    obs.push({
      fact: `CPU: ${system.cpu.model} (${system.cpu.cores} cores)`,
      value: system.cpu.cores,
      unit: 'cores',
      category: 'cpu',
      severity: cpuSeverity,
    });
  }

  if (checks.includes('ram')) {
    const severity = system.memory.usedPercent > 90 ? 'error'
      : system.memory.usedPercent > 75 ? 'warning' : 'ok';
    obs.push({
      fact: `RAM: ${system.memory.availableGB} GB disponibles (${system.memory.usedPercent}% usado)`,
      value: system.memory.usedPercent,
      unit: '%',
      category: 'memory',
      threshold: { warning: 75, error: 90 },
      severity,
    });
  }

  if (checks.includes('gpu')) {
    if (system.gpu.isGeneric) {
      obs.push({
        fact: `GPU: ${system.gpu.name} — driver genérico`,
        category: 'gpu',
        severity: 'warning',
      });
    } else {
      obs.push({
        fact: `GPU: ${system.gpu.name} (driver: ${system.gpu.driver})`,
        category: 'gpu',
        severity: 'ok',
      });
    }
  }

  if (checks.includes('temperature')) {
    const temp = system.temperature?.cpuCelsius;
    if (temp != null) {
      obs.push({
        fact: `Temperatura CPU: ${temp}°C`,
        value: temp,
        unit: '°C',
        category: 'temperature',
        threshold: { warning: 65, error: 80 },
        severity: temp > 80 ? 'error' : temp > 65 ? 'warning' : 'ok',
      });
    } else {
      obs.push({
        fact: 'Temperatura no disponible en este sistema',
        category: 'temperature',
        severity: 'unknown',
      });
    }
  }

  if (checks.includes('storage')) {
    for (const device of system.storage) {
      const severity = device.usedPercent > 95 ? 'error'
        : device.usedPercent > 85 ? 'warning' : 'ok';
      obs.push({
        fact: `Disco ${device.mount}: ${device.freeGB} GB libres / ${device.totalGB} GB`,
        value: device.freeGB,
        unit: 'GB',
        category: 'storage',
        threshold: { warning: 85, error: 95 },
        severity,
      });
    }
  }

  if (checks.includes('processes')) {
    const heavy = system.processes.filter(p => p.cpuPercent > 50);
    if (heavy.length > 0) {
      obs.push({
        fact: `Procesos consumiendo mucho CPU: ${heavy.map(p => p.name).join(', ')}`,
        category: 'processes',
        severity: 'warning',
      });
    } else {
      obs.push({
        fact: 'Sin procesos anómalos detectados',
        category: 'processes',
        severity: 'ok',
      });
    }
  }

  return obs;
}

/**
 * Derive inferences from observations.
 * Each inference represents a POSSIBLE cause — never a confirmed diagnosis.
 */
function deriveInferences(observations: Observation[]): Inference[] {
  const inferences: Inference[] = [];

  const ramObs = observations.find(o => o.category === 'memory' && (o.severity === 'warning' || o.severity === 'error'));
  if (ramObs) {
    inferences.push({
      basedOn: [ramObs.fact],
      statement: `Presión de memoria — ${ramObs.value ?? '?'}% de RAM usado podría contribuir al problema`,
      possible: true,
    });
  }

  const tempObs = observations.find(o => o.category === 'temperature' && (o.severity === 'warning' || o.severity === 'error'));
  if (tempObs) {
    inferences.push({
      basedOn: [tempObs.fact],
      statement: `Temperatura elevada — ${tempObs.value ?? '?'}°C podría estar causando throttling`,
      possible: true,
    });
  }

  // Combined inference when both memory and temperature are elevated
  if (ramObs && tempObs) {
    inferences.push({
      basedOn: [ramObs.fact, tempObs.fact],
      statement: 'Combinación de presión de memoria y temperatura elevada',
      possible: true,
    });
  }

  const gpuObs = observations.find(o => o.category === 'gpu' && (o.severity === 'warning' || o.severity === 'error'));
  if (gpuObs) {
    inferences.push({
      basedOn: [gpuObs.fact],
      statement: 'Driver de GPU genérico — podría limitar rendimiento gráfico',
      possible: true,
    });
  }

  const heavyProcesses = observations.find(o => o.category === 'processes' && (o.severity === 'warning' || o.severity === 'error'));
  if (heavyProcesses) {
    inferences.push({
      basedOn: [heavyProcesses.fact],
      statement: heavyProcesses.fact,
      possible: true,
    });
  }

  const storageObs = observations.find(o => o.category === 'storage' && (o.severity === 'warning' || o.severity === 'error'));
  if (storageObs) {
    inferences.push({
      basedOn: [storageObs.fact],
      statement: 'El espacio disponible es bajo y podría contribuir a problemas de rendimiento',
      possible: true,
    });
  }

  return inferences;
}
