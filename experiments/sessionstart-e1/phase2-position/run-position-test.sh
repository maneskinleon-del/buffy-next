#!/bin/bash
# Phase 2: Position comparison (EARLY vs LATE)
# Usage: ./run-position-test.sh <position:early|late> <task:T1|T2|T3|T4|T5> [run_number]

set -euo pipefail

EXPERIMENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$EXPERIMENT_DIR/results/phase2"
POSITION="${1:-early}"
TASK="${2:-T1}"
RUN="${3:-1}"
MODEL="gemma4:cloud"

# Validate
if [[ ! "$POSITION" =~ ^(early|late)$ ]]; then
    echo "Usage: $0 <position:early|late> <task:T1-T5> [run]"
    echo "  early = Buffy context at top, late = Buffy context near query"
    exit 1
fi

mkdir -p "$RESULTS_DIR"

# Buffy context (same JSON as Phase 1)
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

# Task prompts (same as Phase 1)
declare -A TASKS
TASKS[T1]="Dime qué GPU tiene esta máquina y si su driver es uno genérico o uno específico del hardware. Justifica tu respuesta con la evidencia que tengas."
TASKS[T2]="¿Tengo suficiente RAM para compilar un proyecto grande de Node.js? Di cuánta memoria tengo disponible y qué colchón hay."
TASKS[T3]="¿Mi disco está casi lleno? Dime el porcentaje de uso y tu evaluación de riesgo."
TASKS[T4]="Describe qué sistema operativo y kernel tengo. Sé específico con la versión."
TASKS[T5]="Mi equipo está yendo lento. ¿Qué revisarías primero? Diagnóstica con los datos que tengas."

TASK_PROMPT="${TASKS[$TASK]}"

# Build prompt based on position
INSTRUCTIONS="Answer concisely with specific data from the system facts above. If the information is not in the facts, say so."

if [ "$POSITION" = "early" ]; then
    # EARLY: Buffy context → Instructions → Task query
    PROMPT="$BUFFY_CONTEXT

---

$INSTRUCTIONS

---

$TASK_PROMPT"
else
    # LATE: Instructions → Task query → Buffy context
    PROMPT="$INSTRUCTIONS

---

$TASK_PROMPT

---

Additional system context (use if needed):
$BUFFY_CONTEXT"
fi

echo "=== Phase 2 Position Test ==="
echo "Position: $POSITION"
echo "Task: $TASK"
echo "Run: $RUN"
echo "Model: $MODEL"
echo ""

# Run with timing
START_TIME=$(date +%s%N)
RESPONSE=$(echo "$PROMPT" | timeout 60 ollama run "$MODEL" 2>/dev/null || echo "ERROR: Model failed")
END_TIME=$(date +%s%N)
LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))

# Save results
OUTPUT_FILE="$RESULTS_DIR/${TASK}-${POSITION}-${RUN}-output.md"
META_FILE="$RESULTS_DIR/${TASK}-${POSITION}-${RUN}-meta.txt"

cat > "$OUTPUT_FILE" << EOF
# Phase 2: $TASK - Position $POSITION

## Prompt Structure
Position: $POSITION
$( [ "$POSITION" = "early" ] && echo "Order: Buffy Context → Instructions → Query" || echo "Order: Instructions → Query → Buffy Context" )

## Response
$RESPONSE
EOF

cat > "$META_FILE" << EOF
position: $POSITION
task: $TASK
run: $RUN
model: $MODEL
latency_ms: $LATENCY
timestamp: $(date -Iseconds)
status: $([ "$RESPONSE" = "ERROR: Model failed" ] && echo "FAIL" || echo "OK")
EOF

echo "✅ Results saved:"
echo "   Output: $OUTPUT_FILE"
echo "   Meta: $META_FILE"
echo "   Latency: ${LATENCY}ms"
