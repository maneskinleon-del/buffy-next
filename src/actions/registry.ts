// Buffy Next — Action Registry
// Central catalog of all available actions

import type { CheckResult, ActionDefinition } from '../core/types.js';
import { checkDriverStatus } from './catalog/check-driver-status.js';
import { changePowerPlan } from './catalog/change-power-plan.js';
import { checkSystemTemp } from './catalog/check-system-temp.js';
import { checkGpuDriver } from './catalog/check-gpu-driver.js';
import { listProcesses } from './catalog/list-processes.js';
import { installTool } from './catalog/install-tool.js';

const ALL_ACTIONS: ActionDefinition[] = [
  checkGpuDriver,
  checkDriverStatus,
  checkSystemTemp,
  listProcesses,
  installTool,
  changePowerPlan,
];

export function getAllActions(): ActionDefinition[] {
  return ALL_ACTIONS;
}

export function findActionById(id: string): ActionDefinition | undefined {
  return ALL_ACTIONS.find(a => a.id === id);
}

export function findActionsForIssue(items: CheckResult[]): ActionDefinition[] {
  const actions: ActionDefinition[] = [];
  const suggestedIds = new Set<string>();

  for (const item of items) {
    if (item.suggestedAction) {
      suggestedIds.add(item.suggestedAction);
    }
  }

  for (const action of ALL_ACTIONS) {
    if (suggestedIds.has(action.id)) {
      actions.push(action);
    }
  }

  // If no specific actions matched, return all AUTO_SAFE actions as suggestions
  if (actions.length === 0) {
    return ALL_ACTIONS.filter(a => a.level === 'auto_safe');
  }

  return actions;
}
