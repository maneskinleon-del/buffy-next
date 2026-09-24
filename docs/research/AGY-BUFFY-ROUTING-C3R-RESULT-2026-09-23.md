# AGY–BUFFY ROUTING C3-R1/R2/R3 — REPLICACIÓN C3 (2026-09-23)

**Tipo:** checkpoint documental de resultado experimental. Sin cambios de código.
**Commit base:** `e438f29` (rama `master`, working tree sin modificaciones tracked).
**Sesiones AGY:** 3 (C3-R1, C3-R2, C3-R3), ejecutadas una por una, misma configuración.

---

## 1. Condición replicada

Tres workspaces independientes, byte-idénticos entre sí, equivalentes a la condición
**C3 original** recuperada (NO C3′):

| Workspace | README.md (sha256 18887a9f…) | notes.txt (e49c81e2…) | src/example.py (ed79c172…) |
|---|---|---|---|
| `/tmp/buffy-routing-c3-r1` | ✓ | ✓ | ✓ |
| `/tmp/buffy-routing-c3-r2` | ✓ | ✓ | ✓ |
| `/tmp/buffy-routing-c3-r3` | ✓ | ✓ | ✓ |

- Prompt verbatim idéntico al del checkpoint `0c264ab` (sin menciones a Buffy/MCP/tools).
- AGY CLI 1.1.19, GPT-OSS 120B Medium, config MCP/Buffy/GEMINI.md sin cambios.
- Comando: `agy --print=… --output-format stream-json --dangerously-skip-permissions --log-file …`
- Cero exploración previa: `call_mcp_tool` es la primera tool efectiva en las 3 réplicas
  (`view_file` aparece después, step 7).

## 2. Resultado

| Réplica | Resultado | Evidencia (transcript) |
|---|---|---|
| C3-R1 | **PASS** | step 3: `call_mcp_tool → ServerName:"buffy" → ToolName:"buffy_context"` (DONE, 0.52s) |
| C3-R2 | **PASS** | step 5: misma secuencia (DONE, 0.38s) |
| C3-R3 | **PASS** | step 3: misma secuencia (DONE, 0.46s) |

**3/3 PASS → selección reproducible en esta muestra (n=3).**

Inventario de tools por transcript (idéntico en las 3): `call_mcp_tool` ×1, `view_file` ×1.
Sin `run_command`, `list_dir` ni `read_file`.

**Transcripts completos:** `/tmp/buffy-c3-transcripts/` (`C3-R*.transcript.jsonl` + `.log` + `.stderr`).

## 3. Alcance de la conclusión

- **Sí sostiene:** bajo workspace poblado, la selección de `buffy_context` es estable en
  esta muestra; decisión temprana, no llamada tardía. Debilita "falla casi siempre".
- **No sostiene:** n=3 con 3/3 es compatible con tasa real ~50% (~12% de probabilidad).
  No descarta variabilidad. PASS ≠ uso correcto del resultado. Sin causalidad.

## 4. Hallazgo que detuvo el siguiente paso (C4)

La premisa "C4 está en FAIL" **contradice la documentación primaria**:

- `AGY-BUFFY-ROUTING-C4-PASS-2026-09-14.md`: C4 = **PASS exposición + routing**
  (secuencia `call_mcp_tool → buffy` presente en step 3; `ERROR` posterior por
  **permission-denied** en modo `request-review` + `-p`, esperado por diseño).
- Matrices de `0c264ab` y del análisis C3′ coinciden: C1 PASS · C2 FAIL · C3 PASS ·
  C4 PASS · C3′ = réplica accidental de C2 (workspace vacío → FAIL explicado).

Posible origen de la discrepancia: clasificar C4 como FAIL según **exec DONE** (no según
presencia de la secuencia). Bajo el criterio de esta ronda (secuencia presente), C4 sería PASS.

Además, replicar C4 según su spec histórica exige `buffy install --target antigravity`
con HOME limpio — en conflicto con las restricciones de esta ronda.

**Decisión: STOP. No se ejecutó ninguna réplica C4.** Pendiente de definición de la
condición C4 objetivo (o de aclaración del criterio FAIL aplicado a C4).

---

**Estado del repo:** `e438f29`, sin cambios de código. Este documento es el único cambio
documental. No se modificó Buffy, MCP config, GEMINI.md ni workspaces.

---

## 5. Adenda (2026-09-23, post-C2, solo lectura)

### 5.1 Criterio de validez de sesión (fijado ANTES de reanudar C2)

