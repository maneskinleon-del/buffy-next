# AGY–BUFFY ROUTING C3′ — ANÁLISIS DOCUMENTAL (2026-09-15)

**Tipo:** checkpoint documental/forense. **No se ejecutó ninguna prueba.** No se abrió sesión AGY. No se modificó código.
**Commit base de esta investigación:** `e70219c` (repo `buffy-next`, rama local, working tree limpio al iniciar).
**Documento que motiva este análisis:** `AGY-BUFFY-ROUTING-CHECKPOINT-2026-09-14.md` (commit `0c264ab945803c6e61669d127ea53afa8f9d98b7`).

---

## 0. Resumen ejecutivo

C3' fue una repetición de C3 (workspace independiente poblado) bajo condiciones
consideradas equivalentes, con resultado distinto (C3 PASS → C3' FAIL). La
reconstrucción documental demuestra que **las condiciones NO eran equivalentes**:

> **Hallazgo central: el workspace de C3' (`/tmp/buffy-routing-unrelated-2`) estaba
> VACÍO en tiempo de ejecución.** El propio transcript de la sesión ejecutó
> `ls -A` en el workspace y el stdout fue vacío (exit 0, sin output). El modelo
> reportó explícitamente que solo `codegraph` estaba listado en `<mcp_servers>`
> y resolvió la tarea con `run_command` (7 llamadas, 0 `call_mcp_tool`).

C3' no es una réplica fallida de C3: es una **réplica accidental de C2** (workspace
vacío). La comparación C3 vs C3' no compara población del workspace; compara
"poblado vs vacío" — exactamente la variable que separa C2 de C3.

---

## 1. Método

Solo lectura. Fuentes inspeccionadas en 2026-09-15:

1. Git history completo de `buffy-next` (`--all`), docs/research, EVIDENCE-INDEX.
2. Transcripts AGY: `~/.gemini/antigravity-cli/brain/*/…/transcript_full.jsonl`.
3. `~/.gemini/antigravity-cli/history.jsonl` (timestamp + workspace por prompt).
4. Disco: `/tmp/buffy-routing-unrelated{,-2}`, `~/proyectos/independent-routing-test`,
   `~/.gemini/config/mcp_config.json`, `~/.gemini/GEMINI.md`, `~/.gemini/antigravity-cli/mcp/`.
5. Artifacts de agente: Buffy Context (`~/buffy-context/ai-context/`), manicode
   message-history. Sin hallazgos.

Regla de evidencia aplicada: no confundir "descripción de C3'" con "condición
exacta de C3'". Cada dato cita fuente primaria.

---

## 2. C3 — condición RECUPERADA

| Elemento | Evidencia | Fuente |
|---|---|---|
| Workspace | `/tmp/buffy-routing-unrelated` (poblado) | checkpoint `0c264ab9` + verificado en disco (mtime 2026-09-14 12:19:02) |
| Contenido literal | `README.md` (141B): "# unrelated-project / This is an independent sample project used to test agent behaviour. It has no connection to any system tooling project." · `notes.txt` (11B): `alpha\nbeta` · `src/example.py`: función `greet()` | lectura directa de los archivos |
| Sesión AGY | `dc241f61-60af-4307-b978-5d53d3ea41cf` (2026-09-14T15:19:37Z) | transcript_full.jsonl |
| Modelo | `GPT-OSS 120B (Medium)` | step 0 del transcript (settings change) |
| Prompt | Verbatim igual al del checkpoint | step 0 |
| Routing | step 2 thinking: "Must use tools: buffy_context (lazy tool via MCP server buffy)" → step 3 `call_mcp_tool` → `ServerName: "buffy"`, `ToolReason` n/a, `ToolName: "buffy_context"`, duración 0.547s | transcript verbatim |
| Resultado | PASS — resultado JSON `buffy.context/v1` recibido | checkpoint + transcript |

El workspace de C3 **sigue en disco con contenido intacto** — la condición de C3
es hoy reproducible byte a byte (salvo mtime).

## 3. C3′ — condición PARCIAL (workspace vacío en runtime)

