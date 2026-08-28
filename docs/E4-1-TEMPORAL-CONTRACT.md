# E4.1 — Contrato Temporal

## Estado del documento

- **Experimento:** E4.1
- **Tipo:** Diseño de contrato (spec) — NO implementación
- **Predecesor:** E4 (stale context), AUDIT-EXECUTION-CONTEXT-INTEGRITY
- **Siguiente paso:** Implementación de M1/M2 en sesión dedicada

---

## Contexto

E4 demostró que:

```
observación correcta + tiempo → stale
```

El modelo usó datos del contexto como si fueran actuales cuando ya no lo eran.

La causa raíz identificada en la auditoría:

- `Observation` (types.ts:228) no tiene `observedAt`, `source`, ni estado epistémico
- `DoctorReport.timestamp` es un solo string para todo el reporte — no por medición
- El agente no puede distinguir `observado hace 30s` de `observado hace 3h`
- No existe noción de `stale` como estado diferenciado

E4.1 define el contrato que corrige esto.

---

## Tarea 1 — Modelo Temporal de Observation

### Contrato actual (roto)

```typescript
// types.ts:228 — ACTUAL
export interface Observation {
  fact: string;
  value?: number;
  unit?: string;
  category: ObservationCategory;
  threshold?: { warning: number; error: number };
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  // ❌ NO observedAt
  // ❌ NO source
  // ❌ NO epistemicState
}
```

### Contrato nuevo

```typescript
// types.ts — NUEVO (reemplaza Observation)
// Todos los campos son obligatorios excepto threshold.

// ─── EpistemicState ────────────────────────────────────────

/**
 * Estado epistémico de una observación.
 *
 * OBSERVED  — dato medido directamente del sistema, dentro del umbral de frescura.
 * INFERRED  — dato derivado de OBSERVED, no medido directamente.
 * STALE     — dato que fue OBSERVED pero cuya edad excede el FreshnessPolicy.
 * UNKNOWN   — no se pudo obtener el dato; se omite el value.
 */
export type EpistemicState = 'observed' | 'inferred' | 'stale' | 'unknown';

// ─── Observation (nuevo contrato) ─────────────────────────

export interface Observation {
  /** Dato legible para el agente */
  fact: string;

  /** Valor numérico si aplica */
  value?: number;

  /** Unidad del valor (% , °C, GB, etc.) */
  unit?: string;

  /** Categoría cerrada — igual que antes */
  category: ObservationCategory;

  /** Thresholds aplicados para clasificar severity */
  threshold?: { warning: number; error: number };

  /** Severidad calculada a partir del valor */
  severity: 'ok' | 'warning' | 'error';

  /**
   * Momento en que la medición fue tomada (no cuando se armó el contexto).
   * Formato: ISO 8601.
   */
  observedAt: string;

  /**
   * Fuente que produjo la medición.
   * Valor: nombre del adapter + método (e.g., "WindowsAdapter.getCpuInfo")
   * Esto permite al agente saber qué capa generó el dato.
   */
  source: string;

  /**
   * Estado epistémico.
   * - observed: valor actual y confiable
   * - inferred: derivado de observed, no medido
   * - stale: el valor existe pero excedió la política de frescura
   * - unknown: no se pudo obtener el valor
   */
  epistemicState: EpistemicState;

  /**
   * Edad en milisegundos desde observedAt hasta "ahora".
   * Calculada por Buffy en el momento de compactar el contexto.
   * Campo de conveniencia para el agente — no para decisiones.
   */
  ageMs?: number;
}
```

### Cambios derivados en tipos existentes

```typescript
// CheckResult — agregar observedAt y source (opcional para backward compat)
export interface CheckResult {
  id: string;
  category: string;
  severity: 'ok' | 'warning' | 'error' | 'unknown';
  message: string;
  suggestion?: string;
  explanation?: string;
  actionId?: string;
  suggestedAction?: string;
  // NUEVOS:
  observedAt?: string;  // opcional: cuando no hay adapter (legacy)
  source?: string;
}

// DoctorReport — timestamp pasa a ser generatedAt (semántica más clara)
export interface DoctorReport {
  platform: PlatformInfo;
  system: SystemInfo;
  capabilities: Capability[];
  privileges?: PlatformCapabilities;
  items: CheckResult[];
  /**
   * Momento en que se generó el reporte completo.
   * Es el upper bound de todas las mediciones dentro de system.
   */
  generatedAt: string;
}
```

