#!/bin/bash
# E2-F1 Selection: Smoke Test
# 1 run per condition × T1 only — verify harness works correctly
# Usage: ./run-smoke.sh

set -euo pipefail

EXPERIMENT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$EXPERIMENT_DIR/results/smoke"
VARIANTS_DIR="$EXPERIMENT_DIR/variants"
TASKS_DIR="$EXPERIMENT_DIR/../../sessionstart-e1/tasks"
MODEL="gemma4:cloud"

mkdir -p "$RESULTS_DIR"

echo "╔══════════════════════════════════════════╗"
echo "║  E2-F1 Selection: Smoke Test             ║"
echo "║  4 conditions × T1 × 1 run = 4 runs     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Generate variants first
echo "Generating variants..."
cd "$EXPERIMENT_DIR" && python3 generate-variants.py
echo ""

# Load task
TASK_PROMPT=$(cat "$TASKS_DIR"/T1-*.md 2>/dev/null | head -20)

# Define conditions
declare -A CONDITIONS
CONDITIONS[full]="full.json"
CONDITIONS[high-value]="high-value.json"
CONDITIONS[task-adaptive]="task-adaptive-T1.json"
CONDITIONS[minimal]="minimal-T1.json"

RUN=1
TOTAL=4
PASS=0

for condition in full high-value task-adaptive minimal; do
    CONTEXT_FILE="$VARIANTS_DIR/${CONDITIONS[$condition]}"
    CONTEXT=$(cat "$CONTEXT_FILE")
    CONTEXT_SIZE=${#CONTEXT}

    echo "━━━ [$((++PASS))/$TOTAL] Condition: $condition ━━━"
    echo "  Context size: $CONTEXT_SIZE bytes"

    PROMPT="$CONTEXT

---

$TASK_PROMPT

Answer concisely with specific data from the system facts above. If the information is not in the facts, say so."

    START_TIME=$(date +%s%N)
    RESPONSE=$(echo "$PROMPT" | timeout 60 ollama run "$MODEL" 2>/dev/null || echo "ERROR: Model failed")
    END_TIME=$(date +%s%N)
    LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))

    # Save
    OUTPUT_FILE="$RESULTS_DIR/T1-${condition}-${RUN}-output.md"
    META_FILE="$RESULTS_DIR/T1-${condition}-${RUN}-meta.json"

    echo "$RESPONSE" > "$OUTPUT_FILE"
    cat > "$META_FILE" <<METAEOF
{
  "experiment": "e2-f1-selection",
  "phase": "smoke",
  "condition": "$condition",
  "task": "T1",
  "run": $RUN,
  "model": "$MODEL",
  "context_size": $CONTEXT_SIZE,
  "latency_ms": $LATENCY,
  "timestamp": "$(date -Iseconds)"
}
METAEOF

    echo "  Latency: ${LATENCY}ms"
    echo "  Output: $OUTPUT_FILE"
    echo ""

    # Brief pause between runs
    sleep 2
done

echo "╔══════════════════════════════════════════╗"
echo "║  Smoke Test Complete                     ║"
echo "║  Check results in: $RESULTS_DIR          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Verify:"
echo "  1. All 4 outputs exist"
echo "  2. Each mentions GPU info (T1 asks about GPU)"
echo "  3. high-value has NO GPU (should still answer from model knowledge or say unknown)"
echo "  4. minimal has NO GPU (same)"
echo "  5. task-adaptive HAS GPU (T1 = GPU fields)"