| Elemento | Evidencia | Fuente |
|---|---|Fuentes en este checkpoint|
| Workspace | `/tmp/buffy-routing-unrelated-2` — existe, **vacío** (creado 2026-09-14 13:46:58; sesión AGY iniciada 13:47:20) | `stat`/`ls` + `history.jsonl` entrada `"workspace":"/tmp/buffy-routing-unrelated-2"` ts 1789404440082 |
| Estado en runtime | El transcript ejecutó `ls -A` en el workspace (step 2→3): exit 0, **stdout vacío** | transcript `ebd5c01c-113e-4d7a-a523-73fa9eb4f0bb` step 3 |
| Decisión del modelo | step 2 thinking verbatim: "In MCP servers list: only codegraph server is listed. No buffy server listed. So maybe buffy_context not available." | transcript ebd5c01c |
| Acciones | 7× `run_command` (`ls -A`, `uname -a`, `lscpu`, `free -h`, `lspci -nn \| grep -i vga`, `ls -A .codegraph`, `python3 --version`), 0× `call_mcp_tool` | transcript ebd5c01c (args verbatim) |
| Modelo | `GPT-OSS 120B (Medium)` | step 0 |
| Documentación previa | Ninguna — 0 menciones de `unrelated-2` en todo `buffy-next` y en history.jsonl aparte de la entrada de sesión | grep exhaustivo |

## 4. Cadena causal observada (no probada causalidad, solo correlación fuerte)

```
workspace poblado (C3)  → buffy listado en <mcp_servers> → call_mcp_tool → PASS
workspace vacío (C3′)   → solo codegraph en <mcp_servers> → run_command   → FAIL
workspace vacío (C2)    → solo codegraph en <mcp_servers> → run_command   → FAIL
```

C3' se comporta como C2, no como C3. La comparación C3 vs C3' es inválida como
repetición: compara "poblado vs vacío" — la variable que separa C2 de C3.

---

## 5. Qué explica y qué NO explica

**Explica (evidencia directa):**
- Por qué C3' ≠ C3: las condiciones difieren en la variable crítica (poblado vs vacío).
- Que el FAIL de C3' es consistente con el patrón C2 (vacío → sin buffy en surface).
- Que C3 PASS es internamente válido: su transcript muestra buffy listado y llamado.

**NO explica (queda abierto):**
- Por qué un workspace vacío correlaciona con buffy ausente del `<mcp_servers>`
  construido por AGY (hipótesis H1 del checkpoint original: comportamiento del
  harness en workspace sin proyecto reconocido — sigue sin verificación mecánica).
- El estado exacto del surface cache (`~/.gemini/antigravity-cli/mcp/buffy/`) y de
  `config/mcp_config.json` a las 13:47 (C3') vs 12:19 (C3). La superficie actual
  fue reescrita por installs de C4; entre medias está el fix `9e19bb8`
  ("always write MCP config to unified path"). No hay snapshot con ese timestamp.
- Si la preparación de C3' (mkdir sin populate) fue un paso omitido, un paso
  fallido, o un paso nunca definido.

## 6. Gaps que permanecen

1. **Procedimiento de preparación de C3'**: quién/comando creó
   `/tmp/buffy-routing-unrelated-2` y qué contenido estaba previsto. Sin registro.
2. **Contenido previsto de C3'**: si iba a replicar C3 (`README.md`,
   `src/example.py`, `notes.txt`), ninguna fuente lo confirma.
3. **Snapshot de superficie MCP a las 13:47** (`mcp/buffy/`, `config/mcp_config.json`,
   `GEMINI.md`) — no existe.
4. **Definición formal de C3'** (criterio de equivalencia con C3, procedimiento de
   preparación pre-registrado) — inexistente en los checkpoints.

## 7. Estado de la matriz C1–C4 tras este análisis

| Test | Workspace real (verificado) | Clasificación previa | Clasificación corregida |
|---|---|---|---|
| C1 | checkout `buffy-next` (poblado) | PASS | PASS (sin cambio) |
| C2 | `/tmp/buffy-routing-test` vacío | FAIL | FAIL (sin cambio) |
| C3 | `/tmp/buffy-routing-unrelated` poblado | PASS | PASS (sin cambio) |
| **C3′** | `/tmp/buffy-routing-unrelated-2` **VACÍO** | (no registrada) | **no es réplica de C3; replica C2** — FAIL explicado |
| C4 | `independent-routing-test` + HOME limpio | PASS | PASS (sin cambio) |

---

**Estado del repo:** este checkpoint es el único cambio documental. No hay cambios
de código. Ninguna prueba fue ejecutada para producirlo.
**Próximo paso natural (no ejecutado):** una repetición controlada C3'' con
pre-registro de condición (poblado verificado antes de lanzar AGY) si se quiere
cerrar H1 con una comparación válida.
