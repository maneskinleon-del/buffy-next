// Buffy Next — Action Planner (v2.2)
// Generates preview/description text for actions.
// Does NOT execute commands. Does NOT produce side effects.

import type { ActionDefinition, CanonicalRequest } from './types.js';

/**
 * Internal planner that generates human-readable descriptions
 * of what an action would do.
 *
 * Replaces the old dryRun() method on ActionDefinition.
 * All descriptions are static — no command execution.
 */
export class ActionPlanner {
  /**
   * Generate a preview description for an action.
   *
   * @param action - The action metadata
   * @param request - The canonical request (for target-specific previews)
   * @returns Human-readable description of what the action will do
   */
  preview(action: ActionDefinition, request: CanonicalRequest): string | null {
    // Static descriptions based on action ID
    switch (action.id) {
      case 'change-power-plan':
        return 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

      case 'install-tool': {
        const tool = request.target || '(no especificado)';
        return `Instalar "${tool}" vía gestor de paquetes del sistema`;
      }

      case 'check-shizuku':
        return 'RISH_APPLICATION_ID=com.termux rish -c "id"';

      case 'check-gpu-driver':
        return 'Leer información de GPU del sistema y comparar contra patrones de drivers genéricos';

      case 'check-driver-status':
        return 'Leer el driver actual de tu GPU y verificar si es oficial o genérico';

      case 'list-processes':
        return 'Leer la lista de procesos activos del sistema y ordenarlos por uso de CPU/RAM';

      case 'check-system-temp':
        return 'Leer la temperatura actual del CPU y reportar si está dentro de rango';

      default:
        return null;
    }
  }
}
