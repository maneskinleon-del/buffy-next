# HANDOFF ↔ BUFFY — INTEGRATION PROBE

**Fecha:** 2026-08-30 (original) · 2026-08-30 (actualizado post-P5c)
**Estado:** INVESTIGACIÓN COMPLETADA — resultados observados
**Entorno:** Freebuff (mimo/mimo-v2.5), EndeavourOS, bspwm
**Restricciones:** Sin modificaciones de código. Solo lectura.

---

## 1. Pregunta

¿Un handoff real producido por la skill `handoff` llega efectivamente a una sesión nueva y queda disponible como contexto para el agente?

## 2. Entorno / Harness

| Item | Valor | Fuente |
|---|---|---|
| Harness | Freebuff (mimo/mimo-v2.5) | System prompt + `~/.config/manicode/freebuff` |
| Handoff skill | Instalada en 2 ubicaciones | `ls` output |
| Config handoff | Defaults (no config file) | `config_loader.load_config()` output |
| SessionStart hook | **No existe en Freebuff** | Ver P0 |
| Save location default | `/tmp/handoff-*.md` | Config default: `mode=temp` |

## 3. Procedimiento

### P0 — Baseline

**Registrado:**

| Check | Resultado | Evidencia |
|---|---|---|
| Handoff skill instalada | ✅ `~/.agents/skills/handoff/` + `~/buffy-context/.agents/skills/handoff/` | `ls -la` output |
| Scripts presentes | ✅ 7 Python scripts | `ls` output |
| Config global | ❌ No existe `~/.config/handoff/config.json` | `cat` failed |
| Config proyecto | ❌ No existe `.handoff/config.json` | `cat` failed |
| SessionStart hook | ❌ No existe `hooks.json` ni `hooks/` directorio | `ls` output |
| Freebuff hooks config | ❌ `~/.config/manicode/settings.json` no tiene sección hooks | `cat` output |
| Handoffs existentes | ❌ Ninguno encontrado en `/tmp`, `~/handoffs`, `~/.handoff` | `find` output |

**OBSERVED:** Freebuff no tiene infraestructura de SessionStart hooks. La skill `handoff` describe hooks (`hooks/session_start.py`, `hooks/hooks.json`) que no existen en disco.

### P1 — Crear handoff real

**Acción:** Generado handoff con `handoff_template_generator.py --goal "..." --print-path-only`, contenido escrito manualmente con marcador `HANDOFF_PROBE_ID=alpha-7f3c`.

**Registrado:**

| Campo | Valor |
|---|---|
| Ruta | `/tmp/handoff-seznd5ym.md` |
| Timestamp | `2026-08-30T03:00:00Z` (en frontmatter) |
| Marcador | `HANDOFF_PROBE_ID=alpha-7f3c` |
| Redaction linter | PASS (exit 0, "no findings") |
| Config usada | Defaults: `mode=temp`, `retention=7`, `redaction=strict` |

**OBSERVED:** El handoff se creó correctamente en `/tmp/handoff-seznd5ym.md`. La skill produce Markdown válido con frontmatter YAML y 5 secciones (Goal, State, Decisions, Skills, Artifacts).

### P2 — Iniciar sesión nueva

**Limitación:** No es posible iniciar una nueva sesión de Freebuff desde dentro de esta sesión. El harness no expone un comando para crear sesiones independientes.

**Acción alternativa:** Verificar mecanicamente si Freebuff tiene algún mecanismo que auto-cargue handoffs al inicio.

**Registrado:**

| Check | Resultado | Evidencia |
|---|---|---|
| Freebuff settings.json tiene hooks | ❌ Solo: `mode`, `adsEnabled`, `freebuffModel`, `hasSubmittedFirstPrompt` | `cat` output |
| ~/.AGENTS.md menciona SessionStart | ❌ Solo menciona CONTINUE.md como "handoff entre sesiones" | `grep` output |
| ~/.AGENTS.md menciona handoff skill | ❌ No | `grep` output |
| Claude Code tiene hooks | ✅ `UserPromptSubmit` para codegraph | `~/.claude/settings.json` |
| Message history menciona handoff | ❌ 0/1000 entradas mencionan "handoff", "sessionstart", "hook", o "alpha-7f3c" | Python scan output |

