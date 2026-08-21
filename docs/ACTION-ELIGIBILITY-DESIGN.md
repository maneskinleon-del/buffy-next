# Action Eligibility + Conflict Resolution — Design v0.8

> Estado: **Diseño** (no implementar todavía)
> Baseline: benchmark v2 (`a291cde`) — 12/25 pass, 13 fail

## Problema

El benchmark v2 reveló que `mapActions()` tiene un defecto estructural:

```text
trigger = cpu-status
→ si existe cpu-status → ejecutar acción
```

Esto causa:

1. **safe-reboot se dispara con CPU 40%** (severity: ok)
2. **close-heavy-processes se dispara con CPU 55%** (severity: ok)
3. **check-thermal se dispara con temperatura 45°C** (severity: ok)
4. **4 acciones se disparan simultáneamente** para un mismo síntoma

El modelo actual es:

```text
Observation → Check → Action trigger → Action
```

Necesita ser:

```text
Observation → Check → Inference/severity/evidence → Action eligibility → Conflict resolution → Action
```

## Pregunta central

> ¿Cómo puede Buffy decidir cuándo una acción está justificada, no solo cuándo su trigger existe?

## El contrato actual (defectuoso)

```typescript
// action-registry.ts (actual)
interface ActionEntry {
  id: string;
  triggers: string[];  // ← Solo IDs de check, sin filtro de severidad
  name: string;
  instructions: PlatformInstructions[];
}
```

`findActionsForChecks()` hace:

```typescript
for (const result of checkResults) {
  for (const entry of ACTION_CATALOG) {
    if (entry.triggers.includes(result.id)) {  // ← Solo matchea ID
      triggeredIds.add(entry.id);
    }
  }
}
```

**No verifica severidad, no verifica evidencia, no resuelve conflictos.**

## Diseño propuesto

### Componente 1: Action Eligibility

Cada acción debe poder especificar **condiciones de elegibilidad** más allá del trigger:

```typescript
interface ActionEligibility {
  /** Check IDs that trigger this action */
  triggers: string[];
  /** Minimum severity required (if omitted, any severity matches) */
  minSeverity?: 'ok' | 'warning' | 'error' | 'unknown';
  /** Requires ALL triggers to match, or just ANY? */
  matchMode: 'any' | 'all';
  /** Evidence keywords that must appear in check messages */
  evidence?: string[];
  /** Maximum number of concurrent actions from this family */
  maxConcurrent?: number;
}
```

**Ejemplo para safe-reboot:**

```typescript
{
  triggers: ['cpu-status', 'ram-status', 'temperature-status'],
  minSeverity: 'error',           // ← Solo severity error
  matchMode: 'all',               // ← Requiere MÚLTIPLES checks
  evidence: ['critical', 'unresponsive', 'frozen'],
  maxConcurrent: 0,               // ← Nunca se ejecuta concurrentemente
}
```

**Ejemplo para close-heavy-processes:**

```typescript
{
  triggers: ['heavy-processes', 'cpu-status'],
  minSeverity: 'warning',         // ← Al menos warning
  matchMode: 'any',
  maxConcurrent: 1,               // ← Solo 1 acción de "close" por vez
}
```

### Componente 2: Action Family

Las acciones se agrupan en **familias** para resolver conflictos:

```typescript
type ActionFamily =
  | 'investigate'    // inspect-processes, check-startup, check-thermal
  | 'mitigate'       // close-heavy-processes, clear-memory, restart-network
  | 'escalate'       // safe-reboot
  | 'inform'         // check-permissions, check-tools-availability
  | 'maintenance';   // free-disk-space, clear-app-cache
```

**Regla de familia:**
- `investigate` tiene prioridad sobre `mitigate`
- `mitigate` tiene prioridad sobre `escalate`
- `escalate` solo se ejecuta si `investigate` + `mitigate` no resolvieron
- Máximo 1 acción por familia en la misma respuesta

### Componente 3: Conflict Resolution

Cuando múltiples acciones son elegibles:

```typescript
function resolveConflicts(
  eligible: EligibleAction[],
): EligibleAction[] {
  // 1. Ordenar por prioridad de familia
  // 2. Eliminar duplicados de familia
  // 3. Eliminar acciones que requieren evidencia no presente
  // 4. Limitar a N acciones máximo (default: 3)
  return ranked.slice(0, MAX_ACTIONS_PER_RESPONSE);
}
```

**Prioridad de familia:**

```text
1. investigate  (primero diagnosticar)
2. mitigate     (después actuar)
3. inform       (si no hay acción disponible)
4. maintenance  (solo si explícitamente solicitado)
5. escalate     (último recurso, solo con evidencia fuerte)
```

### Componente 4: Severity Gate

Cada acción puede tener un **severity gate** mínimo:

```typescript
// safe-reboot: necesita severity error EN MÚLTIPLES checks
{
  triggers: ['cpu-status', 'ram-status', 'temperature-status'],
  eligibility: {
    minSeverity: 'error',
    matchMode: 'all',          // Mínimo 2 de 3 con severity error
    minMatches: 2,
  },
}

// check-thermal: necesita severity warning o mayor
{
  triggers: ['temperature-status'],
  eligibility: {
    minSeverity: 'warning',
    matchMode: 'any',
  },
}

// close-heavy-processes: necesita heavy-processes O cpu-status warning+
{
  triggers: ['heavy-processes', 'cpu-status'],
  eligibility: {
    minSeverity: 'warning',
    matchMode: 'any',
  },
}
```

## Arquitectura propuesta

```
checkResults (from diagnosis)
  │
  ▼
[1] Eligibility Filter
  │  Para cada acción: ¿cumple triggers + severity + evidence?
  │
  ▼
[2] Family Grouper
  │  Agrupa acciones elegibles por familia
  │
  ▼
[3] Conflict Resolver
  │  Prioridad: investigate > mitigate > inform > maintenance > escalate
  │  Elimina duplicados de familia
  │  Limita a N acciones máximo
  │
  ▼
[4] Output
  RecommendedAction[] (ya filtrado y rankeado)
```

## Ejemplo: CPU 40% (severity: ok)

```text
Actual (v0.7):
  → close-heavy-processes (high)
  → inspect-processes (high)
  → check-startup (high)
  → safe-reboot (high)
  4 acciones, incluyendo reboot

Con v0.8:
  Eligibility filter:
    close-heavy-processes: minSeverity=warning → REJECT (severity=ok)
    inspect-processes: minSeverity=warning → REJECT (severity=ok)
    check-startup: minSeverity=warning → REJECT (severity=ok)
    safe-reboot: minSeverity=error, matchMode=all → REJECT
  Result: []
  0 acciones — correcto para CPU 40%
```

## Ejemplo: CPU 85% + temp 85°C + heavy process

```text
Actual (v0.7):
  → close-heavy-processes
  → inspect-processes
  → check-startup
  → check-thermal
  → safe-reboot
  5 acciones, incluyendo reboot

Con v0.8:
  Eligibility:
    close-heavy-processes: warning+ → PASS
    inspect-processes: warning+ → PASS
    check-startup: warning+ → PASS
    check-thermal: warning+ → PASS
    safe-reboot: error + matchMode=all → CHECK (2/3 error? temp=yes, cpu=yes)
  
  Family grouping:
    investigate: [inspect-processes, check-startup, check-thermal]
    mitigate: [close-heavy-processes]
    escalate: [safe-reboot]
  
  Conflict resolution:
    1. investigate: keep 1 → inspect-processes (most relevant)
    2. mitigate: keep 1 → close-heavy-processes
    3. escalate: safe-reboot → HOLD (investigate + mitigate first)
  
  Result: [inspect-processes, close-heavy-processes]
  2 acciones, escalonadas
```

## Ejemplo: temperature 45°C (severity: ok)

```text
Actual (v0.7):
  → check-thermal (high)
  → safe-reboot (medium)

Con v0.8:
  check-thermal: minSeverity=warning → REJECT (severity=ok)
  safe-reboot: minSeverity=error → REJECT
  Result: []
  0 acciones — correcto para temperatura normal
```

## Gates de aceptación

```text
G1: benchmark v2 pass rate ≥ 20/25 (80%)
G2: safe-reboot NO se dispara con severity ok
G3: Máximo 3 acciones por respuesta
G4: investigate siempre precede a mitigate
G5: escalate solo con evidencia de severity error en 2+ checks
G6: Sin regressión en benchmark v1 (8/10 pass)
G7: 236+ tests (sin regressión)
G8: Determinismo: misma query → mismo resultado
G9: Sin LLM, sin embeddings, sin dependencias externas
```

## Scope

### In scope

- [ ] ActionEligibility interface (triggers + minSeverity + matchMode + evidence)
- [ ] ActionFamily type (investigate/mitigate/inform/maintenance/escalate)
- [ ] Eligibility Filter (check severity against minSeverity)
- [ ] Family Grouper (group eligible actions by family)
- [ ] Conflict Resolver (priority + dedup + limit)
- [ ] Severity Gate per action
- [ ] Benchmark v2 update with expected results
- [ ] Tests for eligibility, grouping, resolution

### Out of scope

- Nuevas acciones
- Cambios a Action Registry existente (solo agregar eligibility)
- LLM, embeddings, dependencias externas
- Cambios a contratos congelados (v0.5-B, v0.6, v0.7)

## Referencias

- Benchmark v2: commit `a291cde`
- Action Registry: `src/core/action-registry.ts`
- Action Mapper: `src/core/action-mapper.ts`
- Benchmark v1: `experiments/action-grounding-benchmark.ts`