Una sesión AGY cuenta (PASS/FAIL) solo si:

- `result.status ≠ "ERROR"`, **y**
- `result.total_tokens > 0`

**`num_turns > 1` NO se incluye:** verificado en disco, las sesiones válidas C3-R1..R3
tienen `num_turns: 1` (print mode = 1 turno de usuario). El criterio `num_turns > 1`
invalidaría retroactivamente las tres PASS. `num_turns` no discrimina en este setup
(vale 1 tanto en válidas como en ERROR).

Clasificación de intentos C2 (todos INVALID = no deciden PASS/FAIL):

| Intento | mtime transcript | status | tokens | Motivo |
|---|---|---|---|---|
| C2-R1 attempt1 | 23:05:25 | ERROR | 0 | "high traffic" (rate-limit servidor) |
| C2-R2 attempt1 | 23:06:06 | ERROR | 0 | "high traffic" |
| C2-R1 attempt2 | 23:08:46 | ERROR | 0 | "high traffic" |
| C2-R1 attempt3 | 23:13:11 | ERROR | 0 | "high traffic" |

Archivos: `C2-R*.attempt*-INVALID.jsonl` en `/tmp/buffy-c3-transcripts/`.
**Variable hora/carga:** C3-R1..3 corrieron 22:34–22:37; intentos C2 23:05–23:13
(bajo carga del servidor). C2 quedó en 0/3 sesiones válidas.

### 5.2 Corrección: C3′ estaba VACÍO (verificado en disco hoy)

Premisa errónea en circulación: "C3′ estaba poblado y falló". Verificado 2026-09-23:
`/tmp/buffy-routing-unrelated-2` existe y está **vacío** (`ls -A` sin entradas), coherente
con el análisis forense (transcript C3′: `ls -A` → stdout vacío). **La hipótesis
poblado-vs-vacío NO está refutada** por C3′: C3′ replica C2, no C3.

### 5.3 ⚠️ Diferencia: réplicas C3-R vs C3 histórico (NO byte-idénticas)

| Archivo | C3 original (en disco) | Réplicas C3-R1..3 | Delta |
|---|---|---|---|
| `notes.txt` | 11 B, sha `e49c81e2…` | idéntico | 0 |
| `README.md` | **141 B**, sha `2e0d2ba3…` (párrafo tras título `\n\n`; salto tras "behaviour.") | **140 B**, sha `18887a9f…` (un solo salto tras título; espacio tras "behaviour.") | 1 B + layout |
| `src/example.py` | **128 B**, sha `d8b3479f…`: `package snippet` + tipado + `__main__` | **32 B**, sha `ed79c172…`: `def greet(): return "hello"` | contenido distinto |

Las réplicas coinciden con la **especificación dada en el enunciado**, no con los bytes
del C3 histórico. La especificación describía mal el example.py (128B) y el README (141B)
del C3 real. La sesión C3 original citó el example.py con tipado y `__main__`.

### 5.4 Diff de condiciones C3 / C3′ / C4 (fuentes primarias + disco)

| Variable | C3 (PASS) | C3′ (FAIL) | C4 (PASS selección) |
|---|---|---|---|
| Workspace | `/tmp/buffy-routing-unrelated` poblado (py) | `/tmp/buffy-routing-unrelated-2` **vacío** | `~/proyectos/independent-routing-test` poblado (Node: package.json 81B, README 88B, src/index.js 56B) |
| Prompt | verbatim = checkpoint = el de C3-R | verbatim igual (doc C3′) | en doc **elidido con "…"** — no confirmable byte a byte |
| HOME | principal | principal | `/tmp/buffy-clean-HOME-QUYy` (copia limpia, aún en disco) |
| GEMINI.md | mtime 2026-09-14 00:42, sin cambios desde antes de C3 → **constante en las 3 + hoy** | ídem | copia del HOME limpio + installer |
| mcp_config.json | mtime 2026-09-14 00:53 → **constante en las 3 + hoy** | ídem | reescrito en HOME limpio (fix `9e19bb8`) |
| Surface `mcp/buffy/` | estado a 12:19 desconocido (gap doc) | estado a 13:47 **desconocido** (gap doc) | pre-escrito por installer (358B/958B) |
| Buffy commit | `d0c49fe` v0.2.2 | `0c264ab`/`e70219c` según fuente | `9e19bb8` (installer `a54d0bd`) |
| Flags AGY | no documentados explícitamente | no documentados | `-p stream-json --add-dir …` **sin** skip-permissions |
| Permission mode | no documentado (C1 sí: always-proceed) | no documentado | `request-review` → exec denied (esperado) |

