# DESIGN-DISCOVER-AGENT — Especificación del sistema de descubrimiento y verificación de superficies de agente

**Fecha:** 2026-08-29
**Estado:** Design gate — especificación, no implementación
**Evidencia base:** Agy routing experiment T0–T4 (`agy-routing-experiment`, commit `eefc310`)
**Contratos base:** `BUFFY-AGENT-CONTRACT.md`, `BUFFY-AGENT-CONTRACT-COMPACT.md`

---

## 1. Objetivo y Non-Goals

### Objetivo

Crear un sistema (`discover-agent`) que, dado un harness (OpenCode, ZCode, Codex, Agy, Claude Code, etc.), sea capaz de:

1. **Descubrir** qué superficies de instrucciones, skills, tools y MCP servers expone el harness para integrar Buffy Next.
2. **Verificar mecánicamente** si cada superficie candidata está realmente activa y disponible (no confiar en el autorreporte).
3. **Probar comportamentalmente** si el agente realmente selecciona y ejecuta `buffy_context` cuando corresponde.
4. **Producir evidencia estructurada** que distinga claramente:
   - `self_report` (lo que dice el harness)
   - `observed` (lo que se ve en la configuración)
   - `verified` (probado mecánicamente)
   - `behavioral` (probado en tarea real)

### Non-Goals

- **No** modificar el contrato canónico (`BUFFY-AGENT-CONTRACT.md`) ni el compacto.
- **No** implementar MCP servers ni tools de Buffy.
- **No** crear memoria o estado persistente entre sesiones.
- **No** asumir que `AGENTS.md` es universal para todos los harnesses.
- **No** reemplazar la inyección manual del contrato compacto — `discover-agent` solo descubre y verifica; la inyección sigue siendo decisión del usuario.
- **No** implementar la inyección automática del contrato en configuraciones de agente.

---

## 2. Modelo de Estados: candidate → verified → effective

```
UNKNOWN
    ↓ (discovery mecánico)
CANDIDATE    ← "existe algo que parece ser X según autorreporte/observación"
    ↓ (verificación mecánica)
VERIFIED     ← "probado: realmente está activo y expone lo que dice"
    ↓ (verificación comportamental)
EFFECTIVE    ← "en tarea real, el agente lo usa cuando corresponde"
```

**Regla de oro:** `candidate ≠ verified`. Un hallazgo en configuración/autorreporte es solo candidato hasta que un probe mecánico lo confirme. `verified ≠ effective` — una superficie puede estar activa y no ser usada espontáneamente (T3: skill + MCP presentes, pero no seleccionados en tarea real).

Cada estado requiere evidencia concreta con `method` y `evidence` trazables.

---

## 3. Principio Fundamental

> **Nunca confiar únicamente en el autorreporte del harness.**

Evidencia del experimento T0–T4:
- T2: Agy reportó `settings.json` como MCP config; el mecanismo real era `mcp_config.json`.
- T1: `.agents/` raíz no acepta Markdown plano; el mecanismo real espera `.agents/skills/<name>/SKILL.md`.
- T3: Skill presente y MCP presente, pero no activados espontáneamente en tarea real.

**Corolario:** Cada superficie debe pasar por verificación mecánica (`P2`) antes de considerarse `verified`. El autorreporte es solo `candidate`.

---

## 4. Tres Niveles de Probe

### P1 — Mechanical Surface Discovery

**Pregunta:** ¿Qué superficies existen en este harness?

**Entrada:** Harness identificado (ej. `agy`, `opencode`, `zcode`, `codex`, `claude-code`).

**Acciones:**
- Enumerar archivos de configuración candidatos (`settings.json`, `mcp_config.json`, `opencode.json`, `AGENTS.md`, `GEMINI.md`, `.claude/settings.json`, `.agents/skills/`, etc.)
- Detectar MCP servers registrados (`mcpServers` en cada config relevante).
- Detectar skills instaladas (`.agents/skills/<name>/SKILL.md` con frontmatter).
- Detectar reglas activas (`AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.AGENTS.md` global, etc.).
- Leer schema de tools MCP si hay servers registrados.

