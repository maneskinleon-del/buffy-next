#!/bin/bash
# Phase 3: Run all tool policy comparison tests
# 5 tasks × 2 conditions × 3 runs = 30 total

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../results/phase3"
RUNS=3

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Phase 3: Tool Policy (Control vs Buffy+Policy)             ║"
echo "║  5 tasks × 2 conditions × $RUNS runs = 30 total             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Clear previous results
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

TOTAL=0
SUCCESS=0
FAIL=0

for TASK in T1 T2 T3 T4 T5; do
    for CONDITION in control policy; do
        for RUN in $(seq 1 $RUNS); do
            TOTAL=$((TOTAL + 1))
            echo "[$TOTAL/30] $TASK / $CONDITION / Run $RUN..."
            
            if bash "$SCRIPT_DIR/run-policy-test.sh" "$CONDITION" "$TASK" "$RUN" 2>&1 | tail -4; then
                SUCCESS=$((SUCCESS + 1))
            else
                FAIL=$((FAIL + 1))
                echo "  ⚠️  Failed"
            fi
            echo ""
            
            # Brief pause to avoid rate limiting
            sleep 2
        done
    done
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Complete: $SUCCESS/$TOTAL successful ($FAIL failed)                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Results: $RESULTS_DIR/"
ls -la "$RESULTS_DIR/" | head -5
