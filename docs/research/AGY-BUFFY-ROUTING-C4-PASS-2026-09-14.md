# AGY–BUFFY ROUTING C4 — PASS (2026-09-14)

**Commit base:** `9e19bb8`
**Tipo:** prueba de routing viva tras la implementación del surface-cache pre-escrito.

---

## Setup

| Campo | Valor |
|---|---|
| HOME | `/tmp/buffy-clean-HOME-QUYy` (copia limpia de `~/.gemini/`, sin surface de buffy) |
| Instalador | `buffy install --target antigravity` (commit `a54d0bd` + fix `9e19bb8`) |
| Workspace | `~/proyectos/independent-routing-test` (sin referencias a Buffy) |
| Prompt | `Analiza brevemente el entorno actual de esta máquina…` |
| Flags | `-p --output-format stream-json --add-dir …` (sin `--dangerously-skip-permissions`) |
| Permission mode | `request-review` (normal, no auto-approve) |

---

## Cadena mecánica verificada

```
buffy install --target antigravity
  ├─ config/mcp_config.json        → buffy registrado como MCP server
  ├─ GEMINI.md                     → bloque BUFFY_START/END (routing instructions)
  └─ antigravity-cli/mcp/buffy/    → surface cache pre-escrito
        ├─ buffy_context.json      (358B, byte-identico al real)
        └─ instructions.md         (958B, byte-identico al real)

AGY session start
  ├─ lee config/mcp_config.json    → ve buffy como MCP server
  ├─ conecta buffy serve --mcp     → descubre tools (surface ya existía)
  └─ construye <mcp_servers>       → incluye "# buffy\nLazy:\nbuffy_context"

Modelo planifica
  └─ decide call_mcp_tool → ServerName: "buffy", ToolName: "buffy_context"

Policy Engine
  └─ permission check: mcp(buffy/buffy_context) → DENIED (sin allow entry, modo -p auto-denies)
```

---

## Evidencia NDJSON (verbatim)

```json
{"event":"step_update","step_update":{"step_index":2,"state":"DONE","step_type":"agent_response","duration_seconds":11.46,"usage":{"input_tokens":19161,"output_tokens":547,"thinking_tokens":494}}}
{"event":"step_update","step_update":{"step_index":3,"state":"ACTIVE","step_type":"tool","tool_name":"call_mcp_tool","tool_info":{"name":"call_mcp_tool","parameters":{"ServerName":"buffy","ToolName":"buffy_context"}}}}
{"event":"step_update","step_update":{"step_index":3,"state":"ERROR","step_type":"tool","tool_name":"call_mcp_tool","tool_info":{"error":{"type":"TOOL_ERROR","message":"permission check failed for mcp \"buffy/buffy_context\": user denied permission for mcp(buffy/buffy_context)"}}}}
```

---

## Matriz C1–C4

| Test | Workspace | Surface cache | `<mcp_servers>` | Selección | Exec | Veredicto |
|---|---|---|---|---|---|---|
| C1 | checkout `buffy-next` | preexistente (sesiones previas) | buffy listado | `call_mcp_tool → buffy` | PASS (always-proceed) | PASS |
| C2 | vacío `/tmp/…/buffy-routing-test` | NO existía al contexto-build | solo codegraph | — | FAIL routing | FAIL |
| C3 | poblado `/tmp/buffy-routing-unrelated` | preexistente | buffy listado | `call_mcp_tool → buffy` | PASS (always-proceed) | PASS |
| **C4** | `independent-routing-test` + HOME limpio | **pre-escrito por installer** | **buffy listado** | **`call_mcp_tool → buffy`** | **denied (request-review, esperado)** | **PASS exposición + routing** |

---

## Conclusión

La cadena completa funciona desde una instalación limpia:

1. **Exposición** ✓ — buffy aparece en `<mcp_servers>` gracias al surface cache pre-escrito por `buffy install`.
2. **Selección** ✓ — el modelo elige `buffy_context` como primera tool (routing por instrucciones).
3. **Autorización** ✓ — Policy Engine pide permiso (sin entry `mcp(buffy/buffy_context)` en allow). En sesión interactiva, el usuario aprueba. En `-p`, auto-denied (comportamiento esperado).

No se declaró resuelto por la existencia de archivos; se verificó la cadena mecánica completa con evidencia NDJSON.

---

**Estado:** PASS funcional. No se hizo push.
