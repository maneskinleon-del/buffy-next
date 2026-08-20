// Buffy Next — Action Registry
// Central catalog of all available actions

import type { Observation, SuggestedAction, ActionDefinition } from '../core/types.js';
import { checkDriverStatus } from './catalog/check-driver-status.js';
import { changePowerPlan } from './catalog/change-power-plan.js';
import { checkSystemTemp } from './catalog/check-system-temp.js';
import { checkGpuDriver } from './catalog/check-gpu-driver.js';
import { listProcesses } from './catalog/list-processes.js';
import { installTool } from './catalog/install-tool.js';
import { checkShizuku } from './catalog/check-shizuku.js';

const ALL_ACTIONS: ActionDefinition[] = [
  checkGpuDriver,
  checkDriverStatus,
  checkSystemTemp,
  listProcesses,
  installTool,
  changePowerPlan,
  checkShizuku,
];

export function getAllActions(): ActionDefinition[] {
  return ALL_ACTIONS;
}

export function findActionById(id: string): ActionDefinition | undefined {
  return ALL_ACTIONS.find(a => a.id === id);
}

/**
 * Explicit mapping: observation category → action IDs that address it.
 * Only AUTO_SAFE actions are auto-suggested; CONFIRM actions need user initiation.
 * IMPORTANT: keep in sync with categories in diagnose.ts buildObservations().
 */
const CATEGORY_TO_ACTIONS: Record<string, string[]> = {
  gpu: ['check-gpu-driver', 'check-driver-status'],
  temperature: ['check-system-temp'],
  processes: ['list-processes'],
  memory: ['list-processes'],
};

export function findActionsForIssue(observations: Observation[]): SuggestedAction[] {
  const results: SuggestedAction[] = [];
  const seen = new Set<string>();

  for (const obs of observations) {
    if (obs.severity === 'ok') continue;

    const actionIds = CATEGORY_TO_ACTIONS[obs.category] ?? [];
    for (const actionId of actionIds) {
      if (seen.has(actionId)) continue;
      const action = ALL_ACTIONS.find(a => a.id === actionId);
      if (action) {
        results.push({ action, reason: obs.fact });
        seen.add(actionId);
      }
    }
  }

  // If no specific actions matched, suggest all AUTO_SAFE actions
  if (results.length === 0) {
    for (const action of ALL_ACTIONS) {
      if (action.level === 'auto_safe') {
        results.push({ action, reason: 'Diagnóstico general del sistema' });
      }
    }
  }

  return results;
}
