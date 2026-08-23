// Buffy Next — Security
// Risk classification and authorization for actions

import type { ActionLevel, ActionDefinition, Capability, PlatformCapabilities } from './types.js';

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

/** Known platform privileges that can be required by actions */
const PRIVILEGE_NAMES = new Set(['shell', 'shizuku', 'root', 'adb']);

/**
 * Check that all prerequisites for an action are available.
 * Handles both tool prerequisites (Capability[]) and privilege prerequisites (PlatformCapabilities).
 */
export function checkPrerequisites(
  action: ActionDefinition,
  toolCapabilities: Capability[],
  privileges?: PlatformCapabilities,
): { valid: boolean; missing: string[] } {
  if (action.prerequisites.length === 0) {
    return { valid: true, missing: [] };
  }

  const installed = new Set(
    toolCapabilities
      .filter(c => c.status === 'installed')
      .map(c => c.name.toLowerCase()),
  );

  const missing: string[] = [];
  for (const prereq of action.prerequisites) {
    const name = prereq.toLowerCase();
    if (PRIVILEGE_NAMES.has(name)) {
      // Privilege prerequisite: check against PlatformCapabilities
      if (!privileges || !privileges[name as keyof PlatformCapabilities]) {
        missing.push(prereq);
      }
    } else {
      // Tool prerequisite: check against installed capabilities
      if (!installed.has(name)) {
        missing.push(prereq);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
