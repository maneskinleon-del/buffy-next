// Buffy Next — Action: Check Network (v1.0)
// Metadata only. Executor is private in pipeline.ts.

import type { ActionDefinition } from '../../core/types.js';

export const checkNetwork: ActionDefinition = {
  id: 'check-network',
  name: 'Verificar estado de red',
  description: 'Verifica conectividad, DNS y estado de interfaz de red',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
