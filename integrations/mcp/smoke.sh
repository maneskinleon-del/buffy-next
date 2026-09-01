#!/usr/bin/env bash
# smoke.sh — CLI integration smoke test for Buffy Next MCP adapter
#
# Tests the real CLI commands that the MCP adapter consumes.
# This is NOT an MCP transport test — it validates the CLI backend.
#
# Usage: bash integrations/mcp/smoke.sh
# Exit: 0 = all pass, 1 = any failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="$REPO_ROOT/dist/cli.js"

PASS=0
FAIL=0
TOTAL=0

pass() { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  ✅ T$TOTAL: $1"; }
fail() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  ❌ T$TOTAL: $1"; echo "     $2"; }

echo "=== Buffy Next MCP Smoke Test ==="
echo "CLI: $CLI"
echo ""

# ── T1: CLI available ──────────────────────────────────────────────────────
if [ -f "$CLI" ]; then
  pass "CLI exists at $CLI"
else
  fail "CLI not found" "Expected: $CLI"
  echo ""; echo "RESULT: FAIL ($FAIL/$TOTAL)"; exit 1
fi

# ── T2: buffy doctor --context ─────────────────────────────────────────────
CONTEXT=$(node "$CLI" doctor --context 2>&1)
if echo "$CONTEXT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  SCHEMA=$(echo "$CONTEXT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('schema',''))")
  if [ "$SCHEMA" = "buffy.context/v1" ]; then
    pass "doctor --context returns valid JSON with schema buffy.context/v1"
  else
    fail "doctor --context schema mismatch" "Expected: buffy.context/v1, Got: $SCHEMA"
  fi
else
  fail "doctor --context did not return valid JSON" "$(echo "$CONTEXT" | head -3)"
fi

# ── T3: buffy capabilities --json ──────────────────────────────────────────
CAPS=$(node "$CLI" capabilities --json 2>&1)
if echo "$CAPS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
  CAPS_COUNT=$(echo "$CAPS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  pass "capabilities --json returns array ($CAPS_COUNT tools)"
else
  fail "capabilities --json did not return valid array" "$(echo "$CAPS" | head -3)"
fi

# ── T4: buffy act with invalid action ──────────────────────────────────────
INVALID_EXIT=0
node "$CLI" act invalid-action-nonexistent 2>&1 || INVALID_EXIT=$?
if [ "$INVALID_EXIT" -ne 0 ]; then
  pass "act with invalid action exits non-zero (exit: $INVALID_EXIT)"
else
  fail "act with invalid action should exit non-zero" "exit: $INVALID_EXIT"
fi

# ── T5: buffy act check-network (real safe action) ─────────────────────────
ACT_OUT=$(node "$CLI" act check-network 2>&1)
ACT_EXIT=$?
if [ "$ACT_EXIT" -eq 0 ] && echo "$ACT_OUT" | grep -qi 'red\|network\|ping\|OK'; then
  pass "act check-network executed successfully"
else
  fail "act check-network failed" "exit: $ACT_EXIT, output: $(echo "$ACT_OUT" | head -3)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
