# C5-B — Dependencia de task en el routing de `buffy_context` (AGY)

**Tipo:** checkpoint documental de protocolo **pre-registrado**. Sin cambios de código.
**Fecha de registro:** 2026-09-25 (diseño congelado antes de ejecutar).
**Estado:** PROTOCOLO — ejecución y resultados en `C5B-RESULT-2026-09-25.md` (a crear post-ejecución).

---

## 0. Justificación y alcance

La ronda C3-R/C2-R (23-sep, `1c975f0`) midió selección de `buffy_context` bajo **un solo
prompt** (análisis de entorno): 9/9 PASS. Sus límites declarados (§7.2.3-4 de
`AGY-BUFFY-ROUTING-C3R-RESULT-2026-09-23.md`): no cubre tareas de código; disparador de
reapertura legítimo = tareas donde la selección sea menos obvia.

C5-B ataca ese eje: **variación de task con workspace fijo poblado**. No re-mide el techo
ya medido; prueba la única condición nunca variada.

- **H0 (robustez):** la selección de `buffy_context` es independiente del tipo de task.
- **H1 (dependencia):** la selección depende del task — en una tarea de código, el modelo
  enruta directo a herramientas de archivo sin consultar estado del sistema.

Cualquier resultado es informativo. H1 confirmada = el contrato "llamar buffy_context
primero" no es robusto entre tipos de task → disparador real de reapertura (§7.2.4).

---

## 1. Condiciones (2 tasks × workspace fijo × N=3)

| | T1 (control, réplica C3-R) | T2 (tratamiento) |
|---|---|---|
| Task | Análisis de entorno | Comprensión/revisión de código |
| Prompt | Verbatim checkpoint `0c264ab` (§3) | Verbatim §3 (nuevo, paralelo en estructura) |
| Workspace | Poblado canónico (§2), propio por réplica | Ídem |
| Todo lo demás | Idéntico: agy 1.1.19, GPT-OSS 120B Medium, GEMINI.md `931ed337…`, mcp_config `d7a15076…`, surface `mcp/buffy/` (contenido 958B/358B, reescrito por sesión), binario buffy global v0.2.2, flags AGY (§4) | ídem |

Variables fijadas por diseño: mismo workspace-plantilla, mismo modelo, mismo CLI, misma
config, misma ventana temporal de ejecución (las 6 sesiones la misma tarde).

## 2. Workspace poblado canónico

Plantilla (por spec de C3-R, §1 del doc 23-sep — **NO byte-idéntica al C3 histórico del
14-sep**, cuya limitación ya documentó §5.3 del mismo doc; C3-R1..3 operó igual):

```
README.md    ← "# unrelated-project\n\nThis is an independent sample project used to test agent behaviour. It has no connection to any system tooling project.\n" (141 B objetivo, sha 2e0d2ba3… histórico)
notes.txt    ← "alpha\nbeta\n" (11 B, sha e49c81e2… histórico)
src/example.py ← función greet() (spec: contenido razonable con def greet; el texto exacto de 128 B del original es irrecuperable)
```

Instancias: `/tmp/buffy-c5b-{t1r1,t1r2,t1r3,t2r1,t2r2,t2r3}` — clonadas de la plantilla,
shas registrados en el RESULT antes de la primera sesión. Cero menciones a Buffy/MCP/tools
en el contenido.

## 3. Prompts (verbatim)

**P1 — T1 (control, = checkpoint `0c264ab`):**
```
Analiza brevemente el entorno actual de esta máquina para determinar plataforma, CPU, GPU, memoria disponible y herramientas relevantes instaladas. Usa las herramientas disponibles y basa las conclusiones en datos observados.
```

**P2 — T2 (código):**
```
Revisa brevemente el código de este workspace (src/example.py) y determina qué fallas o casos límite tiene la función greet. Usa las herramientas disponibles y basa tus conclusiones en el código observado.
```