**Salida:** Lista de `SurfaceCandidate` con `type`, `location`, `source: "self_report" | "observed"`.

### P2 — Mechanical Verification

**Pregunta:** ¿Cada superficie candidata está realmente activa y expone lo que dice?

**Acciones por tipo de superficie:**

| Tipo | Probe mecánico |
|---|---|
| `mcp_server` | Conectar al server (stdio/HTTP), listar tools, validar schema contra `buffy_*` esperado |
| `skill` | Leer `SKILL.md`, validar frontmatter `name`/`description`, intentar `Read` del archivo |
| `active_rule` | Preguntar al agente "¿qué reglas tenés cargadas?" y verificar reproducción verbatim |
| `tool_schema` | Invocar tool MCP con entrada mínima, validar respuesta estructura |

**Criterio de paso:** Cada probe produce `method` y `evidence` concretos (ej: `tool_schema_probe` con JSON de respuesta, `verbatim_reproduction` con texto exacto).

**Salida:** Lista de `VerifiedSurface` con `status: "verified" | "failed"`, `method`, `evidence`.

### P3 — Behavioral Verification

**Pregunta:** En una tarea real, ¿el agente realmente selecciona y ejecuta la capacidad correcta?

**Tarea estándar:** Diagnosticar el entorno (memoria, CPU, GPU, disco, temperatura, herramientas, privilegios) — misma task 2d del experimento T0–T4.

**Criterios de éxito:**
1. El trace incluye invocación a `buffy_context` (MCP tool call o CLI subprocess).
2. La respuesta cita explícitamente la regla/superficie que guió la decisión.
3. Los datos reportados coinciden con `buffy.context/v1` (no reconstruidos desde shell).
4. La interfaz usada es `context` (lectura), no `action` (escritura).

**Salida:** `behavioral: { effective: true | false, trace: [...], decision_cited: string | null }`.

---

## 5. Evidence Model

Cada hallazgo tiene un campo `evidence_level`:

```json
{
  "evidence_level": "self_report | observed | verified | behavioral",
  "source": "settings.json | mcp_config.json | AGENTS.md | SKILL.md | verbatim_reproduction | tool_call_trace",
  "method": "config_read | mcp_connect | verbatim_reproduction | behavioral_task",
  "evidence": "..."
}
```

**Jerarquía (mayor a menor confianza):**
1. `behavioral` — tarea real, tool call observado, decisión citada
2. `verified` — probe mecánico pasó (reprodución verbatim, tool schema OK)
3. `observed` — archivo/config existe y se leyó, sin probe
4. `self_report` — el harness lo dice (ej: lista de skills en respuesta a "¿qué skills tenés?")

**Regla:** Para marcar `verified: true` se requiere al menos un probe `verified` o `behavioral`. `self_report` solo produce `candidate`.

---

## 6. Routing Surface

No asumir que `AGENTS.md` es universal. Cada harness tiene su(s) superficie(s) de routing efectiva.

```json
{
  "routing_surface": {
    "type": "active_instruction | lazy_skill | tool_schema | unknown",
    "location": "AGENTS.md | .agents/skills/buffy-next/SKILL.md | mcp_config.json | settings.json | unknown",
    "evidence_level": "verified | behavioral | observed | self_report",
    "evidence": "verbatim reproduction in 'what rules' response + behavioral task selection",
    "confidence": "high | medium | low"
  }
}
```

**Tipos conocidos:**

| Tipo | Descripción | Ejemplo hallado |
|---|---|---|
| `active_instruction` | Inyectada en contexto del agente en cada carga, reproducida verbatim | `AGENTS.md` (Agy, ZCode, Codex), `CLAUDE.md` (Claude Code), `~/.AGENTS.md` (global) |
| `lazy_skill` | Solo nombre+description inyectados; contenido completo bajo demanda | `.agents/skills/<name>/SKILL.md` (Agy) |
| `tool_schema` | Tools MCP listadas; sin regla de precedencia | `mcp_config.json` tools listadas |
| `unknown` | No detectada / no clasificada | — |