---

## Tarea 2 — FreshnessPolicy

### Principio de diseño

**No thresholds arbitrarios todavía.**

La política de frescura debe responder a la pregunta:

> ¿Con qué frecuencia cambia típicamente esta categoría de dato en un sistema?

No con números inventados, sino con políticas expresadas como duraciones razonables basadas en la física del sistema.

### FreshnessPolicy

```typescript
// src/core/freshness.ts — NUEVO ARCHIVO

import type { ObservationCategory } from './types.js';

/**
 * Política de frescura por categoría.
 *
 * Cada categoría tiene:
 * - maxAge: duración máxima antes de que el dato se considere stale
 * - volatility: qué tan rápido cambia típicamente el dato
 * - reasoning: por qué se eligió este maxAge
 *
 * Los valores NO son thresholds técnicosarbitrarios.
 * Reflejan la física del sistema y el contracto de observación de Buffy.
 */
export const FRESHNESS_POLICY: Record<ObservationCategory, FreshnessPolicyEntry> = {
  cpu: {
    maxAgeMs: 60_000,          // 1 minuto
    volatility: 'medium',
    reasoning: 'CPU usage cambia con carga de trabajo; 1min es suficiente para observar tendencias sostenidas.',
  },

  memory: {
    maxAgeMs: 30_000,           // 30 segundos
    volatility: 'high',
    reasoning: 'RAM disponible cambia constantemente con asignaciones y garbage collection. 30s es el máximo para dato útil.',
  },

  gpu: {
    maxAgeMs: 300_000,          // 5 minutos
    volatility: 'low',
    reasoning: 'Driver y nombre de GPU casi nunca cambian. 5min es conservador para cubrir reescaneos normales.',
  },

  temperature: {
    maxAgeMs: 30_000,           // 30 segundos
    volatility: 'high',
    reasoning: 'Temperatura puede aumentar rápidamente bajo carga. 30s permite detectar spikes sin ruido.',
  },

  processes: {
    maxAgeMs: 30_000,           // 30 segundos
    volatility: 'high',
    reasoning: 'Lista de procesos y uso de CPU/mem puede cambiar en segundos. 30s es el máximo para datos útiles.',
  },

  storage: {
    maxAgeMs: 3_600_000,        // 1 hora
    volatility: 'very-low',
    reasoning: 'Uso de disco cambia lentamente. 1 hora es apropiado para detección de patrones de llenado.',
  },

  network: {
    maxAgeMs: 60_000,           // 1 minuto
    volatility: 'medium',
    reasoning: 'Conectividad puede cambiar si la red es inestable. 1min permite detectar pérdidas de conexión.',
  },
};

export interface FreshnessPolicyEntry {
  maxAgeMs: number;
  /** Velocidad típica de cambio del dato */
  volatility: 'very-low' | 'low' | 'medium' | 'high';
  /** Justificación de la política */
  reasoning: string;
}

/**
 * Clasifica el estado epistémico de una observación
 * basándose en su edad y la política de frescura.
 *
 * @param observedAt - ISO timestamp de la medición
 * @param category - Categoría de la observación
 * @returns EpistemicState: 'observed' | 'stale' | 'unknown'
 */
export function classifyEpistemicState(
  observedAt: string,
  category: ObservationCategory,
): 'observed' | 'stale' {
  const policy = FRESHNESS_POLICY[category];
  const ageMs = Date.now() - new Date(observedAt).getTime();

  if (ageMs > policy.maxAgeMs) {
    return 'stale';
  }
  return 'observed';
}
```

### Dónde vive la política

```
src/core/freshness.ts    ← FRESHNESS_POLICY + classifyEpistemicState()
                             (puro, sin side effects, testable)

src/core/context.ts       ← usa classifyEpistemicState() al compactar contexto
src/core/diagnose.ts     ← usa classifyEpistemicState() al producir Observation
```

La política **no se configura por el modelo**. Es parte del contrato de Buffy. El modelo recibe el resultado, no la política cruda.