**OBSERVED:** Freebuff no tiene mecanismo de auto-carga de handoffs al inicio de sesión. No existe SessionStart hook ni equivalente.

### P3 — Capturar trace

**Limitación:** No se puede ejecutar P2, por lo tanto no hay trace de sesión nueva.

**Evidencia indirecta reunida:**

1. La skill `handoff` en SKILL.md (línea 105-107) describe:
   > "When the plugin is installed, a `SessionStart` hook scans the configured save location..."
   
   Esto asume "the plugin is installed" — la skill fue diseñada para el ecosistema de Claude Code plugins, no para Freebuff.

2. La `configuration.md` (línea 114) describe:
   > "The SessionStart hook (`hooks/session_start.py`) is wired via `hooks/hooks.json`."
   
   No existe `hooks/` directorio en la skill. El hook está descrito pero no implementado como archivo.

3. Freebuff no tiene `hooks.json` ni mecanismo equivalente en su configuración.

**OBSERVED:** El SessionStart hook descrito en la skill handoff no tiene implementación en disco. No se encontró `hooks/session_start.py` ni `hooks/hooks.json` en ninguna ubicación.

### P4 — Verificación independiente

No se puede completar P4 sin P2/P3. No hay trace de sesión nueva que analizar.

**Clasificación parcial de lo que SÍ se puede verificar:**

| Claim | Evidencia mecánica | Estado |
|---|---|---|
| "El handoff se creó" | `ls -la /tmp/handoff-seznd5ym.md` + `cat` output | ✅ VERIFIED |
| "El marcador está en el handoff" | `grep HANDOFF_PROBE_ID` output | ✅ VERIFIED |
| "El handoff pasa redacción" | `redaction_linter.py` exit 0 | ✅ VERIFIED |
| "SessionStart hook existe en Freebuff" | `ls` + `cat` output: no hooks.json, no hooks/ dir | ❌ NOT_TRUE |
| "El handoff llega a la sesión nueva" | No hay trace de sesión nueva | ❌ NOT_ESTABLISHED |
| "Freebuff auto-carga handoffs" | No hay mecanismo en settings ni AGENTS.md | ❌ NOT_ESTABLISHED |

### P5 — Buffy Context

**Acciones ejecutadas:**

#### P5a: ¿Puede buffy-source.sh leer el handoff?

```bash
bash ~/buffy-context/scripts/buffy-source.sh --resolve node --repo ~/buffy-context --no-live
# Output: ✅ node → 26.7.0 [facts]
```

**OBSERVED:** buffy-source.sh resolvió `node` desde `facts.yaml` (nivel 2), no desde el handoff. buffy-source.sh NO busca archivos en `/tmp/handoff-*.md`. Solo busca en `SNAPSHOT.md`, `CONTINUE.md`, `facts.yaml`, `INFO-core.md`.

**OBSERVED:** buffy-source.sh tiene `KNOWN_FACTS="os kernel wm rice shell locale git node npm python3 codegraph cargo rustc adb fastboot gh vercel uv"`. El handoff no contiene ninguno de estos hechos. El handoff contiene `Branch: master` y `Last commit: 5862065c0` que son parseables por `md_value()`, pero no son KNOWN_FACTS.

**NOT_ESTABLISHED:** buffy-source.sh no fue modificado para buscar handoffs. No se testió si una integración futura funcionaría (no era el objetivo de P5).

#### P5b: ¿Puede un script encontrar el último handoff?