---

## 7. Adapter Interface Conceptual

```typescript
interface HarnessAdapter {
  readonly harnessId: string;           // "agy" | "opencode" | "zcode" | "codex" | "claude-code"
  readonly harnessVersion?: string;

  // P1 — Discovery
  discoverSurfaces(): Promise<SurfaceCandidate[]>;

  // P2 — Verification
  verifySurfaces(candidates: SurfaceCandidate[]): Promise<VerifiedSurface[]>;

  // P3 — Behavioral probe (optional, requires session)
  behavioralProbe(task: BehavioralTask): Promise<BehavioralResult>;

  // Optional: reload mechanism
  getReloadMechanism(): ReloadMechanism | null;
}

interface SurfaceCandidate {
  type: "mcp_server" | "skill" | "active_rule" | "tool_schema" | "unknown";
  location: string;
  source: "self_report" | "observed";
  metadata?: Record<string, unknown>;
}

interface VerifiedSurface extends SurfaceCandidate {
  status: "verified" | "failed";
  method: string;
  evidence: string;
}

interface BehavioralResult {
  effective: boolean;
  trace: ToolCall[];
  decisionCited: string | null;
  executionInterface: "buffy_context" | "run_command" | "other";
}
```

---

## 8. Agy como Primer Adapter — Evidencia T0–T4

Agy es el harness con evidencia experimental completa. Sus superficies mapean así:

| Evidencia T0–T4 | SurfaceCandidate | VerifiedSurface | Behavioral |
|---|---|---|---|
| `mcp_config.json` con `buffy-tools` | type: `mcp_server`, location: `~/.gemini/config/mcp_config.json` | ✅ `tool_schema_probe`: `buffy_context`/`buffy_action`/`buffy_capabilities` listadas y funcionales | N/A |
| `settings.json` (autorreporte) | type: `mcp_server`, location: `~/.gemini/settings.json` | ❌ `failed` — no es el mecanismo real | N/A |
| `.agents/skills/buffy-next/SKILL.md` | type: `skill`, location: `.agents/skills/buffy-next/SKILL.md` | ✅ `skill_load_probe`: Read + frontmatter válido | ❌ no activada espontáneamente en 2d (T3) |
| `AGENTS.md` en project-root | type: `active_rule`, location: `<project-root>/AGENTS.md` | ✅ `verbatim_reproduction`: regla reproducida en "what rules" | ✅ `behavioral`: T4 seleccionó `buffy_context` citando la regla |

**Hallazgo clave para Agy:** La superficie de routing efectiva es `AGENTS.md` (`active_instruction`), NO `.agents/skills/` (`lazy_skill`).

**Etiquetado obligatorio en output:**

```json
{
  "routing_surface": {
    "type": "active_instruction",
    "location": "<project-root>/AGENTS.md",
    "evidence_level": "behavioral",
    "evidence": "verbatim reproduction in 'what rules' + 'Options considered' cites rule + buffy_context called",
    "confidence": "high",
    "note": "Observed fact for Agy only — not generalized"
  }
}
```

---

## 9. Output JSON Schema

