#!/bin/bash
# E2-F1 Selection: Full Experiment
# 4 conditions × 5 tasks × 3 runs = 60 corridas
# Usage: ./run-all.sh

set -euo pipefail

EXPERIMENT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$EXPERIMENT_DIR/results/full"
VARIANTS_DIR="$EXPERIMENT_DIR/variants"
TASKS_DIR="$EXPERIMENT_DIR/../../sessionstart-e1/tasks"
MODEL="gemma4:cloud"
RUNS_PER_COMBO=3

mkdir -p "$RESULTS_DIR"

echo "╔══════════════════════════════════════════╗"
echo "║  E2-F1 Selection: Full Experiment        ║"
echo "║  4 × 5 × 3 = 60 corridas                ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Generate variants
echo "Generating variants..."
cd "$EXPERIMENT_DIR" && python3 generate-variants.py
echo ""

# Load all tasks
declare -A TASK_PROMPTS
for task_file in "$TASKS_DIR"/T*.md; do
    task_id=$(basename "$task_file" | cut -d- -f1)
    TASK_PROMPTS[$task_id]=$(cat "$task_file" | head -20)
done

# Define conditions and their context source
# For task-adaptive and minimal, context varies per task
get_context_file() {
    local condition=$1
    local task=$2
    case $condition in
        full)           echo "$VARIANTS_DIR/full.json" ;;
        high-value)     echo "$VARIANTS_DIR/high-value.json" ;;
        task-adaptive)  echo "$VARIANTS_DIR/task-adaptive-${task}.json" ;;
        minimal)        echo "$VARIANTS_DIR/minimal-${task}.json" ;;
    esac
}

CONDITIONS="full high-value task-adaptive minimal"
TASKS="T1 T2 T3 T4 T5"
TOTAL=60
COUNT=0
ERRORS=0

for condition in $CONDITIONS; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Condition: $condition"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for task in $TASKS; do
        CONTEXT_FILE=$(get_context_file "$condition" "$task")
        CONTEXT=$(cat "$CONTEXT_FILE")
        CONTEXT_SIZE=${#CONTEXT}
        TASK_PROMPT="${TASK_PROMPTS[$task]}"

        for run in $(seq 1 $RUNS_PER_COMBO); do
            COUNT=$((COUNT + 1))
            printf "[%2d/%d] %-14s %s run=%d  " "$COUNT" "$TOTAL" "$condition" "$task" "$run"

            PROMPT="$CONTEXT

---

$TASK_PROMPT

Answer concisely with specific data from the system facts above. If the information is not in the facts, say so."

            START_TIME=$(date +%s%N)
            RESPONSE=$(echo "$PROMPT" | timeout 60 ollama run "$MODEL" 2>/dev/null)
            RC=$?
            END_TIME=$(date +%s%N)
            LATENCY=$(( (END_TIME - START_TIME) / 1000000 ))

            if [ $RC -ne 0 ] || [ -z "$RESPONSE" ]; then
                echo "❌ FAILED (rc=$RC)"
                RESPONSE="ERROR: Model failed or returned empty"
                ERRORS=$((ERRORS + 1))
            else
                echo "✅ ${LATENCY}ms"
            fi

            # Save
            OUTPUT_FILE="$RESULTS_DIR/${task}-${condition}-${run}-output.md"
            META_FILE="$RESULTS_DIR/${task}-${condition}-${run}-meta.json"

            echo "$RESPONSE" > "$OUTPUT_FILE"
            cat > "$META_FILE" <<METAEOF
{
  "experiment": "e2-f1-selection",
  "phase": "full",
  "condition": "$condition",
  "task": "$task",
  "run": $run,
  "model": "$MODEL",
  "context_size": $CONTEXT_SIZE,
  "latency_ms": $LATENCY,
  "timestamp": "$(date -Iseconds)"
}
METAEOF

            sleep 1
        done
    done
    echo ""
done

echo "╔══════════════════════════════════════════╗"
echo "║  E2-F1 Full Experiment Complete          ║"
echo "║  Runs: $COUNT / $TOTAL                             ║"
echo "║  Errors: $ERRORS                               ║"
echo "║  Results: $RESULTS_DIR       ║"
echo "╚══════════════════════════════════════════╝"
