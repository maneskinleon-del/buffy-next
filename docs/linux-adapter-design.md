# LinuxAdapter — Design (Fase 2)

> **Estado:** Diseño para revisión. No implementar hasta aprobación.

## Contexto

Buffy Next soporta Windows (PowerShell/WMI) y Android/Termux (bash/ADB). Linux desktop quedó pendiente como Fase 2. El fix `3a3fe9d` demostró que la detección de plataforma funciona correctamente — Linux se identifica como `linux` y rechaza explícitamente con "LinuxAdapter no implementado".

Este documento define qué debe producir LinuxAdapter sin tocar el core.

## Regla congelada

> **ADB conectado es una capacidad del host, no evidencia de que el host sea Android.**

LinuxAdapter detecta ADB como herramienta instalada (igual que Node.js o git), nunca como indicador de plataforma.

## PlatformAdapter interface (recordatorio)

```typescript
interface PlatformAdapter {
  readonly name: string;
  detect(): Promise<PlatformInfo>;
  systemInfo(): Promise<SystemInfo>;
  capabilities(): Promise<Capability[]>;
  execute(action: ActionDefinition): Promise<ActionResult>;
}
```

Los tres adapters deben cumplir exactamente esta interfaz. Sin métodos extra, sin lógica en el core.

## Fuentes de datos

| Dato | Fuente Linux | Comando | Fallback |
|---|---|---|---|
| **OS** | `/etc/os-release` | `cat /etc/os-release` | `uname -o` |
| **Kernel** | `uname -r` | `uname -r` | — |
| **Arch** | `uname -m` | `uname -m` | `process.arch` |
| **CPU model** | `/proc/cpuinfo` | `grep "model name" /proc/cpuinfo \| head -1` | `lscpu` |
| **CPU cores** | `/proc/cpuinfo` | `nproc` | `lscpu` |
| **RAM total** | `/proc/meminfo` | `grep MemTotal /proc/meminfo` | `free -b` |
| **RAM available** | `/proc/meminfo` | `grep MemAvailable /proc/meminfo` | `free -b` |
| **GPU** | `lspci` | `lspci \| grep -i vga` | `/sys/class/drm/card*/device/vendor` |
| **GPU driver** | `/sys/class/drm/card*/device/driver` | `readlink /sys/class/drm/card0/device/driver` | `lspci -k` |
| **Storage** | `df` | `df -BM / --output=size,avail,pcent` | `df -h /` |
| **Temperature** | `/sys/class/thermal/` | `cat /sys/class/thermal/thermal_zone*/temp` | `sensors` (lm-sensors) |
| **Processes** | `ps` | `ps aux --sort=-%mem \| head -20` | — |

## Detección de GPU

El GPU parser debe ser robusto contra falsos positivos (como el bug de `SingleSuppressCallback` en Android). Para Linux:

```bash
# Principal: lspci
lspci | grep -i "vga\|3d\|display"

# Fallback: /sys/class/drm
cat /sys/class/drm/card0/device/vendor 2>/dev/null
cat /sys/class/drm/card0/device/device 2>/dev/null
```

**Patrón para GPU genérica:**
```typescript
const GENERIC_LINUX_GPU = [
  'ASPEED', 'Matrox', 'VMware', 'VirtualBox', 'QXL',
  'Microsoft Basic', 'Cirrus', 'Bochs',
];
```

## Detección de temperatura

Linux tiene múltiples fuentes de temperatura con distintos formatos:

```bash
# /sys/class/thermal (siempre disponible)
cat /sys/class/thermal/thermal_zone*/temp  # milidegrees

# lm-sensors (si está instalado)
sensors -j  # JSON output
```

La temperatura viene en milidegrees (ej: `45000` → 45°C). Dividir por 1000.

## Herramientas a detectar

```typescript
const LINUX_TOOLS = [
  { name: 'Node.js', check: 'node', versionCmd: 'node --version' },
  { name: 'npm', check: 'npm', versionCmd: 'npm --version' },
  { name: 'git', check: 'git', versionCmd: 'git --version' },
  { name: 'Python', check: 'python3', versionCmd: 'python3 --version' },
  { name: 'GCC', check: 'gcc', versionCmd: 'gcc --version' },
  { name: 'Make', check: 'make', versionCmd: 'make --version' },
  { name: 'Docker', check: 'docker', versionCmd: 'docker --version' },
  { name: 'ADB', check: 'adb', versionCmd: 'adb --version' },  // capacidad, NO indicador de plataforma
  { name: 'curl', check: 'curl', versionCmd: 'curl --version' },
  { name: 'wget', check: 'wget', versionCmd: 'wget --version' },
];
```

## Privilegios

LinuxAdapter detecta privilegios de forma similar a AndroidTermuxAdapter pero sin Shizuku:

