# Pipeline Integration Audit — v0.5-B → v0.8

## 1. Situación actual

```
diagnose() (src/core/diagnose.ts):
  query
    → selectChecks(query)              ← v0.5-B ✅
    → adapter.systemInfo()             ← adapter ✅
    → analyzeForQuery(systemInfo)      ← legacy ⚠️
    → findActionsForIssue(items)       ← legacy ❌ (registry viejo, 7 acciones)
```

**NO usa:**
- `scoreContext()` — v0.6
- `mapActions()` — v0.7-0.8
- `action-registry.ts` (nuevo) — v0.8 con eligibility

## 2. Contratos entre capas

### selectChecks()
```typescript
// Entrada: query (string)
// Salida: CheckName[] — ['cpu', 'ram', 'gpu', 'storage', ...]
// Tipo: string (alias de CheckName)
selectChecks(query: string): CheckName[]
```

### scoreContext()
```typescript
// Entrada: query (string) + lexicalCandidates (CheckName[])
// Salida: CheckSelection { checks: CheckName[], ambiguous: boolean, confidence: Confidence }
// Ejecuta: splitFragments() + bindEntityModifier()
scoreContext(query: string, lexicalCandidates: CheckName[]): CheckSelection
```

### analyzeForQuery() [ACTUAL — en diagnose.ts]
```typescript
// Entrada: SystemInfo + CheckName[] (los candidatos)
// Salida: CheckResult[] (con severidad real del sistema)
// Produce: id='cpu-status', severity='warning'|'ok'|'error', message=...
analyzeForQuery(system: SystemInfo, checks: CheckName[]): CheckResult[]
```

### mapActions()
```typescript
// Entrada: CheckResult[] (con severidad) + PlatformName
// Salida: RecommendedAction[] (con instrucciones, confidence, observed, inferred)
// Ejecuta: findActionsForChecks() → resolveConflicts() → evaluateConfidence()
mapActions(checkResults: CheckResult[], platform: PlatformName): RecommendedAction[]
```

## 3. El gap crítico

```
selectChecks() → CheckName[]     ['cpu', 'ram']
                                       ↓
scoreContext()  → CheckSelection { checks: ['cpu'], confidence: 'high' }
                                       ↓
analyzeForQuery() → CheckResult[] [{id:'cpu-status', severity:'warning', ...}]
                                       ↓
mapActions() → RecommendedAction[] [{id:'close-heavy-processes', confidence:'high', ...}]
```

**Cada capa produce el tipo que la siguiente necesita.** Pero actualmente:
- `scoreContext()` no se ejecuta
- `mapActions()` no se ejecuta
- `findActionsForIssue()` reemplaza a `mapActions()` con un registry de 7 acciones

## 4. ¿mapActions() necesita observations/diagnosis o solo CheckName[]?

**Necesita CheckResult[]**, no CheckName[].

```typescript
// mapActions() lee:
checkResults.filter(c => entry.triggers.includes(c.id))  // filtra por trigger ID
c.severity  // para eligibility (minSeverity)
c.message   // para observed/inferred
c.suggestion || c.explanation  // para inferred
```

Por tanto, `analyzeForQuery()` **debe ejecutarse ANTES de `mapActions()`** porque es quien produce las severidades reales.

## 5. ¿scoreContext() antes o después de systemInfo()?

**Antes.** `scoreContext()` es pura — solo necesita query + CheckName[].
`systemInfo()` es la llamada costosa (acceso a hardware).

```
orden correcto:
  1. selectChecks(query)        → CheckName[]        (rápido, regex)
  2. scoreContext(query, lex)   → CheckSelection     (rápido, pure fn)
  3. adapter.systemInfo()       → SystemInfo          (lento, hardware)
  4. analyzeForQuery(sys, sel)  → CheckResult[]       (rápido, cálculo)
  5. mapActions(checks, plat)   → RecommendedAction[] (rápido, pure fn)
```

## 6. Pipeline conceptual vs actual

### Conceptual (diseño)
```
query
  → selection        (selectChecks)
  → observations     (scoreContext refines selection)
  → system data      (adapter.systemInfo)
  → inference        (analyzeForQuery produces CheckResults)
  → eligibility      (mapActions with v0.8 eligibility)
  → actions          (RecommendedAction[])
  → instructions     (PlatformInstructions per action)
```

### Actual (diagnose.ts)
```
query
  → selection        (selectChecks)           ✅
  → [scoreContext]   (NO SE EJECUTA)         ❌
  → system data      (adapter.systemInfo)     ✅
  → [analyzeForQuery] (funciona pero hardcodeado) ⚠️
  → [mapActions]     (NO SE EJECUTA)         ❌
  → findActionsForIssue (registry viejo)      ❌
```

### Propuesto (ruta canónica)
```
query
  → selectChecks(query)              → CheckName[]
  → scoreContext(query, checks)      → CheckSelection
  → adapter.systemInfo()             → SystemInfo
  → analyzeForQuery(sys, sel.checks) → CheckResult[]
  → mapActions(results, platform)    → RecommendedAction[]
```

## 7. Partes legacy vs a conservar

### Legacy (reemplazar)
| Función | Problema | Reemplazo |
|---------|----------|-----------|
| `findActionsForIssue()` | Registry viejo (7 acciones) | `mapActions()` |
| `DiagnosisResult` interface | No incluye v0.6/v0.8 campos | Nuevo `DiagnosticResponse` |

### Conservar (adaptar)
| Función | Por qué | Cambio necesario |
|---------|---------|------------------|
| `selectChecks()` | v0.5-B funciona correctamente | Ninguno |
| `analyzeForQuery()` | Produce CheckResult[] con severidad real | Ninguno (ya produce el tipo correcto) |
| `adapter.systemInfo()` | Datos reales del sistema | Ninguno |

