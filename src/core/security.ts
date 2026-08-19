// Buffy Next — Security
// Risk classification and authorization for actions

import type { ActionLevel, ActionDefinition } from './types.js';

/**
 * Classify an action by its risk level
 */
export function classifyAction(action: ActionDefinition): ActionLevel {
  return action.level;
}

/**
 * Check if an action requires authorization
 */
export function requiresAuth(action: ActionDefinition): boolean {
  return action.level === 'confirm';
}

/**
 * Check if an action is forbidden
 */
export function isForbidden(action: ActionDefinition): boolean {
  return action.level === 'forbidden';
}

/**
 * Build the authorization prompt for an action
 */
export function buildAuthPrompt(action: ActionDefinition): string {
  const lines = [
    `📋 ${action.name}`,
    `   ${action.description}`,
    '',
    `   Nivel: ${action.level === 'confirm' ? 'CONFIRM' : action.level.toUpperCase()}`,
    `   Reversible: ${action.reversible ? 'Sí' : 'No'}`,
    `   Plataformas: ${action.platforms.join(', ')}`,
  ];

  if (action.prerequisites.length > 0) {
    lines.push(`   Requiere: ${action.prerequisites.join(', ')}`);
  }

  if (action.dryRun) {
    lines.push('', '   Dry-run:');
  }

  return lines.join('\n');
}

/**
 * Validate that an action can be executed on this platform
 */
export function validateAction(action: ActionDefinition, currentPlatform: string): { valid: boolean; reason?: string } {
  if (!action.platforms.includes(currentPlatform as any)) {
    return { valid: false, reason: `Acción no disponible en ${currentPlatform}` };
  }

  if (action.level === 'forbidden') {
    return { valid: false, reason: 'Acción prohibida — Buffy nunca ejecuta esto' };
  }

  return { valid: true };
}
