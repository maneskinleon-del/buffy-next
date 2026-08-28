# Buffy Next — Observability

## Estado: ✅ COMPLETADO

**Fecha:** 2026-08-28
**Tests:** 569/569

---

## Componentes

### 1. Telemetry (`src/core/telemetry.ts`)

Mínimo telemetry sin dependencias pesadas.

#### Request Metrics

```typescript
interface RequestMetrics {
  timestamp: string;
  query: string;
  queryType: 'factual' | 'dynamic' | 'stale' | 'unknown' | 'open';
  fieldsSelected: string[];
  fieldsOmitted: string[];
  staleFields: string[];
  refreshRequested: string[];
  refreshSuccess: string[];
  refreshLatencyMs: number;
  contextBytes: number;
  modelLatencyMs: number;
  totalLatencyMs: number;
  unsupportedClaims: number;
}
```

#### Freshness Telemetry

```typescript
interface FreshnessTelemetry {
  field: string;
  observedAt: string;
  ageMs: number;
  epistemicState: string;
  refreshRequired: boolean;
  refreshPerformed: boolean;
}
```

#### Error Records

```typescript
interface ErrorRecord {
  timestamp: string;
  category: ErrorCategory;
  message: string;
  query: string;
  platform: string;
  model: string;
  input: unknown;
  expected: unknown;
  actual: unknown;
  trace: string;
}
```

### 2. Error Taxonomy (`src/core/errors.ts`)

Categorías explícitas de errores:

| Categoría | Descripción |
|-----------|-------------|
| OBSERVATION_ERROR | Fallo al leer datos del sistema |
| FRESHNESS_ERROR | Fallo al clasificar frescura |
| REFRESH_ERROR | Fallo al refrescar datos stale |
| SELECTION_ERROR | Fallo al seleccionar checks |
| CONTEXT_ERROR | Fallo al construir contexto |
| MODEL_ERROR | Modelo retornó respuesta inválida |
| PLATFORM_ERROR | Fallo específico de plataforma |
| EXECUTION_ERROR | Fallo al ejecutar acción |

### 3. Health Check

```typescript
interface HealthStatus {
  timestamp: string;
  platform: string;
  adapter: string;
  subsystems: {
    observation: 'ok' | 'error';
    freshness: 'ok' | 'error';
    actions: 'ok' | 'error';
    state: 'ok' | 'error';
  };
  metrics: {
    totalRequests: number;
    totalErrors: number;
    staleRate: number;
    averageLatencyMs: number;
  };
  version: string;
}
```

---

## Uso

### Registrar métricas

```typescript
import { recordRequestMetrics, buildRequestMetrics } from './telemetry.js';

const metrics = buildRequestMetrics(query, selection, gating, observations, audit, latency);
recordRequestMetrics(metrics);
```

### Analizar patrones de frescura

```typescript
import { analyzeFreshnessPatterns } from './telemetry.js';

const patterns = analyzeFreshnessPatterns();
// patterns.mostStaleFields — campos más stale
// patterns.mostRefreshedFields — campos más refrescados
// patterns.staleRate — tasa de stale
```

### Health check

```typescript
import { getHealthStatus } from './telemetry.js';

const health = getHealthStatus('linux', 'LinuxAdapter');
console.log(health.subsystems); // { observation: 'ok', freshness: 'ok', ... }
```

---

## Reglas

1. No almacenar PII o datos sensibles
2. Límite de 1000 registros por categoría
3. Reset solo en tests
4. Un error debe pertenecer a una categoría identificable
