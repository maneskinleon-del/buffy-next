// Buffy Next — Action: Check GPU Driver (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';


export const checkGpuDriver: ActionDefinition = {
  id: 'check-gpu-driver',
  name: 'Verificar driver de GPU',
  description: 'Detecta si tu GPU usa un driver genérico o oficial',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};
