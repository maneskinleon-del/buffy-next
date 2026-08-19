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

## Resultados

### Spike 1 — Linux (251e931 → 3a3fe9d)

**Plataforma:** EndeavourOS (Linux desktop) + ANDROID_HOME configurado + ADB instalado + ZTE conectado.

**Resultado:** El adapter detectó falsamente `android-termux` y mezcló datos del host Linux con el GPU del teléfono ZTE. El agente (AGY) detectó la inconsistencia.

**Corrección:** `3a3fe9d` — ANDROID_HOME y SERIAL eliminados como indicadores. Solo `ANDROID_ROOT=/system` + `ANDROID_DATA=/data` juntos. Ahora detecta `linux` correctamente.

**Regla congelada:** ADB conectado es una capacidad del host, NO evidencia de que el host sea Android.

### Spike 2 — Windows (post-3a3fe9d)

**Plataforma:** Windows 10 Enterprise LTSC, i5-3330, 11.9 GB RAM, GPU "Unknown GPU".

**Resultado:** PASS con observaciones.

| Afirmación del agente | Evaluación |
|---|---|
| i5-3330 / 4 cores | ✅ Sustentado por JSON |
| Windows 10 Enterprise LTSC | ✅ Sustentado por JSON |
| 11.9 GB RAM | ✅ Sustentado por JSON |
| C: 69% / D: 16% | ✅ Sustentado por JSON |
| Node/npm/Git/Python/PowerShell | ✅ Sustentado por JSON |
| GPU "Unknown GPU" | ✅ Sustentado por JSON |
| "No soporta AVX2" | ⚠️ Conocimiento externo, no del JSON |
| "GPU Intel HD 2500" | ⚠️ Inferencia — JSON dice "Unknown GPU" |
| "11.9 GB probablemente 8+4" | ⚠️ Especulación — JSON no dice configuración DIMM |
| "69% uso puede degradarse" | ⚠️ Inferencia razonable pero no sustentada |

**Hallazgo:** El agente distingue correctamente los datos del JSON pero añade conocimiento externo/inferencias. Esto NO es un fallo de Buffy — es un comportamiento del agente consumidor.

**Implicación:** El Context Package funciona como contrato. El problema de inferencias está en la capa de consumo, no en la de producción. No requiere cambios en Buffy.

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
