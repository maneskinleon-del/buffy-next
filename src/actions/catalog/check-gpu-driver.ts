// Buffy Next — Action: Check GPU Driver
// AUTO_SAFE: detects generic GPU driver, reports status
// Per spec v2.1 §9.1: does NOT install drivers, only detects and reports

import type { ActionDefinition } from '../../core/types.js';
import { isGenericGpu } from '../../shared/gpu.js';

export const checkGpuDriver: ActionDefinition = {
  id: 'check-gpu-driver',
  name: 'Verificar driver de GPU',
  description: 'Detecta si tu GPU usa un driver genérico o oficial',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],

  async dryRun() {
    return 'Leer información de GPU del sistema y comparar contra patrones de drivers genéricos';
  },

  async execute() {
    try {
      // Use dynamic import to avoid bundling child_process
      const { execSync } = await import('child_process');
      let gpuName = 'Unknown';
      let driverVersion = 'unknown';

      if (process.platform === 'win32') {
        // Windows: PowerShell WMI
        try {
          const raw = execSync(
            'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,DriverVersion | ConvertTo-Json -Compress"',
            { encoding: 'utf-8', timeout: 10_000 },
          );
          const gpu = JSON.parse(raw);
          gpuName = gpu.Name ?? 'Unknown';
          driverVersion = gpu.DriverVersion ?? 'unknown';
        } catch {
          // WMI not available
        }
      } else {
        // Android/Termux: try multiple sources
        try {
          gpuName = execSync(
            'cat /sys/class/kgsl/kgsl-3d0/gpu_model 2>/dev/null || echo ""',
            { encoding: 'utf-8', timeout: 5_000 },
          ).trim();
        } catch { /* not Qualcomm */ }

        if (!gpuName) {
          try {
            gpuName = execSync(
              'dumpsys SurfaceFlinger 2>/dev/null | grep -i "GLES" | head -1 | sed "s/^GLES: //"',
              { encoding: 'utf-8', timeout: 5_000 },
            ).trim();
          } catch { /* dumpsys not available */ }
        }

        if (!gpuName) gpuName = 'Unknown';
      }

      const isGeneric = isGenericGpu(gpuName);

      return {
        success: true,
        message: isGeneric
          ? `Driver genérico detectado: ${gpuName}. Tu GPU no está usando el driver oficial.`
          : `Driver OK: ${gpuName} (${driverVersion})`,
        details: {
          gpuName,
          driverVersion,
          isGeneric,
          platform: process.platform === 'win32' ? 'windows' : 'android-termux',
        },
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
