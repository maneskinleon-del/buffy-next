# Buffy Next — Spec v2.1

> **Motor de operaciones con interfaz de asistente.**
> Buffy observa tu sistema, detecta problemas, te explica qué ocurre y, con tu autorización, ejecuta acciones para solucionarlos.
> No es un framework. No es un agente de IA. No depende de LLM para funcionar.

**Correcciones v2.1 vs v2.0:**
1. AUTO_SAFE = observación + acciones no destructivas (no solo lectura)
2. Rollback opcional, no universal
3. PlatformAdapter reducido (4 métodos)
4. Router → Check Selector
5. `buffy act` revalida todo (nunca confía en propuesta previa)
6. Primer MVP con acción simple (no drivers)
7. Setup = solo bootstrap, dependencias de acciones aparte
8. MVP mínimo extremo (~800 líneas, no ~2900)

---

## 1. Decisiones de diseño (congeladas)

### 1.1 Separación de Buffy Context
Buffy Next **no es** Buffy Context 2.0. Proyecto separado que reutiliza patrones probados y elimina:
- FTS5, benchmarks, Knowledge estático, sync, handoff, memoria curada
- Router léxico, cap-selector, dominios
- Todo lo que era experimentación → se queda en buffy-context

### 1.2 Buffy Context selecciona contexto para una IA. Buffy Next selecciona acciones/comprobaciones para un sistema.

### 1.3 Motor de operaciones con interfaz de asistente
```
Buffy habla como asistente
        ↓
pero internamente
        ↓
diagnostica mediante reglas
        ↓
ejecuta acciones declaradas
        ↓
verifica resultados
```

Esto deja abierta la puerta para que agentes (Claude, Gemini, Mimo, Freebuff, Copilot, MCP) usen Buffy como herramienta, sin que Buffy dependa de ellos.

### 1.4 Core portable + adapters de plataforma
El core NO conoce peculiaridades de Windows, Termux, ADB, Shizuku. Todo viaja por el adapter.

### 1.5 JSON como contrato máquina, humano como presentación
Toda estructura de datos se serializa a JSON con `--json`. Sin `--json`, output legible con emojis y formato.

### 1.6 No usar LLM como dependencia del funcionamiento básico
El pipeline funciona 100% con reglas declaradas. LLMs son opcionales (futuro: MCP, agentes).

### 1.7 Windows + Android/Termux como primera etapa. Linux después.

---

## 2. Arquitectura

```
BUFFY
                          │
                          ▼
                   ┌─────────────┐
                   │     CLI     │
                   └──────┬──────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         doctor        diagnose        act
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                  ┌───────────────┐
                  │ Check Selector│
                  └───────┬───────┘
                          ▼
                   ┌─────────────┐
                   │   Adapter   │
                   └──────┬──────┘
                ┌─────────┴─────────┐
                ▼                   ▼
            Windows              Android
            PowerShell            Termux
                │                   │
                └─────────┬─────────┘
                          ▼
                   Diagnostic Data
                          │
                          ▼
                   ┌─────────────┐
                   │  Diagnosis  │
                   └──────┬──────┘
                          ▼
                   Action Registry
                          │
                          ▼
                   ┌─────────────┐
                   │  Security   │
                   └──────┬──────┘
                AUTO_SAFE / CONFIRM
                          │
                          ▼
                     Executor
                          │
                          ▼
                      Verify
                          │
                          ▼
                     Presenter
```

Estado local (fuera del camino crítico):
```
┌──────────────┐
│ state.json   │
└──────▲───────┘
       │
  guardar resultado
```

No debe convertirse en otro sistema de conocimiento.

---

## 3. Modelo de seguridad (corregido v2.1)

### 3.1 Niveles

| Nivel | Significado | Ejemplo |
|---|---|---|
| **AUTO_SAFE** | Observación y acciones estrictamente no destructivas | Diagnosticar, verificar estado, listar procesos, comprobar driver |
| **CONFIRM** | Cualquier modificación del sistema | Instalar herramienta, cambiar config, actualizar driver |
| **FORBIDDEN** | Acciones que Buffy jamás ejecuta | Formatear, borrar partición, desactivar firewall completo |

### 3.2 Reglas