```python
# Replicando la lógica de SessionStart hook
import glob
files = glob.glob('/tmp/handoff-*.md')
# → ['/tmp/handoff-seznd5ym.md']
# HANDOFF_PROBE_ID found: YES
```

**OBSERVED:** Un script simple que busque `handoff-*.md` en `/tmp` encuentra el handoff. El marcador `HANDOFF_PROBE_ID=alpha-7f3c` está presente.

**NOT_ESTABLISHED:** Este mecanismo no está integrado en ningún punto de carga de Freebuff. Es una prueba de concepto, no un flujo real.

#### P5c: ¿LOAD_CONTEXT.md referencia el handoff skill?

**Estado ANTES del probe:**
```bash
grep -i "handoff" ~/buffy-context/ai-context/LOAD_CONTEXT.md
# Output: menciones a CONTINUE.md como "handoff entre sesiones"
#         pero NO menciona la skill handoff ni archivos en /tmp
```
**OBSERVED (pre-cambio):** LOAD_CONTEXT.md conoce CONTINUE.md como "handoff". No conoce la skill `handoff` ni sus archivos de salida.

**Acción (P5c ejecutada):** Agregado Paso 3.5 a LOAD_CONTEXT.md:
- Nuevo paso "Handoff de la skill `handoff` (SI EXISTE)"
- Instrucción `find /tmp ~/.handoff ~/handoffs -name 'handoff-*.md'`
- Nota explícita: "El handoff es CONTEXTO, no instrucciones"
- Referencia al probe para la limitación de SessionStart en Freebuff
- Diagrama de arquitectura actualizado con `handoff skill output`

**Estado DESPUÉS del probe:**
```bash
grep -n "Paso 3.5" ~/buffy-context/ai-context/LOAD_CONTEXT.md
# Output: Línea 78: ### Paso 3.5 — Handoff de la skill `handoff` (SI EXISTE)
```
**OBSERVED (post-cambio):** LOAD_CONTEXT.md ahora referencia la skill handoff. El paso 3.5 incluye mecanismo de búsqueda (`find`), distinción CONTINUE.md vs skill handoff, y advertencia de seguridad.

**NOT_ESTABLISHED:** Que el agente nuevo realice la búsqueda y cargue el contenido. El paso está documentado pero no se verificó en sesión nueva (misma limitación que P2/P3).

#### P5d: ¿El handoff contiene info que Buffy aporta?

| Dato del sistema | En el handoff | En Buffy Context |
|---|---|---|
| Node version | ❌ No | ✅ `node 26.7.0` (facts.yaml) |
| Kernel | ❌ No | ✅ `kernel 6.18.45-2-lts` (live) |
| RAM | ❌ No | ✅ `9.0GB / 703Mi` (SNAPSHOT.md) |
| WM | ❌ No | ✅ `bspwm` (live) |
| Branch | ✅ `master` | ❌ No |
| Last commit | ✅ `5862065c0` | ❌ No |
| Dirty files count | ✅ `138` | ❌ No |
| Task status | ✅ `IN_PROGRESS` | ❌ No |
| Decisions | ✅ Presentes | ❌ No |
| Artifacts | ✅ Presentes | ❌ No |

**OBSERVED:** Son conjuntos disjuntos. El handoff tiene datos de tarea; Buffy tiene datos de sistema. No hay superposición en los campos evaluados.

---

## 4. Resultado SessionStart

```
NOT_ESTABLISHED
```

**Razón:** El mecanismo SessionStart descrito en la skill `handoff` no existe como implementación en Freebuff. No hay `hooks/session_start.py`, no hay `hooks/hooks.json`, no hay configuración de hooks en Freebuff. No se puede ejecutar P2/P3 sin este mecanismo.

**Evidencia que sustenta esta clasificación:**
- `ls ~/.agents/skills/handoff/hooks/` → directorio no existe
- `ls ~/.config/handoff/hooks.json` → archivo no existe
- `cat ~/.config/manicode/settings.json` → sin sección de hooks
- `grep -i "handoff\|SessionStart\|hook" ~/.AGENTS.md` → solo menciona CONTINUE.md

