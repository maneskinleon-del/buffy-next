# MCP HISTORICAL STATE — Checkpoint y evaluación (2026-09-13)

**Fecha:** 2026-09-13
**Alcance:** investigación read-only local + documentación de `buffy-next`.
**Adapter evaluado:** `~/experiments/opencode-buffy-cplus/adapter/buffy-mcp-server.js`
**Repos:** `buffy-next` (`cf77eee`), `buffy-context` (ausente localmente), `agy-routing-experiment` (commit `eefc310`, remoto, sin copia local).
**Tipo:** checkpoint documental + evaluación arquitectónica. No se implementa ni reconstruye nada.

> El adapter MCP histórico no está actualmente disponible en la máquina y no se reconstruye en este checkpoint.

---

# PARTE 1 — CHECKPOINT

## OBSERVACIÓN

La investigación local (2026-09-13) confirmó la **ausencia física** del adapter
MCP histórico de Buffy. Lo que permanece es evidencia documental dentro de
`buffy-next` y trazas históricas de uso en logs/transcripts de Agy y chats de
manicode. No existe registro MCP vigente de Buffy en ningún harness configurado
en esta máquina.

El adapter histórico exponía tres tools — `buffy_context`,
`buffy_capabilities`, `buffy_action` — documentadas como wrapper externo que
llamaba al CLI público de `buffy-next`.

## EVIDENCIA MECÁNICA

| Ítem | Estado verificado |
|---|---|
| `~/experiments/opencode-buffy-cplus/adapter/buffy-mcp-server.js` | **NO existe** (`stat` falla). SHA-256: N/A (ausente) |
| `~/experiments/opencode-buffy-cplus/` | **NO existe**; `~/experiments/` solo contiene `agent-workdir/ fixtures/ freebuff-buffy-contract/ results/` |
| Variantes (`buffy-mcp-server.py`, `buffy-tools*`, `buffy-mcp*`, `buffy_context*`) en raíces priorizadas | **Ninguna** (`find` en `~/experiments`, `~/proyectos`, `~/.config`, `~/.gemini`, `~/proyectos/buffy-next`) |
| `~/buffy-context` | **NO existe** (repo ausente) |
| `~/.prime/agent/skills/buffy-context/src` (módulo Python `buffy_context`) | **NO existe**; sin `*buffy*` bajo `~/.prime`. Solo referenciado en comandos históricos |
| Código MCP en `buffy-next` | **No existe** — docs lo declaran externo; auditado en `AGENT-DISCOVERY-AUDIT.md:18` |
| Registro MCP en OpenCode | `~/.config/opencode/opencode.json` → `mcp: {codegraph (local), browseros (remote)}`. El string `buffy` no aparece en el archivo (413 KB). Sin `mcp.buffy-tools` |
| Registro MCP en Antigravity | `settings.json`: solo permiso `mcp(codegraph/codegraph_explore)`; sin server MCP de Buffy |
| Archivos `.mcp.json` en home/config | Ninguno (profundidad ≤ 2) |
| CLI público hoy | `npm run build` OK (`dist/cli.js` 136.7 KB); `buffy capabilities --json` → 10 tools (Node, npm, git, Python, GCC, Make, Docker, ADB, curl, wget) con `{name,status,version}` |
| Trazas históricas | Logs `~/.gemini/antigravity-cli/log/cli-*.log` y `brain/*/transcript*.jsonl` citan el python one-liner `from buffy_context import run` (módulo Python de buffy-context, no el adapter JS); chats manicode citan `~/experiments/opencode-buffy-cplus/adapter/buffy-mcp-server.js` |
| Documentación histórica | `docs/VERSION-MCP-AUDIT.md`, `docs/AGENT-INTEGRATION.md`, `docs/AGENT-DISCOVERY*.md`, `docs/BUFFY-AGENT-CONTRACT.md` describen el adapter, sus 3 tools, el registro `mcp.buffy-tools` y `BUFFY_CLI` |
| `agy-routing-experiment` (cloud) | `docs/research/AGY-ROUTING-FINDINGS.md` documenta el resultado T4 (MCP + regla imperativa → `buffy_context`); sin copia local del repo |

