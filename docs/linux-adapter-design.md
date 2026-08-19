# LinuxAdapter — Design (Fase 2)

> **Estado:** Diseño aprobado con correcciones menores. Listo para implementar.

## Contexto

Buffy Next soporta Windows (PowerShell/WMI) y Android/Termux (bash/ADB). Linux desktop quedó pendiente como Fase 2. El fix `3a3fe9d` demostró que la detección de plataforma funciona correctamente — Linux se identifica como `linux` y rechaza explícitamente con "LinuxAdapter no implementado".

Este documento define qué debe producir LinuxAdapter sin tocar el core.

## Reglas congeladas

### 1. ADB es capacidad del host, NO indicador de plataforma

> **ADB conectado es una capacidad del host, no evidencia de que el host sea Android.**

LinuxAdapter detecta ADB como herramienta instalada (igual que Node.js o git), nunca como indicador de plataforma.

### 2. Graceful degradation — null, nunca valores inventados

Si la fuente primaria falla y el fallback también falla → `null`.

**No usar:**
- `"unknown"` para representar dato no disponible
- `0` para representar temperatura o cantidad no detectada
- `"Unknown GPU"` para representar GPU no identificada
- `""` para representar string no disponible

**Usar siempre:** `null`

**Razón semántica:**

| Valor | Significado | Problema |
|---|---|---|
| `null` | Buffy no pudo obtener el dato | ✅ Claro para el agente |
| `"unknown"` | El sistema reportó algo como desconocido | ⚠️ Ambiguo — ¿quién dijo "unknown"? |
| `0` | El sistema reportó 0 | ❌ El agente puede interpretar "0°C" literalmente |
| `"Unknown GPU"` | GPU no identificada | ⚠️ Podría confundir con un nombre de GPU real |

**Aplicación especial a GPU, temperatura y CPU:**

```typescript
// GPU
const gpuName = lspciOutput || drmVendor || null;  // NO "Unknown GPU"
const gpuDriver = drmDriver || lspciKernel || null;

// Temperatura
const tempRaw = thermalZone || sensorsOutput || null;
const temperatureC = tempRaw ? Math.round(tempRaw / 1000) : null;  // NO 0

// CPU
const cpuModel = cpuinfoMatch || lscpuMatch || null;  // NO "Unknown CPU"
```

### 3. Shell = $SHELL

`environment.shell` representa el shell configurado/preferido del usuario, detectado via `$SHELL`.

**No** representa el shell actualmente ejecutando Buffy. Si `$SHELL` no está definido → `null`.

---

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

---

## Fuentes de datos

| Dato | Fuente Linux | Comando | Fallback | Si ambos fallan |
|---|---|---|---|---|
| **OS** | `/etc/os-release` | `cat /etc/os-release` | `uname -o` | `"Linux"` (constante razonable) |
| **Kernel** | `uname -r` | `uname -r` | — | `null` |
| **Arch** | `uname -m` | `uname -m` | `process.arch` | `process.arch` (Node siempre lo tiene) |
| **CPU model** | `/proc/cpuinfo` | `grep "model name" /proc/cpuinfo \| head -1` | `lscpu` | `null` |
| **CPU cores** | `/proc/cpuinfo` | `nproc` | `lscpu` | `1` (mínimo absoluto) |
| **RAM total** | `/proc/meminfo` | `grep MemTotal /proc/meminfo` | `free -b` | `null` |
| **RAM available** | `/proc/meminfo` | `grep MemAvailable /proc/meminfo` | `free -b` | `null` |
| **GPU** | `lspci` | `lspci \| grep -i vga` | `/sys/class/drm/card*/device/vendor` | `null` |
| **GPU driver** | `/sys/class/drm/card*/device/driver` | `readlink /sys/class/drm/card0/device/driver` | `lspci -k` | `null` |
| **Storage** | `df` | `df -BM / --output=size,avail,pcent` | `df -h /` | `null` (array vacío) |
| **Temperature** | `/sys/class/thermal/` | `cat /sys/class/thermal/thermal_zone*/temp` | `sensors` (lm-sensors) | `null` |
| **Processes** | `ps` | `ps aux --sort=-%mem \| head -20` | — | `[]` (array vacío) |
| **Shell** | `$SHELL` | `process.env.SHELL` | — | `null` |

