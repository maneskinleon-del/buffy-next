// Buffy Next — Action: Change Power Plan (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const changePowerPlan: ActionDefinition = {
  id: 'change-power-plan',
  name: 'Cambiar plan de energía a Alto rendimiento',
  description: 'Cambia el plan de energía de Windows a "Alto rendimiento" para mejor rendimiento en juegos',
  level: 'confirm',
  reversible: true,
  platforms: ['windows'],
  prerequisites: ['PowerShell'],
};
