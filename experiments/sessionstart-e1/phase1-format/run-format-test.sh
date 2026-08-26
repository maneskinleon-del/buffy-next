#!/bin/bash
# Phase 1: Format comparison (JSON vs Semantic)
# Usage: ./run-format-test.sh <variant:a|b> <task:T1|T2|T3|T4|T5> [run_number]

set -euo pipefail

EXPERIMENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$EXPERIMENT_DIR/results/phase1"
VARIANT="${1:-a}"
TASK="${2:-T1}"
RUN="${3:-1}"
MODEL="gemma4:cloud"

# Validate
if [[ ! "$VARIANT" =~ ^[ab]$ ]]; then
    echo "Usage: $0 <variant:a|b> <task:T1-T5> [run]"
    echo "  a = JSON format, b = Semantic text format"
    exit 1
fi

mkdir -p "$RESULTS_DIR"

# Load variant context
if [ "$VARIANT" = "a" ]; then
    CONTEXT_FILE="$EXPERIMENT_DIR/phase1-format/variant-a-json.txt"
else
    CONTEXT_FILE="$EXPERIMENT_DIR/phase1-format/variant-b-semantic.txt"
fi

CONTEXT=$(cat "$CONTEXT_FILE")

# Load task prompt
TASK_FILE="$EXPERIMENT_DIR/tasks/${TASK}-*.md"
TASK_PROMPT=$(cat $TASK_FILE 2>/dev/null | head -20)

# Build full prompt
PROMPT="$CONTEXT

---

$TASK_PROMPT

Answer concisely with specific data from the system facts above. If the information is not in the facts, say so."

echo "=== Phase 1 Format Test ==="
echo "Variant: $VARIANT ($( [ "$VARIANT" = "a" ] && echo "JSON" || echo "Semantic" ))"
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
# Phase 1: $TASK - Variant $VARIANT ($( [ "$VARIANT" = "a" ] && echo "JSON" || echo "Semantic" ))

## Context ($VARIANT)
$CONTEXT

## Prompt
$TASK_PROMPT

## Response
$RESPONSE
EOF

cat > "$META_FILE" << EOF
variant: $VARIANT
variant_name: $( [ "$VARIANT" = "a" ] && echo "json" || echo "semantic" )
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
