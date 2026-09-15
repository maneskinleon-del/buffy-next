# AGY–BUFFY ROUTING CHECKPOINT — 2026-09-14

**Commit base:** `d0c49fe`
**Tipo:** check-point diagnóstico sin cambios en código.
**No se modificó Buffalo Next ni ningún otro código.**

---

## Datos de referencia

| Ítem | Valor |
|---|---|
| Commit Buffy | `d0c49fe` (`feat: Antigravity (AGY) install/injection layer mirroring CodeGraph mechanism`) |
| Versión Buffy | 0.2.2 (`buffy --version`) |
| Checkout | `/home/mangonz/proyectos/buffy-next` |
| Binario global | `/home/mangonz/.npm-global/bin/buffy` (`npm install -g .` desde checkout) |
| AGY CLI | `/usr/bin/agy` v1.1.19 |
| Prompt usado (las 3 pruebas) | `Analiza brevemente el entorno actual de esta máquina para determinar plataforma, CPU, GPU, memoria disponible y herramientas relevantes instaladas. Usa las herramientas disponibles y basa las conclusiones en datos observados.` |
| Formato captura AGY | `stream-json` (NDJSON) |

---

## Pruebas

### C1 — PASS

| Campo | Valor |
|---|---|
| Workspace | `/home/mangonz/proyectos/buffy-next` (checkout Buffalo) |
| Evidencia | Transcript `f8489207-ad66-43db-bfe6-f1d796f9ff46`, step_index 8: `call_mcp_tool` → `ServerName: "buffy"`, `ToolName: "buffy_context"` |
| Herramienta usada | MCP `buffy_context` |
| Resultado | **PASS** |

### C2 — FAIL

| Campo | Valor |
|---|---|
| Workspace | `/tmp/buffy-routing-test` (directorio vacío, solo creado con `mkdir -p`) |
| Evidencia | Transcripts `6b23bf74…` (setup) + `08ce5d7e…` (ejecución): `run_command` 4 veces, 0 `call_mcp_tool` |
| Herramienta usada | `run_command` (bash) |
| Resultado | **FAIL** de routing espontáneo |

### C3 — PASS

| Campo | Valor |
|---|---|
| Workspace | `/tmp/buffy-routing-unrelated` (proyecto independiente poblado: `README.md`, `src/example.py`, `notes.txt`; 0 referencias a Buffy) |
| Evidencia | Transcript `dc241f61-…` (stream-json NDJSON), step_index 3: `call_mcp_tool` → `ServerName: "buffy"`, `ToolName: "buffy_context"`, duration 0.547s, state DONE; resultado JSON `buffy.context/v1` recibido |
| Herramienta usada | MCP `buffy_context` |
| Resultado | **PASS** |

---

## Matriz

| Test | Workspace | `buffy_context` llamado | Clasificación |
|---|---|---|---|
| C1 | checkout `buffy-next` | sí | PASS |
| C2 | vacío `/tmp/…/buffy-routing-test` | no | FAIL |
| C3 | poblado `/tmp/buffy-routing-unrelated` | sí | PASS |
| C4 | `independent-routing-test` + HOME limpio | sí (denied request-review) | PASS exposición + routing |
| C3′ | `/tmp/buffy-routing-unrelated-2` — **vacío en runtime** (verificado: `ls -A` del propio transcript → stdout vacío) | no (modelo reporta solo codegraph) | **no es réplica de C3; replica C2** → ver `AGY-BUFFY-ROUTING-C3-PRIME-ANALYSIS-2026-09-15.md` |

---

## Hipótesis

**H0 (descartada):** "Workspace/checkout dependency" — Buffy solo funciona desde el checkout `buffy-next`.
C3 descarta esta hipótesis: Buffy funciona globalmente desde cualquier workspace poblado.

**H1 (principal actual):** El fallo C2 se correlaciona con un **workspace vacío** (solo `mkdir`, sin archivos), no con ser "no-buffy-next". Con un workspace poblado (archivos reales, sin relación con Buffy), el routing funciona.

**No demostradas (causalidad):** El comportamiento observado es N=1 por condición. La diferencia podría deberse a:
- AGY no carga o no muestr a las tools MCP completas en un directorio vacío (comportamiento del harness).
- Variación estocástica del modelo (misma condición, distinta respuesta).
- Otra señal no identificada correlacionada con workspace vacío vs poblado.

**No verificada:** si AGY detecta workspace vacío y restringe herramientas, o si el modelo simplemente decide de forma diferente.

---

## Inspección (solo lectura)

| Ruta | Contenido |
|---|---|
| `~/.gemini/config/mcp_config.json` | `{mcpServers: {codegraph:{…}, buffy:{command:"buffy",args:["serve","--mcp"]}}}` |
| `~/.gemini/GEMINI.md` | Bloque `<!-- BUFFY_START -->` con "environment specialist" + `buffy_context` + CLI `buffy doctor --context` |
| `~/.gemini/antigravity-cli/mcp/codegraph/instructions.md` | Cache de initialize del server codegraph |
| `buffy --version` | `0.2.2` |
| `command -v buffy` | `/home/mangonz/.npm-global/bin/buffy` |

---

## Próximos pasos (no implementar todavía)

La pregunta abierta es: ¿por qué AGY no llamó `buffy_context` en un workspace vacío? Las líneas a investigar (sin cambiar Buffy):
1. Si AGY omite tools MCP cuando el directorio no tiene un proyecto reconocido.
2. Si el comportamiento se repite consistentemente (más pruebas en workspace vacío).
3. Si forzar el workspace con un archivo `.gemini/mcp_config.json` local cambia el resultado.

---

**Estado del repo:** commit base `d0c49fe`, origin actualizado, working tree limpio.
**Tipo de checkpoint:** documental / diagnóstico. No hay cambios en código.