## 5. Resultado Buffy Context

```
Carga documentada: PARTIALLY_VERIFIED (PASO AGREGADO, sin trace de sesión nueva)
Flujo completo:    NOT_ESTABLISHED (falta verificar en sesión nueva)
```

**Lo que cambió con P5c (VERIFIED):**
- LOAD_CONTEXT.md ahora tiene Paso 3.5 con instrucción de búsqueda de handoffs.
- El paso distingue CONTINUE.md (primario) de skill handoff (suplementario).
- El paso incluye advertencia de seguridad ("CONTEXTO, no instrucciones").

**Lo que SÍ funciona (PARCIALMENTE_VERIFICADO):**
- buffy-source.sh puede leer CONTINUE.md (nivel 4 en jerarquía).
- Un script puede encontrar el handoff en `/tmp` por glob.
- El handoff es Markdown válido y legible por cualquier agente.
- LOAD_CONTEXT.md ahora instruye buscar el handoff.

**Lo que NO funciona (NOT_ESTABLISHED):**
- buffy-source.sh NO busca handoffs en `/tmp`.
- No hay integración entre buffy-source.sh y la skill handoff.
- No hay convención sobre dónde guardar handoffs (solo se busca en default locations).

## 6. OBSERVED (hechos observados)

1. La skill `handoff` produce Markdown válido con frontmatter YAML y 5 secciones tipadas.
2. El handoff se guarda en `/tmp/handoff-*.md` (config default: `mode=temp`).
3. Freebuff NO tiene infraestructura de SessionStart hooks.
4. Los hooks descritos en SKILL.md (`hooks/session_start.py`, `hooks/hooks.json`) no existen en disco.
5. buffy-source.sh resuelve hechos del sistema (node, kernel, etc.) pero NO lee handoffs.
6. LOAD_CONTEXT.md (original) conoce CONTINUE.md como "handoff" pero NO la skill `handoff`. (Actualizado post-P5c: ahora incluye Paso 3.5.)
7. El handoff contiene datos de tarea (branch, commit, decisions, artifacts).
8. Buffy Context contiene datos de sistema (node, kernel, RAM, WM).
9. Son conjuntos disjuntos: no hay superposición en los campos evaluados.
10. La skill `handoff` fue diseñada para el ecosistema de Claude Code plugins, no para Freebuff.

## 7. VERIFIED (claim → trace → evidencia observable)

| Claim | Trace | Evidencia |
|---|---|---|
| El handoff se creó en `/tmp` | `ls -la /tmp/handoff-seznd5ym.md` | `-rw------- 1 mangonz mangonz 1566 ago 29 22:55 /tmp/handoff-seznd5ym.md` |
| El marcador está presente | `grep HANDOFF_PROBE_ID /tmp/handoff-seznd5ym.md` | `HANDOFF_PROBE_ID=alpha-7f3c` |
| Redacción pasó | `redaction_linter.py /tmp/handoff-seznd5ym.md` → exit 0 | `OK: no findings in /tmp/handoff-seznd5ym.md.` |
| Freebuff no tiene hooks | `cat ~/.config/manicode/settings.json` | Solo `mode`, `adsEnabled`, `freebuffModel`, `hasSubmittedFirstPrompt` |
| No hay hooks.json | `ls ~/.config/handoff/hooks.json` | No such file or directory |
| No hay hooks/ dir | `ls ~/.agents/skills/handoff/hooks/` | No such file or directory |
| buffy-source.sh no lee handoffs | `buffy-source.sh --resolve node --repo ~/buffy-context --no-live` | Resolvió desde `facts.yaml`, no desde handoff |

## 8. PARTIALLY_VERIFIED

