# FINDING-CONTEXT-ASYMMETRY — Asimetría entre contexto de sistema y contexto de continuidad

**Fecha:** 2026-08-30
**Origen:** Revisión de `tests/agent-contract.test.ts` (7/7 tests pasan)
**Severidad:** Media — no bloquea, pero crea una zona ciega en la validación
**Estado:** Hallazgo documentado. Sin acción inmediata requerida.

---

## 1. El hallazgo

Un agente que necesita completar una tarea pasa por **dos preguntas distintas** que dependen de **dos fuentes de datos distintas**:

| Pregunta | Fuente | Contrato | ¿Tiene test de contrato? |
|---|---|---|---|
| ¿Qué es verdad en esta máquina **ahora**? | Buffy Next | `buffy.context/v1` | ✅ `tests/agent-contract.test.ts` (7 tests) |
| ¿Qué se estaba haciendo y qué sigue? | Buffy Context | `buffy.handoff/v1` / `CONTINUE.md` | ❌ Ninguno |

La primera pregunta tiene un contrato canónico (`BUFFY-AGENT-CONTRACT.md`), una versión compacta inyectable (`BUFFY-AGENT-CONTRACT-COMPACT.md`), y un test que valida su integridad semántica.

La segunda pregunta **no tiene contrato equivalente, ni test, ni validación automática**.

---

## 2. Evidencia concreta

### 2.1 Lo que el test valida (lado sistema)

```
tests/agent-contract.test.ts
  ✓ identity and role         → "environment specialist", "ai agents"
  ✓ three canonical interfaces → context, capabilities, action
  ✓ real public entry points   → buffy doctor --context, buffy act, etc.
  ✓ safety boundary            → actiongate, auto_safe
  ✓ non-goals                  → never for, arbitrary shell, memory
  ✓ self-explanatory            → no references to other docs
  ✓ size budget                 → < 2048 bytes
```

Todo esto cubre el dominio de **estado de sistema**: hardware, plataforma, herramientas disponibles, privilegios, freshness de observaciones.

### 2.2 Lo que NO se valida (lado continuidad)

No existe contrato equivalente para:

- **Handoff estructurado** (`buffy.handoff/v1` — diseñado en `DESIGN-AGENT-HANDOFF.md`, no implementado)
- **CONTINUE.md** (Markdown libre, sin contrato de datos, sin test)
- **SESION.md** (bitácora cronológica, sin contrato de datos, sin test)
- **Jerarquía de fuentes** (`buffy-source.sh` real-time → facts → SNAPSHOT → HANDOFF → CONTINUE → INFO-core → inferred — sin validación de que la cadena funcione)

---

## 3. Evidencia empírica: Corrida 2 (2026-08-30)

**Prompt:** "Revisá tests/agent-contract.test.ts en buffy-next: ¿el test
está completo y correcto o falta algo?"

**Trace completo:**

```
Read buffy-next/tests/agent-contract.test.ts, buffy-next/docs/BUFFY-AGENT-CONTRACT.md, buffy-next/docs/BUFFY-AGENT-CONTRACT-COMPACT.md
• Search agent-contract|AGENT_CONTRACT|agentContract in buffy-next (0 results)

$ cd buffy-next && npx vitest run tests/agent-contract.test.ts 2>&1
 ✓ tests/agent-contract.test.ts (7 tests) 5ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

**Búsqueda de handoff:** ausente — sin `find`, sin acceso a /tmp,
~/.handoff, ~/handoffs.
**HANDOFF_PROBE_ID beta-9e2a:** no mencionado.
**Clasificación:** 2d FAIL — la tarea era autocontenida (resoluble con
contrato + test, sin datos de handoff), por lo que el FAIL indica ausencia
de necesidad, no fallo de mecanismo.

### 3.1 Distinción conductual: ausencia vs fallo

El FAIL en 2d es **conductual, no mecánico**: la Capa 3 (búsqueda de
handoff / continuidad) no se disparó porque la tarea no la requería.
Esto es comportamiento correcto — un agente no debería buscar handoff
cuando la tarea es autocontenida.

Lo que **no quedó probado** es el caso opuesto: una tarea que sí
requiere datos de continuidad (ej: continuar trabajo previo) y la Capa 3
falla en activarse. Eso requiere una **tarea forzada de continuidad**
(diseño pendiente).

---

## 4. Escenario de diseño: rate limit (DESIGN PROPOSAL — no verificado)

> **Nota:** El siguiente escenario es una proyección de diseño, no un
> hecho establecido. El mecanismo de rate-limit como EVENT PROXYED fue
> discutido en sesiones previas y clasificado como NOT_ESTABLISHED —
> Freebuff no tiene evidencia confirmada de que exponga rate-limit de
> forma que un agente pueda interceptar.

```
Agente A trabaja en "corregir errores TS en pwa_securguard"
  → alcanza rate limit (EVENT PROXYED, no verificado si Freebuff lo expone)
  → handoff: "Fix CSV export ✅, falta LogsTab"
  → Agente B inicia sesión
  → Agente B pregunta: "¿Qué estaba haciendo?"
  → Necesita CONTINUE.md / handoff (lado continuidad)
  → Necesita buffy.context/v1 para verificar que la máquina sigue OK (lado sistema)
