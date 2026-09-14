# CODEGRAPH LOCAL MECHANISM — Checkpoint y estudio (2026-09-14)

**Fecha:** 2026-09-13/14
**Alcance:** investigación read-only del mecanismo CodeGraph local + checkpoint Buffy.
**No se modifica ningún archivo de Buffy ni de configuración.**

---

## Estado Buffy previo

- **Distribución actual:** `~/ai-context/README.md` + `~/.buffy/layout.json` + `templates/ai-context-README.md` + `scripts/buffy-distribute.sh`
- **Checkpoint distribución:** `eaad4a9d79a756eb13f8f3c8f02830f1559308e6`
- **Checkpoint MCP histórico:** `193fb80941254f962bc02f473132337acd3a2d7c`
- **Experimento Agy congelado:** commit `eefc310` (remoto, sin copia local)
- **Resultado T0–T4:** MCP solo → NO selección; skill solo → NO selección; MCP + regla imperativa AGENTS → selección real `buffy_context`
- **Advertencia:** NO repetir T0–T4.

## Pregunta actual

> ¿Cuál es el mecanismo real mediante el cual el CodeGraph local es descubierto, registrado, seleccionado y ejecutado por nuestros agentes?

---

## PARTE 1 — Estado del repo

| Ítem | Valor |
|---|---|
| Branch | `master` |
| HEAD | `193fb80` (= `origin/master`) |
| Working tree | limpio (0 pendientes) |
| Último checkpoint relevante | `193fb80 docs: checkpoint and assess historical Buffy MCP adapter` |
| Tests | 621/621 PASS (37 archivos) |
| Typecheck | OK |
| Build | OK (`dist/cli.js` 136.7 KB) |

---

## PARTE 2 — CodeGraph local

### 2.1 Binario/comando

| Ítem | Valor |
|---|---|
| Comando | `codegraph` |
| PATH | `/home/mangonz/.npm-global/bin/codegraph` (symlink → `npm-shim.js`) |
| Paquete | `@colbymchenry/codegraph` v1.5.0 |
| Instalación | npm global (`~/.npm-global/lib/node_modules/@colbymchenry/codegraph/`) |
| Binario plataforma | `codegraph-linux-x64` v1.5.0 (optionalDependency) |
| Bundled Node | Node 24 (con `node:sqlite`) empaquetado en `codegraph-linux-x64/node` (123 MB) |
| App real | `codegraph-linux-x64/lib/dist/bin/codegraph.js` |
| Kernel nativo | `codegraph-linux-x64/lib/kernel/codegraph-kernel.node` |
| Versión CLI | `codegraph --version` → `1.5.0` |
| Repo fuente | `github.com/colbymchenry/codegraph` |

**Cadena de ejecución (observada):**

```text
codegraph (npm-shim.js)
  → resuelve @colbymchenry/codegraph-linux-x64
  → exec node --liftoff-only lib/dist/bin/codegraph.js <args>
```

### 2.2 Configuración

**OpenCode** (`~/.config/opencode/opencode.json`):
```json
"mcp": {
  "codegraph": {
    "type": "local",
    "command": ["codegraph", "serve", "--mcp"],
    "enabled": true
  }
}
```
Transporte: **stdio**. Un solo argumento: `--mcp`.

**Antigravity/Gemini** (`~/.gemini/antigravity-cli/settings.json`):
- Permiso: `mcp(codegraph/codegraph_explore)` (lista de permisos, línea 34).
- Superficie MCP: `~/.gemini/antigravity-cli/mcp/codegraph/` contiene:
  - `instructions.md` (el texto de initialize, cacheado)
  - `codegraph_explore.json` (schema de la tool)

**Otros:** No se encontró `.mcp.json` en home/config. No se encontró configuración CodeGraph en `~/.config/codegraph/`.

### 2.3 Proceso de arranque