| Claim | Evidencia parcial | Lo que falta |
|---|---|---|
| "Un script puede encontrar el handoff" | `glob('/tmp/handoff-*.md')` → 1 archivo, HANDOFF_PROBE_ID found | Falta integrar en punto de carga real |
| "El handoff es legible por agentes" | Markdown válido, 5 secciones, frontmatter YAML | Falta verificar en sesión nueva |
| "Buffy y handoff son complementarios" | Campos disjuntos verificados | Falta verificar en flujo real |

## 9. NOT_ESTABLISHED

| Claim | Razón |
|---|---|
| "El handoff llega a la sesión nueva" | No se puede iniciar sesión nueva desde esta sesión |
| "Freebuff auto-carga handoffs" | No hay mecanismo en settings ni AGENTS.md |
| "SessionStart hook funciona" | Hook no existe como implementación |
| "El agente ejecuta el paso 3.5 en sesión nueva" | No se puede verificar sin sesión nueva (misma limitación que P2) |
| "buffy-source.sh puede integrar handoffs" | buffy-source.sh no fue modificado; no se testió |

## 10. Cadena de invocación: ¿LOAD_CONTEXT.md es activa o lazy?

**Pregunta:** ¿Qué invoca `LOAD_CONTEXT.md` al inicio de sesión de Freebuff, y ese invocador es activo o lazy?

**Evidencia (VERIFIED):**

| Capa | Mecanismo | Tipo | Evidencia |
|---|---|---|---|
| **Freebuff** → AGENTS.md | Freebuff inyecta `~/.AGENTS.md` en `<project_instructions>` del system prompt | **ACTIVO** (automático) | El system prompt de esta sesión contiene el contenido completo de `~/.AGENTS.md` en `<project_instructions>`. El archivo está en `changed_file_paths` al inicio de la conversación. |
| **AGENTS.md** → LOAD_CONTEXT.md | Línea 14: "Carga condicional: usar el protocolo de `~/buffy-context/ai-context/LOAD_CONTEXT.md`" | **ACTIVO** (instrucción en regla inyectada) | `grep` output: línea 14 de `~/.AGENTS.md`. |
| **LOAD_CONTEXT.md** → Handoff | Paso 3.5: "find /tmp ~/.handoff ~/handoffs -name 'handoff-*.md'" | **LAZY** (requiere que el agente ejecute) | str_replace verificado en LOAD_CONTEXT.md línea 78. |

**Cadena completa:**
```text
Freebuff (runtime)
  ↓ inyecta automáticamente
~/.AGENTS.md (en <project_instructions>)
  ↓ instruye "usar el protocolo de LOAD_CONTEXT.md"
ai-context/LOAD_CONTEXT.md (agente lo lee)
  ↓ instruye "find /tmp ~/.handoff ~/handoffs -name handoff-*.md"
Handoff de la skill (agente lo encuentra)
```

**Análisis:**
- Capa 1 (Freebuff → AGENTS.md): **ACTIVA** — el runtime la ejecuta automáticamente.
- Capa 2 (AGENTS.md → LOAD_CONTEXT.md): **ACTIVA como instrucción** — está en reglas inyectadas en el system prompt. El agente DEBE seguirla (es una instrucción, no una sugerencia).
- Capa 3 (LOAD_CONTEXT.md → Handoff): **LAZY** — el agente debe decidir ejecutar el `find`. Pero esta decisión está respaldada por las dos capas anteriores.

**Comparación con T3/Agy (NO HACER — predicción, no hallazgo):**

En T3 la skill era `lazy_skill` (solo nombre+description). En T4, la regla en AGENTS.md mejoró 2c pero no 2d. No hay garantía de que una cadena más larga (Freebuff→AGENTS.md→LOAD_CONTEXT.md→find) sea más efectiva — podría ser al revés: más saltos = más superficie para que el agente se detenga antes del último paso. Esta comparación se deja SIN RESOLVER hasta tener el dato de la sesión nueva.

