#!/usr/bin/env bash
# run-corrida-ollama.sh — Ejecuta UNA corrida de E1-SessionStart usando Ollama
# Uso: run-corrida-ollama.sh <control|buffy> <T1..T5> <run#>
#
# Versión adaptada para usar Ollama cloud models (gratis) en lugar de Claude/OpenRouter.
# Basado en run-corrida.sh original.

set -u

COND="${1:?uso: run-corrida-ollama.sh <control|buffy> <T1..T5> <run#>}"
TASK="${2:?falta tarea}"
RUN="${3:?falta corrida}"

E1_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$E1_DIR/results/$COND"
CLONE="$HOME/e1/$COND"
MODEL="gemma4:cloud"  # Modelo gratuito de Ollama Cloud
MAX_SECS=240

[ -d "$CLONE" ] || { echo "ERROR: no existe $CLONE" >&2; exit 1; }
PROMPT_FILE="$E1_DIR/tasks/${TASK}"-*.md
PROMPT=$(cat $PROMPT_FILE 2>/dev/null) || { echo "ERROR: tarea $TASK no encontrada" >&2; exit 1; }

mkdir -p "$RESULTS"

# No necesitamos source e1.env para Ollama (usa autenticación local)
# source "$HOME/.config/e1/e1.env"

attempt() {
    local START END OUT RC
    START=$(date +%s%N)
    
    # Usar ollama run directamente con el modelo cloud
    # El prompt se pasa como argumento
    OUT=$(cd "$CLONE" && echo "$PROMPT" | timeout "$MAX_SECS" ollama run "$MODEL" 2>&1)
    RC=$?
    
    END=$(date +%s%N)
    printf '%s' "$OUT"
    echo "$(( (END-START)/1000000 )) $RC" > /tmp/e1-last-meta
}

echo "[$COND $TASK $RUN] ejecutando con Ollama ($MODEL)..."
OUT=$(attempt)
META=$(cat /tmp/e1-last-meta); MS=${META% *}; RC=${META#* }

# Reintentos ante fallo transitorio, máx 2, espera 30s
RETRY=0
while { [ "$RC" -ne 0 ] || [ -z "$OUT" ] || printf '%s' "$OUT" | grep -qi "error\|failed\|not found"; } && [ "$RETRY" -lt 2 ]; do
    RETRY=$((RETRY+1))
    echo "  fallo transitorio (rc=$RC), reintento $RETRY en 30s..."
    sleep 30
    OUT=$(attempt)
    META=$(cat /tmp/e1-last-meta); MS=${META% *}; RC=${META#* }
done

OUT_FILE="$RESULTS/${TASK}-${RUN}-output.md"
printf '%s\n' "$OUT" > "$OUT_FILE"

cat > "$RESULTS/${TASK}-${RUN}-meta.txt" <<EOF
condition: $COND
task: $TASK
run: $RUN
model: $MODEL
rc: $RC
latency_ms: $MS
retries: $RETRY
finished_at: $(date -Is)
EOF

# Ground truth INMEDIATAMENTE tras la respuesta final
"$E1_DIR/capture-ground-truth.sh" "$COND" "$TASK" "$RUN" >/dev/null

if [ "$RC" -eq 0 ] && [ -n "$OUT" ]; then
    echo "  OK (${MS}ms, reintentos=$RETRY) → $OUT_FILE"
else
    echo "  FALLO FINAL (rc=$RC, ${MS}ms, reintentos=$RETRY) → revisar $OUT_FILE"
fi
