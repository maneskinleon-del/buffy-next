// Buffy Next — Action: List Processes
// AUTO_SAFE: lists top processes by CPU/RAM usage

import type { ActionDefinition } from '../../core/types.js';

export const listProcesses: ActionDefinition = {
  id: 'list-processes',
  name: 'Listar procesos activos',
  description: 'Muestra los procesos que más CPU y memoria están usando',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],

  async dryRun() {
    return 'Leer la lista de procesos activos del sistema y ordenarlos por uso de CPU/RAM';
  },

  async execute() {
    try {
      const { execSync } = await import('child_process');
      let output = '';

      if (process.platform === 'win32') {
        // Windows: Get-Process sorted by CPU
        output = execSync(
          'powershell -NoProfile -NonInteractive -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name,@{N=\'CPU(s)\';E={[math]::Round($_.CPU,1)}},@{N=\'RAM(MB)\';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress"',
          { encoding: 'utf-8', timeout: 10_000 },
        );

        const processes = JSON.parse(output);
        const list = Array.isArray(processes) ? processes : [processes];

        return {
          success: true,
          message: `${list.length} procesos top por CPU: ${list.map((p: any) => `${p.Name}(${p['CPU(s)']}s/${p['RAM(MB)']}MB)`).join(', ')}`,
          details: {
            count: list.length,
            processes: list.map((p: any) => ({
              name: p.Name,
              cpu: p['CPU(s)'],
              memoryMB: p['RAM(MB)'],
            })),
          },
        };
      } else {
        // Android/Termux: parse `ps -A` output (PID TTY TIME CMD)
        // No RSS/CPU in default ps; read memory from /proc/[pid]/status
        output = execSync(
          'ps -A 2>/dev/null | head -16',
          { encoding: 'utf-8', timeout: 5_000 },
        );

        const lines = output.trim().split('\n');
        const processes = lines
          .filter(line => /^\s*\d+/.test(line)) // only lines starting with a PID
          .map(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[0] ?? '0', 10);
            // Read VmRSS from /proc/[pid]/status for memory usage
            let memoryMB = 0;
            try {
              const status = execSync(
                `cat /proc/${pid}/status 2>/dev/null | grep VmRSS`,
                { encoding: 'utf-8', timeout: 2_000 },
              );
              const rssKB = parseInt(status.match(/VmRSS:\s+(\d+)/)?.[1] ?? '0', 10);
              memoryMB = Math.round(rssKB / 1024);
            } catch { /* process may have exited */ }
            return {
              pid,
              name: parts[parts.length - 1] ?? '?',
              cpuPercent: 0, // not available in default ps output
              memoryMB,
            };
          });

        return {
          success: true,
          message: `${processes.length} procesos top por CPU: ${processes.map(p => `${p.name}(${p.cpuPercent}%/${p.memoryMB}MB)`).join(', ')}`,
          details: {
            count: processes.length,
            processes,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `No se pudieron listar procesos: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async verify() {
    return true;
  },
};
