// Buffy Next — Executor
// Executes actions with authorization, verification, and reporting

import type { ActionDefinition, ActionResult, Capability } from './types.js';
import { classifyAction, validateAction, checkPrerequisites } from './security.js';

export interface ExecutionPlan {
  action: ActionDefinition;
  platformValid: boolean;
  levelValid: boolean;
  prerequisitesValid: boolean;
  missingPrerequisites: string[];
  dryRunResult?: string;
  requiresAuth: boolean;
}

/**
 * Build execution plan for an action (validates everything before executing)
 */
export async function buildExecutionPlan(
  action: ActionDefinition,
  platform: string,
  capabilities: Capability[] = [],
  dryRun: boolean = true,
): Promise<ExecutionPlan> {
  const validation = validateAction(action, platform);
  const prereqCheck = checkPrerequisites(action, capabilities);
  const level = classifyAction(action);
  const requiresAuth = level === 'confirm';

  let dryRunResult: string | undefined;
  if (dryRun && action.dryRun) {
    dryRunResult = await action.dryRun();
  }

  return {
    action,
    platformValid: validation.valid,
    levelValid: level !== 'forbidden',
    prerequisitesValid: prereqCheck.valid,
    missingPrerequisites: prereqCheck.missing,
    dryRunResult,
    requiresAuth,
  };
}

/**
 * Execute an action (after authorization)
 */
export async function executeAction(action: ActionDefinition): Promise<ActionResult> {
  try {
    const result = await action.execute();

    // Verify if verify function exists
    if (action.verify) {
      const verified = await action.verify();
      if (!verified) {
        return {
          success: false,
          message: `Acción ejecutada pero la verificación falló: ${action.name}`,
          details: { ...result.details, verified: false },
        };
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      message: `Error ejecutando ${action.name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
