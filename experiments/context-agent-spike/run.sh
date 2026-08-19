#!/usr/bin/env bash
# Buffy Next — Context Agent Spike
# Generates BuffyContext and prepares experiment prompts
#
# Usage:
#   ./run.sh              # Generate context + prepare prompts
#   ./run.sh --context    # Only generate context JSON
#   ./run.sh --prepare    # Only prepare prompts (requires existing fixture)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUFFY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES="$SCRIPT_DIR/fixtures"
PROMPTS="$SCRIPT_DIR/prompts"
RESULTS="$SCRIPT_DIR/results"

# ─── Generate context ───────────────────────────────────────

generate_context() {
  echo "🔍 Generating BuffyContext..."
  cd "$BUFFY_ROOT"

  npx tsx src/cli.ts doctor --context 2>/dev/null > "$FIXTURES/buffy-context.json"

  if [ ! -s "$FIXTURES/buffy-context.json" ]; then
    echo "❌ Failed to generate context"
    exit 1
  fi

  echo "✅ Context saved to fixtures/buffy-context.json"

  python3 -c "
import json
with open('$FIXTURES/buffy-context.json') as f:
    d = json.load(f)
print(f\"  Schema: {d['schema']}\")
print(f\"  Platform: {d['platform']['os']} ({d['platform']['os_name']})\")
print(f\"  CPU: {d['hardware']['cpu']} ({d['hardware']['cpu_cores']} cores)\")
print(f\"  RAM: {d['hardware']['ram_gb']} GB\")
print(f\"  GPU: {d['hardware']['gpu']}\")
print(f\"  Tools: {len([t for t in d['tools'] if t['available']])} available / {len(d['tools'])} total\")
print(f\"  Privileges: shell={d['privileges']['shell']}, adb={d['privileges']['adb']}\")
"
}

# ─── Prepare prompts ────────────────────────────────────────

prepare_prompts() {
  echo ""
  echo "📝 Preparing experiment prompts..."

  python3 -c "
import json, shutil, os

fixtures = '$FIXTURES'
prompts = '$PROMPTS'
results = '$RESULTS'

os.makedirs(results, exist_ok=True)

with open(os.path.join(fixtures, 'buffy-context.json')) as f:
    context = f.read().strip()

# Case A
with open(os.path.join(prompts, 'case-a-full-context.md')) as f:
    template = f.read()
with open(os.path.join(results, 'case-a-ready.md'), 'w') as f:
    f.write(template.replace('PLACEHOLDER_CONTEXT', context))
print('  ✅ Case A → results/case-a-ready.md')

# Case B (no context)
shutil.copy(os.path.join(prompts, 'case-b-no-context.md'), os.path.join(results, 'case-b-ready.md'))
print('  ✅ Case B → results/case-b-ready.md')

# Case C
with open(os.path.join(prompts, 'case-c-risk-analysis.md')) as f:
    template = f.read()
with open(os.path.join(results, 'case-c-ready.md'), 'w') as f:
    f.write(template.replace('PLACEHOLDER_CONTEXT', context))
print('  ✅ Case C → results/case-c-ready.md')
"

  echo ""
  echo "📋 Ready. Copy the content of results/case-{a,b,c}-ready.md"
  echo "   into your AI agent and record the responses in results/"
}

# ─── Main ───────────────────────────────────────────────────

case "${1:-all}" in
  --context)
    generate_context
    ;;
  --prepare)
    prepare_prompts
    ;;
  all|*)
    generate_context
    prepare_prompts
    ;;
esac

echo ""
echo "Done. See README.md for evaluation criteria."