- **AUTO_SAFE** no significa "solo lectura". Significa: si la acción se ejecuta 100 veces, el sistema queda exactamente igual. Incluye: diagnosticar, listar, verificar, medir. **NO** incluye: crear archivos, modificar permisos, cambiar config.
- **CONFIRM** requiere `promptUser()`. Sin confirmación explícita → no se ejecuta.
- **FORBIDDEN** se rechaza inmediatamente, sin prompt.
- No existe nivel LOW todavía. Solo los 3 niveles.
- `buffy act` SIEMPRE revalida nivel + plataforma + prerequisites, independientemente de que la acción haya sido propuesta previamente.

### 3.3 Clasificación

```typescript
type SecurityLevel = 'auto_safe' | 'confirm' | 'forbidden';

function classifyAction(action: ActionDefinition): SecurityLevel;
function requiresAuth(action: ActionDefinition): boolean;  // confirm → true
function isForbidden(action: ActionDefinition): boolean;    // forbidden → true
```

---

## 4. Tipos TypeScript

### 4.1 Plataforma

```typescript
interface PlatformInfo {
  name: 'windows' | 'android-termux' | 'linux';
  os: string;
  version: string;
  arch: string;
}

interface SystemInfo {
  os: { name: string; version: string; arch: string };
  cpu: { model: string; cores: number };
  memory: { totalGB: number; availableGB: number; usedPercent: number };
  gpu: { name: string; driver: string; isGeneric: boolean };
  storage: StorageDevice[];
  temperature: { cpuCelsius: number };
  processes: ProcessInfo[];
}

interface StorageDevice {
  mount: string;
  totalGB: number;
  freeGB: number;
  usedPercent: number;
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMB: number;
}

interface Capability {
  name: string;
  status: 'installed' | 'missing' | 'unknown';
  version?: string;
}
```

### 4.2 PlatformAdapter (reducido — 4 métodos)

```typescript
interface PlatformAdapter {
  /** Identificar plataforma */
  detect(): Promise<PlatformInfo>;

  /** Info del sistema (CPU, RAM, GPU, etc.) */
  systemInfo(): Promise<SystemInfo>;

  /** Herramientas disponibles en esta plataforma */
  capabilities(): Promise<Capability[]>;

  /** Ejecutar una acción definida */
  execute(action: ActionDefinition): Promise<ActionResult>;
}
```

Los detalles de CPU/GPU/RAM viven internamente en cada adapter. El core nunca conoce WMI, `/proc/stat`, ni ADB.

### 4.3 Acciones

```typescript
interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  level: SecurityLevel;
  reversible: boolean;
  rollback?: () => Promise<void>;  // solo si reversible === true
  platforms: PlatformName[];
  prerequisites: string[];
  execute: () => Promise<ActionResult>;
  dryRun?: () => Promise<string>;  // qué haría (sin ejecutar)
}

interface ActionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}
```

### 4.4 Check Selector

```typescript
interface CheckResult {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  suggestion?: string;
  actionId?: string;  // acción sugerida si existe
}
```

### 4.5 Diagnóstico

```typescript
interface DiagnosticResult {
  items: CheckResult[];
  suggestedActions: SuggestedAction[];
}

interface SuggestedAction {
  action: ActionDefinition;
  reason: string;
}

interface DoctorReport {
  platform: PlatformInfo;
  system: SystemInfo;
  capabilities: Capability[];
  items: CheckResult[];
  timestamp: string;
}
```

---

## 5. Módulos

### 5.1 CLI (`src/cli.ts`)
Entry point. Parsea args, despacha a comandos, maneja `--json`.

### 5.2 Check Selector (`src/core/checks.ts`)
Reemplaza al router. No busca archivos ni consulta FTS5.

```typescript
function selectChecks(
  adapter: PlatformAdapter,
  systemInfo: SystemInfo,
  capabilities: Capability[]
): Promise<CheckResult[]>;
```

Cada check es una función pura que recibe datos del adapter y devuelve un `CheckResult`. Sin estado, sin LLM, sin query del usuario.

Checks MVP:
- GPU genérica (Microsoft Basic Display Adapter → warning)
- RAM baja (< 20% disponible → warning)
- Herramientas faltantes (Node.js no instalado → info)
- Driver de display actualizado

