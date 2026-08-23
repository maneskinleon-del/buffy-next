// Buffy Next — Action: Install Tool (v2.3)
// Metadata only. Executor is private in executor-registry.ts.

import type { ActionDefinition } from '../../core/types.js';

export const installTool: ActionDefinition = {
  id: 'install-tool',
  name: 'Instalar herramienta',
  description: 'Instala una herramienta en el sistema vía gestor de paquetes',
  level: 'confirm',
  reversible: false,
  platforms: ['windows', 'android-termux', 'linux'],
  prerequisites: [],
};