## Solo documentado (sin soporte físico)

- Semántica exacta de las tres tools (el código no está disponible).
- El registro `mcp.buffy-tools` en OpenCode (`VERSION-MCP-AUDIT.md:37`, `AGENT-INTEGRATION.md:26`).
- `BUFFY_CLI` y su fallback a ruta absoluta.
- Smoke test "context ✓, capabilities ✓, action ✓" (`VERSION-MCP-AUDIT.md:44`) — evidencia de que **en ese momento** pasó; no es evidencia de ejecutabilidad actual.

## Sin verificar

- Contenido real del adapter (código fuente no disponible).
- Existencia del repo/artefactos en otras máquinas o en GitHub (`opencode-buffy-cplus`).
- Momento ni causa de la desaparición local del directorio `opencode-buffy-cplus`.

## HIPÓTESIS

- El adapter fue mantenido deliberadamente fuera del repo (base: docs repetidamente lo llaman "adapter externo que no forma parte del repo"). No hay evidencia del evento de borrado local.
- Las marcas de uso `buffy_context` en logs de Agy corresponden mayormente al **módulo Python de buffy-context** (`~/.prime/…/buffy-context/src`), no al adapter MCP JS — colisión de nombres histórica. No verificable sin el código de ambos.

## CONCLUSIÓN (checkpoint)

Con seguridad de la evidencia mecánica: **el adapter MCP histórico no existe hoy en esta máquina**, ni como archivo, ni como registro en OpenCode/Antigravity, ni como variante en las raíces priorizadas. Toda la evidencia es documental y unívoca (tres fuentes independientes, mismas tools, mismo camino). Sigue totalmente vigente el principio del routing: **la selección efectiva de herramientas NO la produce el registro MCP, sino la regla imperativa activa** (`AGY-ROUTING-FINDINGS.md`, T4).

---

# PARTE 2 — EVALUACIÓN

Fuentes: `BUFFY-AGENT-CONTRACT.md` (tabla de interfaces, líneas 29-45), `AGENT-INTEGRATION.md`, `VERSION-MCP-AUDIT.md`, `AGENT-DISCOVERY.md`/`AUDIT`, `AGY-ROUTING-FINDINGS.md`, y verificación del CLI actual.

## A. `buffy_context`

- **Función:** devolver el contexto operativo del sistema como `buffy.context/v1`: plataforma, hardware (CPU/RAM/GPU/disco/temperatura/procesos), tools disponibles, privileges, con freshness por campo (`observedAt`/`ageMs`/`epistemicState`).
- **Qué entregaba:** un snapshot factual freshness-aware (`buffy doctor --context`).
- **Por qué fue útil para Agy:** en T4, frente a un diagnóstico, Agy eligió `buffy_context` por la regla imperativa y obtuvo evidencia observada y fresca **sin ejecutar comandos arbitrarios** — valor "testigo verificable", no memoria.
- **Relación con `buffy-context`:** son **complementarios y distintos**. `buffy-context` es memoria/knowledge (persistente entre sesiones, selección por router/selector; hoy ausente). `buffy_context` (adapter) es contexto operativo en tiempo real del sistema vía `buffy-next`. La colisión de nombre histórica con el módulo Python `buffy_context` (memoria) es una fuente de confusión ya observada en trazas.
- **Sigue teniendo sentido:** SÍ como *dato* — es exactamente lo que `buffy doctor --context` produce y que la distribución actual ya enlaza. El *canal* no depende de MCP: cualquier harness puede llamarlo por subprocess. Un tool MCP solo añade formato JSON tipado en la herramienta.

**Decisión: ADAPTAR** — conservar la interfaz de datos (context v1) vía CLI/discovery; no se necesita el tool MCP como requisito. Un tool opcional sería solo el proxy a `doctor --context`.

