# Semantic Routing — Design v0.6

> Estado: **Diseño** (no implementar todavía)
> Baseline congelado: v0.5-B (`9a49408`) — 92% correct, 76.7% precision, 78% recall

## Pregunta central

> ¿Puede Buffy resolver los 4 golden cases mediante scoring contextual pequeño, determinista y medible, sin convertir el selector en un LLM router?

Si la respuesta es sí → v0.6 es scoring contextual.
Si la respuesta es no → v0.6 necesita embeddings o un modelo semántico.

## Por qué no implementar todavía

v0.5-B demostró que el 88% del problema se resuelve con determinismo puro.
Los 4 casos restantes no son "no conozco esta palabra" sino "conozco las palabras pero no sé qué relación tienen entre sí".

Antes de implementar, hay que diseñar:
1. Qué significa *context scoring* para Buffy
2. Si puede hacerse de manera pequeña, determinista y medible
3. Qué métricas justifican introducir complejidad

## Restricción explícita

> **v0.6 no debe introducir embeddings, LLM ni conocimiento externo.**

El experimento debe demostrar primero cuánto puede conseguir Buffy mediante:
- fragmentos
- entidades
- modificadores
- co-ocurrencia
- puntuación determinista
- umbrales explícitos

Así podremos responder con datos:

**¿El 8% restante realmente necesita semántica vectorial/LLM, o basta con contexto estructurado?**

## Regla metodológica

> **Una solución que aumenta Correct pero elimina casos hacia `[]` o `ambiguous` sin evidencia suficiente no es una mejora automática.**

Podemos conseguir 95–98% haciendo que el selector seleccione demasiado. El objetivo sigue siendo **precisión contextual sin recuperar el over-selection de v0.5-A**.

## Arquitectura propuesta

```
query
  │
  ▼
[1] Lexical selector (v0.5-B)           ← candidatos
  │
  ▼
[2] Fragment splitter (D1)               ← separa en y/pero/cuando
  │
  ▼
[3] Entity/modifier binding              ← "lento" modifica "wifi"
  │
  ▼
[4] Context scoring                      ← puntuación determinista
  │
  ├── confident → selected checks
  ├── multiple strong candidates → ambiguous
  └── no sufficient evidence → []
```

### Capa 1: Deterministic lexical candidates (v0.5-B)

Ya resuelta. El selector actual entrega:
- Checks específicos cuando matchea un pattern
- DEFAULT_DIAGNOSTIC_CHECKS cuando hay intención vaga
- [] cuando no hay intención diagnóstica

### Capa 2: Context scoring (v0.6 — a diseñar)

Esta capa recibe los candidates de la capa 1 y aplica scoring contextual.

#### Preguntas de diseño

**Q1: ¿Qué es "contexto" en este nivel?**
- Relaciones sintácticas entre fragmentos de la query
- Presencia de modificadores que califican un término genérico
- Co-ocurrencia de términos de dominios distintos

**Q2: ¿Cuándo activar la capa 2?**
- Solo cuando la capa 1 entrega más de N checks
- O cuando la query contiene conectores entre dominios ("y", "pero", "cuando")
- Nunca para queries directas (ya funcionan al 100%)

**Q3: ¿Qué señales son baratas de detectar?**
- Conectores: "y", "pero", "cuando", "además", "también"
- Modificadores de dominio: "wifi es lento" → "lento" modifica "wifi", no el sistema
- Entidades implícitas: "el mouse" → input device, no GPU

**Q4: ¿Qué NO hacer?**
- No usar un LLM para decidir checks
- No calcular embeddings
- No引入 dependencias nuevas
- No romper el contrato determinista del selector

#### Mecanismo candidato: Co-occurrence filtering

Cuando la query contiene **términos de 2+ dominios**:

1. Identificar dominios presentes (ya lo hace el selector)
2. Para cada término genérico (ej: "lento"), verificar si hay un **modificador de dominio** cerca
3. Si "lento" está cerca de "wifi" → el contexto es red, no performance general
4. Si "lento" está aislado → performance general (comportamiento actual)

Ejemplo:
```
"wifi es lento y la temperatura sube"

Dominios: [network, temperature]
Léxico: "lento" → performance, "temperatura" → temperature

Scoring:
  "lento" modificado por "wifi" → contexto: network (no agrega ram/gpu)
  "temperatura" → temperature + cpu + processes (específico)

Resultado: [network, os, temperature, cpu, processes]
```

