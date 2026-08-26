#!/usr/bin/env bash
# capture-ground-truth.sh — E1-SessionStart
# Registra el estado REAL del sistema en el momento de cada corrida.
# Uso: capture-ground-truth.sh <condicion> <tarea> <corrida>
# Ej.: capture-ground-truth.sh buffy T2 run1

set -u

COND="${1:?uso: capture-ground-truth.sh <control|buffy> <T#> <run#>}"
TASK="${2:?falta tarea}"
RUN="${3:?falta corrida}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HERE/results/$COND"
OUT="$OUT_DIR/${TASK}-${RUN}-groundtruth.txt"
mkdir -p "$OUT_DIR"

{
  echo "captured_at: $(date -Is)"
  echo "condition: $COND  task: $TASK  run: $RUN"
  echo "--- uname ---";    uname -a
  echo "--- free (MB) ---"; free -m
  echo "--- df / ---";     df -h /
  echo "--- gpu ---";      lspci -k | grep -A3 'VGA\|Display' 2>/dev/null || true
  echo "--- temp ---";     sensors 2>/dev/null | grep -i 'Tdie\|Package\|edge' | head -5 || echo "sensors no disponible"
} > "$OUT"

echo "ground truth → $OUT"