---

## Detección de GPU

El GPU parser debe ser robusto contra falsos positivos (como el bug de `SingleSuppressCallback` en Android). Para Linux:

```bash
# Principal: lspci
lspci | grep -i "vga\|3d\|display"

# Fallback: /sys/class/drm
cat /sys/class/drm/card0/device/vendor 2>/dev/null
cat /sys/class/drm/card0/device/device 2>/dev/null

# Si ambos fallan → gpu: null (NO "Unknown GPU")
```

**Patrón para GPU genérica:**
```typescript
const GENERIC_LINUX_GPU = [
  'ASPEED', 'Matrox', 'VMware', 'VirtualBox', 'QXL',
  'Microsoft Basic', 'Cirrus', 'Bochs',
];
```

**Gracious degradation para GPU:**

```typescript
function detectGpu(): { name: string | null; driver: string | null; isGeneric: boolean | null } {
  // Intentar lspci
  const lspciLine = sh('lspci | grep -i "vga\\|3d\\|display" | head -1');
  if (lspciLine) {
    const name = parseGpuName(lspciLine);
    const driver = parseGpuDriver(sh('lspci -k | grep -i "kernel driver" | head -1'));
    return { name, driver, isGeneric: isGenericLinuxGpu(name) };
  }

  // Intentar /sys/class/drm
  const vendor = sh('cat /sys/class/drm/card0/device/vendor 2>/dev/null');
  if (vendor) {
    const name = resolveDrmVendor(vendor);
    const driver = sh('readlink /sys/class/drm/card0/device/driver 2>/dev/null')?.split('/').pop() ?? null;
    return { name, driver, isGeneric: name ? isGenericLinuxGpu(name) : null };
  }

  // Ambos fallaron → null, NO "Unknown GPU"
  return { name: null, driver: null, isGeneric: null };
}
```

---

## Detección de temperatura

Linux tiene múltiples fuentes de temperatura con distintos formatos:

```bash
# /sys/class/thermal (siempre disponible en kernels con thermal framework)
cat /sys/class/thermal/thermal_zone*/temp  # milidegrees

# lm-sensors (si está instalado)
sensors -j  # JSON output
```

La temperatura viene en milidegrees (ej: `45000` → 45°C). Dividir por 1000.

**Graceful degradation:**

```typescript
function detectTemperature(): number | null {
  // Intentar /sys/class/thermal
  const thermalRaw = sh('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1');
  if (thermalRaw) {
    const temp = parseInt(thermalRaw, 10);
    if (!isNaN(temp) && temp > 0) return Math.round(temp / 1000);
  }

  // Intentar lm-sensors
  const sensorsRaw = sh('sensors -j 2>/dev/null');
  if (sensorsRaw) {
    const temp = parseSensorsJson(sensorsRaw);
    if (temp !== null) return temp;
  }

  // Ambos fallaron → null, NO 0
  return null;
}
```

---

## Shell detection

```typescript
function detectShell(): string | null {
  // $SHELL = shell configurado/preferido del usuario
  // NO es el shell actualmente ejecutando Buffy
  return process.env.SHELL ?? null;
}
```

---

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

---

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

---

## Ejecución de acciones

LinuxAdapter ejecuta acciones vía `execSync` con bash:

```typescript
async execute(action: ActionDefinition): Promise<ActionResult> {
  return action.execute();
}
```

Mismo patrón que WindowsAdapter y AndroidTermuxAdapter. La lógica de ejecución vive en la acción, no en el adapter.

---

## Acciones soportadas (Fase 2)

| Action ID | Plataforma | Notas |
|---|---|---|
| `install-tool` | linux | `apt install` / `dnf install` / `pacman -S` (detectar package manager) |
| `list-processes` | linux | `ps aux` |
| `check-gpu-driver` | linux | `lspci -k` |
| `check-system-temp` | linux | `/sys/class/thermal/` |

