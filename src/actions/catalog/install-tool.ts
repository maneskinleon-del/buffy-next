// Buffy Next — Action: Install Tool
// CONFIRM: installs a tool via winget (Windows) or pkg (Termux)

import type { ActionDefinition } from '../../core/types.js';

// The tool name is passed via a module variable set before execution.
// Input is sanitized: only alphanumeric, hyphens, dots, and underscores.
let pendingTool: string = 'node';

/** Sanitize tool name: reject shell metacharacters, allow only safe package identifiers */
function sanitizeToolName(name: string): string {
  // Only allow: letters, numbers, hyphens, dots, underscores, slashes (for scoped packages)
  const sanitized = name.replace(/[^a-zA-Z0-9._\-/]/g, '');
  if (!sanitized || sanitized.length === 0 || sanitized.length > 100) {
    throw new Error(`Nombre de paquete inválido: "${name}"`);
  }
  return sanitized;
}

export const installTool: ActionDefinition = {
  id: 'install-tool',
  name: 'Instalar herramienta',
  description: 'Instala una herramienta en el sistema vía gestor de paquetes',
  level: 'confirm',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],

  async dryRun() {
    if (process.platform === 'win32') {
      return `winget install ${pendingTool}`;
    } else {
      return `pkg install -y ${pendingTool}`;
    }
  },

  async execute() {
    try {
      const { execSync } = await import('child_process');
      let result = '';

      if (process.platform === 'win32') {
        result = execSync(
          `winget install --id ${pendingTool} --accept-source-agreements --accept-package-agreements`,
          { encoding: 'utf-8', timeout: 120_000 },
        );
      } else {
        result = execSync(
          `pkg install -y ${pendingTool}`,
          { encoding: 'utf-8', timeout: 120_000 },
        );
      }

      return {
        success: true,
        message: `${pendingTool} instalado correctamente`,
        details: { tool: pendingTool, platform: process.platform === 'win32' ? 'windows' : 'android-termux' },
      };
    } catch (error) {
      return {
        success: false,
        message: `Error instalando ${pendingTool}: ${error instanceof Error ? error.message : String(error)}`,
        details: { tool: pendingTool },
      };
    }
  },

  async verify() {
    try {
      const { execSync } = await import('child_process');
      if (process.platform === 'win32') {
        execSync(`winget list --id ${pendingTool}`, { encoding: 'utf-8', timeout: 10_000 });
      } else {
        execSync(`command -v ${pendingTool}`, { encoding: 'utf-8', timeout: 5_000 });
      }
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Set the tool to install. Used by CLI when parsing arguments.
 */
export function setInstallTarget(toolName: string): void {
  pendingTool = sanitizeToolName(toolName);
}