**Variables candidatas que difieren más allá del nombre de carpeta:**
1. **Poblado vs vacío** (C3 vs C3′/C2) — única diferencia conocida C3↔C3′.
2. **HOME limpio + surface pre-escrito + permission mode** (C4 vs C3).
3. **Contenido del workspace** (py vs Node) — C4 vs C3.
4. **Superficie MCP en el instante de la sesión** (C3 vs C3′) — sin snapshot (gap known).

### 5.5 Estado surface actual (read-only)

`mcp/buffy/buffy_context.json` 358B y `instructions.md` 958B — bytes iguales a los
documentados en C4; **mtime se reescribe en cada arranque de sesión AGY** (último:
23:13:07, intento C2-R1-3). GEMINI.md sha `931ed337…`, mcp_config sha `d7a15076…`
sin cambios desde 2026-09-14.

---

## 6. Resultado C2-R1/R2/R3 — 3/3 PASS en workspace vacío (2026-09-23)

Criterio de validez de §5.1 aplicado. Workspaces verificados vacíos antes y después
(`ls -A` → 0 entradas en los 3). Misma invocación, mismo prompt y misma config que C3-R.

| Réplica | Hora (mtime) | Válida (status/tokens) | Resultado | Evidencia |
|---|---|---|---|---|
| C2-R1 | 23:48:49 | SUCCESS / 44990 | **PASS** | step 3: `call_mcp_tool → ServerName:"buffy" → ToolName:"buffy_context"` (ACTIVE+DONE) |
| C2-R2 | 23:51:57 | SUCCESS / 58616 | **PASS** | misma secuencia (ACTIVE+DONE), step equivalente |
| C2-R3 | 23:53:40 | SUCCESS / 72667 | **PASS** | 2× `call_mcp_tool → buffy/buffy_context` (4 eventos ACTIVE+DONE) |

Inventario: R1 y R2 → `call_mcp_tool` ×1 + `view_file` ×1; R3 → `call_mcp_tool` ×2 +
`view_file` ×1. **0 `run_command` en las tres.**

Intentos INVALID descartados (rate-limit servidor, `status:ERROR`, 0 tokens):
C2-R1 att.1/2/3 (23:05, 23:08, 23:13) y C2-R2 att.1 (23:06) — conservados con
sufijo `.attempt*-INVALID`.

### Consecuencias (solo reproducibilidad, sin causalidad)

1. **El FAIL histórico de C2 (14 sep, n=1) no se reprodujo:** 0/3 FAIL hoy.
   La matriz queda: vacío → C2 FAIL (14 sep) + C3′ FAIL (14 sep) + **C2-R×3 PASS (23 sep)**.
2. **La hipótesis poblado-vs-vacío pierde su soporte empírico** como condición
   suficiente: workspaces vacíos hoy producen PASS tan estable como los poblados
   (6/6 poblados + 3/3 vacíos = 9/9 PASS en total el 23 sep).
3. Diferencias entre las corridas FAIL (14 sep) y PASS (23 sep) del caso vacío:
   fecha (9 días), estado de la surface MCP (mtime se reescribe por sesión; contenido
   idéntico 358B/958B), posibles cambios de AGY/modelo entre fechas, carga del servidor.
   **Ninguna aislada como variable.** El único FAIL de C2 y el de C3′ son de la misma
   fecha; los PASS, de otra. La variable candidata pasa a ser **tiempo/estado del entorno
   entre el 14 y el 23 sep**, no el contenido del workspace.
4. Contraste propuesto (1 archivo vs vacío) perdió utilidad: ya no hay FAIL en vacío
   que contrastar. Para aislar algo haría falta replicar la condición del **14 sep**
   (cómo se consigue un FAIL hoy), que es una pregunta distinta.

**Transcripts:** `/tmp/buffy-c3-transcripts/C2-R{1,2,3}.transcript.jsonl` (+ `.log`,
`.stderr` por sesión; intentos inválidos con sufijo `.attempt*-INVALID`).

---

## 7. Cierre de ronda (2026-09-23) — verificación final + conclusiones

### 7.1 Verificación read-only: ¿existía la surface `mcp/buffy/` el 14 sep?