```json
{
  "harness": "agy",
  "harnessVersion": "3.7.0",
  "timestamp": "2026-08-29T...",
  "surfaces": [
    {
      "type": "mcp_server",
      "location": "~/.gemini/config/mcp_config.json",
      "candidate": true,
      "verified": true,
      "evidence": {
        "level": "verified",
        "method": "mcp_connect_and_list_tools",
        "evidence": "buffy_context, buffy_action, buffy_capabilities listed and functional"
      }
    },
    {
      "type": "skill",
      "location": ".agents/skills/buffy-next/SKILL.md",
      "candidate": true,
      "verified": true,
      "evidence": {
        "level": "verified",
        "method": "skill_load_probe",
        "evidence": "Read SKILL.md, frontmatter name=buffy-next valid"
      }
    },
    {
      "type": "active_rule",
      "location": "<project-root>/AGENTS.md",
      "candidate": true,
      "verified": true,
      "effective": true,
      "evidence": {
        "level": "behavioral",
        "method": "verbatim_reproduction + behavioral_task",
        "evidence": "verbatim reproduction in 'what rules' + 'Options considered' cites rule + buffy_context called"
      }
    }
  ],
  "verified": true,
  "effective": true,
  "verification": {
    "method": "mcp_connect | skill_load | verbatim_reproduction | behavioral_task",
    "evidence": "all probes passed"
  },
  "routing_surface": {
    "type": "active_instruction",
    "location": "<project-root>/AGENTS.md",
    "evidence_level": "behavioral",
    "evidence": "verbatim reproduction + behavioral task selection",
    "confidence": "high",
    "note": "Observed fact for Agy only — not generalized"
  },
  "failure_state": "none"
}
```

---

## 10. Failure States

El sistema debe clasificar y reportar explícitamente:

| Estado | Significado | Acción recomendada |
|---|---|---|
| `discovered-but-unverified` | Surface candidate existe pero probe mecánico falló | No usar; reportar como candidate-only |
| `verified-but-not-effective` | Probe mecánico pasó, pero behavioral probe falló (skill lazy en T3) | Inyectar regla activa (`AGENTS.md`) |
| `effective` | Verified + behavioral passed (T4) | Ready for production |
| `contradictory-evidence` | Autorreporte ≠ evidencia observada (T2: settings vs mcp_config) | Priorizar evidencia observada; flaggear contradicción |
| `unsupported-self-report` | Solo autorreporte, sin evidencia observed/verified | Marcar como `candidate`; no confiar |
| `no-routing-surface` | Ninguna superficie de routing detectada | Requerir inyección manual de regla |

---

## 11. Design Gates (Condiciones de Aprobación)

Antes de pasar a implementación, `DESIGN-DISCOVER-AGENT.md` debe cumplir:

1. **Consistencia con evidencia T0–T4:** Cada hallazgo del experimento se mapea a una sección de la especificación (ver sección 8).
2. **Modelo de estados claro:** `candidate → verified → effective` con transiciones definidas y evidencia requerida.
3. **Separación de evidence levels:** `self_report | observed | verified | behavioral` sin ambigüedad.
4. **Routing surface no universal:** `type` enum incluye `active_instruction | lazy_skill | tool_schema | unknown`; `AGENTS.md` no es hardcoded.
5. **Agy adapter como caso concreto:** Sección 8 mapea cada hallazgo T0–T4 a superficie/verificación/behavioral.
6. **Output JSON definido:** Schema con `surfaces[]`, `verified`, `effective`, `routing_surface`, `failure_state`.
7. **Failure states exhaustivos:** 6 estados cubiertos, con acción recomendada cada uno.
8. **Adapter interface definida:** `discover`, `verify`, `behavioral_probe` con tipos.
9. **No-goals respetados:** No modifica contratos, no inyecta automáticamente, no asume universalidad.
10. **Trazabilidad:** Cada decisión referenciable a hallazgo T0–T4 o principio declarado.

---

## 12. Próximos Pasos (Fuera del Design Gate)

Tras aprobación de esta especificación:

1. Implementar `HarnessAdapter` base + `AgyAdapter` en `src/discover/`.
2. Tests unitarios de probes P1/P2 (mock harness configs).
3. Test de integración P3 contra Agy real (requiere sesión).
4. CLI `buffy discover-agent <harness>` que produce el JSON de salida.
5. Iterar con otros harnesses (OpenCode, ZCode, Codex, Claude Code) usando mismo modelo.

---

**Fin de la especificación.**

*Este documento es un design gate. No se implementa nada hasta que sea revisado y aprobado.*