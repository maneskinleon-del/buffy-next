// Buffy Next — Action: Check Disk Space (v1.0)
// Metadata only. Executor is private in pipeline.ts.

import type { ActionDefinition } from '../../core/types.js';

export const checkDiskSpace: ActionDefinition = {
  id: 'check-disk-space',
  name: 'Verificar espacio en disco',
  description: 'Analiza el uso de espacio en el volumen principal y reporta si está bajo',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