## Golden Cases

Estos son los 4 casos que v0.6 debe resolver. Cada uno tiene un **expected** y un **reasoning** que explica por qué.

### GC-1: "el mouse se mueve solo"

```text
Query:    "el mouse se mueve solo"
v0.5-B:   [] (sin match, sin intención diagnóstica clara)
Expected: { checks: [], ambiguous: true, confidence: 'low' }

Reasoning:
  - "mouse" could be input device (hardware) or could indicate display issue
  - "se mueve solo" = ghost input → could be hardware, GPU artifact, or process
  - No sufficient evidence to select a specific check
  - Correct behavior: return [] with ambiguous: true
  - La incertidumbre es la respuesta correcta, no inventar certeza

Contrato: dato desconocido → unknown, intención ambigua → ambiguous.
```

### GC-2: "antes andaba mejor"

```text
Query:    "antes andaba mejor"
v0.5-B:   [cpu, ram, gpu, storage, temperature, processes] (DEFAULT via "anda")
          + "mejor" triggers performance pattern → adds ram/gpu
          Result: over-selected (storage is extra)

Expected: [cpu, ram, gpu, temperature, processes]

Reasoning:
  - "antes andaba mejor" = degradation over time
  - No explicit entity → general performance
  - "mejor" is a comparative modifier, not a domain term
  - Should trigger performance checks WITHOUT storage
  - Problem: "mejor" doesn't match any pattern → falls to DEFAULT

Possible fix:
  Add "mejor" / "peor" as performance modifiers in v0.5-B
  This might resolve it without needing scoring layer
```

### GC-3: "wifi es lento y la temperatura sube"

```text
Query:    "wifi es lento y la temperatura sube"
v0.5-B:   [network, os, temperature, cpu, processes, ram, gpu]
Expected: [network, os, temperature, cpu, processes]

Reasoning:
  - Two distinct domains: network + temperature
  - "lento" modifies "wifi" → context is network performance
  - "lento" should NOT trigger ram/gpu in this context
  - "temperatura sube" → temperature + cpu + processes (correct)
  - Extra: ram, gpu (from "lento" → performance pattern)

Key insight:
  "lento" is a CONTEXT-DEPENDENT modifier.
  - "mi PC está lento" → performance (general)
  - "wifi es lento" → network (specific domain)
  - The difference is the entity "wifi" preceding "lento"

Scoring mechanism:
  If entity + generic modifier → entity domain only
  If generic modifier alone → general performance
```

### GC-4: "la temperatura sube cuando abro Chrome y el mouse se pone lento"

```text
Query:    "la temperatura sube cuando abro Chrome y el mouse se pone lento"
v0.5-B:   [temperature, cpu, processes, ram, gpu]
Expected: [temperature, cpu, processes, gpu]

Reasoning:
  - Two fragments connected by "y":
    Fragment A: "la temperatura sube cuando abro Chrome"
    Fragment B: "el mouse se pone lento"
  - Fragment A: temperature + processes (Chrome = app)
  - Fragment B: "mouse se pone lento" → input/display issue
  - "lento" in Fragment B modifies "mouse", not the system
  - Extra: ram (from "lento" → performance pattern)

Key insight:
  The conjunction "y" separates two independent diagnostic statements.
  Each fragment should be scored independently.
  "lento" in Fragment B has a different context than "lento" in general.

Scoring mechanism:
  Split on conjunctions ("y", "pero", "cuando")
  Score each fragment independently
  Union results
```

## Criterios de evaluación para v0.6

### Métricas obligatorias

| Métrica | v0.5-B baseline | v0.6 objetivo |
|---------|-----------------|---------------|
| Correct | 92% | ≥92% (no regresión) |
| Precision | 76.7% | ≥80% |
| Recall | 78.0% | ≥78% (no regresión) |
| Over-selection | 6% | ≤6% |
| Under-selection | 2% | ≤2% |
| Ambiguous/unknown | 0% | Nuevo: track this |

### Golden cases específicas

