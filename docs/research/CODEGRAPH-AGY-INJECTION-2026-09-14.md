# CODEGRAPH INSTALACIÓN/INTEGRACIÓN EN ANTIGRAVITY (AGY) — 2026-09-14

**Alcance:** determinar exactamente qué artefactos inyecta la instalación de
CodeGraph v1.5.0 para que AGY lo descubra y consuma.
**Método:** inspección mecánica del instalador embebido (bundled), de los
artefactos en disco, y reconstrucción del estado previo por timestamps.
**No se modificó nada.**

---

## Observación

CodeGraph v1.5.0 tiene un instalador multi-target (`codegraph install`) con un
target dedicado `antigravity`. En este entorno, AGY consume CodeGraph mediante
**cuatro artefactos compon e instalador escribe (2) + dos que AGY genera en
runtime (2)**, más un gate de permisos escrito por AGY/runtime.

Lo que el instalador NO hace es notable: **no escribe skills, no escribe
AGENTS.md, no toca `settings.json` de antigravity-cli, no escribe la cache
MCP**.

## Hipótesis

El mecanismo de integración completo es una cadena de tres capas:

1. **Registro MCP** (escrito por instalador) → el harness sabe que el server existe.
2. **Instrucciones de archivo** (escrito por instalador en GEMINI.md) → la
   superficie de routing para subagents y harnesses no-MCP (que nunca ven
   `initialize.instructions`).
3. **Superficie MCP runtime** (server → cliente) → `initialize.instructions` +
   `tools/list`, cacheados por AGY en su propio directorio.
4. **Permiso de invocación** (runtime/AGY) → allow-list en settings.json.

De las cuatro, las dos DEL INSTALADOR son registro + instrucciones de archivo;
pero **ninguna de ellas garantiza selección espontánea** — solo hacen que el
recurso esté disponible y que las reglas de uso existan en los dos niveles.

## Mecanismo encontrado

```text
codegraph install --target antigravity
  ├─~/.gemini/config/mcp_config.json          → mcpServers.codegraph
  │    { command: "codegraph", args: ["serve","--mcp"] }   (SIN type:stdio)
  └─ (legacy cleanup: solo si existía la ruta vieja)

codegraph install --target gemini (mismo install — GEMINI.md es compartida)
  ├─~/.gemini/settings.json                   → mcpServers.codegraph (type: stdio)
  └─~/.gemini/GEMINI.md                       → bloque marcado <!-- CODEGRAPH_START/END -->

AGY en runtime (al conectar el MCP server)
  ├─~/.gemini/antigravity-cli/mcp/codegraph/instructions.md        ← initialize.instructions
  ├─~/.gemini/antigravity-cli/mcp/codegraph/codegraph_explore.json ← tools/list
  └─~/.gemini/antigravity-cli/settings.json:34 → permissions.allow += "mcp(codegraph/codegraph_explore)"
```

### Artefactos exactos

| Artefacto | Ruta | Quién lo escribe | Contenido |
|---|---|---|---|
| MCP server (binario) | `~/.npm-global/bin/codegraph` → `@colbymchenry/codegraph` v1.5.0 (npm), bundle `codegraph-linux-x64` | npm install | app + Node 24 bundled |
| Registro MCP AGY | `~/.gemini/config/mcp_config.json` | `codegraph install --target antigravity` | `mcpServers.codegraph = {command:"codegraph", args:["serve","--mcp"]}` (sin `type`) |
| Registro MCP Gemini CLI | `~/.gemini/settings.json` | `codegraph install --target gemini` | `mcpServers.codegraph = {type:"stdio", command:"codegraph", args:[...]}` |
| Instrucciones de archivo | `~/.gemini/GEMINI.md` | `codegraph install --target gemini` | Bloque `<!-- CODEGRAPH_START --> … <!-- CODEGRAPH_END -->` |
| Instrucciones de archivo (Claude) | `~/.claude/CLAUDE.md` (línea 1) | `codegraph install --target claude` | Mismo bloque, al inicio de archivo |
| Cache superficie MCP | `~/.gemini/antigravity-cli/mcp/codegraph/{instructions.md, codegraph_explore.json}` | AGY runtime | initialize.instructions + tools/list del server |
| Cache superficie MCP (IDE legacy) | `~/.gemini/antigravity/mcp/codegraph/` | IDE runtime | idem |
| Permiso de invocación | `~/.gemini/antigravity-cli/settings.json` → `permissions.allow` | AGY runtime (tras aprobar) | `"mcp(codegraph/codegraph_explore)"` |