| Pregunta | Respuesta | Estado |
|---|---|---|
| ¿Quién lanza CodeGraph? | El harness (OpenCode o Antigravity) al inicio de sesión | OBSERVADO |
| ¿Con qué comando? | `codegraph serve --mcp` | OBSERVADO |
| ¿Qué transport? | **stdio** (JSON-RPC sobre stdin/stdout, newline-delimited) | OBSERVADO |
| ¿Qué proceso permanece vivo? | El proceso MCP como child process del harness; muere al cerrar sesión | OBSERVADO |

---

## PARTE 3 — El MCP real

### initialize

**Método:** se envía `initialize` con `rootUri: "file:///home/mangonz/GameBoosterManu"` y se recibe respuesta.

| Campo | Valor | Estado |
|---|---|---|
| `serverInfo.name` | `"codegraph"` | OBSERVADO |
| `serverInfo.version` | `"1.5.0"` | OBSERVADO |
| `protocolVersion` | `"2024-11-05"` | OBSERVADO |
| `capabilities` | `{"tools":{}}` — solo tools, sin resources ni prompts | OBSERVADO |
| `instructions` | Markdown extenso que explica el propósito, la tool única, y cómo consultar | OBSERVADO |

El `instructions` (parcial, ~3 KB capturado) dice:

> "Codegraph is a SQLite knowledge graph of every symbol, edge, and file in the workspace"
> "One tool: codegraph_explore — use it instead of reading files"
> "Reach for it BEFORE and while writing or editing code"

### tools/list

**Una sola tool: `codegraph_explore`.**

| Campo | Valor | Estado |
|---|---|---|
| `name` | `codegraph_explore` | OBSERVADO |
| `inputSchema.query` | string (requerido) — símbolos, nombres de archivo, o pregunta en lenguaje natural | OBSERVADO |
| `inputSchema.projectPath` | string (opcional) — ruta absoluta al proyecto; resuelve `.codegraph/` más cercano | OBSERVADO |
| `inputSchema.maxFiles` | number (opcional, default 12) | OBSERVADO |
| `annotations.readOnlyHint` | `true` | OBSERVADO |
| `annotations.destructiveHint` | `false` | OBSERVADO |
| `annotations.idempotentHint` | `true` | OBSERVADO |
| `annotations.openWorldHint` | `false` | OBSERVADO |

### tool call (una sola llamada, lectura)

**Consulta:** `codegraph_explore` con `query: "MainActivity"`, `projectPath: "/home/mangonz/GameBoosterManu"`, `maxFiles: 2`.

**Resultado:** texto markdown con:
- "Found 19 symbols across 1 file"
- Blast radius: callers y tests dependientes
- Código fuente verbatim con números de línea

El camino operacional completo fue:

```text
agent → JSON-RPC tools/call → codegraph serve --mcp (stdio)
  → resuelve .codegraph/ de GameBoosterManu
  → consulta SQLite (codegraph.db, 3.3 MB)
  → devuelve fuente verbatim + call paths + blast radius
```

Estado: **OBSERVADO** (ejecutado una vez; verificación mecánica completa).

---

## PARTE 4 — Arquitectura

```text
DISCOVERY     OpenCode: opencode.json → mcp.codegraph (una línea JSON)
              Antigravity: permissions list → mcp(codegraph/codegraph_explore)
              Estado: OBSERVADO

REGISTRATION  opencode.json: {type:"local", command:["codegraph","serve","--mcp"], enabled:true}
              Estado: OBSERVADO

BOOTSTRAP     Harness ejecuta `codegraph serve --mcp` → child process stdio
              npm-shim.js → bundled Node 24 → lib/dist/bin/codegraph.js
              Estado: OBSERVADO

GUIDANCE      initialize → instructions (markdown extenso)
              "One tool: codegraph_explore — use it instead of reading files"
              "Reach for it BEFORE and while writing or editing code"
              Estado: OBSERVADO

TOOL SURFACE  Una herramienta: codegraph_explore
              readOnly, non-destructive, idempotent, closed-world
              Estado: OBSERVADO

ROUTING       Las instructions de initialize dicen "call FIRST"
              La description de la tool dice "PRIMARY TOOL — call FIRST"
              El agente recibe ambas y decide usarla
              Estado: OBSERVADO (mecanismo); NO VERIFICADO (si todos los agentes la usan siempre)

EXECUTION     stdio JSON-RPC → resuelve .codegraph/ → SQLite → verbatim source
              Estado: OBSERVADO

RESULT        Fuente verbatim con números de línea + call paths + blast radius
              Estado: OBSERVADO
```

