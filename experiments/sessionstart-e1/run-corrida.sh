#!/usr/bin/env bash
# run-corrida.sh — Ejecuta UNA corrida de E1-SessionStart
# Uso: run-corrida.sh <control|buffy> <T1..T5> <run#>
#
# Reglas implementadas (DESIGN.md congelado):
#   - Sesión fresca por corrida (claude -p).
#   - Sin intervención humana (prompt = texto exacto de la tarea).
#   - Latencia medida alrededor de la sesión completa.
#   - Ground truth capturado INMEDIATAMENTE tras la respuesta.
#   - Output crudo intacto + metadatos.
#   - Modelo pinneado idéntico en ambas condiciones.

set -u

COND="${1:?uso: run-corrida.sh <control|buffy> <T1..T5> <run#>}"
TASK="${2:?falta tarea}"
RUN="${3:?falta corrida}"

E1_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$E1_DIR/results/$COND"
CLONE="$HOME/e1/$COND"
MODEL="~deepseek/deepseek-v4-flash-latest"
MAX_SECS=240

[ -d "$CLONE" ] || { echo "ERROR: no existe $CLONE" >&2; exit 1; }
PROMPT_FILE="$E1_DIR/tasks/${TASK}"-*.md
PROMPT=$(cat $PROMPT_FILE 2>/dev/null) || { echo "ERROR: tarea $TASK no encontrada" >&2; exit 1; }

mkdir -p "$RESULTS"
source "$HOME/.config/e1/e1.env"

ALLOWED="Bash(free:*) Bash(df:*) Bash(uname:*) Bash(lspci:*) Bash(sensors:*) Bash(uptime:*) Bash(ps:*)"

attempt() {
    local START END OUT RC
    START=$(date +%s%N)
    OUT=$(cd "$CLONE" && timeout "$MAX_SECS" claude -p "$PROMPT" \
            --model "$MODEL" --max-turns 12 --allowedTools $ALLOWED 2>&1)
    RC=$?
    END=$(date +%s%N)
    printf '%s' "$OUT"
    echo "$(( (END-START)/1000000 )) $RC" > /tmp/e1-last-meta
}

echo "[$COND $TASK $RUN] ejecutando..."
OUT=$(attempt)
META=$(cat /tmp/e1-last-meta); MS=${META% *}; RC=${META#* }

# Reintentos ante fallo transitorio (429/credit/empty), máx 2, espera 30s
RETRY=0
while { [ "$RC" -ne 0 ] || [ -z "$OUT" ] || printf '%s' "$OUT" | grep -q "API Error"; } && [ "$RETRY" -lt 2 ]; do
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
