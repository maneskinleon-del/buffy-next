#!/bin/bash
# Phase 5: Ablation study — remove one field at a time
# Usage: ./run-ablation-test.sh <variant:full|-gpu|-ram|-disk|-temp|-cpu|-os|-tools> <task:T1|T2|T3|T4|T5> [run_number]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VARIANTS_DIR="$SCRIPT_DIR/variants"
RESULTS_DIR="$SCRIPT_DIR/../results/phase5"
VARIANT="${1:-full}"
TASK="${2:-T1}"
RUN="${3:-1}"
MODEL="gemma4:cloud"

# Validate
if [[ ! "$VARIANT" =~ ^(full|-gpu|-ram|-disk|-temp|-cpu|-os|-tools)$ ]]; then
    echo "Usage: $0 <variant> <task> [run]"
    echo "Variants: full, -gpu, -ram, -disk, -temp, -cpu, -os, -tools"
    exit 1
fi

mkdir -p "$RESULTS_DIR"

# Load variant context
CONTEXT_FILE="$VARIANTS_DIR/${VARIANT}.txt"
if [ ! -f "$CONTEXT_FILE" ]; then
    echo "❌ Variant file not found: $CONTEXT_FILE"
    exit 1
fi
CONTEXT=$(cat "$CONTEXT_FILE")

# Task prompts
declare -A TASKS
TASKS[T1]="Dime qué GPU tiene esta máquina y si su driver es uno genérico o uno específico del hardware. Justifica tu respuesta con la evidencia que tengas."
TASKS[T2]="¿Tengo suficiente RAM para compilar un proyecto grande de Node.js? Di cuánta memoria tengo disponible y qué colchón hay."
TASKS[T3]="¿Mi disco está casi lleno? Dime el porcentaje de uso y tu evaluación de riesgo."
TASKS[T4]="Describe qué sistema operativo y kernel tengo. Sé específico con la versión."
TASKS[T5]="Mi equipo está yendo lento. ¿Qué revisarías primero? Diagnóstica con los datos que tengas."

TASK_PROMPT="${TASKS[$TASK]}"

# Build prompt
PROMPT="$CONTEXT

---

$TASK_PROMPT

Answer concisely with specific data from the system facts above. If the information is not in the facts, say so."

echo "=== Phase 5 Ablation Test ==="
echo "Variant: $VARIANT"
echo "Task: $TASK"
echo "Run: $RUN"
echo "Model: $MODEL"
echo "Context size: ${#CONTEXT} bytes"
echo ""

# Run with timing
START_TIME=$(date +%s%N)
RESPONSE=$(echo "$PROMPT" | timeout 60 ollama run "$MODEL" 2>/dev/null || echo "ERROR: Model failed")
END_TIME=$(date +%s%N)
LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))

# Save results
OUTPUT_FILE="$RESULTS_DIR/${TASK}-${VARIANT}-${RUN}-output.md"
META_FILE="$RESULTS_DIR/${TASK}-${VARIANT}-${RUN}-meta.txt"

cat > "$OUTPUT_FILE" << EOF
# Phase 5: $TASK — Variant $VARIANT

## Context ($VARIANT)
$CONTEXT

## Response
$RESPONSE
EOF

cat > "$META_FILE" << EOF
variant: $VARIANT
task: $TASK
run: $RUN
model: $MODEL
context_bytes: ${#CONTEXT}
latency_ms: $LATENCY
timestamp: $(date -Iseconds)
status: $([ "$RESPONSE" = "ERROR: Model failed" ] && echo "FAIL" || echo "OK")
EOF

echo "✅ Results saved:"
echo "   Output: $OUTPUT_FILE"
echo "   Meta: $META_FILE"
echo "   Latency: ${LATENCY}ms"