**Lo que falta:** La prueba real requiere ver en el trace que el agente ejecuta el comando `find` por iniciativa propia como parte de orientarse, no porque se le preguntó sobre el mecanismo. Si la primera sesión nueva es una pregunta directa ("¿encontraste un handoff?"), eso mide 2c, no 2d.

**Clasificación de esta cadena:** PARTIALLY_VERIFIED (capas 1-2 VERIFIED para n=1; capa 3 PARTIALLY_VERIFIED por documentación pero sin trace de ejecución).

---

## 11. Limitaciones

1. **No se puede iniciar una sesión nueva de Freebuff** desde dentro de esta sesión. P2/P3 requieren un harness que soporte creación de sesiones independientes.
2. **El SessionStart hook no existe** en Freebuff. Fue diseñado para Claude Code plugins. No hay infraestructura que lo ejecute.
3. **La configuración del handoff usa defaults** (`mode=temp`). No se testió con `mode=project` (que guardaría en `ai-context/handoffs/`).
4. **El handoff producido es un probe**, no un handoff real de trabajo. Un handoff real podría tener diferente estructura.
5. **P5c ejecutada**: LOAD_CONTEXT.md actualizado con Paso 3.5. Falta verificar en sesión nueva.

## 12. Diseño de la sesión nueva (corregido)

**Error a evitar:** Medir 2c (reconocimiento en pregunta directa) cuando lo que importa es 2d (comportamiento en tarea real). Mismo patrón que T3/Agy.

**Diseño de la prueba:**

1. **Crear handoff con ID nuevo** (`beta-9e2a`) — no reusar `alpha-7f3c` (ya "gastado" en esta conversación).
2. **El handoff debe describir una tarea creíble** que el agente pueda querer continuar.
3. **La sesión nueva recibe una tarea concreta que NO menciona handoff, protocolo de carga, ni sesión anterior.** La tarea debe ser específica y acotada para que el agente necesite orientarse antes de actuar — no vaga ("mirá qué hay pendiente") porque eso tiene salidas baratas (git status, grep TODO) que no pasan por la cadena de invocación.

**Prompt de corrida 1:**
```
Aplicá el fix pendiente en buffy-next: el error de tipos en context.ts
donde hwField() puede recibir un string vacío.
```

**Prompt de corrida 2** (genuinamente distinto, misma restricción de no nombrar archivos de la cadena bajo prueba):
```
Revisá el estado del experimento agy-routing y decime si falta algo
para cerrarlo.
```

Los dos prompts son concretos pero distintos en dominio (fix de código vs revisión de doc). Un PASS en ambas es evidencia de n=2 real, no del mismo prompt corriendo dos veces.

4. **Criterio de éxito para 2d:** el trace del agente muestra:
   - Ejecución de `find /tmp ~/.handoff ~/handoffs -name 'handoff-*.md'` (o equivalente), **O**
   - Lectura explícita del archivo de handoff, **O**
   - Mención de `HANDOFF_PROBE_ID=beta-9e2a` **acompañada de** evidencia de que el agente buscó el archivo (no solo lo mencionó).
5. **Near-miss como dato:** registrar la posición del `find` en la secuencia del trace (paso 1, 2, 3, etc.) y las acciones antes de él. Un `find` como primer paso de orientación es más fuerte que uno después de 4 acciones no relacionadas.
6. **Si solo hay pregunta directa** ("¿encontraste algo de la sesión anterior?"), marcar como equivalente a 2c, no como resolución de fila 3.
7. **Si el agente orienta por git status / grep TODO** sin llegar al `find`, registrar como "fuente de orientación más barata encontrada" — no es 2d FAIL ni 2d PASS, es un resultado distinto.

**Corrección a Capa 1:** VERIFIED para n=1. Freebuff podría truncar `project_instructions` en proyectos con AGENTS.md más largos. Dejar como VERIFIED (n=1) hasta segunda sesión que confirme.