---

## Tarea 3 — Autoridad

### La pregunta

```
¿Modelo decide freshness?      ❌ E4 lo contradice
¿Buffy decide freshness?        ← candidato
¿Harness decide freshness?      ← candidato
```

### Análisis

**Modelo decide freshness** → No. El modelo no tiene acceso a timestamps ni puede calcular ageMs. Además, E4 demostró que el modelo asume datos como actuales sin evidencia. Delegar la decisión al modelo reproduce E4.

**Harness decide freshness** → Candidata. El harness tiene acceso al clock, puede calcular ageMs, y es la capa que construye el contexto antes de enviarlo. Pero el harness no sabe qué significa cada campo ni cuál es la semántica de la categoría.

**Buffy decide freshness** → Candidata preferida. Buffy conoce:
- Cada campo del contexto y su categoría semántica
- La FreshnessPolicy
- Cómo calcular ageMs a partir de observedAt

Buffy produce las Observation con epistemicState ya resuelto. El harness lo recibe listo para compactar.

### Decisión: Buffy/harness determina, modelo recibe

```
                    ┌─────────────────────────────────────────┐
                    │  BUFFY                                  │
                    │                                         │
Observation         │  1. Medir dato del sistema              │
(from adapter)      │  2. Asignar observedAt = ahora          │
                    │  3. Asignar source = adapter.method     │
                    │  4. Calcular ageMs = ahora - observedAt │
                    │  5. Clasificar epistemicState          │
                    │     (freshness.ts + FRESHNESS_POLICY)  │
                    │  6. Adjuntar epistemicState resuelto    │
                    └──────────────┬──────────────────────────┘
                                   │ Observation {
                                   │   epistemicState: 'stale'
                                   │   observedAt: '...'
                                   │   ageMs: 183420
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  SELECTOR (task-adaptive)               │
                    │                                         │
                    │  Si epistemicState === 'stale':         │
                    │    ├── tarea necesita este campo →       │
                    │    │   marcar como "needs_refresh"       │
                    │    └── tarea no necesita → omitir       │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  COMPACT                              │
                    │                                         │
                    │  Construye { ram: { value, freshness } } │
                    │  NO el modelo decide qué es fresh       │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  MODELO                                 │
                    │                                         │
                    │  Recibe:                               │
                    │  { ram: { value: 7.9, freshness: 'stale' } } │
                    │                                         │
                    │  ✅ No necesita interpretar timestamps   │
                    │  ✅ No decide si está stale             │
                    │  ✅ Recibe el estado como hecho         │
                    └─────────────────────────────────────────┘
```

### Formato del campo freshness en el contexto compactado

El agente/modelo recibe el contexto compactado. El campo `freshness` es parte del valor, no metadata separada:

```typescript
// Contexto que recibe el modelo:
{
  "ram": {
    "value": 7.9,
    "unit": "GB",
    "observedAt": "2026-08-27T18:25:00.000Z",
    "ageMs": 183420,
    "freshness": "stale"
  }
}
```

No necesita calcular nada. El campo `freshness` ya tiene el valor resuelto.

---

## Tarea 4 — Freshness Gating en el Selector

### Conexión con E2

E2 estableció: **task-adaptive + compact + on-demand**. El selector decide qué entra al contexto basándose en la tarea del agente.

La frescura se integra en esa decisión:

```
tarea: "mi PC está lento"
  ↓
selector identifica: RAM, CPU, processes, temperature
  ↓
para cada campo:
  ├── epistemicState === 'observed' → incluir
  ├── epistemicState === 'stale'   → marcar needs_refresh
  └── epistemicState === 'unknown'  → omitir completamente
  ↓
compact recibe: { RAM: { value, freshness: 'stale', needs_refresh: true }, ... }
  ↓
compact decide:
  ├── stale + needs_refresh → incluir con freshness='stale' (modelo sabe que está desactualizado)
  └── stale + no necesita  → omitir (no tiene sentido incluir dato innecesario)
  ↓
modelo recibe contexto con freshness explícito
  ↓
si el modelo ve freshness='stale' para algo crítico:
  → puede pedir refresh (on-demand refresh trigger)
```

### Decisión de diseño

