# CONTINUE.md — Handoff buffy-next

## 2026-08-25 — Iteración 2: SessionStart portable (sin tocar buffy-next)

POC técnico aprobado + revisión aplicada. Cadena final:
`<repo>/.claude/settings.json (SessionStart) → <repo>/scripts/buffy-bootstrap.sh →
dist/cli.js doctor --context → stdout buffy.context/v1`

Cambios vs iteración 1 (revisión del usuario):
- Hook movido al **proyecto**: nuevo `buffy-next/.claude/settings.json` con
  `$CLAUDE_PROJECT_DIR/scripts/buffy-bootstrap.sh`. El settings global quedó como
  estaba (solo codegraph). Symlink ~/.local/bin eliminado.
- Script movido al repo: `buffy-next/scripts/buffy-bootstrap.sh`. Resuelve el CLI
  relativo a su propia ubicación — **cero rutas absolutas**, viaja con git clone.
- Timeout bajado 10s → **3s** (criterio acordado para SessionStart).
- Conservado: fail-open (siempre exit 0), log en `~/.buffy/sessionstart.log`, rotación 1MB.
- Verificado: camino feliz desde cwd ajeno (rc=0, JSON válido, **377ms**), fail-open
  (CLI ausente → exit 0 + SKIP), settings global revertido sin romper codegraph.

Notas de portabilidad:
- `dist/` está en .gitignore: un clone fresco entra por fail-open (SKIP con hint
  "¿falta npm run build?") hasta que se corre `npm install && npm run build`.
- **Cero cambios en `src/`**; no existe `buffy bootstrap` como subcomando.
- **Commiteado**: `a981ca9` (feat: add portable Claude Code SessionStart integration)
  — SOLO `.claude/settings.json` + `scripts/buffy-bootstrap.sh` (62 líneas). `src/`
  intacto, sin `buffy bootstrap`, cambios ajenos de experiments fuera del commit.
- **Prueba desde clone limpio** (`/tmp/buffy-clean-test`, eliminado tras la prueba):
  1. clone sin build → SKIP fail-open (ruta resuelta al clone, no al original) ✅
  2. `npm install && npm run build` → camino feliz: rc=0, 414ms, 4766 bytes,
     JSON válido ✅
  3. dist/cli.js ausente post-build → SKIP fail-open ✅ (mv reversible, restaurado)
- Baseline sellado: tag `integration-baseline` → `a981ca9`. Congelado: sin UserPromptSubmit,
  sin `buffy bootstrap`, sin telemetría, sin tocar src/.
- Fase experimental iniciada: `experiments/sessionstart-e1-DESIGN.md` (untracked) —
  pregunta: ¿aporta Buffy contexto a un agente de contexto enorme? Condiciones
  CONTROL/BUFFY sobre clones de a981ca9, 5 tareas con ground truth, sujeto en fases
  (A: Claude Code real; B: manual si A es ruidoso). Sin ejecutar aún.
- Infraestructura Fase A lista y verificada: clones `~/e1/control` (hook OFF) y
  `~/e1/buffy` (hook ON + build, prueba de humo rc=0), tareas ciegas T1–T5 en
  `experiments/sessionstart-e1/tasks/`, captura de ground truth por corrida operativa.
  Reglas metodológicas congeladas: sin score compuesto, outputs crudos intactos,
  tareas no se modifican tras ver resultados parciales, ground truth inmediatamente
  tras la respuesta final, y prohibida cualquier intervención humana durante la
  corrida (pegar la tarea textual y esperar).
- Separación de preguntas: E1 = ¿Buffy aporta a agente de contexto enorme?
  E2 (solo si E1 muestra invenciones) = ¿reduce afirmaciones sin soporte?

## Estado al cierre (2026-08-21, segundo cierre — verificación)

- **Buffy HEAD:** `62c8a37` (feat(v0.9): add model feasibility and diagnostic routing)
- **Rama:** master, **11 commits** adelante de origin/master (NO pusheados)
- **Decisión:** NO MODIFICAR Buffy. Cierre de sesión / auditoría únicamente.
- **Nota:** el CONTINUE.md previo (mismo día) estaba desactualizado: decía HEAD `95f51cb`
  y 261 tests. Este lo corrige con datos verificados en vivo.

## Experimentos (sin cambios respecto al cierre anterior)