```typescript
interface PlatformCapabilities {
  shell: boolean;    // siempre true en Linux (bash/zsh)
  shizuku: boolean;  // siempre false en Linux
  root: boolean;     // verificar con `id -u` = 0
  adb: boolean;      // verificar `adb devices` con dispositivo conectado
}
```

**Nota:** `adb` es una capacidad del host, no un indicador de que el host sea Android. Un Linux desktop puede tener ADB instalado para desarrollar apps Android.

## Ejecución de acciones

LinuxAdapter ejecuta acciones vía `execSync` con bash:

```typescript
async execute(action: ActionDefinition): Promise<ActionResult> {
  return action.execute();
}
```

Mismo patrón que WindowsAdapter y AndroidTermuxAdapter. La lógica de ejecución vive en la acción, no en el adapter.

## Acciones soportadas (Fase 2)

| Action ID | Plataforma | Notas |
|---|---|---|
| `install-tool` | linux | `apt install` / `dnf install` / `pacman -S` (detectar package manager) |
| `list-processes` | linux | `ps aux` |
| `check-gpu-driver` | linux | `lspci -k` |
| `check-system-temp` | linux | `/sys/class/thermal/` |

**No incluir acciones que requieran root** sin CONFIRM.

## Detección de package manager

```typescript
function detectPackageManager(): 'apt' | 'dnf' | 'pacman' | 'zypper' | 'unknown' {
  if (commandExists('apt')) return 'apt';
  if (commandExists('dnf')) return 'dnf';
  if (commandExists('pacman')) return 'pacman';
  if (commandExists('zypper')) return 'zypper';
  return 'unknown';
}
```

## Contrato `buffy.context/v1` para Linux

```json
{
  "schema": "buffy.context/v1",
  "platform": {
    "os": "linux",
    "os_name": "EndeavourOS",
    "os_version": null,
    "kernel": "6.18.42-1-lts",
    "architecture": "x86_64"
  },
  "hardware": {
    "cpu": "AMD Ryzen 5 3400G with Radeon Vega Graphics",
    "cpu_cores": 8,
    "ram_gb": 13.6,
    "ram_available_gb": 9.2,
    "gpu": "AMD/ATI Renoir",
    "gpu_driver": "amdgpu",
    "gpu_is_generic": false,
    "storage": [{ "mount": "/", "total_gb": 500, "free_gb": 250, "used_percent": 50 }],
    "temperature_c": 45
  },
  "environment": {
    "shell": "bash",
    "node_version": "v22.17.1"
  },
  "tools": [
    { "name": "Node.js", "available": true, "version": "v22.17.1" },
    { "name": "ADB", "available": true, "version": "...", "note": "host capability, not platform evidence" }
  ],
  "privileges": {
    "shell": true,
    "shizuku": false,
    "root": false,
    "adb": true
  }
}
```

## Tests planificados

| Test | Input | Expected |
|---|---|---|
| `detect()` returns linux | mock /etc/os-release | `PlatformInfo` con `name: 'linux'` |
| `systemInfo()` CPU from /proc/cpuinfo | mock /proc/cpuinfo | CPU model + cores correctos |
| `systemInfo()` GPU from lspci | mock lspci output | GPU name correcto, no falso positivo |
| `systemInfo()` temperature from /sys/class/thermal | mock thermal zones | temperatura en °C |
| `capabilities()` detects installed tools | mock command -v | status installed/missing correcto |
| `capabilities()` ADB is capability, not platform | mock adb available | `adb: true` en privileges |
| `execute()` delegates to action | mock action | resultado correcto |
| GPU genérica detectada | mock ASPEED/VirtualBox GPU | `isGeneric: true` |
| Package manager detectado | mock `which apt` | `'apt'` |

## Archivos a crear/modify

| Archivo | Cambio |
|---|---|
| `src/adapters/linux.ts` | **Nuevo** — LinuxAdapter |
| `src/adapters/index.ts` | Agregar `LinuxAdapter` al switch (ya rechaza con error, solo cambiar a `return new LinuxAdapter()`) |
| `src/actions/install-tool.ts` | Agregar branch `linux` para apt/dnf/pacman |
| `tests/linux-adapter.test.ts` | **Nuevo** — tests del adapter |
| `tests/platform-detection.test.ts` | Agregar test: `linux` → `LinuxAdapter` (ya existe el test de error, actualizar) |

## No hacer

- No crear `LinuxAdapter` que dependa de systemd, NetworkManager, o cualquier daemon específico
- No instalar nada durante `detect()` o `systemInfo()`
- No modificar el contrato `buffy.context/v1`
- No tocar `doctor.ts`, `context.ts`, `pipeline.ts`, `security.ts`, `executor.ts`
- No implementar acciones que requieran root sin CONFIRM
