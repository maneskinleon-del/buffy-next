// Buffy Next — Action Registry (v2.2)
// Central catalog of all available actions (metadata only).
// Physical executors are registered separately with ActionGate.

import type { Observation, ObservationCategory, SuggestedAction, ActionDefinition, PlatformName } from '../core/types.js';
import { checkDriverStatus } from './catalog/check-driver-status.js';
import { changePowerPlan } from './catalog/change-power-plan.js';
import { checkSystemTemp } from './catalog/check-system-temp.js';
import { checkGpuDriver } from './catalog/check-gpu-driver.js';
import { listProcesses } from './catalog/list-processes.js';
import { installTool } from './catalog/install-tool.js';
import { checkShizuku } from './catalog/check-shizuku.js';
import { checkNetwork } from './catalog/check-network.js';
import { checkDiskSpace } from './catalog/check-disk-space.js';

const ALL_ACTIONS: ActionDefinition[] = [
  checkGpuDriver,
  checkDriverStatus,
  checkSystemTemp,
  listProcesses,
  installTool,
  changePowerPlan,
  checkShizuku,
  checkNetwork,
  checkDiskSpace,
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
/**
 * Explicit mapping: observation category → action IDs that address it.
 * TypeScript enforces exhaustiveness — adding a new ObservationCategory
 * without updating this record produces a compile error.
 *
 * If a category has no mapping (e.g. 'storage'), the observation is
 * still reported but no action is suggested. This is intentional:
 * "finding a problem ≠ having a fix".
 */
const CATEGORY_TO_ACTIONS: Record<ObservationCategory, string[]> = {
  cpu: [],
  gpu: ['check-gpu-driver', 'check-driver-status'],
  temperature: ['check-system-temp'],
  processes: ['list-processes'],
  memory: ['list-processes'],
  storage: ['check-disk-space'],
  network: ['check-network'],
};

export function findActionsForIssue(
  observations: Observation[],
  platform: string,
): SuggestedAction[] {
  const results: SuggestedAction[] = [];
  const seen = new Set<string>();

  for (const obs of observations) {
    if (obs.severity === 'ok') continue;

    const actionIds = CATEGORY_TO_ACTIONS[obs.category];
    for (const actionId of actionIds) {
      if (seen.has(actionId)) continue;
      const action = ALL_ACTIONS.find(a => a.id === actionId);
      if (!action) continue;

      // Platform filter: only suggest actions available on this platform
      if (!action.platforms.includes(platform as PlatformName)) continue;

      results.push({ action, reason: obs.fact });
      seen.add(actionId);
    }
  }

  return results;
}