### E1 (10 casos ciegos)
- C (Gemma+Buffy): **7/10 correctos (70%)**
- A (Gemma solo): 3/10
- Invenciones C: 0/10
- Regresiones grounding: ~0/10

### E2 (20 casos ciegos, abc-e2)
- **C (Gemma+Buffy): 18/20 correctos (90%)**
- A (Gemma solo): 0/20
- **Invenciones C: 0/20 (0%)** ✅ (gain de 3/20 vs A que inventa 3: W4, A4, X5)
- **Regresiones grounding: 2/20**
  - L3: Docker permisos — A da solución correcta, C no resuelve (gap de cobertura de Buffy)
  - X2: apps se cierran — C expone JSON crudo (problema de prompt de Mode C)
- Hallazgo clave: eliminación de invención es la señal más fuerte; 90% de C es
  correcto/aceptable; fallos explicables (prompt X2, gap de cobertura L3).

### Spike context-agent (separado)
- Veredicto: EXITOSO (11/11 campos reconocidos, 0 alucinaciones, reconoce nulls/`unknown`/`0 GB`).

## Próximo experimento
- **E3:** centrado en regresiones/límites — corregir prompt de Mode C (X2) y gap de
  cobertura de Buffy (L3). No tocar el core hasta E3.

## Tests y typecheck (verificados en vivo hoy)
- `npm test` (vitest): **353 passed / 20 files** ✅ (subió de 261/17: se agregaron tests)
- `npm run typecheck`: **ROTO** — 4 errores TS en `src/core/action-mapper.ts`
  (líneas 96 y 102: propiedad `instructions` inexistente en el tipo;
  líneas 97 y 102: `i` implícitamente `any`).
  **Pre-existente, NO introducido en este cierre** (no se tocó código). Fuera de alcance.

## ACTION-SAFETY + BDD (verificado en este cierre)

- **Ubicación:** `~/buffy-context/ACTION-SAFETY.md` y `~/buffy-context/ACTION-SAFETY-BDD.md`
  — **NO están en el árbol de `buffy-next`** (grep de `ACTION-SAFETY`/`ActionGate` en buffy-next
  devuelve 0 resultados). Están **sin versionar (untracked)** en buffy-context.
- **Contenido verificado contra los 8 puntos pedidos:**
  1. ✅ 4 niveles OBSERVE / PREPARE / MODIFY / FORBIDDEN — ACTION-SAFETY.md §1
  2. ✅ CAPABILITY ≠ AUTHORIZATION — ACTION-SAFETY.md §3.1 + BDD 12/13 + Principios clave
  3. ✅ Ausencia solicitada ≠ ausencia necesaria — ACTION-SAFETY.md §3.2 + BDD 10a/10b + Principios
  4. ✅ ADB/Shizuku son capacidades, no autorización — ACTION-SAFETY.md §3.1 + BDD 12/13
  5. ✅ Herramienta incompatible nunca se ejecuta — BDD Scenario 11
  6. ✅ Herramienta temporal solo vía PREPARE — ACTION-SAFETY.md §3.3 + BDD 4/10b
  7. ✅ MODIFY siempre requiere autorización — ACTION-SAFETY.md MODIFY + BDD 6/7
  8. ✅ FORBIDDEN siempre se rechaza — **resuelto hoy**: se reescribió la Política de
     ACTION-SAFETY.md (antes decía "confirmar antes de ejecutar", contradictorio). Ahora:
     `FORBIDDEN → RECHAZAR → registrar motivo (log) → no ejecutar`, y regla explícita de que
     AUTHORIZATION nunca convierte FORBIDDEN en permitido (aunque el usuario diga "Sí, hazlo").
      Coherente con BDD Scenario 8 ("inquebrantable incluso con consentimiento").

### 🛑 BDD definitivo 17/17 — INTENTO DETENIDO (2026-08-21, cierre posterior)

Se ejecutó la tarea de generar el BDD definitivo con 17 invariantes. El paso "identificar
las 17 invariantes del contrato actual" reveló que **ACTION-SAFETY.md solo contiene 10
invariantes explícitas** (I1–I10, §1/§2/§3). **Ninguna** del architecture final acordada en
chat (Target Resolver, Registry, Policy, Authorization Record, Resource Ledger, Qwen-no-risk,
TOCTOU, Confirmation Channel, expiresAt, UNKNOWN_COMPOSITION, etc.) está escrita en el contrato.