Ambos: misma longitud de orden, misma cláusula de herramientas, cero menciones a
Buffy/MCP/system-state en P2. P2 NO pide modificar archivos (solo determina/describe) —
la sesión debe ser de lectura; si T2 edita archivos se registra como desviación.

## 4. Invocación (idéntica a C3-R/C2-R)

```bash
cd /tmp/buffy-c5b-<id>
agy --print="$PROMPT" --output-format stream-json --dangerously-skip-permissions \
    --log-file /tmp/buffy-c5b-transcripts/C5B-<id>.log \
    > /tmp/buffy-c5b-transcripts/C5B-<id>.transcript.jsonl \
    2> /tmp/buffy-c5b-transcripts/C5B-<id>.stderr
```

Sintaxis exacta de flags a validar con `agy --help` en preflight antes de la primera
sesión (las citas de C3-R usan esa forma; si difiere, se registra la usada).

## 5. Criterio de validez de sesión (= §5.1 del doc 23-sep, pre-registrado)

Cuenta PASS/FAIL solo si: `result.status ≠ "ERROR"` **y** `result.total_tokens > 0`.
Rate-limit / ERROR / 0 tokens → intento INVALID: retry, transcript con sufijo
`.attempt*-INVALID`, conservado. Máx 3 intentos por réplica antes de STOP y reporte.

## 6. Métrica (pre-registrada)

- **Primaria (presencia):** `call_mcp_tool → ServerName:"buffy" → ToolName:"buffy_context"` presente en sesión válida (cualquier posición).
- **Secundaria (posición):** si es la primera tool efectiva (comparación directa con C3-R, donde lo era en step 3) o aparece después de tool(s) de archivo.
- **Inventario:** secuencia completa de tools por sesión; destino de cada `view_file` (workspace vs brain file de AGY — en C3-R1 el view_file apuntaba al brain, no al workspace).
- **Falsabilidad:** T2 con 0/3 presencia → H1 confirmada (selección task-dependiente). T2 con 3/3 → H0 sostenida en este par de tasks. 1-2/3 → inconclusivo: extender T2 a N=5 ANTES de concluir (pre-registrado).
- **Predicción registrada (pre-ejecución):** se anticipa H1 como más probable (la task de código no necesita estado del sistema), sin descartar H0 si el modelo trata la instrucción de GEMINI.md como incondicional. Ambos resultados se reportan igual.

## 7. Preflight (bloqueante)

1. `agy --help` → validar flags de §4.
2. Probe de disponibilidad: T1-R1 es a la vez probe; si ≥2 réplicas consecutivas caen en rate-limit (como C2 el 23-sep ~23:05), STOP y reprogramar — no quemar las 6 sesiones en ventana de congestión.
3. Verificación read-only pre-run: shas de GEMINI.md, mcp_config, contenido de surface; workspaces clonados y shas registrados.

## 8. Alcance y contención

- Read-mostly: ninguna sesión debe modificar Buffy, MCP config, GEMINI.md, repos.
- Únicos writes permitidos: workspaces `/tmp/buffy-c5b-*` (y solo si una sesión T2 se desvía a editar — se registra, no se bloquea a posteriori) y `/tmp/buffy-c5b-transcripts/`.
- Persistencia: transcripts → `~/docs/experiments/2026-09-25-c5b-transcripts/` + `SHA256SUMS` (misma disciplina que el 23-sep). `/tmp` es efímero.
- Resultado: `C5B-RESULT-2026-09-25.md` en este directorio, con log de ejecución, tabla de resultados, inventarios y clasificación H0/H1. Commits separados: protocolo (este) → ejecución → resultado.

## 9. Registro de desviaciones

Toda desviación del protocolo (flags distintos, retry extra, desvío de T2 a edición de
archivos, caída de servicio) se registra en el RESULT con timestamp. Desviación no
registrada = invalidación de la réplica.
