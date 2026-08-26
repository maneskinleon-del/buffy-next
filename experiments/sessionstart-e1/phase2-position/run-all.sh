#!/bin/bash
# Phase 2: Run all position comparison tests
# 5 tasks × 2 positions × 3 runs = 30 total

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../results/phase2"
RUNS=3

echo "╔══════════════════════════════════════════════════╗"
echo "║  Phase 2: Position Comparison (Early vs Late)    ║"
echo "║  5 tasks × 2 positions × $RUNS runs = 30 total   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Clear previous results
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

TOTAL=0
SUCCESS=0
FAIL=0

for TASK in T1 T2 T3 T4 T5; do
    for POSITION in early late; do
        for RUN in $(seq 1 $RUNS); do
            TOTAL=$((TOTAL + 1))
            echo "[$TOTAL/30] $TASK / $POSITION / Run $RUN..."
            
            if bash "$SCRIPT_DIR/run-position-test.sh" "$POSITION" "$TASK" "$RUN" 2>&1 | tail -3; then
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
echo "╔══════════════════════════════════════════════════╗"
echo "║  Complete: $SUCCESS/$TOTAL successful ($FAIL failed)         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Results: $RESULTS_DIR/"
ls -la "$RESULTS_DIR/" | head -5