**Regla:** El selector NUNCA descarta `observed` automáticamente. Solo puede descartar `stale` si la tarea no lo requiere.

Esto evita silenciar datos que el agente podría necesitar aunque estén stale.

---

## Tarea 5 — Efecto sobre BuffyContext

### BuffyContext actualizado

```typescript
// types.ts — BuffyContext actualizado

export interface BuffyContext {
  schema: 'buffy.context/v1';
  buffy_version: string;

  /** Momento en que se armó este contexto */
  generated_at: string;

  platform: {
    os: string;
    os_name: string;
    os_version: string | null;
    kernel: string | null;
    architecture: string;
  };

  hardware: {
    cpu: HardwareField | null;
    cpu_cores: number | null;
    ram_gb: HardwareField | null;      // ← ahora es objeto, no primitivo
    gpu: HardwareField | null;
    storage: HardwareField[];
    temperature_c: HardwareField | null;
    process_groups?: ProcessGroupField[];
  };

  environment: {
    shell: string | null;
    node_version: string | null;
  };

  tools: Array<{
    name: string;
    available: boolean;
    version: string | null;
  }>;

  privileges: {
    shell: boolean;
    shizuku: boolean;
    root: boolean;
    adb: boolean;
  };
}

// ─── HardwareField (nuevo) ────────────────────────────────

/**
 * Campo de hardware con metadata temporal.
 * Reemplaza valores primitivos en BuffyContext.hardware.
 */
export interface HardwareField {
  /** El valor. null solo si epistemicState === 'unknown' */
  value: number | string | boolean | null;

  /** Para valores numéricos */
  unit?: string;

  /** Momento en que se midió */
  observedAt: string;

  /** Edad en ms desde observedAt */
  ageMs: number;

  /**
   * Estado epistémico resuelto por Buffy.
   * - observed: valor actual
   * - stale: valor que excedió la política de frescura
   * - unknown: no se pudo obtener
   */
  freshness: 'observed' | 'stale' | 'unknown';

  /** Fuente de la medición (adapter + método) */
  source: string;
}
```

### Cambio semántico importante

**Antes:**

```typescript
ram_gb: number | null  // solo el valor
```

**Después:**

```typescript
ram_gb: HardwareField | null  // valor + timestamps + freshness + source
```

Esto es un **cambio de breaking type** en BuffyContext. Requiere bump de schema version a `buffy.context/v2`.

---

## Resumen de cambios de tipo (especificación, no implementación)

| Tipo | Cambio | Razón |
|---|---|---|
| `Observation` | Agregar `observedAt`, `source`, `epistemicState` | Contrato temporal básico |
| `CheckResult` | Agregar `observedAt?`, `source?` (opcional) | Compatibilidad hacia atrás |
| `DoctorReport` | `timestamp` → `generatedAt` | Semántica más clara |
| `BuffyContext` | `schema: 'buffy.context/v2'` | Breaking change en hardware fields |
| `EpistemicState` | Nuevo tipo | Estados diferenciables |
| `HardwareField` | Nuevo tipo | Campos hardware con metadata temporal |
| `FRESNESS_POLICY` | Nuevo archivo | Políticas por categoría |

---

## Decisiones que se aplazan a la implementación

1. **Valores de maxAgeMs** — La política está definida en términos de volatilidad y razonamiento, pero los números específicos pueden ajustarse con datos empíricos durante la implementación
2. **Comportamiento de `needs_refresh`** — Cómo el modelo activa un refresh on-demand (interfaz de llamada)
3. **INFERRED como estado** — Cómo se produce una Observation con `epistemicState: 'inferred'`
4. **Caché de Observation** — Si las Observation se almacenan entre llamadas o se regeneran en cada diagnose

---

## Dependencias

```
E4.1 (este spec)
   ↓
Implementación M1 (observedAt en Observation)
   ↓
Implementación M2 (propagar timestamps desde adapters)
   ↓
Implementación M3 (fix cpuPercent = 0 en Linux)
   ↓
Implementación S2 (freshness policy + classifyEpistemicState)
   ↓
Implementación S3 (epistemicState en Observation)
   ↓
Mini experiment de validación (prueba狭)
   ↓
E4.2 (integración selector + freshness gating)
```
