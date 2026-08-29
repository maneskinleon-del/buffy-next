# Agent Integration — Buffy Next

## Arquitectura

```
OpenCode (agente)
   ↓ MCP: buffy-tools
buffy-mcp-server.js (adapter externo)
   ↓ execFile("node", [cli.js, ...])
Buffy Next CLI (dist/cli.js)
   ↓
buildContext() / ActionGate
   ↓
buffy.context/v1 (JSON)
   ↓
modelo (vía MCP response)
```

## Componentes

| Componente | Ubicación | Propósito |
|---|---|---|
| **Buffy Next CLI** | `~/buffy-next/dist/cli.js` | Motor de contexto/acciones |
| **Contrato** | `buffy.context/v1` | Estructura JSON pública |
| **MCP Adapter** | `~/experiments/opencode-buffy-cplus/adapter/buffy-mcp-server.js` | Wrapper externo para OpenCode |
| **OpenCode config** | `~/.config/opencode/opencode.json` → `mcp.buffy-tools` | Configuración del MCP server |

## CLI pública

```bash
buffy doctor --context    # → BuffyContext JSON (schema buffy.context/v1)
buffy capabilities        # → lista de acciones disponibles
buffy act <action-id>     # → ejecuta acción vía ActionGate
buffy health --json       # → estado de salud + versión
buffy --version           # → buffy-next vX.Y.Z
```

## MCP Adapter (externo)

El adaptador MCP expone 3 tools:

- `buffy_context` → llama a `buffy doctor --context`
- `buffy_capabilities` → llama a `buffy capabilities --json`
- `buffy_action` → llama a `buffy act <actionId> [args]`

**Seguridad**: el adaptador es un wrapper delgado. No accede a internals de Buffy (ActionGate, ExecutorRegistry, etc.). Todas las acciones pasan por la CLI → ActionGate.

**Configuración en OpenCode** (`~/.config/opencode/opencode.json`):
```json
"mcp": {
  "buffy-tools": {
    "type": "local",
    "command": ["node", "/ruta/a/buffy-mcp-server.js"]
  }
}
```

**Variable de entorno**: `BUFFY_CLI=/ruta/al/dist/cli.js` (fallback: ruta absoluta del experimento).

## Qué hace y qué NO hace

| Hace | No hace |
|---|---|
| Observa el sistema (read-only) | Modifica configuración del sistema |
| Ejecuta acciones reversibles vía ActionGate | Ejecuta rm, sudo, formateo |
| Entrega contexto factual al agente | Toma decisiones por el agente |
| Reporta freshness de datos | Garantiza freshness (depende del agente usarlo) |

## C+ validado

El adaptador MCP fue validado en el experimento `opencode-buffy-cplus` con los 4 casos:
- S1 Node ✓
- S2 RAM ✓ (con fresh/stale/refresh)
- S3 Process ✓
- S4 Shell ✓
- S5 Verify ✓
- S6 Temp ✓ (con freshness)
