#!/bin/bash
# Phase 3: Tool policy comparison (Control vs Buffy+Policy)
# Usage: ./run-policy-test.sh <condition:control|policy> <task:T1|T2|T3|T4|T5> [run_number]

set -euo pipefail

EXPERIMENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$EXPERIMENT_DIR/results/phase3"
CONDITION="${1:-control}"
TASK="${2:-T1}"
RUN="${3:-1}"
MODEL="gemma4:cloud"

# Validate
if [[ ! "$CONDITION" =~ ^(control|policy)$ ]]; then
    echo "Usage: $0 <condition:control|policy> <task:T1-T5> [run]"
    echo "  control = no Buffy policy, policy = prefer Buffy facts first"
    exit 1
fi

mkdir -p "$RESULTS_DIR"

# Buffy context (JSON format, EARLY position)
BUFFY_CONTEXT='System context provided by Buffy (observed now):

```json
{
  "schema": "buffy.context/v1",
  "platform": {
    "os": "linux",
    "os_name": "EndeavourOS",
    "kernel": "6.18.45-2-lts",
    "architecture": "x86_64"
  },
  "hardware": {
    "cpu": "AMD Ryzen 5 3400G with Radeon Vega Graphics",
    "cpu_cores": 8,
    "ram_gb": 13.6,
    "ram_available_gb": 7.0,
    "gpu": "AMD/ATI Picasso/Raven 2 [Radeon Vega Series]",
    "gpu_driver": "amdgpu",
    "storage": [{"mount": "/", "total_gb": 217, "free_gb": 88.3, "used_percent": 58}],
    "temperature_c": 43
  },
  "environment": {
    "shell": "zsh",
    "node_version": "v26.7.0"
  },
  "tools": [
    {"name": "Node.js", "available": true, "version": "v26.7.0"},
    {"name": "npm", "available": true, "version": "12.0.2"},
    {"name": "git", "available": true, "version": "2.55.0"},
    {"name": "Python", "available": true, "version": "3.14.7"},
    {"name": "Docker", "available": true, "version": "29.7.2"},
    {"name": "ADB", "available": true, "version": "37.0.0"}
  ],
  "privileges": {"shell": true, "adb": true, "root": false}
}
```'

# Task prompts
declare -A TASKS
TASKS[T1]="Dime qué GPU tiene esta máquina y si su driver es uno genérico o uno específico del hardware. Justifica tu respuesta con la evidencia que tengas."
TASKS[T2]="¿Tengo suficiente RAM para compilar un proyecto grande de Node.js? Di cuánta memoria tengo disponible y qué colchón hay."
TASKS[T3]="¿Mi disco está casi lleno? Dime el porcentaje de uso y tu evaluación de riesgo."
TASKS[T4]="Describe qué sistema operativo y kernel tengo. Sé específico con la versión."
TASKS[T5]="Mi equipo está yendo lento. ¿Qué revisarías primero? Diagnóstica con los datos que tengas."

TASK_PROMPT="${TASKS[$TASK]}"

# Build prompt based on condition
if [ "$CONDITION" = "control" ]; then
    # CONTROL: Buffy context provided, but no policy instructions
    PROMPT="$BUFFY_CONTEXT

---

$TASK_PROMPT

Answer concisely with specific data. If you need to run a command to verify, you may do so."
else
    # POLICY: Buffy context + explicit policy to prefer facts first
    PROMPT="$BUFFY_CONTEXT

---

IMPORTANT POLICY: Use the observed system facts provided by Buffy above as your primary source. These facts were collected recently and are reliable.

- FIRST: Check if Buffy already has the answer you need
- ONLY use a tool/command if:
  1. The data is missing from Buffy
  2. The data may have changed (dynamic values like temperature, processes)
  3. The task explicitly requires direct observation
- Do NOT re-fetch data that Buffy already provides correctly

$TASK_PROMPT

Answer concisely using Buffy's facts. Only mention needing a command if the fact is truly missing or needs verification."
fi

echo "=== Phase 3 Policy Test ==="
echo "Condition: $CONDITION"
echo "Task: $TASK"
echo "Run: $RUN"
echo "Model: $MODEL"
echo ""

# Run with timing
START_TIME=$(date +%s%N)
RESPONSE=$(echo "$PROMPT" | timeout 60 ollama run "$MODEL" 2>/dev/null || echo "ERROR: Model failed")
END_TIME=$(date +%s%N)
LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))

# Analyze response for tool usage indicators
TOOL_MENTIONS=$(echo "$RESPONSE" | grep -ci "lspci\|sensors\|free\|df\|uname\|run.*command\|ejecut.*comando\|necesito.*verificar\|necesito.*ejecutar\|shell\|terminal" || true)
BUFFY_REFERENCES=$(echo "$RESPONSE" | grep -ci "buffy\|contexto\|observado\|proporcionado\|sistema.*fact\|hechos" || true)

# Save results
OUTPUT_FILE="$RESULTS_DIR/${TASK}-${CONDITION}-${RUN}-output.md"
META_FILE="$RESULTS_DIR/${TASK}-${CONDITION}-${RUN}-meta.txt"

cat > "$OUTPUT_FILE" << EOF
# Phase 3: $TASK - Condition $CONDITION

## Condition
$([ "$CONDITION" = "control" ] && echo "Control: No policy instructions" || echo "Policy: Prefer Buffy facts first")

## Response
$RESPONSE
EOF

cat > "$META_FILE" << EOF
condition: $CONDITION
task: $TASK
run: $RUN
model: $MODEL
latency_ms: $LATENCY
tool_mentions: $TOOL_MENTIONS
buffy_references: $BUFFY_REFERENCES
timestamp: $(date -Iseconds)
status: $([ "$RESPONSE" = "ERROR: Model failed" ] && echo "FAIL" || echo "OK")
EOF

echo "✅ Results saved:"
echo "   Output: $OUTPUT_FILE"
echo "   Meta: $META_FILE"
echo "   Latency: ${LATENCY}ms"
echo "   Tool mentions: $TOOL_MENTIONS"
echo "   Buffy references: $BUFFY_REFERENCES"
