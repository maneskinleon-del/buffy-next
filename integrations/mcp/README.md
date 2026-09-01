# Buffy Next — MCP Integration

Exposes Buffy Next system diagnostics and actions via the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

## Architecture

```
MCP Client (OpenCode, Claude, Gemini, etc.)
  ↓ stdio (JSON-RPC)
buffy-mcp-server.js (thin adapter)
  ↓ execFile (secure, no shell interpolation)
buffy CLI (dist/cli.js)
  ↓
Buffy Next core (action gate, adapters, diagnostics)
```

The adapter **never** imports Buffy Next internals. It consumes only the public CLI.

## Tools

| Tool | Description | CLI Command |
|------|-------------|-------------|
| `buffy_context` | System observation data (CPU, RAM, GPU, storage, temperature, OS) with freshness metadata | `buffy doctor --context` |
| `buffy_capabilities` | Installed tools and their versions | `buffy capabilities --json` |
| `buffy_action` | Execute a system action (diagnostic, check, reversible) | `buffy act <action-id> [args]` |

## Valid Action IDs

```
check-gpu-driver, check-network, check-system-temp, check-disk-space,
list-processes, install-tool, change-power-plan, check-shizuku,
check-driver-status
```

Use `buffy_capabilities` to discover available actions at runtime.

## Usage

### With OpenCode

Add to `~/.config/opencode/opencode.json` under `"mcp"`:

```json
"buffy-tools": {
  "type": "local",
  "command": ["node", "/path/to/buffy-next/integrations/mcp/buffy-mcp-server.js"]
}
```

### With Claude Code

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "buffy-tools": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/buffy-next/integrations/mcp/buffy-mcp-server.js"]
    }
  }
}
```

### Standalone

```bash
node integrations/mcp/buffy-mcp-server.js
```

The server communicates via stdio (JSON-RPC). Press Ctrl+C to stop.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BUFFY_CLI` | Path to buffy CLI binary | `../../dist/cli.js` (relative to this file) |

## Security

- **execFile only**: Arguments are passed as an array, never shell-interpolated
- **Explicit timeouts**: context (15s), capabilities (10s), action (30s)
- **No hardcoded paths**: CLI resolved via `BUFFY_CLI` env or relative path
- **1 MB buffer**: Prevents memory exhaustion from large outputs

## Testing

```bash
# CLI integration smoke test
bash integrations/mcp/smoke.sh

# Full test suite
npm test
npm run typecheck
npm run build
```

## Known Debt

- `buffy_capabilities` exposes installed tools (from `buffy capabilities --json`), not the action catalog. The action catalog lives in `src/actions/registry.ts` but is not exposed via a CLI command. Resolving this requires adding `buffy actions --json` to the CLI.

## License

MIT