Por la regla de parada del usuario ("si el contrato no contiene realmente 17 invariantes, NO
inventes las faltantes; detente"), **se detuvo**. NO se modificó `ACTION-SAFETY-BDD.md` (sigue
siendo el BDD viejo de 15 escenarios para el contrato v0.9). NO se tocó `src/`. NO se implementó
ActionGate/ToolExecutor/MCP. NO se hizo commit.

**Criterio de aceptación 17/17: NO cumplido** — no por falta de BDD, sino porque el contrato
no tiene las 17. Falta reconciliar el contrato (escribir la arquitectura final como 17 invariantes
explícitas) antes de generar el BDD.

## Qué queda DELIBERADAMENTE sin implementar
- **ActionGate, ToolExecutor, MCP** — no implementados (contrato congelado por diseño;
  ACTION-SAFETY.md §6 "NO implementar todavía").
- Los `.md` de ACTION-SAFETY son contrato/BDD, no código; el Action Gate no se codificó.
- Typecheck roto (4 errores) — pre-existente, fuera de alcance de cierre.

## Artefactos sin commit (pendientes de versionar luego — NO se commiteó hoy)
- Modificados (tracked): `experiments/context-agent-spike/fixtures/buffy-context.json`,
  `case-a-ready.md`, `case-c-ready.md` (solo datos de fixtures/resultados, no código).
- Sin seguimiento (untracked): `experiments/abc-e2-*`, `abc-evaluation-v0.8-*`,
  `abc-experiment-*`, `context-agent-spike/results/*`, `CONTINUE.md` (este archivo).
- `~/buffy-context/ACTION-SAFETY.md` y `ACTION-SAFETY-BDD.md` — untracked en buffy-context.

## Modificado en este cierre
- Se actualizó `CONTINUE.md` con datos verificados en vivo (HEAD, 353 tests, estado ACTION-SAFETY).
  **Sin commit** (cierre solo lectura + doc). No se modificó código de Buffy.
- No se ejecutó reset/clean/stash/delete sobre ningún cambio del usuario.

## Próximo paso recomendado (orden acordado 2026-08-21)

**Decisión de ubicación:** ACTION-SAFETY.md / ACTION-SAFETY-BDD.md **se quedan en
`~/buffy-context/`** (contrato arquitectónico, no código de buffy-next). No duplicar en
buffy-next hasta implementar ActionGate. Separación contrato ≠ implementación se conserva.

**Hecho hoy (cierre):** contradicción FORBIDDEN corregida en ACTION-SAFETY.md.
**Intento BDD 17/17:** DETENIDO — el contrato tiene 10 invariantes, no 17 (ver sección arriba).

**Orden corregido (requiere reconciliar contrato primero):**

0. **RECONCILIAR CONTRATO:** escribir la arquitectura final en `ACTION-SAFETY.md` (o
   `ACTION-SAFETY-ARCH.md` en buffy-context) como **17 invariantes explícitas**. Sin esto,
   el BDD 17/17 no puede generarse sin inventar. (Borrador propuesto por OpenCode, validado
   por el usuario — NO hecho aún.)
1. Generar `ACTION-SAFETY-BDD.md` definitivo: 17/17 invariantes con escenario Given/When/Then
   + matriz INVARIANTE|ESCENARIO|ADVERSARIAL|CONCURRENCIA|ESTADO. Criterio: 17/17.
2. Última auditoría adversarial del BDD.
3. Revisar E3 pendiente (corregir prompt Mode C X2; gap de cobertura L3).
4. Diseñar ActionGate.
5. Implementarlo guiándose por la BDD.
6. Tests adversariales.

**Independiente (no mezclar con ActionGate):**
7. Reparar typecheck de `src/core/action-mapper.ts` (4 errores pre-existentes).

**MCP:** sigue esperando hasta demostrar decisión segura sin Qwen ni MCP.

**MCP:** sigue esperando. Demostrar primero que Buffy decide seguro sin Qwen ni MCP;
después MCP es solo el mecanismo de consumo de capacidades.

**Commits:** 11 locales sin pushear + experiments sin commitear + ACTION-SAFETY.md modificado
(untracked en buffy-context) — decisión del usuario.