## B. `buffy_capabilities`

- **Problema que resolvía:** saber qué herramientas/capacidades tiene el sistema para que el agente decida qué pedir.
- **Sigue siendo necesario:** el *dato* (tools presentes + veredictos de driver/ADB/shizuku) sí; la *tool separada* hoy es **redundante**: `buffy.context/v1` ya incluye `tools disponibles` y `privileges` (`BUFFY-AGENT-CONTRACT.md:33`).
- **Fuente mejor hoy:** `buffy doctor --context` (mismo dato, un solo comando) + el discovery (`~/ai-context/README.md`, `~/.buffy/layout.json`) que localiza las fuentes canónicas.
- **Mismatch detectado:** el contrato describe `capabilities` como "observaciones y acciones con nivel de seguridad y requisitos", pero el CLI actual devuelve 10 tools `{name,status,version}` — el **catálogo de acciones con niveles** (9 acciones, `action-gate.ts`) **no está expuesto** por `buffy capabilities --json` hoy. Ese es un gap del contrato, no del adapter.

**Decisión: DESCARTAR como tool independiente** (el dato ya vive en context); opcionalmente ADAPTAR la *definición* si se decide exponer el catálogo de acciones con niveles de seguridad (gap a definir por separado).

## C. `buffy_action`

- **Capacidad operacional:** ejecutar una acción del catálogo (9 acciones: verificar driver/temp/red/disco/procesos/shizuku, instalar herramienta, cambiar plan de energía) **solo con autorización** vía `buffy act <id>` y **ActionGate como autoridad final** (`action-gate.ts:80-199`, niveles `auto_safe`/`confirm`/`forbidden`).
- **Riesgos de seguridad:** es la única de las tres con efectos físicos; el riesgo real no estaba en el adapter (wrapper delgado que llamaba CLI) sino en el harness: exponer una tool "action" con `confirm` débil, o argumentos que cambien de acción. ActionGate es el gate correcto y debe conservarse.
- **Modelo actual:** permite conservarla **sin duplicar lógica** — el motor (`act` + ActionGate) ya existe en `src/`; un canal nuevo solo llamaría al CLI. No hay duplicación en Next; el punto de riesgo es la configuración MCP del harness.
- **Recuperar / rediseñar / descartar:** la **capacidad** es el corazón de `Next = entorno/operaciones` y debe conservarse (ya existe vía CLI). El **canal** es opcional y debe mantenerse bajo ActionGate con `confirm` explícito.

**Decisión: RECUPERAR conceptualmente (vía CLI existente)**; un tool MCP `buffy_action` futuro sería opcional, estrictamente `confirm`-gateado, sin duplicar el motor.

## D. Adapter externo (capa opcional)

```text
harness → MCP adapter → Buffy CLI/API estable → buffy-next
```

vs.

```text
harness → Buffy directamente (subprocess `node dist/cli.js …`)
```

- **A favor del adapter:** encapsula el camino (una sola ruta conocida `BUFFY_CLI`), no toca `buffy-next`, y puede ser la vía natural para harnesses que no soportan subprocess robusto. Fue útil en su momento (`VERSION-MCP-AUDIT.md`).
- **En contra:** T4 demostró que el registro MCP **no produce selección espontánea**; la decisión la toma la regla imperativa en `AGENTS.md`. Hoy, además, la vía directa es viable (CLI compilado, contract por líneas, discovery en `~/ai-context`/`~/.buffy`). El adapter duplica el discovery y añade un componente por máquina que se pierde si no se mantiene (exactamente lo ocurrido).
- **Evaluación:** como **concepto** (capa fina de traducción externa) es defensable y opcional. Como **requisito** para consumir Buffy: NO — la arquitectura actual lo hace innecesario para el discovery y opcional para la ejecución.

**Decisión: DESCARTAR como componente central; conservar el patrón como opción documentada (no reconstruir ahora).**

