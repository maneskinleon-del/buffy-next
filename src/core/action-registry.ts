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
        command: 'du -sh ~/.cache 2>/dev/null; echo "---"; journalctl --vacuum-size=100M 2>/dev/null; echo "---"; rm -rf /tmp/* 2>/dev/null',
        requires: [],
        status: 'verified',
      },
      {
        platform: 'android-termux',
        ui_path: null,
        command: 'adb shell "pm cache --clear" 2>/dev/null; adb shell "du -sh /data/data" 2>/dev/null | sort -rh | head -10',
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
