// Buffy Next — Action: Check System Temperature (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const checkSystemTemp: ActionDefinition = {
  id: 'check-system-temp',
  name: 'Verificar temperatura del sistema',
  description: 'Lee la temperatura actual del CPU y reporta si está dentro de rango',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
