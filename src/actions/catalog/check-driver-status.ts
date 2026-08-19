// Buffy Next — Action: Check Driver Status
// AUTO_SAFE: reads GPU driver info, reports if generic or official

import type { ActionDefinition } from '../../core/types.js';

export const checkDriverStatus: ActionDefinition = {
  id: 'check-driver-status',
  name: 'Verificar estado del driver de GPU',
  description: 'Lee el driver actual de tu GPU y verifica si es oficial o genérico',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],

  async execute() {
    try {
      const { execSync } = await import('child_process');
      let gpuInfo = '';

      if (process.platform === 'win32') {
        gpuInfo = execSync(
          'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController) | Select-Object Name, DriverVersion | ConvertTo-Json"',
          { encoding: 'utf-8', timeout: 10000 }
        );
      } else {
        gpuInfo = execSync('dumpsys SurfaceFlinger 2>/dev/null | grep -i GLES | head -1 || echo "GPU info not available"',
          { encoding: 'utf-8', timeout: 10000 }
        );
      }

      const isGeneric = /Basic Display|Microsoft|Standard|Generic/i.test(gpuInfo);

      return {
        success: true,
        message: isGeneric
          ? 'Driver genérico detectado — tu GPU no está usando el driver oficial'
          : 'Driver oficial detectado — tu GPU tiene un driver correcto',
        details: { raw: gpuInfo.trim(), isGeneric },
      };
    } catch (error) {
      return {
        success: false,
        message: `No se pudo verificar el driver: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async verify() {
    return true;
  },
};