```

**Ambos lados serían necesarios.** Si solo uno estuviera validado, el agente podría:
- Tener estado de sistema perfecto pero no saber qué estaba haciendo (sin continuidad)
- Tener el handoff perfecto pero no saber si la máquina cambió (sin sistema)

### 4.1 La asimetría crea una zona ciega

| Capa | Contrato | Test | Freshness | Provenance |
|---|---|---|---|---|
| **Sistema** (Buffy Next) | ✅ `buffy.context/v1` | ✅ `agent-contract.test.ts` | ✅ `observedAt` / `ageMs` / `epistemicState` | N/A (machine state) |
| **Continuidad** (Buffy Context) | ⏳ `buffy.handoff/v1` (diseñado) | ❌ | ⏳ `freshness.observed_at` (diseñado) | ⏳ `producer.agent` / `harness` (diseñado) |
| **Continuidad legacy** (CONTINUE.md) | ❌ | ❌ | ❌ | ❌ |

La capa de continuidad está **dos fases detrás** de la capa de sistema:
1. Sistema: contrato → implementación → test → validado ✅
2. Continuidad: contrato diseñado → sin implementar → sin test → sin validar ❌

---

## 5. Raíz de la asimetría

La asimetría no es un accidente — refleja la **historia de desarrollo**:

1. **Buffy Next** nació como proyecto de TypeScript con test suite, CI, y contrato formal desde el inicio.
2. **Buffy Context** nació como bash + Markdown + YAML, donde los "contratos" son convenciones de archivo, no schemas tipados.
3. El contrato de sistema (`buffy.context/v1`) es **JSON tipado** con un builder que lo produce.
4. El handoff de CONTINUE.md es **Markdown libre** sin campos obligatorios ni validación.

Esto es consistente con el principio de COMPANION-ARCHITECTURE:

> *"La integración ocurre en el nivel del agente, no por dependencia entre repos."*

Pero la consecuencia no documentada es: **cada repo valida su propio lado, y nadie valida la interfaz entre ambos**.

---

## 6. Impacto

### 6.1 Bajo (hoy)

Hoy la mayoría de las tareas son **single-session**: el agente arranca, resuelve, termina. La continuidad entre sesiones es un caso minoritario. La asimetría no causa fallos porque el lado sin test rara vez se invoca de forma crítica.

### 6.2 Medio (cuando se implemente handoff)

Cuando `buffy.handoff/v1` se implemente:
- Se creará un contrato sin test de integridad semántica (como el que tiene el lado de sistema).
- Un cambio en CONTINUE.md o en la jerarquía de `buffy-source.sh` podría romper la continuidad sin que nadie lo detecte.
- El test `agent-contract.test.ts` seguirá pasando porque solo valida el lado de sistema.

### 6.3 Alto (si se adopta multi-harness con handoffs)

En un escenario con rate limits frecuentes y handoffs entre harnesses distintos (Freebuff → Agy → Codex), la continuidad se vuelve crítica. Un handoff corrupto o staled sin detección = trabajo perdido.

---

## 7. Acciones recomendadas

### 7.1 Corto plazo (no requiere implementación)

| Acción | Esfuerzo | Impacto |
|---|---|---|
| Documentar esta asimetría (este documento) | ✅ Hecho | Traza del hallazgo |
| Agregar test de sanity para CONTINUE.md: verificar que existe y tiene secciones mínimas | Bajo | Detecta CONTINUE.md roto |
| Agregar test de integridad para `buffy-source.sh`: verificar que la jerarquía resuelve sin errores | Bajo | Detecta regressions en la cadena |

### 7.2 Medio plazo (requiere diseño)

| Acción | Esfuerzo | Impacto |
|---|---|---|
| Crear `tests/continuity-contract.test.ts` que valide el contrato de handoff (cuando se implemente) | Medio | Cierra la asimetría |
| Agregar `FINDING-CONTEXT-ASYMMETRY` al `EVIDENCE-INDEX.md` | Bajo | Trazabilidad |

### 7.3 Largo plazo (requiere implementación)

| Acción | Esfuerzo | Impacto |
|---|---|---|
| Implementar `buffy.handoff/v1` según `DESIGN-AGENT-HANDOFF.md` | Alto | Contrato estructurado de continuidad |
| Test de integración end-to-end: rate limit → handoff → nuevo agente → continuar | Alto | Validación real de la cadena completa |

---

## 8. Relación con otros documentos

| Documento | Relación |
|---|---|
| `COMPANION-ARCHITECTURE.md` | Define las dos preguntas (§tabla "Pregunta / Sistema / Contrato") pero no documenta la asimetría de validación |
| `DESIGN-AGENT-HANDOFF.md` | Diseña la capa que faltaría (`buffy.handoff/v1`) — este hallazgo justifica por qué ese diseño existe |
| `DESIGN-DISCOVER-AGENT.md` | Cubre descubrimiento de superficies de agente — perpendicular a este hallazgo |
| `BUFFY-AGENT-CONTRACT.md` | El contrato canónico solo cubre el lado de sistema |
| `AGENT-DISCOVERY.md` | Documenta cómo consumen el contrato los harnesses — solo mentiona el contrato de sistema |
| `tests/agent-contract.test.ts` | El test que originó este hallazgo — validez confirmed (7/7) |

---

## 9.一句话 (one-liner)

> **El contrato de sistema tiene contrato + test + size budget. El contrato de continuidad tiene un diseño en papel y cero validación automática. La asimetría es aceptable hoy pero será un riesgo cuando los handoffs se implementen.**

---

*Este hallazgo fue documentado durante la revisión de `tests/agent-contract.test.ts` en la sesión del 2026-08-30.*