| Evidencia | Valor | Lectura |
|---|---|---|
| `mcp/buffy/instructions.md` **birth** | **2026-09-14 00:44:15** | Surface creada 00:44 del 14 sep |
| `mcp/buffy/buffy_context.json` birth | 2026-09-23 23:53:07 | **Gap:** se recrea (delete+create) en cada sesión; la birth original quedó sobreescrita por las corridas de hoy. `instructions.md` sí sobrevive in-place (birth antiguo, ctime/mtime por sesión) |
| Workspace C2 `/tmp/buffy-routing-test` birth | 2026-09-14 **00:48:26** | 4 min **después** de la surface |
| Sesión C3 | 2026-09-14 **12:19:37** (`dc241f61`, 15:19:37Z) | ~11.5 h después de la surface |
| Workspace+sesión C3′ | 2026-09-14 **13:46:58 / 13:47:20** | ~13 h después de la surface |
| Surface en HOME limpio (C4) birth | 2026-09-14 16:44–16:45 | Copia del installer de C4, posterior a todo |
| `mcp_config.json` ctime | 2026-09-14 00:53:53 (sin cambios desde) | Antes de C3 y C3′; ~5 min tras el mkdir de C2 |
| `GEMINI.md` ctime | 2026-09-14 00:42:42 (sin cambios desde) | Antes de las tres |

**Resultado: la variable candidata "la surface no existía durante los FAIL" queda
REFUTADA para C3 y C3′, e indeterminada-but-improbable para C2.** `instructions.md`
nació 00:44:15, antes que el workspace de C2 (00:48), la sesión de C3 (12:19) y C3′
(13:47). Único gap residual: la birth original de `buffy_context.json` (recreado por
sesión) y la hora exacta de la sesión C2 (solo se conoce la del mkdir; history.jsonl no
conserva entradas del 14 sep). Ni lo uno ni lo otro abre una variable nueva — lo cierra.

### 7.2 Conclusiones de cierre

1. **Selección de `buffy_context` estable hoy: 9/9 PASS** (6 poblados + 3 vacíos),
   AGY 1.1.19, GPT-OSS 120B Medium, prompt de análisis de entorno. Vacío vs poblado
   no mostró efecto en la selección.
2. **Los dos FAIL (C2 y C3′, ambos 14 sep) no se reprodujeron** (0/2 al replicar:
   3/3 PASS en vacío). No hay variable aislada: la diferencia de fecha/estado del
   entorno entre el 14 y el 23 sep es la única candidata restante y no está
   descompuesta. Contraste 2/5 (14 sep) vs 0/9 (23 sep): C(5,2)/C(14,2) ≈ 11% —
   **no distinguible del ruido** con estos n. El cálculo previo "5 vs 2, p≈5%" era
   post hoc y no controlaba fecha; queda descartado.
3. **Alcance:** solo mide *selección* (llamada efectiva vía `call_mcp_tool`), con un
   solo CLI (AGY 1.1.19), un solo modelo (GPT-OSS 120B Medium) y un prompt de análisis
   de entorno. No cubre uso correcto del resultado, tareas de código, ni otros modelos.
4. **Implicación:** ni un contrato global de discovery ni RAG tienen respaldo
   empírico de esta ronda — no hay fallo de selección observable hoy que resolver.
   Si se retoma, con otro modelo o con tareas donde la selección sea menos obvia,
   no reproduciendo el 14 sep.

**Estado final:** repo `e438f29`, sin cambios de código. Cero modificaciones a Buffy,
MCP config, GEMINI.md, workspaces ni superficie más allá del re-write por sesión que
AGY ya hace siempre (bit-identical, 358B/958B). Sin RAG, sin fixes de routing, sin
cambios de configuración. Transcripts de las 6 sesiones válidas + 4 intentos INVALID
conservados en `/tmp/buffy-c3-transcripts/` y copiados a `~/docs/experiments/`
(§8).

---

## 8. Evidencia persistida (2026-09-23)

- **Copia canónica:** `~/docs/experiments/2026-09-23-c3r-transcripts/` — 30 archivos
  (6 sesiones válidas + 4 intentos INVALID + logs/ stderr/ launchers).
- **Integridad:** `SHA256SUMS` (30 entradas) — `sha256sum -c` → 30/30 coincidentes
  (verificado tras la copia; locale ES muestra "La suma coincide").
- El original en `/tmp/buffy-c3-transcripts/` es efímero; ante duda, usar la copia de
  `~/docs/experiments/` y revalidar con `sha256sum -c SHA256SUMS`.