| Case | v0.5-B | v0.6 objetivo |
|------|--------|---------------|
| GC-1: "mouse se mueve solo" | [] (under) | [] con flag "ambiguous" |
| GC-2: "antes andaba mejor" | over-select (storage) | [cpu,ram,gpu,temp,proc] |
| GC-3: "wifi lento + temperatura" | over-select (ram,gpu) | [network,os,temp,cpu,proc] |
| GC-4: "temp sube + mouse lento" | over-select (ram) | [temp,cpu,proc,gpu] |

### Métricas nuevas para v0.6

| Métrica | Descripción |
|---------|-------------|
| **Ambiguity detection** | ¿Identifica correctamente queries ambiguas? |
| **Fragment splitting** | ¿Separa correctamente queries con "y"/"pero"/"cuando"? |
| **Entity-modifier binding** | ¿Asocia "lento" al dominio correcto? |
| **Latencia** | ¿Añade <1ms de overhead? |
| **Determinismo** | ¿Misma query → mismo resultado siempre? |
| **Coste** | ¿Cero dependencias externas? |

### Gates de aceptación

```text
G1: No regresión en direct (10/10)
G2: No regresión en non-diagnostic (10/10 → [])
G3: Recall ≥ 78%
G4: Precision ≥ 80%
G5: Over-selection ≤ 6%
G6: Los 4 golden cases resueltos
G7: Latencia < 1ms
G8: Determinismo: misma query → mismo resultado
G9: Tests unitarios para cada fragment splitting / entity binding
G10: Benchmark 50 queries sin regresión
```

## Decisiones de diseño (resueltas)

### D1: Fragment splitting → **SÍ, limitado a conectores evidentes**

Split on conjunctiones explícitas: `y`, `pero`, `cuando`, `además`, `también`.

Cada fragmento se scorea independentemente. Los resultados se unen.

Limitación conocida: no detecta relaciones causales implícitas ("cuando abro Chrome se pone lento" → "cuando" es conector temporal, no causal explícita). Si los golden cases lo requieren, escalar a ventanas de contexto en v0.7.

Motivo: necesario para GC-3 y GC-4.

### D2: Ambiguous → **SÍ, como estado explícito**

El tipo de retorno de `selectChecks()` se extiende:

```typescript
interface CheckSelection {
  checks: CheckName[];
  ambiguous: boolean;    // true cuando no hay evidencia suficiente
  confidence: 'high' | 'medium' | 'low';
}
```

Cuando `ambiguous: true`, el consumer decide qué hacer (mostrar mensaje, preguntar al usuario, ejecutar DEFAULT_DIAGNOSTIC_CHECKS como fallback seguro).

GC-1 demuestra que forzar un check sería inventar certeza. La salida correcta es `[]` con `ambiguous: true`.

Motivo: "el mouse se mueve solo" no tiene evidencia suficiente para seleccionar un check concreto.

### D3: Scoring location → **Función separada después del lexical selector**

```typescript
// Nueva función — Testing independiente
function scoreContext(
  candidates: CheckName[],
  query: string,
): CheckSelection
```

Se llama desde `diagnose()`, después de `selectChecks()`. El selector v0.5-B queda intacto.

```typescript
// diagnose.ts (modificado)
const lexical = selectChecks(query);           // v0.5-B
const scored = scoreContext(lexical, query);   // v0.6
const checks = scored.checks;                 // para análisis
```

Ventajas:
- v0.5-B se conserva como baseline puro
- `scoreContext()` se testea de forma independiente
- Se puede activar/desactivar sin romper el selector
- Mejor separación de responsabilidades

Motivo: modularidad y ability to A/B test contra v0.5-B.

## Scope de v0.6

### In scope

- [ ] Fragment splitting on conjunctions
- [ ] Entity-modifier binding (context-dependent "lento")
- [ ] Ambiguity detection and flagging
- [ ] Golden cases as formal test cases
- [ ] Benchmark expansion with ambiguity queries

### Out of scope (candidatos para v0.7+)

- Semantic routing con embeddings
- LLM-based check selection
- Session context (historial de queries)
- Cross-query learning
- Confidence calibration

## Referencias

- v0.5-B baseline: commit `9a49408`
- Benchmark: `experiments/check-selector-benchmark.ts`
- Selector actual: `src/core/check-selector.ts`
- Tests: `tests/checks.test.ts`, `tests/diagnose.test.ts`