### 5.3 Adapter Windows (`src/adapters/windows.ts`)
PowerShell + WMI para systemInfo, capabilities, execute.

### 5.4 Adapter Android/Termux (`src/adapters/android.ts`)
bash + ADB/Shizuku para systemInfo, capabilities, execute.

### 5.5 Doctor (`src/core/doctor.ts`)
Orquesta: adapter → systemInfo → capabilities → selectChecks → reporte.

### 5.6 Diagnose (`src/core/diagnose.ts`)
Recibe query del usuario → selecciona checks relevantes → ejecuta → sugiere acciones.

### 5.7 Executor (`src/core/executor.ts`)
```typescript
function executeAction(action: ActionDefinition): Promise<ActionResult>;
```
Ejecuta la acción, registra resultado en state.json.

### 5.8 Action Registry (`src/actions/registry.ts`)
Catálogo estático de acciones disponibles.

```typescript
function findActionById(id: string): ActionDefinition | undefined;
function listActions(platform: PlatformName): ActionDefinition[];
```

### 5.9 State (`src/state/store.ts`)
`~/.buffy/state.json` — estado local mínimo.

```typescript
interface BuffyState {
  lastScan?: string;
  platform?: string;
  system?: Partial<SystemInfo>;
  actionHistory: ActionRecord[];
}

interface ActionRecord {
  actionId: string;
  timestamp: string;
  success: boolean;
  message: string;
}
```

### 5.10 Presenter (`src/core/presenter.ts`)
Formatea datos para humano (`renderDoctorReport`, `renderProposal`, etc.) o JSON.

---

## 6. Flujo `buffy act` (corregido v2.1)

Nunca: `action-id → execute`. Siempre:

```
buffy act <action-id>
        │
        ▼
resolver action-id (findActionById)
        │
        ▼
validar plataforma (action.platforms.includes(currentPlatform))
        │
        ▼
validar prerequisites (herramientas instaladas)
        │
        ▼
validar nivel de seguridad
        │
        ├── FORBIDDEN → rechazar, exit 1
        │
        ▼
dryRun si existe → mostrar plan
        │
        ▼
requiresAuth? → promptUser()
        │
        ├── cancelado → exit 0
        │
        ▼
execute(action)
        │
        ▼
verify resultado
        │
        ▼
registrar en state.json
        │
        ▼
render resultado
```

---

## 7. Flujo `buffy diagnose`

```
buffy diagnose "tu problema"
        │
        ▼
adapter.systemInfo()
        │
        ▼
selectChecks(adapter, systemInfo, capabilities)
        │
        ▼
filtrar checks relevantes al query (match léxico simple: "gpu" → gpu check)
        │
        ▼
ejecutar checks filtrados
        │
        ▼
si hay checks con severity=error/warning → buscar acciones sugeridas
        │
        ▼
render diagnóstico + propuestas
        │
        ▼
si hay propuestas → promptUser() por cada una → execute → verify
```

El "match léxico simple" no es un router FTS5. Es un mapa estático:
```typescript
const CHECK_KEYWORDS: Record<string, string[]> = {
  'gpu': ['gpu', 'display', 'pantalla', 'driver', 'render'],
  'ram': ['ram', 'memoria', 'lento', 'slow'],
  'disk': ['disco', 'almacenamiento', 'espacio', 'disk'],
  // ...
};
```

---

## 8. Setup (corregido v2.1)

**Solo bootstrap de Buffy:**

```
buffy setup
        │
        ▼
detectar plataforma (adapter.detect())
        │
        ▼
verificar que Buffy funciona (adapter ejecutable)
        │
        ▼
crear ~/.buffy/ si no existe
        │
        ▼
crear state.json inicial
        │
        ▼
mostrar capacidades (qué checks y acciones disponibles)
```

**NO instala dependencias de acciones.** Si una acción necesita winget/adb/shizuku, eso se resuelve cuando la acción se solicita (prerequisite check en el flujo `buffy act`).

---

## 9. MVP — Primer ciclo completo (corregido v2.1)

### 9.1 Acción MVP: `check-gpu-driver`
**NO instalar drivers.** Solo detectar y reportar.

