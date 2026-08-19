// Buffy Next — Diagnose
// Directed diagnosis based on user query

import type { PlatformAdapter, CheckResult, ActionDefinition } from './types.js';
import { selectChecks } from './check-selector.js';
import { findActionsForIssue } from '../actions/registry.js';

export interface DiagnosisResult {
  items: CheckResult[];
  suggestedActions: ActionDefinition[];
}

export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosisResult> {
  const checks = selectChecks(query);
  const systemInfo = await adapter.systemInfo();
  const items = analyzeForQuery(systemInfo, checks);
  const suggestedActions = findActionsForIssue(items);

  return { items, suggestedActions };
}

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
        suggestedAction: 'install-official-driver',
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

  return items;
}