**Corrección sobre comparación con T3:** La frase "más fuerte que T3" es una predicción, no un hallazgo. En T4 la regla en AGENTS.md mejoró 2c pero no 2d. No hay garantía de que una cadena más larga (Freebuff→AGENTS.md→LOAD_CONTEXT.md→find) sea más efectiva — podría ser al revés: más saltos = más superficie para que el agente se detenga antes del último paso. Sacar del resumen hasta tener el dato.

## 13. Siguientes Pruebas Recomendadas

| # | Prueba | Prompt | Harness | Estado |
|---|---|---|---|---|
| 1 | **Corrida 1** — fix en context.ts | "Aplicá el fix pendiente en buffy-next: el error de tipos en context.ts donde hwField() puede recibir un string vacío." | Freebuff (nueva ventana) | PENDIENTE |
| 2 | **Corrida 2** — revisión test file | "Revisá tests/agent-contract.test.ts en buffy-next: ¿el test está completo y correcto o falta algo?" | Freebuff (nueva ventana) | PENDIENTE |
| 3 | ~~**LOAD_CONTEXT.md + handoff**~~ | — | ~~Cualquier harness~~ | **EJECUTADA** — paso agregado |
| 4 | **Claude Code SessionStart** | — | Claude Code | pendiente |
| 5 | **Config mode=project** | — | Cualquier harness | pendiente |

---

## 13b. Corrección de mapping de repos (2026-08-30)

Durante la preparación de las corridas se descubrió una ambigüedad en el naming de "Buffy Context" dentro de esta sesión:

| Entidad | Repo real | Remote |
|---|---|---|
| `ai-context/` (LOAD_CONTEXT.md, INFO-core.md, buffy-source.sh, etc.) | **`buffy-context`** | `github.com/maneskinleon-del/buffy-context` |
| `agy-routing-experiment/` | **repo propio** | `github.com/maneskinleon-del/agy-routing-experiment` |
| `buffy-next/` (código, docs/, tests/) | **`buffy-next`** | `github.com/maneskinleon-del/buffy-next` |

**Detalle:**
- `~/ai-context` es un symlink → `~/buffy-context/ai-context/` (creado 2026-08-02).
- `~/buffy-next/` NO tiene directorio `ai-context/`.
- `~/buffy-context/scripts/buffy-source.sh` es el script real; `~/.local/bin/buffy-source.sh` es el symlink en PATH.
- `DESIGN-AGENT-HANDOFF.md` está correctamente en `buffy-next/docs/` (commit `43e8809`). Sus referencias a `buffy-source.sh` y `ai-context/` ya apuntan correctamente a `buffy-context` (línea 945: `buffy-context/scripts/buffy-source.sh`).

**Impacto en corridas:** La cadena `AGENTS.md → LOAD_CONTEXT.md → find handoff` se verifica en `buffy-context` (vía symlink `~/ai-context`). Las corridas de Freebuff usan `~/.AGENTS.md` (global) que resuelve a `buffy-context`. No hay conflicto de repo para las corridas planificadas.

**Corrección de corrida 2:** El prompt original apuntaba al agy-routing-experiment (repo separado, experimento ya completado → salida barata). Se reemplazó por una revisión de `tests/agent-contract.test.ts` en `buffy-next` — archivo nuevo sin trackear, verificable ahora.

**Ambigüedad de `context.ts`:** El prompt de corrida 1 describe un fix en `context.ts` con tipos como `HardwareField`, `hwField`, `freshness`, `observedAt`. Estos términos aparecen también en los documentos 3-4 de la sesión para describir el componente "Buffy Context" (que vive en `buffy-context`). Se verificó: `context.ts` NO existe en `buffy-context`; está en `buffy-next/src/core/context.ts` (commit existente). La coincidencia de vocabulario es por diseño (el componente "Buffy Context" es consumido por el código de `buffy-next`), no por confusión de repos.