**No incluir acciones que requieran root** sin CONFIRM.

---

## Detección de package manager

```typescript
function detectPackageManager(): 'apt' | 'dnf' | 'pacman' | 'zypper' | null {
  if (commandExists('apt')) return 'apt';
  if (commandExists('dnf')) return 'dnf';
  if (commandExists('pacman')) return 'pacman';
  if (commandExists('zypper')) return 'zypper';
  return null;  // NO 'unknown'
}
```

---

## Contrato `buffy.context/v1` para Linux

### Happy path — todos los datos disponibles

```json
{
  "schema": "buffy.context/v1",
  "platform": {
    "os": "linux",
    "os_name": "EndeavourOS",
    "os_version": "23",
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
    "shell": "/usr/bin/bash",
    "node_version": "v22.17.1"
  },
  "tools": [
    { "name": "Node.js", "available": true, "version": "v22.17.1" },
    { "name": "ADB", "available": true, "version": "Android Debug Bridge version 1.0.41" }
  ],
  "privileges": {
    "shell": true,
    "shizuku": false,
    "root": false,
    "adb": true
  }
}
```

### Degraded path — GPU y temperatura no disponibles

```json
{
  "schema": "buffy.context/v1",
  "platform": {
    "os": "linux",
    "os_name": "Ubuntu",
    "os_version": "22.04",
    "kernel": "5.15.0",
    "architecture": "x86_64"
  },
  "hardware": {
    "cpu": "Intel Xeon E5-2680 v4",
    "cpu_cores": 4,
    "ram_gb": 8.0,
    "ram_available_gb": 6.1,
    "gpu": null,
    "gpu_driver": null,
    "gpu_is_generic": null,
    "storage": [{ "mount": "/", "total_gb": 100, "free_gb": 45, "used_percent": 55 }],
    "temperature_c": null
  },
  "environment": {
    "shell": "/bin/bash",
    "node_version": null
  },
  "tools": [
    { "name": "Node.js", "available": false, "version": null }
  ],
  "privileges": {
    "shell": true,
    "shizuku": false,
    "root": false,
    "adb": false
  }
}
```

Nota: `gpu: null` (NO `"Unknown GPU"`), `temperature_c: null` (NO `0`), `node_version: null` (NO `""`).

---

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
| **CPU sin model name** | mock /proc/cpuinfo sin "model name" | `cpu: null` (NO `"Unknown CPU"`) |
| **GPU no disponible** | mock lspci no instalado + sin /sys/class/drm | `gpu: null`, `gpu_driver: null`, `gpu_is_generic: null` |
| **Temperatura no disponible** | mock sin /sys/class/thermal + sin sensors | `temperature_c: null` (NO `0`) |
| **Shell detectado** | mock `$SHELL=/usr/bin/zsh` | `environment.shell: "/usr/bin/zsh"` |
| **Shell no disponible** | mock sin `$SHELL` | `environment.shell: null` |

---

## Archivos a crear/modify

| Archivo | Cambio |
|---|---|
| `src/adapters/linux.ts` | **Nuevo** — LinuxAdapter |
| `src/adapters/index.ts` | Agregar `LinuxAdapter` al switch (ya rechaza con error, solo cambiar a `return new LinuxAdapter()`) |
| `src/actions/install-tool.ts` | Agregar branch `linux` para apt/dnf/pacman |
| `tests/linux-adapter.test.ts` | **Nuevo** — tests del adapter |
| `tests/platform-detection.test.ts` | Agregar test: `linux` → `LinuxAdapter` (ya existe el test de error, actualizar) |

---

## No hacer

- No crear `LinuxAdapter` que dependa de systemd, NetworkManager, o cualquier daemon específico
- No instalar nada durante `detect()` o `systemInfo()`
- No modificar el contrato `buffy.context/v1`
- No tocar `doctor.ts`, `context.ts`, `pipeline.ts`, `security.ts`, `executor.ts`
- No implementar acciones que requieran root sin CONFIRM
- No usar `"unknown"`, `0`, `""`, `"Unknown GPU"`, `"Unknown CPU"` para datos no disponibles
