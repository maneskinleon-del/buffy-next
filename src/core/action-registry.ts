// Buffy Next — Action Registry (v0.7)
// Hardcoded catalog of actions with platform-specific instructions.
//
// Design constraint (D5): hardcoded first. No LLM.
// Each action has instructions per platform with InstructionStatus.
// If status = 'unsupported', the action exists but has no verified steps.

import type { PlatformName, PlatformInstructions, RecommendedAction, Confidence, CheckResult } from './types.js';

// ─── Action Catalog ────────────────────────────────────────

interface ActionEntry {
  id: string;
  /** Which check results trigger this action */
  triggers: string[];
  /** Human-readable action name */
  name: string;
  /** Platform-specific instructions */
  instructions: PlatformInstructions[];
}

const ACTION_CATALOG: ActionEntry[] = [
  // ── CPU / Performance ──────────────────────────────────────
  {
    id: 'close-heavy-processes',
    triggers: ['heavy-processes', 'cpu-status'],
    name: 'Cerrar procesos que consumen muchos recursos',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Ctrl+Shift+Esc → Administrador de tareas → pestaña Procesos → ordenar por CPU → cerrar procesos innecesarios',
        command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WorkingSet64',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'top -o %CPU -bn1 | head -15',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell top -n1 | head -20',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },

  // ── RAM ────────────────────────────────────────────────────
  {
    id: 'clear-memory',
    triggers: ['ram-status'],
    name: 'Liberar memoria RAM',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Administrador de tareas → pestaña Procesos → ordenar por Memoria → cerrar pestañas innecesarias del navegador',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'sync && echo 3 | sudo tee /proc/sys/vm/drop_caches',
        requires: ['root'],
        status: 'partial',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell "su -c \"sync && echo 3 > /proc/sys/vm/drop_caches\"" 2>/dev/null || echo "Root no disponible"',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── Temperature ────────────────────────────────────────────
  {
    id: 'check-thermal',
    triggers: ['temperature-status'],
    name: 'Revisar temperatura y ventilación',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Abrir administrador de tareas → pestaña Rendimiento → CPU → verificar temperatura',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'sensors | grep -E "Tctl|edge|temp1"',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell "cat /sys/class/thermal/thermal_zone*/temp" 2>/dev/null | head -5',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },

  // ── Storage ────────────────────────────────────────────────
  {
    id: 'free-disk-space',
    triggers: ['storage-/'],
    name: 'Liberar espacio en disco',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Explorador de archivos → Properties de C: → Disk Cleanup → seleccionar archivos a eliminar',
        command: 'cleanmgr /d C:',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'echo "=== Caché del usuario ===" && du -sh ~/.cache 2>/dev/null && echo "=== Logs del sistema ===" && journalctl --disk-usage 2>/dev/null && echo "=== Limpiando logs antiguos ===" && sudo journalctl --vacuum-size=100M 2>/dev/null && echo "=== Espacio total ===" && df -h /',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'echo "=== Apps más pesadas ===" && adb shell "du -sh /data/data/*" 2>/dev/null | sort -rh | head -10 && echo "=== Cache ===" && adb shell "ls -la /data/data/*/cache" 2>/dev/null | head -10',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── GPU ────────────────────────────────────────────────────
  {
    id: 'install-gpu-driver',
    triggers: ['gpu-generic-driver'],
    name: 'Instalar driver de GPU oficial',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Visitar página del fabricante (NVIDIA/AMD/Intel) → descargar driver → instalar',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'ubuntu-drivers devices 2>/dev/null && sudo ubuntu-drivers autoinstall || echo "Usar gestor de paquetes del sistema"',
        requires: ['root'],
        status: 'partial',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: null,
        requires: [],
        status: 'unsupported',
      },
    ],
  },

  // ── Network ────────────────────────────────────────────────
  {
    id: 'restart-network',
    triggers: ['network-status'],
    name: 'Reiniciar conexión de red',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Configuración → Network & Internet → Status → Network reset',
        command: 'ipconfig /flushdns && ipconfig /renew',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'sudo systemctl restart NetworkManager 2>/dev/null || sudo systemctl restart systemd-networkd 2>/dev/null',
        requires: ['root'],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell svc wifi disable && sleep 2 && adb shell svc wifi enable',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },

  // ── Chrome ─────────────────────────────────────────────────
  {
    id: 'close-chrome-tabs',
    triggers: ['heavy-processes'],
    name: 'Cerrar pestañas innecesarias de Chrome',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Chrome → Shift+Esc → administrador de tareas de Chrome → cerrar pestañas con más uso',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: 'Chrome → Shift+Esc → cerrar pestañas con más uso',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell am force-stop com.android.chrome',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },

  // ── Process Inspection ────────────────────────────────────
  {
    id: 'inspect-processes',
    triggers: ['heavy-processes', 'cpu-status', 'ram-status'],
    name: 'Inspeccionar procesos en detalle',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Ctrl+Shift+Esc → Administrador de tareas → pestaña Procesos → detalles',
        command: 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Name, @{N="CPU%";E={$_.CPU}}, @{N="RAM_MB";E={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table -AutoSize',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'ps aux --sort=-%mem | head -15',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell ps -A -o PID,NAME,%CPU,%MEM | sort -k3 -rn | head -15',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },

  // ── Startup Inspection ────────────────────────────────────
  {
    id: 'check-startup',
    triggers: ['cpu-status', 'ram-status'],
    name: 'Revisar programas de inicio',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Ctrl+Shift+Esc → pestaña Inicio → revisar programas que se inician',
        command: 'Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location | Format-Table -AutoSize',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'systemctl list-unit-files --type=service --state=enabled --no-pager | head -20',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell pm list packages -e | head -20',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── App Cache (Android) ───────────────────────────────────
  {
    id: 'clear-app-cache',
    triggers: ['storage-/data'],
    name: 'Limpiar caché de aplicaciones',
    instructions: [
      {
        platform: 'windows',
        ui_path: null,
        command: null,
        requires: [],
        status: 'unsupported',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: null,
        requires: [],
        status: 'unsupported',
      },
      {
        platform: 'android-termux',
        ui_path: 'Configuración → Aplicaciones → seleccionar app → Almacenamiento → Limpiar caché',
        command: 'adb shell pm list packages -3 | while read pkg; do adb shell pm clear "${pkg#package:}" --cache-only 2>/dev/null; done; echo "Caché limpiada"',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── Storage Detail ────────────────────────────────────────
  {
    id: 'inspect-storage-detail',
    triggers: ['storage-/'],
    name: 'Detalle de uso de espacio en disco',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Explorador de archivos → This PC → clic derecho en C: → Propiedades',
        command: 'Get-PSDrive C | Select-Object Used, Free | Format-List',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'echo "=== Directorios principales ===" && du -sh /home /var /tmp /opt /usr 2>/dev/null | sort -rh && echo "=== Caché usuario ===" && du -sh ~/.cache 2>/dev/null',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell "du -sh /data/data /sdcard /system 2>/dev/null | sort -rh"',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── Restart Service (Linux) ───────────────────────────────
  {
    id: 'restart-service',
    triggers: ['network-status'],
    name: 'Reiniciar servicio del sistema',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'services.msc → buscar servicio → clic derecho → Reiniciar',
        command: null,
        requires: [],
        status: 'partial',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'systemctl list-units --type=service --state=failed --no-pager',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: null,
        requires: [],
        status: 'unsupported',
      },
    ],
  },

  // ── Check Permissions ─────────────────────────────────────
  {
    id: 'check-permissions',
    triggers: ['permissions-status', 'tools-status'],
    name: 'Verificar permisos del sistema',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Configuración → Cuentas → tu usuario → verificar tipo de cuenta',
        command: 'whoami /priv 2>nul | findstr /i "SeDebug"',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'id && groups',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell pm list permissions -g | head -10 && echo "---" && adb shell getprop ro.build.version.sdk',
        requires: ['adb'],
        status: 'partial',
      },
    ],
  },

  // ── Check Tools ───────────────────────────────────────────
  {
    id: 'check-tools-availability',
    triggers: ['tools-status'],
    name: 'Verificar herramientas instaladas',
    instructions: [
      {
        platform: 'windows',
        ui_path: null,
        command: 'Get-Command adb, python, node, git -ErrorAction SilentlyContinue | Select-Object Name, Source | Format-Table -AutoSize',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'for cmd in adb python3 node git java; do printf "%-10s" "$cmd:"; which $cmd 2>/dev/null || echo "no encontrado"; done',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'for cmd in adb rish pm; do printf "%-10s" "$cmd:"; which $cmd 2>/dev/null || echo "no encontrado"; done',
        requires: [],
        status: 'verified',
      },
    ],
  },

  // ── Safe Reboot ───────────────────────────────────────────
  {
    id: 'safe-reboot',
    triggers: ['cpu-status', 'ram-status', 'temperature-status'],
    name: 'Reiniciar el dispositivo (último recurso)',
    instructions: [
      {
        platform: 'windows',
        ui_path: 'Inicio → Apagar → Reiniciar',
        command: null,
        requires: [],
        status: 'verified',
      },
      {
        platform: 'linux',
        ui_path: null,
        command: 'echo "Reiniciando en 10 segundos... (Ctrl+C para cancelar)" && sleep 10 && sudo reboot',
        requires: ['root'],
        status: 'partial',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb reboot',
        requires: ['adb'],
        status: 'verified',
      },
    ],
  },
];

// ─── Registry API ──────────────────────────────────────────

/**
 * Finds actions that match given check results.
 *
 * @param checkResults - Results from diagnosis
 * @returns Matching action entries
 */
export function findActionsForChecks(checkResults: CheckResult[]): ActionEntry[] {
  const triggeredIds = new Set<string>();

  for (const result of checkResults) {
    for (const entry of ACTION_CATALOG) {
      if (entry.triggers.includes(result.id)) {
        triggeredIds.add(entry.id);
      }
    }
  }

  return ACTION_CATALOG.filter(e => triggeredIds.has(e.id));
}

/**
 * Gets all available action IDs (for testing/debugging).
 */
export function getActionIds(): string[] {
  return ACTION_CATALOG.map(e => e.id);
}

/**
 * Gets an action entry by ID.
 */
export function getActionById(id: string): ActionEntry | undefined {
  return ACTION_CATALOG.find(e => e.id === id);
}