**Ambas corridas en `buffy-next`:** No son "repo A vs repo B" sino dos tareas distintas dentro del mismo repo (core types fix vs test file review). Dominio distinto se refiere al tipo de trabajo (types vs testing), no al repositorio.

---

## 14. Clasificación Final

```
SessionStart hook en Freebuff:    NOT_ESTABLISHED (no existe infraestructura)
Cadena AGENTS→LOAD→handoff:      PARTIALLY_VERIFIED (capas 1-2 VERIFIED, capa 3 lazy)
Handoff llega a sesión nueva:     NOT_ESTABLISHED (no hay trace)
LOAD_CONTEXT.md referencia handoff: PARTIALLY_VERIFIED (P5c: paso agregado, sin trace)
Un script puede encontrarlo:      PARTIALLY_VERIFIED (glob funciona, sin integración)
El handoff es Markdown válido:    VERIFIED
Son complementarios (disjuntos):  OBSERVED (no verificado en flujo real)
```

**Conclusión factual:**

La comparación funcional identifica responsabilidades del handoff (datos de tarea: branch, commit, decisions, artifacts, next_actions) y responsabilidades de Buffy Context (datos de sistema: node, kernel, RAM, WM, freshness). Estos conjuntos son disjuntos según la evidencia de los campos evaluados.

La integración tiene un mecanismo documentado (Paso 3.5 en LOAD_CONTEXT.md) pero no verificado en sesión nueva. buffy-source.sh no busca handoffs. El SessionStart hook descrito en la skill no existe como implementación en Freebuff. La fila "¿El handoff llega a sesión nueva?" permanece NOT_ESTABLISHED porque no se puede iniciar sesión nueva desde este contexto.

**Actualización post-P5c:** LOAD_CONTEXT.md ahora instruye buscar handoffs de la skill `handoff`. Esto resuelve la fila 5 del probe ("LOAD_CONTEXT.md no referencia la skill handoff"). La fila 3 ("¿El handoff llega a sesión nueva?") sigue NOT_ESTABLISHED — requiere trace de sesión nueva, misma limitación que P2/P3.

---

## Pre-check gamma-3f1d (2026-08-30)

**Objetivo:** confirmar que ninguna fuente cargable contiene o permite
inferir maxRetries=6 / backoffMs=812 antes de crear el probe de
continuidad forzada.

**Comandos ejecutados:**
[los 4 grep + cat CONTINUE.md — pegar tal cual corrieron]

**OBSERVED:**
- Términos genéricos (rate limit/retries/backoff/maxRetries) presentes
  en buffy-next/docs/ y buffy-context/ai-context/ (CHANGELOG.md,
  PROJECTS.md, SESION-archive.md, MEMORY.md)
- Valores de maxRetries existentes: 3 (cliente HTTP MB$), 2 (SDK AI),
  10 (vitest coverage), 0-2 (logs de experimentos) — ninguno coincide
  con 6
- backoffMs como término literal: ausente en el proyecto
- "812": una sola ocurrencia, en node_modules/vite (código minificado,
  índice de variable ofuscada) — ruido, sin relación semántica
- CONTINUE.md revisado completo: contenido es cierre del experimento
  T0-T4 (routing Agy), sin mención de rate limiting/retries/backoff

**VERIFIED:** ninguna fuente inspeccionada contiene la combinación
maxRetries=6 + backoffMs=812, ni el nombre rateLimiter/createRateLimiter

**NOT_ESTABLISHED:**
- Si CHANGELOG.md/PROJECTS.md/SESION-archive.md son parte de la carga
  automática de LOAD_CONTEXT.md o solo referencia manual — no bloquea
  el gate (valores no coinciden igual) pero da al agente vocabulario
  general de rate limiting antes de la tarea
- grep no excluyó node_modules/ — generó ruido pero no afectó el
  veredicto

**VERDICT: PASS**

---

*Fin del probe. No se modificó código. No se hicieron commits.*
