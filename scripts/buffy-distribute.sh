#!/usr/bin/env bash
# buffy-distribute.sh — Genera el punto de descubrimiento global de Buffy.
#
# Localiza repos (por defecto, sin clonar) y genera:
#   $HOME/.buffy/layout.json      manifest JSON de localizaciones verificadas
#   $HOME/ai-context/README.md    índice de descubrimiento (plantilla versionada)
#
# Fail-open: la ausencia de Buffy Context no impide que Buffy Next funcione.
# Idempotente: re-ejecutar produce el mismo estado lógico sin destruir
#              archivos que no sean los dos artefactos derivados.
# No clona, no instala, no descarga; solo localiza.
#
# Variables de entorno opcionales:
#   BUFFY_CONTEXT_HOME   Ruta explícita a Buffy Context (sobrescribe búsqueda).

set -u

# ─── Rutas del repo donde vive este script ────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/ai-context-README.md"

# ─── HOME obligatorio ─────────────────────────────────────────

if [ -z "${HOME:-}" ]; then
  printf '%s\n' 'buffy-distribute: variable HOME no definida' >&2
  exit 1
fi

LAYOUT_DIR="$HOME/.buffy"
CONTEXT_WORKSPACE="$HOME/ai-context"
LAYOUT_FILE="$LAYOUT_DIR/layout.json"
README_FILE="$CONTEXT_WORKSPACE/README.md"

# ─── Helpers ──────────────────────────────────────────────────

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

