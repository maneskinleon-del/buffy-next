// Buffy Next — Action: List Processes (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const listProcesses: ActionDefinition = {
  id: 'list-processes',
  name: 'Listar procesos activos',
  description: 'Muestra los procesos que más CPU y memoria están usando',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