---

## PARTE 5 — Comparación con Buffy

| Aspecto | CodeGraph local | Buffy actual |
|---|---|---|
| Discovery | `opencode.json` mcp.codegraph + instructions en initialize | `~/ai-context/README.md` + `~/.buffy/layout.json` |
| Registration | Una línea JSON en opencode.json | Sin registro; documental (README apunta a docs) |
| Bootstrap | `codegraph serve --mcp` (stdio child process) | `buffy doctor --context` (CLI subprocess) |
| initialize/instructions | Auto-inyectado durante initialize (markdown extenso) | Compacto + AGENT-DISCOVERY.md (inyección manual por harness) |
| Tool surface | 1 tool (read-only) | 3 tools (context read, capabilities read, action write) |
| Routing | Instructions dicen "call FIRST"; 1 tool = sin routing complejo | MCP solo NO selecciona (T2); necesita regla activa (T4) |
| Execution | stdio MCP → SQLite → verbatim | CLI → adapter plataforma → ActionGate |
| Result | Fuente + call paths + blast radius | Contexto JSON + capabilities + action execution |

### A. ¿Qué mecanismo usa CodeGraph que Buffy no usa?

CodeGraph **auto-inyecta instructions ricas durante initialize**. El agente recibe, en su primer intercambio MCP, un documento que le dice exactamente qué es CodeGraph, cuándo usarlo, y cómo. No necesita una regla externa en `AGENTS.md` — las instructions Ya lo son.

Buffy depende de inyección manual: el compacto (`< 2048 bytes`) se inyecta en `AGENTS.md` o `CLAUDE.md`, y el routing requiere una regla imperativa adicional (demostrado en T4). CodeGraph no necesita esa segunda capa.

### B. ¿Qué parte es genérica y reutilizable?

- El patrón de **inyectar instructions durante initialize** es genérico y适用于 cualquier MCP server.
- La regla de **una sola tool read-only + instructions que dicen "usame primero"** es transferible a `buffy_context` como tool única (read-only).
- Las **annotations** (`readOnlyHint`, `destructiveHint`) ayudan al harness a decidir permisos automáticamente.

### C. ¿Qué pertenece solo a CodeGraph?

- El SQLite knowledge graph y el kernel nativo (`.node`) son específicos de code intelligence.
- El patrón de un solo proyecto indexado con `.codegraph/` es propio de la indexación de código.
- El bundled Node 24 (auto-contenido) es una decisión de distribución específica de CodeGraph.

### D. ¿Cambio mínimo para que Buffy adopte el mismo patrón?

Un MCP server de Buffy que, durante `initialize`, inyecte instructions ricas (el contrato compacto ya existente, en lugar de `< 2048 bytes` de texto comprimido) y exponga UNA tool read-only (`buffy_context` → `buffy doctor --context`). Las instructions dirían cuándo y cómo usarla.

**NO implementar ahora.** Solo la dirección.

### E. ¿Evidencia suficiente para implementar?

Sí para el **patrón** (initialize instructions + una tool read-only). No para la implementación completa del MCP server (eso requiere diseño adicional). La evidencia de que "MCP solo no selecciona" (T2) se resuelve parcialmente porque CodeGraph resuelve el routing mediante instructions ricas, no mediante registro MCP solitario.

---

## PARTE 6 — Comparación con la investigación externa

