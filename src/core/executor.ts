// Buffy Next — Executor (v2.2)
// buildExecutionPlan() — internal validation utility
//
// SECURITY: executeAction() has been REMOVED.
// Physical execution is exclusively via ActionGate → private executor registry.
// There is no public function that directly calls action.execute().
// (ActionDefinition no longer has execute.)

import type { ActionDefinition, Capability, PlatformCapabilities } from './types.js';
import { classifyAction, validateAction, checkPrerequisites } from './security.js';

export interface ExecutionPlan {
  action: ActionDefinition;
  platformValid: boolean;
  levelValid: boolean;
  prerequisitesValid: boolean;
  missingPrerequisites: string[];
  requiresAuth: boolean;
}

/**
 * Build execution plan for an action (validates everything before executing).
 * Internal utility — used by ActionGate and tests.
 */
export async function buildExecutionPlan(
  action: ActionDefinition,
  platform: string,
  capabilities: Capability[] = [],
  privileges?: PlatformCapabilities,
): Promise<ExecutionPlan> {
  const validation = validateAction(action, platform);
  const prereqCheck = checkPrerequisites(action, capabilities, privileges);
  const level = classifyAction(action);
  const requiresAuth = level === 'confirm';

  return {
    action,
    platformValid: validation.valid,
    levelValid: level !== 'forbidden',
    prerequisitesValid: prereqCheck.valid,
    missingPrerequisites: prereqCheck.missing,
    requiresAuth,
  };
}
