// Buffy Next — Doctor
// Runs a full system audit via the platform adapter

import type { PlatformAdapter, DoctorReport, CheckResult, SystemInfo, Capability, PlatformInfo, PlatformCapabilities } from './types.js';

export async function runDoctor(adapter: PlatformAdapter): Promise<DoctorReport> {
  const [platform, system, capabilities] = await Promise.all([
    adapter.detect(),
    adapter.systemInfo(),
    adapter.capabilities(),
  ]);

  const items = analyzeSystem(system, capabilities);

  return {
    platform,
    system,
    capabilities,
    privileges: system.privileges,
    items,
    timestamp: new Date().toISOString(),
  };
}

function analyzeSystem(system: SystemInfo, capabilities: Capability[]): CheckResult[] {
  const items: CheckResult[] = [];

  // OS check
  items.push({
    id: 'os-version',
    severity: 'ok',
    category: 'Sistema Operativo',
    message: `${system.os.name} (${system.os.arch})`,
  });

  // CPU check
  items.push({
    id: 'cpu-model',
    severity: 'ok',
    category: 'Hardware',
    message: `CPU: ${system.cpu.model} (${system.cpu.cores} cores)`,
  });

  // RAM check
  const ramSeverity: CheckResult['severity'] = system.memory.usedPercent > 90 ? 'error'
    : system.memory.usedPercent > 75 ? 'warning' : 'ok';
  items.push({
    id: 'ram-usage',
    severity: ramSeverity,
    category: 'Hardware',
    message: `RAM: ${system.memory.totalGB} GB total, ${system.memory.availableGB} GB disponible (${system.memory.usedPercent}% usado)`,
  });

  // GPU check
  if (system.gpu.isGeneric) {
    items.push({
      id: 'gpu-generic-driver',
      severity: 'warning',
      category: 'Hardware',
      message: `GPU: ${system.gpu.name} — driver genérico detectado`,
      explanation: 'Un driver genérico limita significativamente el rendimiento en juegos y aplicaciones gráficas.',
      suggestedAction: 'install-official-driver',
    });
  } else {
    items.push({
      id: 'gpu-driver',
      severity: 'ok',
      category: 'Hardware',
      message: `GPU: ${system.gpu.name} (driver: ${system.gpu.driver})`,
    });
  }

  // Storage check
  for (const device of system.storage) {
    const storageSeverity: CheckResult['severity'] = device.usedPercent > 95 ? 'error'
      : device.usedPercent > 85 ? 'warning' : 'ok';
    items.push({
      id: `storage-${device.mount}`,
      severity: storageSeverity,
      category: 'Almacenamiento',
      message: `Disco ${device.mount}: ${device.freeGB} GB libres / ${device.totalGB} GB total`,
    });
  }

  // Temperature check
  if (system.temperature?.cpuCelsius) {
    const tempSeverity: CheckResult['severity'] = system.temperature.cpuCelsius > 80 ? 'error'
      : system.temperature.cpuCelsius > 65 ? 'warning' : 'ok';
    items.push({
      id: 'temperature-cpu',
      severity: tempSeverity,
      category: 'Estado',
      message: `Temperatura CPU: ${system.temperature.cpuCelsius}°C`,
    });
  }

  // Buffy dependencies check
  for (const tool of capabilities) {
    if (tool.status === 'missing') {
      items.push({
        id: `tool-${tool.name}`,
        severity: 'warning',
        category: 'Dependencias de Buffy',
        message: `${tool.name}: no instalado`,
        explanation: tool.description,
      });
    }
  }

  // Platform privileges check (Android: Shell / Shizuku / Root / ADB)
  const priv = system.privileges;
  if (priv) {
    const privItems: Array<{ id: string; label: string; available: boolean }> = [
      { id: 'priv-shell', label: 'Shell', available: priv.shell },
      { id: 'priv-shizuku', label: 'Shizuku', available: priv.shizuku },
      { id: 'priv-root', label: 'Root', available: priv.root },
      { id: 'priv-adb', label: 'ADB', available: priv.adb },
    ];
    for (const p of privItems) {
      items.push({
        id: p.id,
        severity: p.available ? 'ok' : 'warning',
        category: 'Plataforma',
        message: `${p.label}: ${p.available ? 'disponible' : 'no disponible'}`,
      });
    }
  }

  return items;
}
