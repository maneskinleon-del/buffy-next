// Buffy Next — Action: Check Shizuku (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const checkShizuku: ActionDefinition = {
  id: 'check-shizuku',
  name: 'Verificar Shizuku',
  description: 'Ejecuta un comando read-only vía rish para confirmar que Shizuku está funcional',
  level: 'auto_safe',
  reversible: false,
  platforms: ['android-termux'],
  prerequisites: ['shizuku'],
};
