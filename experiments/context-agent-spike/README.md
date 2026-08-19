# Context Agent Spike

Experimento controlado para validar si `BuffyContext` es útil para un agente AI real.

## Objetivo

Comprobar que el contrato `buffy.context/v1` permite a un agente externo:

1. **Identificar** correctamente el equipo descrito
2. **Razonar** sobre problemas y riesgos reales
3. **No inventar** datos que no están en el JSON
4. **Reconocer limitaciones** (null, campos no disponibles)

## Setup

```bash
./run.sh              # Genera contexto + prepara prompts
./run.sh --context    # Solo generar JSON
./run.sh --prepare    # Solo preparar prompts (requiere fixture existente)
```

## Experimentos

### Case A — Contexto completo

El agente recibe exclusivamente el BuffyContext y la pregunta:

> "¿Puedes diagnosticar este equipo?"

**Mide:** identificación, fidelidad, utilidad.

### Case B — Sin contexto (control)

El agente recibe solo la misma pregunta, sin JSON.

**Mide:** qué tan útil es el contexto comparado con nada.

### Case C — Contexto + análisis de riesgos

El agente recibe el BuffyContext y pregunta:

> "¿Qué problemas o riesgos ves en este equipo y qué revisarías primero?"

**Mide:** razonamiento, priorización, recomendaciones accionables.

## Métricas de evaluación

| Métrica | Qué mide | Cómo verificar |
|---------|----------|----------------|
| **Identificación** | ¿Reconoció correctamente la máquina? | Comparar con fixture real |
| **Fidelidad** | ¿Inventó datos que no estaban? | Buscar valores no presentes en JSON |
| **Utilidad** | ¿Extrajo problemas reales del contexto? | Evaluar si los problemas corresponden a los datos |
| **Priorización** | ¿Distinguió lo importante de lo trivial? | Evaluar orden de recomendaciones |
| **Alucinación** | ¿Agregó hardware/software inexistente? | Verificar cada afirmación contra el JSON |
| **Limitaciones** | ¿Reconoció los `null` y capacidades ausentes? | Buscar menciones de "no disponible" o "desconocido" |
| **Acción** | ¿Sus recomendaciones corresponden al entorno real? | Evaluar coherencia |

## Estructura

```
experiments/context-agent-spike/
├── README.md              # Este archivo
├── run.sh                 # Generador de contexto + prompts
├── prompts/
│   ├── case-a-full-context.md    # Template Case A
│   ├── case-b-no-context.md      # Template Case B
│   └── case-c-risk-analysis.md   # Template Case C
├── fixtures/
│   └── buffy-context.json        # BuffyContext real de esta máquina
└── results/
    ├── case-a-ready.md           # Prompt listo para copiar
    ├── case-b-ready.md           # Prompt listo para copiar
    ├── case-c-ready.md           # Prompt listo para copiar
    └── (agent responses here)    # Respuestas del agente
```

## Nota conocida

El adapter actual detecta esta máquina como `android-termux` debido a variables de entorno Android en el PATH (`ANDROID_ROOT`, etc.). Esto es un bug pre-existente del adapter factory (Linux no tiene adapter propio aún). El experimento usa el JSON tal cual — lo que un agente vería realmente.

## Criterio de éxito

El experimento es exitoso si el agente:

1. Identifica al menos 8/11 campos correctamente (sin alucinaciones)
2. No inventa hardware/software no presente en el JSON
3. En Case C, identifica al menos 2 problemas reales basados en los datos
4. Reconoce al menos 1 limitación (null o campo no disponible)

## Next steps

Si el spike es exitoso:

1. Refinar el contrato basándose en qué campos fueron más útiles
2. Agregar campos que el agente pidió pero no estaban
3. Eliminar campos que nadie usó
4. Evaluar si `buffy context` como comando separado tiene sentido