```
doctor
  → detecta GPU genérica (Microsoft Basic Display Adapter)
  → check genera: severity=warning, actionId="fix-gpu-driver"
  → proposal: "Tu GPU usa un driver genérico. ¿Querés que busque el driver correcto?"
  → si confirm → buscar driver disponible (winget search / ADB shell) → mostrar
  → NO instalar automáticamente (sería CONFIRM de alto riesgo)
```

Esto demuestra: doctor → detect → propose → confirm → execute (búsqueda, no instalación) → verify → present, sin convertir el primer MVP en un proyecto de gestión de drivers.

### 9.2 Segunda acción: `install-tool <name>`
Genérica: instalar una herramienta vía winget (Windows) o pkg (Termux).

### 9.3 Acciones MVP en total

| Action ID | Nivel | Qué hace |
|---|---|---|
| `check-gpu-driver` | AUTO_SAFE | Detecta driver genérico, propone buscar el correcto |
| `install-tool` | CONFIRM | Instala herramienta vía winget/pkg |
| `list-processes` | AUTO_SAFE | Lista procesos activos por CPU/RAM |

---

## 10. Estructura de archivos

```
buffy-next/
  src/
    cli.ts                  # Entry point
    core/
      types.ts              # Todas las interfaces
      doctor.ts             # Orquesta doctor
      diagnose.ts           # Diagnóstico dirigido
      checks.ts             # Check Selector
      executor.ts           # Ejecuta acciones
      security.ts           # Clasificación + validación
      presenter.ts          # Render humano/JSON
    adapters/
      index.ts              # createAdapter() — detecta plataforma
      windows.ts            # WindowsAdapter
      android.ts            # AndroidTermuxAdapter
    actions/
      registry.ts           # Catálogo de acciones
      gpu-driver.ts         # check-gpu-driver
      install-tool.ts       # install-tool
      list-processes.ts     # list-processes
    state/
      store.ts              # ~/.buffy/state.json
  tests/
    doctor.test.ts
    security.test.ts
    checks.test.ts
    executor.test.ts
    adapter-mock.ts         # Mock adapter para tests
  docs/
    spec-v2.1.md            # Este documento
  package.json
  tsconfig.json
  README.md
```

---

## 11. Tamaño estimado del MVP

| Módulo | Archivos | Líneas estimadas |
|---|---|---|
| CLI | 1 | ~80 |
| Core (types + doctor + diagnose + checks + executor + security + presenter) | 7 | ~400 |
| Adapters (index + windows + android) | 3 | ~200 |
| Actions (registry + 3 acciones) | 4 | ~150 |
| State | 1 | ~50 |
| Tests | 5 | ~300 |
| **Total** | **~21** | **~1180** |

Meta: demostrar Buffy Next de extremo a extremo con el mínimo de piezas.

---

## 12. Reglas no negociables

1. **Core NO conoce plataforma.** Todo viaja por PlatformAdapter.
2. **`buffy act` SIEMPRE revalida.** Nunca confiar en una validación previa.
3. **Rollback solo cuando se pueda garantizar.** El contrato dice `reversible: boolean` + `rollback?: () => Promise<void>`. Si no hay rollback, el verify reporta qué quedó hecho.
4. **AUTO_SAFE no es "solo lectura".** Es "si se ejecuta 100 veces, el sistema queda igual".
5. **Setup NO instala nada.** Solo bootstrap de Buffy.
6. **Sin LLM en el camino crítico.** El pipeline funciona con reglas declaradas.
7. ** buffy-context intacto.** Buffy Next puede reutilizar patrones, no contaminar el laboratorio.

---

## 13. Definición de Done del MVP

El MVP está listo cuando:

- [ ] `buffy doctor` ejecuta en Windows y Termux, muestra reporte
- [ ] `buffy diagnose "mi GPU usa driver genérico"` detecta el problema y sugiere acción
- [ ] `buffy act check-gpu-driver` ejecuta el check y reporta
- [ ] `buffy act install-tool node` instala vía winget/pkg con CONFIRM
- [ ] `buffy --json doctor` produce JSON válido
- [ ] `buffy setup` crea ~/.buffy/ y state.json
- [ ] Tests pasan: doctor, security, checks, executor
- [ ] `npm run typecheck` sin errores
- [ ] `npm run build` produce dist/cli.js ejecutable
