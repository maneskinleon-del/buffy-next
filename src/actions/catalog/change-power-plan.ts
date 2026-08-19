// Buffy Next — Action: Change Power Plan
// CONFIRM: changes Windows power plan to High Performance

import type { ActionDefinition } from '../../core/types.js';

const HIGH_PERFORMANCE_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

let previousPlan: string | null = null;
// NOTE: previousPlan is module-scoped. If the process restarts between execute and rollback,
// the rollback data is lost. For production, persist via ActionResult.details + state.json.
// For now, this works because Buffy CLI runs as a single process.

export const changePowerPlan: ActionDefinition = {
  id: 'change-power-plan',
  name: 'Cambiar plan de energía a Alto rendimiento',
  description: 'Cambia el plan de energía de Windows a "Alto rendimiento" para mejor rendimiento en juegos',
  level: 'confirm',
  reversible: true,
  platforms: ['windows'],
  prerequisites: ['PowerShell'],

  async dryRun() {
    return 'powercfg /setactive ' + HIGH_PERFORMANCE_GUID;
  },

  async execute() {
    try {
      const { execSync } = await import('child_process');

      previousPlan = execSync(
        'powercfg /getactivescheme',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      execSync(
        `powercfg /setactive ${HIGH_PERFORMANCE_GUID}`,
        { encoding: 'utf-8', timeout: 5000 }
      );

      const active = execSync(
        'powercfg /getactivescheme',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      const isHighPerf = active.includes(HIGH_PERFORMANCE_GUID);

      return {
        success: isHighPerf,
        message: isHighPerf
          ? 'Plan de energía cambiado a "Alto rendimiento"'
          : 'No se pudo cambiar el plan de energía',
        details: { active, previous: previousPlan, previousPlan },
      };
    } catch (error) {
      return {
        success: false,
        message: `Error cambiando plan de energía: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async verify() {
    try {
      const { execSync } = await import('child_process');
      const active = execSync('powercfg /getactivescheme', { encoding: 'utf-8', timeout: 5000 });
      return active.includes(HIGH_PERFORMANCE_GUID);
    } catch {
      return false;
    }
  },

  async rollback() {
    if (!previousPlan) return;

    try {
      const { execSync } = await import('child_process');
      const guid = previousPlan.split(' ')[0];
      execSync(`powercfg /setactive ${guid}`, { encoding: 'utf-8', timeout: 5000 });
    } catch {
      // Rollback failed silently — state may be inconsistent
    }
  },
};
