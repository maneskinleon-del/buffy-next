// Buffy Next — Action: Check Driver Status (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const checkDriverStatus: ActionDefinition = {
  id: 'check-driver-status',
  name: 'Verificar estado del driver de GPU',
  description: 'Lee el driver actual de tu GPU y verifica si es oficial o genérico',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
