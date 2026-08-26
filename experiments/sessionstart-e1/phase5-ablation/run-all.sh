#!/bin/bash
# Phase 5: Run all ablation tests
# 8 variants × 5 tasks × 3 runs = 120 total

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../results/phase5"
RUNS=3

VARIANTS=("full" "-gpu" "-ram" "-disk" "-temp" "-cpu" "-os" "-tools")
TASKS=("T1" "T2" "T3" "T4" "T5")

TOTAL_VARIANTS=${#VARIANTS[@]}
TOTAL_TASKS=${#TASKS[@]}
TOTAL=$((TOTAL_VARIANTS * TOTAL_TASKS * RUNS))

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Phase 5: Ablation Study (remove one field at a time)       ║"
echo "║  $TOTAL_VARIANTS variants × $TOTAL_TASKS tasks × $RUNS runs = $TOTAL total             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Clear previous results
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

COUNT=0
SUCCESS=0
FAIL=0

for VARIANT in "${VARIANTS[@]}"; do
    for TASK in "${TASKS[@]}"; do
        for RUN in $(seq 1 $RUNS); do
            COUNT=$((COUNT + 1))
            echo "[$COUNT/$TOTAL] $TASK / $VARIANT / Run $RUN..."
            
            if bash "$SCRIPT_DIR/run-ablation-test.sh" "$VARIANT" "$TASK" "$RUN" 2>&1 | tail -3; then
                SUCCESS=$((SUCCESS + 1))
            else
                FAIL=$((FAIL + 1))
                echo "  ⚠️  Failed"
            fi
            echo ""
            
            # Brief pause
            sleep 2
        done
    done
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Complete: $SUCCESS/$TOTAL successful ($FAIL failed)                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Results: $RESULTS_DIR/"
