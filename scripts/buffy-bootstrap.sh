#!/usr/bin/env bash
# buffy-bootstrap.sh — Adaptador SessionStart (Claude Code → Buffy), portable
#
# Cadena (todo relativo al repo — viaja con `git clone`):
#   <repo>/.claude/settings.json (SessionStart)
#     → <repo>/scripts/buffy-bootstrap.sh   (este script: wrapper observable, fail-open)
#       → node <repo>/dist/cli.js doctor --context
#         → stdout JSON (buffy.context/v1) → contexto de la sesión
#
# Contrato:
#   - NUNCA bloquea ni rompe el arranque de sesión (siempre exit 0).
#   - Todo diagnóstico propio va al LOG, nunca a stdout (stdout = solo contexto).
#   - Timeout 3s: SessionStart ocurre al iniciar/reanudar/compactar; no puede esperar más.
#   - Sin rutas absolutas: el CLI se resuelve relativo a la ubicación de este script.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUFFY_CLI="$REPO_ROOT/dist/cli.js"
LOG_DIR="$HOME/.buffy"
LOG="$LOG_DIR/sessionstart.log"
TIMEOUT_SECS=3

mkdir -p "$LOG_DIR"

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"; }

# CLI no compilado (clone fresco sin `npm install && npm run build`) → fail-open silencioso
if [ ! -f "$BUFFY_CLI" ]; then
    log "SKIP cli no encontrado: $BUFFY_CLI (¿falta npm run build?)"
    exit 0
fi

OUT="$(timeout "$TIMEOUT_SECS" node "$BUFFY_CLI" doctor --context 2>>"$LOG")"
RC=$?

if [ "$RC" -eq 0 ] && [ -n "$OUT" ]; then
    # Log rotado por tamaño (~1MB) para no crecer indefinidamente
    if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1000000 ]; then
        mv "$LOG" "$LOG.1"
    fi
    log "OK bytes=${#OUT} repo=$REPO_ROOT"
    printf '%s\n' "$OUT"
else
    log "FAIL rc=$RC bytes=${#OUT} repo=$REPO_ROOT"
fi

exit 0
