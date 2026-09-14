# BUFFY AGY INJECTION — Checkpoint (2026-09-14)

**Commit base:** `c6fef9d`
**Referencia:** `docs/research/CODEGRAPH-AGY-INJECTION-2026-09-14.md`
**Mecanismo replicado:** `codegraph install --target antigravity` (v1.5.0)

---

## Observación

`src/mcp.ts` ya exponía `buffy serve --mcp` con `initialize.instructions` y la
tool `buffy_context`. Faltaba la capa de instalación/inyección para AGY: el
registro MCP y el bloque de instrucciones en la superficie de archivo que
Antigravity lee. Se implementó siguiendo el mecanismo real de CodeGraph v1.5.0.

## Implementación

| Archivo | Tipo | Cambio |
|---|---|---|
| `src/install/instructions.ts` | NUEVO | Bloque marker-fenced (`BUFFY_START/END`) corto: identidad "environment specialist" + routing `buffy_context` + fallback CLI `buffy doctor --context` |
| `src/install/antigravity.ts` | NUEVO | Instalador AGY (opciones con `geminiHome` inyectable para tests) |
| `src/cli.ts` | MODIFICADO | +21 líneas: `buffy install --target antigravity` (case, cmdInstall, help) |
| `tests/install-antigravity.test.ts` | NUEVO | 6 tests unitarios (temp dir) |
| `docs/research/CODEGRAPH-AGY-INJECTION-2026-09-14.md` | NUEVO | Investigación de referencia (publicada en este commit) |

### Formato AGY aplicado (exacto al real de CodeGraph)

```json
{
  "mcpServers": {
    "buffy": {
      "command": "buffy",
      "args": ["serve", "--mcp"]
    }
  }
}
```

- Ruta unificada `~/.gemini/config/mcp_config.json` si existe `.migrated` o el
  archivo; sino legado `~/.gemini/antigravity/mcp_config.json`.
- **Sin campo `type`** (Antigravity rechaza entradas con `type:"stdio"`).
- `command` = `buffy` (bare) en Linux, resuelto a absoluto en macOS — como
  `resolveCodegraphCommand()` de CodeGraph.
- Merge: preserva entradas existentes (`codegraph`, etc.).

### Bloque de instrucciones (corto, marker-fenced)

Escrito por upsert en `~/.gemini/GEMINI.md`. Es condicional ("If Buffy is not
installed, skip it"), menciona MCP + fallback CLI, y NO duplica las
`initialize.instructions` completas (lección #529).

## Evidencia

- **Tests:** 6/6 del instalador en directorio temporal (`mkdtemp`), sin tocar
  `~/.gemini` real.
- **Verificación CLI end-to-end** con `HOME=/tmp/...` (sin side-effects):
  produjo exactamente `{mcpServers:{buffy:{command:"buffy",args:["serve","--mcp"]}}}`
  y el bloque marker-fenced en `GEMINI.md`.
- **Suite completa:** 627/627 PASS (38 archivos, +6 nuevos).
- **Typecheck:** OK. **Build:** OK (144.9 KB).
- **`buffy_context` vía MCP:** responde `buffy.context/v1` (re-verificado tras
  el cambio).

## Limitaciones

- `buffy` no está actualmente en PATH en esta máquina. El registro genera
  `command: "buffy"` (patrón CodeGraph, bare command). Para que AGY pueda
  spawnearlo, `buffy` debe resolverse en el PATH del harness — eso es
  responsabilidad de la capa de distribución (`buffy-distribute.sh` /
  bootstrap), no de esta capa de inyección.
- Solo se implementó el target `antigravity`. OpenCode/Freebuff/otros quedan
  fuera (decisión explícita).
- El instalador escribe sobre el `~/.gemini` real solo si el usuario lo invoca
  (`buffy install --target antigravity`); los tests usan dirs temporales.
- No se realizó prueba de routing con AGY (fuera de alcance).

## Conclusión

La capa de instalación/inyección reproduce el mecanismo documentado de
CodeGraph v1.5.0 para AGY: registro MCP (formato AGY sin `type`) + bloque de
instrucciones marker-fenced corto en la superficie de archivo. Responsabilidades
separadas conservadas: server (`src/mcp.ts`, intacto), instalación
(`src/install/`), routing instrucción (`BUFFY_INSTRUCTIONS_BLOCK`).
No se implementó `buffy_action` y no se tocó AGENTS.md.