### Agregar (nuevo)
| Función | Por qué |
|---------|---------|
| `scoreContext()` | Refina selección con contexto |
| `mapActions()` | v0.8 eligibility + conflict resolution |

## 8. Contradicciones detectadas

### Contradicción 1: CheckName vs CheckResult
`selectChecks()` devuelve `CheckName[]` (strings como 'cpu', 'ram').
`mapActions()` necesita `CheckResult[]` (objetos con id, severity, message).

**Resolución:** `analyzeForQuery()` ya hace esta conversión. No hay contradicción, solo falta conectarlas.

### Contradicción 2: action-registry doble
Existen DOS action registries:
- `src/actions/registry.ts` — 7 acciones, sin eligibility (el que usa diagnose.ts)
- `src/core/action-registry.ts` — 15 acciones, con eligibility (el que usa mapActions)

**Resolución:** Eliminar `src/actions/registry.ts` del pipeline canónico. Usar solo `src/core/action-registry.ts` via `mapActions()`.

### Contradicción 3: DiagnosticResult vs RecommendedAction
`DiagnosisResult` tiene `suggestedActions: ActionDefinition[]` (viejo tipo).
`mapActions()` devuelve `RecommendedAction[]` (nuevo tipo con observed/inferred/confidence).

**Resolución:** Crear nueva interface `DiagnosticResponse` que use `RecommendedAction[]`.

### Contradicción 4: analyzeForQuery hardcodea severidad
La función `analyzeForQuery()` calcula severidad con lógica hardcodeada (e.g., CPU > 80 = warning). Esto es correcto pero está duplicado conceptualmente con lo que `mapActions()` espera recibir.

**Resolución:** No es un problema real — `analyzeForQuery()` produce los CheckResult[], `mapActions()` los consume. La severidad se calcula una vez.

## 9. Modificación mínima propuesta

### Archivo: src/core/diagnose.ts (reescritura parcial)

```typescript
// Nueva interface de salida
export interface DiagnosticResponse {
  query: string;
  selection: CheckSelection;        // v0.6 — qué se seleccionó y por qué
  observations: CheckResult[];      // datos reales del sistema
  actions: RecommendedAction[];     // v0.8 — acciones con instrucciones
  platform: PlatformName;
}

// Ruta canónica v0.8
export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<DiagnosticResponse> {
  // 1. Lexical selection (v0.5-B)
  const lexicalChecks = selectChecks(query);

  // 2. Context scoring (v0.6)
  const selection = scoreContext(query, lexicalChecks);

  // 3. System data (adapter)
  const systemInfo = await adapter.systemInfo();

  // 4. Observations (analyze real system data)
  const observations = analyzeForQuery(systemInfo, selection.checks);

  // 5. Action mapping (v0.8)
  const platform = adapter.name as PlatformName;
  const actions = mapActions(observations, platform);

  return { query, selection, observations, actions, platform };
}
```

### Archivo: src/core/presenter.ts (agregar renderer)

```typescript
export function renderDiagnosticResponse(response: DiagnosticResponse): string {
  // Formatear para humano:
  // - selection.checks → qué revisó
  // - observations → qué encontró (con severidad)
  // - actions → qué recomienda (con instrucciones)
  // Respetar confidence: high→haz, medium→prueba, low→podría, unsupported→no tengo pasos
}

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);  // ya existe
}
```

### Archivo: src/cli.ts (actualizar cmdDiagnose)

```typescript
async function cmdDiagnose(adapter, query) {
  const response = await diagnose(adapter, query);

  if (jsonMode) {
    console.log(toJSON(response));
    return;
  }

  console.log(renderDiagnosticResponse(response));

  // YA NO ejecuta acciones automáticamente — solo recomienda
  // (v0.8 produce RecommendedAction[] con instructions, no ActionDefinition[])
}
```

## 10. Lo que NO se toca

| Componente | Por qué |
|-----------|---------|
| `selectChecks()` | Funciona, v0.5-B congelado |
| `scoreContext()` | Funciona, v0.6 congelado |
| `fragment-splitter.ts` | Funciona |
| `entity-modifier.ts` | Funciona |
| `action-mapper.ts` | Funciona, v0.8 congelado |
| `action-registry.ts` | Funciona, v0.8 congelado |
| `check-selector.ts` | Funciona |
| Todos los tests existentes | 236/236 se conservan |
| Benchmarks v1 y v2 | Se conservan como artefactos |

## 11. Riesgos

1. **`analyzeForQuery()` produce CheckResult IDs que matchean con action-registry triggers.** Verificar que los IDs son consistentes (e.g., 'cpu-status' en ambos lados). Ya funciona en el benchmark v2.

2. **`adapter.name` es string, no PlatformName.** Hay que castear o validar.

3. **El renderer humano necesita traducir RecommendedAction a lenguaje comprensible.** Esto es UX, no arquitectura.

4. **`cmdDiagnose` actual ejecutaba acciones automáticamente.** La nueva versión solo recomienda — cambio de comportamiento que afecta la CLI.

## 12. Resumen

```
ANTES:  diagnose() → selectChecks → analyzeForQuery → findActionsForIssue (legacy)
DESPUÉS: diagnose() → selectChecks → scoreContext → systemInfo → analyzeForQuery → mapActions

Cambio real: ~40 líneas en diagnose.ts + ~30 líneas en presenter.ts
No toca: selectChecks, scoreContext, action-mapper, action-registry, tests, benchmarks
```
