# BUFFY MCP INITIALIZE INSTRUCTIONS — Checkpoint (2026-09-14)

**Fecha:** 2026-09-14
**Commit base:** `10e9b98` (CodeGraph mechanism study)
**Tipo:** implementación + checkpoint

---

## 1. Observación

Buffy Next no tenía un servidor MCP. CodeGraph local (v1.5.0) demuestra un
patrón efectivo: `initialize.instructions` + una tool read-only. Se implementó
un MCP server mínimo en `buffy-next` siguiendo exactamente ese patrón.

## 2. Hipótesis / diseño adoptado

Patrón replicado de CodeGraph:

```text
harness → codegraph serve --mcp (stdio)
        → initialize: instructions + capabilities {tools:{}}
        → tools/list: una tool (codegraph_explore, read-only)
        → tools/call: verbatim source + blast radius
```

Traducido a Buffy:

```text
harness → buffy serve --mcp (stdio)
        → initialize: instructions + capabilities {tools:{}}
        → tools/list: una tool (buffy_context, read-only)
        → tools/call: buffy.context/v1 JSON (freshness-aware)
```

Diferencias con CodeGraph deliberadas:
- Buffy importa `createAdapter`/`runDoctor`/`buildContext` directamente
  (misma dirección, no subprocess) — CodeGraph también usa su propio runtime.
- `buffy_context` no tiene parámetros (devuelve el contexto completo).
- `buffy_action` NO se implementa (decisión de diseño previa).

## 3. Cambios realizados

| Archivo | Tipo | Cambio |
|---|---|---|
| `src/mcp.ts` | NUEVO | Servidor MCP stdio: initialize, tools/list, tools/call. ~120 líneas. Zero deps externos. |
| `src/cli.ts` | MODIFICADO | +16 líneas: import `startMcpServer`, case `serve`, cmdServe(), help text. |

**No se modificaron:**
- `src/core/` — ningún archivo de lógica de Buffy.
- `package.json` — sin nuevas dependencias.
- Configuraciones de agentes.
- Código de CodeGraph.
- Modelo de evidencia de acciones.
- AGENTS.md.

## 4. Evidencia mecánica

### initialize

```json
{
  "serverInfo": {"name": "buffy-next", "version": "0.2.2"},
  "capabilities": {"tools": {}},
  "instructions": "Buffy is split into two independent projects..."
}
```

Las instructions contienen el texto exacto especificado, incluyendo:
- "Buffy is split into two independent projects"
- "Call `buffy_context` before assuming..."
- "Never for: codebase exploration..."
- "Call `buffy_context` first..."

### tools/list

```json
{
  "tools": [{
    "name": "buffy_context",
    "inputSchema": {"type": "object", "properties": {}},
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  }]
}
```

Una sola tool. Annotations idénticas a CodeGraph.

### tools/call

`tools/call buffy_context` → devuelve `buffy.context/v1` JSON con:
- platform (os, kernel, arch)
- hardware (cpu, ram, gpu, storage, temperature)
- tools, privileges
- freshness por campo (`observedAt`, `ageMs`, `freshness`)

## 5. Tests

| Test | Resultado |
|---|---|
| Typecheck (`tsc --noEmit`) | OK |
| Build (`esbuild`) | OK (140.8 KB) |
| Suite completa (`vitest run`) | 621/621 PASS (37 archivos) |
| MCP initialize | JSON válido, contiene instructions, serverInfo v0.2.2 |
| MCP tools/list | Una tool: `buffy_context` con annotations correctas |
| MCP tools/call | Devuelve buffy.context/v1 JSON completo |

## 6. Limitaciones

- El MCP server solo expone `buffy_context`. `buffy_action` no está
  implementado (decisión deliberada).
- Las instructions de initialize son estáticas (texto fijo). No se adaptan
  al contexto del harness.
- No se verificó el routing con agentes reales. Este checkpoint documenta
  la implementación técnica, no demuestra causalidad del routing.
- `inputSchema` de `buffy_context` está vacío (sin parámetros). Futuras
  extensiones podrían agregar opciones (e.g., `maxFields`).
- El server no maneja `resources` ni `prompts` MCP (solo `tools`).

## 7. Conclusión

La implementación reproduce el patrón técnico observado en CodeGraph: MCP
stdio + `initialize.instructions` + superficie de herramienta pequeña. Esto
NO demuestra por sí solo que `initialize.instructions` sea la causa suficiente
del routing espontáneo de un agente.

Lo que SÍ queda demostrado:
- El MCP server de Buffy funciona (initialize, tools/list, tools/call).
- Las instructions se inyectan correctamente durante initialize.
- La tool `buffy_context` es read-only, non-destructive, idempotent.
- La implementación es mínima (2 archivos, +16 modificados, 1 nuevo, 0 deps).
- No se rompió nada (621/621 tests, typecheck OK, build OK).