### Bloque de instrucciones que escribe el instalador (`instructions-template.js`)

```markdown
<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
```

Notas de diseño documentadas en el source del instalador (comentarios):

- El bloque de archivo es **corto a propósito** (#529): no duplica las
  `initialize.instructions` del server, que son la fuente única para el agente
  principal.
- Se re-introdujo (#704) porque las `initialize.instructions` **no llegan a
  dos audiencias**: (a) task-tool subagents — reciben el archivo de
  instrucciones del proyecto pero NO las MCP initialize; (b) harnesses sin
  cliente MCP — usan el CLI `codegraph explore`.
- Medición registrada: sin este bloque, los subagents usaron codegraph en ~1/9
  ejecuciones; con él, consistentemente (incluidos runs con cero fallback
  Read/grep).
- El wording es CONDICIONAL ("In repositories indexed by…") porque el install
  global aplica a proyectos sin indexar — una afirmación incondicional
  produciría llamadas fallidas (ruido).

## Evidencia

### Estado A (antes de instalar CodeGraph) — reconstruido

Base: los artefactos del instalador comparten timestamps agrupados en
**2026-08-06 20:47–20:53** (npm pkg 20:47; `mcp_config.json`, `GEMINI.md`,
`settings.json`, `CLAUDE.md`, `~/.codegraph/` 20:52–53). Antes de esa fecha:

| Artefacto | Estado previo (inferido) |
|---|---|
| `~/.npm-global/bin/codegraph` | NO existía |
| `~/.gemini/config/mcp_config.json` | NO existía (creado 2026-08-06 20:52) |
| `~/.gemini/GEMINI.md` | NO existía (creado 2026-08-06 20:52) |
| `mcp(codegraph/codegraph_explore)` en antigravity-cli/settings.json | NO existía |
| `~/.gemini/antigravity-cli/mcp/codegraph/` | NO existía |
| `~/.codegraph/` | NO existía (creado 2026-08-06 20:53) |

**Estado: INFERIDO por timestamps** (no se encontró un snapshot literal previo;
el `.bak` de mcp_config.json (2026-08-29) ya contiene codegraph).

### Estado B (después) — OBSERVADO

Todos los artefactos existen y son los descritos arriba. Timestamps clave:

- `codegraph` v1.5.0 en ~/.npm-global (2026-08-06 20:47)
- `mcp_config.json` (2026-08-06 20:52, modificado 2026-08-29 17:59 — cuando se añadió `buffy-tools`)
- `GEMINI.md` (2026-08-06 20:52)
- `CLAUDE.md` (2026-08-06 20:52, modificado 2026-09-05)
- Cache superficie `antigravity-cli/mcp/codegraph/` (actualizado 2026-09-13 22:22 — último arranque AGY)
- `settings.json` antigravity-cli: `mcp(codegraph/codegraph_explore)` (línea 34)

**Ambas configs Gemini (settings.json y mcp_config.json) contienen ademas un
entry stale `buffy-tools` apuntando a `~/experiments/opencode-buffy-cplus/
adapter/buffy-mcp-server.js`** — resto del experimento histórico, fuera de
alcance (ver 193fb80).

### Hallazgo colateral OBSERVADO

`mcp_config.json` y `settings.json` actuales contienen un entry `buffy-tools`
muerto (apunta a ruta inexistente). No afecta a CodeGraph.

## Qué debe reproducir Buffy

Para que un harness tipo AGY descubra y use `buffy_context` como CodeGraph usa
`codegraph_explore`, Buffy necesitaría (eventualmente, NO en esta tarea):

1. **Un comando de instalación** par aregistrar el MCP server en el harness:
   `mcpServers.<name>.command/<args>` con `serve --mcp` (sin `type` para
   Antigravity; con `type:"stdio"` para Gemini CLI).
2. **Un bloque de instrucciones de archivo corto y marker-fenced** en la
   instrucción surface del harness (`GEMINI.md`, `CLAUDE.md`, etc.) — que diga
   "call `buffy_context` first" para el routing del agente principal Y llegue a
   subagents/no-MCP vía CLI (`buffy doctor --context`).
3. **`initialize.instructions` ricas** en el server (ya implementado en
   `src/mcp.ts`).
4. **Superficie de herramienta mínima** (una tool read-only, ya implementada).
5. **Permiso de invocación** por harness (runtime/approval) — no es algo que el
   installer deba escribir necesariamente; AGY lo generó al aprobar.

## Qué NO debemos reproducir

- **No duplicar** las `initialize.instructions` en el bloque de archivo
  (lección #529): el agente principal ya las recibe del server; el bloque de
  archivo es SOLO "llama esta herramienta primero / hay un CLI equivalente",
  no el playbook completo.
- **No escribir espagueti multi-archivo**: CodeGraph usa CUATRO artefactos
  para un solo server. Buffy ya tiene el compacto (<2048 bytes) que puede ser
  la base del bloque de archivo sin inflar.
- **No replicar el install multi-target completo** de una vez: el mínimo es
  registrar el server (ya está en opencode) + el bloque de archivo en las
  superficies activas.
- **No asumir que el registro solo produce selección**: la evidencia de
  CodeGraph (comentarios #529/#704) y de T0–T4 coinciden: el registro es
  mecánico; la selección la gatillan las instrucciones en las superficies que
  el agente sí lee (archivo para subagents, initialize para el principal).
- **No introducir el entry `buffy-tools` obsoleto**: el durable args de
  CodeGraph es un entry limpio; el `buffy-tools` stale en la config actual es
  un anti-patrón.

## Respuestas finales

### 1. ¿Qué inyecta CodeGraph en AGY?

Dos artefactos por el instalador:
- `~/.gemini/config/mcp_config.json` → `mcpServers.codegraph`
  (`command:"codegraph", args:["serve","--mcp"]`, SIN `type`).
- `~/.gemini/GEMINI.md` → bloque marker-fenced corto
  (`<!-- CODEGRAPH_START/END -->`) "reach for it BEFORE grep/find".

Más dos que **AGY genera en runtime** al conectar el server:
- `~/.gemini/antigravity-cli/mcp/codegraph/instructions.md`
  (cache de `initialize.instructions`).
- `~/.gemini/antigravity-cli/mcp/codegraph/codegraph_explore.json`
  (cache de `tools/list`).
- y un permis o de invocación en `settings.json:34` (`mcp(codegraph/codegraph_explore)`).

No inyecta skills, ni AGENTS.md, ni toca la config del CLI antigravity.

### 2. ¿Qué parte es necesaria para descubrimiento?

El **registro MCP** (`mcp_config.json`). Sin él, el harness no lanza el server
ni le ofrece las tools. Es lo único que hace "existir" a CodeGraph ante AGY.

### 3. ¿Qué parte es necesaria para routing?

Dos niveles, según audiencia:
- **Agente principal**: `initialize.instructions` (routing en el momento de
  conexión; AGY lo cachea como `instructions.md`).
- **Subagents + no-MCP**: el bloque de archivo en `GEMINI.md` (repite "usalo
  primero" + alternativa CLI). Medición de CodeGraph: sin él, subagents ~1/9;
  con él, consistente.

### 4. ¿Qué parte es redundante/histórica?

- El bloque de GEMINI.md es **redundante para el agente principal** (ya recibe
  instructions del server) — pero es necesaria para subagents/no-MCP. No es
  histórica, es un canal complementario.
- El entry `codegraph` en `~/.gemini/settings.json` (gemini CLI, `type:"stdio"`)
  es el registro del channel Gemini CLI, no el de AGY: redundante si AGY solo
  lee el config path unificado; presente aquí por instalación dulce de ambos.
- El `buffy-tools` stale en ambos archivos es histórico y obsoleto.

### 5. ¿Cuál es el mínimo equivalente que Buffy debería implementar?

Tres piezas, dos ya hechas en `src/mcp.ts`:
1. `initialize.instructions` + superficie de 1 tool read-only — **YA
   implementado** (c6fef9d).
2. Registro MCP por harness — **pendiente** (un snippet `--print-config`
   equivalente; redactable con `buffy serve --mcp`).
3. Bloque de archivo corto marker-fenced ("call `buffy_context` first" + CLI
   `buffy doctor --context` como fallback para subagents) en las superficies
   activas — **pendiente**, apoyándose en el compacto existente.

El bloque de archivo DEBE ser corto y no duplicar las instructions del server.
Ese es el mínimo equivalente funcional al patrón de CodeGraph.

---

**Estado:** reporte finalizado. No se modificó Buffy ni configuraciones.