## E. Relación con la arquitectura actual

```text
Buffy
├── Context = memoria/contexto      (ausente hoy; vía ~/ai-context quando presente)
└── Next    = entorno/operaciones   (CLI + ActionGate + contract v1)

distribución: ~/ai-context/README.md  → índice verificado
              ~/.buffy/layout.json    → manifest de localizaciones
```

El MCP histórico representaba exclusivamente a **Next** (interfaces contract) y,
por colisión de nombre, se confundía con la memoria de Context. Con el
discovery actual verificado (layout + README + compacto inyectable), la función
de *descubrir* Buffy ya no necesita un MCP registrado: la cumple el punto de
entrada global + contratos canónicos + regla activa en el harness.

- **Complementa:** parcialmente — como canal JSON tipado opcional para harnesses con MCP-first, no aporta al routing (demostrado T2/T3).
- **Duplica:** `buffy_capabilities` duplica `context.tools`; el README/layout duplican la localización que antes hacía el registro. La separación Context/Next que imponemos hoy resuelve la colisión de nombres histórica.
- **Posición correcta:** adapter MCP **opcional** por harness, registrado externamente, apuntando al CLI público — exactamente el diseño que ya documenta `AGENT-INTEGRATION.md`, pero nunca como célula de discovery ni como requisito.
- **Pertenece a:** en su rol de discovery-hook, a la arquitectura anterior (superado por layout+README+compacto). En su rol de canal de ejecución, conserva un valor opcional.

## Tabla de decisión

| Componente | Evidencia histórica | Valor actual | Decisión |
|---|---|---|---|
| `buffy_context` | Contract v1 con freshness (`BUFFY-AGENT-CONTRACT.md:33`); T4 seleccionó esta tool con regla imperativa (`AGY-ROUTING-FINDINGS.md`) | Alto: es el "testigo verificable" del sistema; dato ya disponible por `buffy doctor --context` y enlazado por el discovery | **ADAPTAR** como interfaz de datos (context v1 vía CLI/discovery); tool MCP opcional, no requisito |
| `buffy_capabilities` | Tool #2 (`VERSION-MCP-AUDIT.md`); contrato la describe como "acciones con niveles" pero CLI devuelve hoy 10 tools `{name,status,version}` | Bajo como tool separada: dato duplicado en `context.tools`; existe un gap real de "catálogo de acciones con niveles" no cubierto | **DESCARTAR** como tool independiente; evaluar aparte exponer el catálogo de acciones con niveles |
| `buffy_action` | Tool #3; `buffy act` con ActionGate autoridad (`action-gate.ts:80-199`, auto_safe/confirm/forbidden); wrapper delgado sin internals | Alto: corazón de `Next = entorno/operaciones`; motor ya existe en `src/`, sin duplicación posible si se expone por CLI | **RECUPERAR** la capacidad vía CLI existente; canal MCP futuro opcional y estrictamente confirm-gated |
| adapter MCP | `AGENT-INTEGRATION.md` (arquitectura wrapper externo); smoke test histórico PASS; T2/T3: registro MCP por sí solo no selecciona | Bajo como discovery (duplica layout/README/compacto), medio como canal opcional; componente por máquina que se pierde sin mantenimiento | **DESCARTAR** como componente central; conservar patrón externo opcional documentado, sin reconstruir |
| integración AGENTS (regla imperativa) | T4: MCP + regla activa → `buffy_context`; "la superficie efectiva de routing es AGENTS.md" (`AGY-ROUTING-FINDINGS.md`) | Alto: es el mecanismo de selección demostrado; hoy lo emula la distribución (README global + compacto + `~/.AGENTS.md`) | **RECUPERAR** como principio rector del discovery (ya incorporado en la distribución actual) |

**Regla aplicada:** "vale la pena recuperar conceptualmente ≠ hay que implementarlo ahora". Esta evaluación no implementa nada; solo fija qué conceptos del adapter conservan valor sobre la arquitectura actual.