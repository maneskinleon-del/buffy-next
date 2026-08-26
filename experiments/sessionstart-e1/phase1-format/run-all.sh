#!/bin/bash
# Phase 1: Run all format comparison tests
# 5 tasks × 2 variants × 3 runs = 30 total

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../results/phase1"
RUNS=3

echo "╔══════════════════════════════════════════════════╗"
echo "║  Phase 1: Format Comparison (JSON vs Semantic)   ║"
echo "║  5 tasks × 2 variants × $RUNS runs = 30 total    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Clear previous results
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

TOTAL=0
SUCCESS=0
FAIL=0

for TASK in T1 T2 T3 T4 T5; do
    for VARIANT in a b; do
        for RUN in $(seq 1 $RUNS); do
            TOTAL=$((TOTAL + 1))
            VARIANT_NAME=$( [ "$VARIANT" = "a" ] && echo "JSON" || echo "Semantic" )
            echo "[$TOTAL/30] $TASK / $VARIANT_NAME / Run $RUN..."
            
            if bash "$SCRIPT_DIR/run-format-test.sh" "$VARIANT" "$TASK" "$RUN" 2>&1 | tail -3; then
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
