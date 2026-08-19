// Buffy Next — Action: Check System Temperature
// AUTO_SAFE: reads CPU temperature, reports status

import type { ActionDefinition } from '../../core/types.js';

export const checkSystemTemp: ActionDefinition = {
  id: 'check-system-temp',
  name: 'Verificar temperatura del sistema',
  description: 'Lee la temperatura actual del CPU y reporta si está dentro de rango',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],

  async execute() {
    try {
      const { execSync } = await import('child_process');
      let temp: number | null = null;

      if (process.platform === 'win32') {
        try {
          const output = execSync(
            'powershell -NoProfile -Command "(Get-CimInstance MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentTemperature"',
            { encoding: 'utf-8', timeout: 10000 }
          );
          const raw = parseInt(output.trim(), 10);
          if (!isNaN(raw)) {
            temp = Math.round((raw - 2732) / 10);
          }
        } catch {
          // Thermal zone not available
        }
      } else {
        try {
          const output = execSync('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null', {
            encoding: 'utf-8', timeout: 5000,
          });
          const raw = parseInt(output.trim(), 10);
          if (!isNaN(raw)) {
            temp = raw > 1000 ? Math.round(raw / 1000) : raw;
          }
        } catch {
          // Thermal zone not available
        }
      }

      if (temp === null) {
        return {
          success: true,
          message: 'Temperatura no disponible en este sistema',
          details: { available: false },
        };
      }

      const severity = temp > 80 ? 'crítica' : temp > 65 ? 'elevada' : 'normal';

      return {
        success: true,
        message: `Temperatura CPU: ${temp}°C (${severity})`,
        details: { celsius: temp, severity, available: true },
      };
    } catch (error) {
      return {
        success: false,
        message: `No se pudo leer la temperatura: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async verify() {
    return true;
  },
};