display_path() {
  local p="$1"
  case "$p" in
    "$HOME"/*) printf '~%s' "${p#"$HOME"}" ;;
    "$HOME")   printf '~' ;;
    *)         printf '%s' "$p" ;;
  esac
}

status_of() { [ -e "$1" ] && printf 'found' || printf 'missing'; }

is_repo_like() {
  [ -d "$1/.git" ] && return 0
  [ -n "$(/bin/ls -A "$1" 2>/dev/null)" ] && return 0
  return 1
}

emit_entry() {
  local name="$1" kind="$2" path="$3" status="$4"
  if [ "$status" = found ]; then
    printf '    "%s": {"kind":"%s","path":"%s","status":"found"}' \
      "$(json_escape "$name")" "$kind" "$(json_escape "$path")"
  else
    printf '    "%s": {"kind":"%s","path":null,"status":"missing"}' \
      "$(json_escape "$name")" "$kind"
  fi
}

# ─── Localizar Buffy Context ──────────────────────────────────

find_context_repo() {
  if [ -n "${BUFFY_CONTEXT_HOME:-}" ] && [ -d "$BUFFY_CONTEXT_HOME" ]; then
    printf '%s\n' "$BUFFY_CONTEXT_HOME"
    return 0
  fi

  local root
  for root in "$HOME" "$HOME/proyectos" "$HOME/experiments" "$HOME/repos"; do
    if [ -d "$root/buffy-context" ] && is_repo_like "$root/buffy-context"; then
      printf '%s\n' "$root/buffy-context"
      return 0
    fi
  done
  return 1
}

CONTEXT_REPO="$(find_context_repo || true)"
CONTEXT_STATUS=missing
if [ -n "$CONTEXT_REPO" ]; then
  CONTEXT_STATUS=found
fi

# ─── Estado de los archivos referenciados ─────────────────────

NEXT_STATUS=found

COMPACT="$NEXT_ROOT/docs/BUFFY-AGENT-CONTRACT-COMPACT.md"
COMPACT_STATUS="$(status_of "$COMPACT")"

CONTRACT="$NEXT_ROOT/docs/BUFFY-AGENT-CONTRACT.md"
CONTRACT_STATUS="$(status_of "$CONTRACT")"

DISCOVERY="$NEXT_ROOT/docs/AGENT-DISCOVERY.md"
DISCOVERY_STATUS="$(status_of "$DISCOVERY")"

SESSIONSTART="$NEXT_ROOT/scripts/buffy-bootstrap.sh"
SESSIONSTART_STATUS="$(status_of "$SESSIONSTART")"

DISTRIBUTE="$SCRIPT_DIR/buffy-distribute.sh"
DISTRIBUTE_STATUS="$(status_of "$DISTRIBUTE")"

# ─── Generar ~/.buffy/layout.json ─────────────────────────────

mkdir -p "$LAYOUT_DIR"

{
  printf '{\n'
  printf '  "version": 1,\n'
  printf '  "generatedAt": "%s",\n' "$(date -Iseconds 2>/dev/null || date +'%Y-%m-%dT%H:%M:%S%z')"
  printf '  "source": "%s",\n' "$(json_escape "buffy-next:scripts/buffy-distribute.sh")"
  printf '  "entries": {\n'
  emit_entry 'buffy-next'                           'repo'   "$NEXT_ROOT"                       "$NEXT_STATUS"
  printf ',\n'
  emit_entry 'buffy-context'                        'repo'   "${CONTEXT_REPO:-}"                "$CONTEXT_STATUS"
  printf ',\n'
  emit_entry 'BUFFY-AGENT-CONTRACT-COMPACT.md'     'doc'    "$COMPACT"                         "$COMPACT_STATUS"
  printf ',\n'
  emit_entry 'BUFFY-AGENT-CONTRACT.md'             'doc'    "$CONTRACT"                        "$CONTRACT_STATUS"
  printf ',\n'
  emit_entry 'AGENT-DISCOVERY.md'                  'doc'    "$DISCOVERY"                       "$DISCOVERY_STATUS"
  printf ',\n'
  emit_entry 'scripts/buffy-bootstrap.sh'          'script' "$SESSIONSTART"                    "$SESSIONSTART_STATUS"
  printf ',\n'
  emit_entry 'scripts/buffy-distribute.sh'         'script' "$DISTRIBUTE"                     "$DISTRIBUTE_STATUS"
  printf '\n  },\n'
  printf '  "artifacts": {\n'
  printf '    "layout": "~/.buffy/layout.json",\n'
  printf '    "readme": "~/ai-context/README.md"\n'
  printf '  }\n'
  printf '}\n'
} > "$LAYOUT_FILE.tmp" && mv "$LAYOUT_FILE.tmp" "$LAYOUT_FILE"

# ─── Generar ~/ai-context/README.md desde la plantilla ────────

if [ ! -f "$TEMPLATE" ]; then
  printf 'buffy-distribute: plantilla no encontrada: %s\n' "$TEMPLATE" >&2
  exit 1
fi

T_NEXT="$(display_path "$NEXT_ROOT")"

if [ "$CONTEXT_STATUS" = found ]; then
  T_CONTEXT="$(display_path "$CONTEXT_REPO")"
else
  T_CONTEXT="NO DISPONIBLE (repositorio no localizado)"
fi

if [ "$COMPACT_STATUS" = found ]; then
  T_COMPACT="$(display_path "$COMPACT")"
else
  T_COMPACT="NO DISPONIBLE (no verificado en este entorno)"
fi

if [ "$CONTRACT_STATUS" = found ]; then
  T_CONTRACT="$(display_path "$CONTRACT")"
else
  T_CONTRACT="NO DISPONIBLE (no verificado en este entorno)"
fi

if [ "$DISCOVERY_STATUS" = found ]; then
  T_DISCOVERY="$(display_path "$DISCOVERY")"
else
  T_DISCOVERY="NO DISPONIBLE (no verificado en este entorno)"
fi

if [ "$SESSIONSTART_STATUS" = found ]; then
  T_SESSIONSTART="$(display_path "$SESSIONSTART")"
else
  T_SESSIONSTART="NO DISPONIBLE (no verificado en este entorno)"
fi

if [ "$DISTRIBUTE_STATUS" = found ]; then
  T_DISTRIBUTE="$(display_path "$DISTRIBUTE")"
else
  T_DISTRIBUTE="NO DISPONIBLE (no verificado en este entorno)"
fi

if [ "$CONTEXT_STATUS" = found ]; then
  T_CONTEXT_RULE="7. Buffy Context está disponible en ${T_CONTEXT}; es opcional y Buffy Next no depende de él."
else
  T_CONTEXT_RULE="7. Buffy Context no está disponible en este entorno; no asumir su ruta ni su existencia."
fi

export T_NEXT T_CONTEXT T_COMPACT T_CONTRACT T_DISCOVERY T_DISTRIBUTE T_SESSIONSTART T_CONTEXT_RULE

mkdir -p "$CONTEXT_WORKSPACE"

awk '{
  gsub(/__NEXT__/,        ENVIRON["T_NEXT"]);
  gsub(/__CONTEXT__/,     ENVIRON["T_CONTEXT"]);
  gsub(/__COMPACT__/,     ENVIRON["T_COMPACT"]);
  gsub(/__CONTRACT__/,    ENVIRON["T_CONTRACT"]);
  gsub(/__DISCOVERY__/,   ENVIRON["T_DISCOVERY"]);
  gsub(/__DISTRIBUTE__/,  ENVIRON["T_DISTRIBUTE"]);
  gsub(/__SESSIONSTART__/,ENVIRON["T_SESSIONSTART"]);
  gsub(/__CONTEXT_RULE__/,ENVIRON["T_CONTEXT_RULE"]);
  print
}' "$TEMPLATE" > "$README_FILE.tmp" && mv "$README_FILE.tmp" "$README_FILE"

# ─── Verificar referencias generadas ──────────────────────────

verify_readme() {
  local readme_file="$1" missing=0 ref abs
  while read -r ref; do
    [ -z "$ref" ] && continue
    case "$ref" in
      ~*)        abs="${HOME}${ref#\~}" ;;
      /*/*)      abs="$ref" ;;
      *)         continue ;;
    esac
    if [ ! -e "$abs" ]; then
      printf 'buffy-distribute: referencia sin verificar: %s -> %s\n' "$ref" "$abs" >&2
      missing=1
    fi
  done < <(grep -oE '~[A-Za-z0-9_.~/'"'"'-]+|/[A-Za-z0-9_.~/'"'"'-]+' "$readme_file" | sed 's/[.,:;)]$//' | sort -u)
  return "$missing"
}

if verify_readme "$README_FILE"; then
  printf 'buffy-distribute: manifest -> %s\n' "$(display_path "$LAYOUT_FILE")"
  printf 'buffy-distribute: readme   -> %s\n' "$(display_path "$README_FILE")"
else
  printf 'buffy-distribute: existen referencias no verificadas\n' >&2
  exit 1
fi