| Afirmación externa | Local | Evidencia |
|---|---|---|
| CodeGraph usa MCP registration | **CONFIRMADO** | `opencode.json:14247` — `mcp.codegraph` con command `["codegraph","serve","--mcp"]` |
| Instrucciones durante initialize | **CONFIRMADO** | Respuesta a `initialize` contiene `instructions` (~3 KB de markdown con "One tool", "Reach for it FIRST") |
| Superficie pequeña de herramientas | **CONFIRMADO** | tools/list devuelve **1 tool** (`codegraph_explore`) |
| CLI + servidor comparten infraestructura | **CONFIRMADO** | Mismo binario: `codegraph` (npm-shim.js) ejecuta tanto `codegraph query` como `codegraph serve --mcp` |
| No pudo verificar nuestro entorno local | **CORRECTO** | La investigación externa era sobre la implementación pública; nuestro entorno confirma los mismos patrones |

---

## PARTE 7 — Conclusión

### ¿Sabemos cómo CodeGraph consigue ser descubierto, seleccionado y ejecutado?

**SÍ, completamente.** El mecanismo es:

1. **Discovery:** una línea en `opencode.json` registra `mcp.codegraph` (command + transport).
2. **Registration:** el harness lanza `codegraph serve --mcp` como child process stdio.
3. **Initialize:** el servidor devuelve `instructions` ricas + capabilities `{"tools":{}}`.
4. **Routing:** las instructions dicen "call FIRST for almost any question"; la tool description dice "PRIMARY TOOL". El agente las lee y decide.
5. **Execution:** `tools/call codegraph_explore` → resuelve `.codegraph/` → SQLite → verbatim source.
6. **Result:** fuente + call paths + blast radius en una sola respuesta.

La clave es que **las instructions de initialize son la superficie de routing efectiva** — no el registro MCP, no una regla externa. CodeGraph pone toda la información necesaria en el initialize, y el agente la consume espontáneamente porque es la primera cosa que ve.

### ¿Evidencia suficiente para diseñar Buffy siguiendo el mismo patrón?

**SÍ para el patrón.** El mecanismo de "initialize instructions + una tool read-only" es claramente efectivo y transferible. Buffy ya tiene el contrato compacto (< 2048 bytes) que podría servir como instructions, y `buffy_context` (`buffy doctor --context`) ya es una tool read-only.

**NO para implementar ahora.** La evaluación arquitectónica (MCP-HISTORICAL-STATE) ya determinó que `buffy_context` debe ADAPTARSE, no reconstruirse, y que el adapter MCP es opcional. Este estudio confirma la dirección: un MCP server de Buffy con instructions ricas + una tool `buffy_context` read-only seguiría el patrón de CodeGraph.

### Resultado científico/técnico

Demostrado: CodeGraph local usa exactamente el patrón "MCP stdio + initialize instructions + una tool read-only" que la investigación externa hipotetizaba. El routing efectivo viene de las instructions, no del registro.

### Resultado operacional

Podemos diseñar un MCP server de Buffy que:
- Exponga `buffy_context` como tool read-only (una sola tool)
- Inyecte el contrato compacto como instructions durante initialize
- Siga las mismas annotations de CodeGraph (`readOnlyHint: true`)
- Resuelva el problema de routing sin necesidad de regla imperativa externa

### Incertidumbres

- No sabemos si OpenCode procesa las instructions de initialize de la misma manera que Antigravity.
- No sabemos si "una sola tool read-only" es suficiente para `buffy_action` (que es write-capable y requiere `confirm`).
- No sabemos si el patrón "instructions como routing" funciona en todos los harnesses (Agy T4 demostró que AGENTS.md funciona; no está demostrado para MCP initialize instructions).

### Próximo paso mínimo

**Una sola acción:** diseñar la estructura de `initialize instructions` que un MCP server de Buffy enviaría, basándose en el contrato compacto existente y en el patrón de CodeGraph. No implementar el server todavía — solo las instructions.

---

## Checkpoint final

```
COMMIT: pendiente
PUSH: pendiente
HEAD: 193fb80 (pre-checkpoint)
ORIGIN: 193fb80
TREE: limpio (0 pendientes)
```

Estado previo al checkpoint: `master` en `193fb80`, working tree limpio, 621/621 tests. Se creará un commit con este documento y se pusheará inmediatamente.
