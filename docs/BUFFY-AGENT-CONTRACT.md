# BUFFY-AGENT-CONTRACT — Discovery contract para agentes AI

**Versión:** 1.0 · **Fecha:** 2026-08-29 · **Estado:** canónico
**Versión compacta inyectable:** [`BUFFY-AGENT-CONTRACT-COMPACT.md`](BUFFY-AGENT-CONTRACT-COMPACT.md)
**Consumo por harness:** [`AGENT-DISCOVERY.md`](AGENT-DISCOVERY.md)

Este documento es la descripción canónica de Buffy Next para que un agente AI
descubra qué es, cuándo usarlo y hasta dónde puede llegar. Toda afirmación está
respaldada por interfaces públicas reales del repo (v0.2.2+).

---

## Identity

**Buffy Next es:** *"Environment specialist for AI agents."*

Un motor de operaciones que observa el sistema vivo, diagnostica problemas y
ejecuta —solo con autorización— acciones físicas sobre ese sistema.

**Buffy Next NO es:**

- el agente principal (el agente es quien razona, planifica y decide);
- un modelo de lenguaje (no depende de LLM para funcionar);
- un sistema de memoria (no recuerda entre sesiones; solo estado operativo mínimo);
- un shell genérico (solo puede ejecutar las acciones de su catálogo, vía ActionGate).

## Capabilities — interfaces públicas reales

Tres interfaces canónicas, disponibles por CLI y por MCP:

| Interfaz | CLI | MCP tool (adapter externo `buffy-tools`) | Qué devuelve |
|---|---|---|---|
| **context** | `buffy doctor --context` | `buffy_context` | `buffy.context/v1` — JSON tipado: plataforma, hardware (CPU/RAM/GPU/disco/temperatura/procesos), tools disponibles, privileges, con freshness por campo (`observedAt`/`ageMs`/`epistemicState`) |
| **capabilities** | `buffy capabilities --json` | `buffy_capabilities` | Qué puede hacer Buffy en esta plataforma: observaciones y acciones con su nivel de seguridad y requisitos |
| **action** | `buffy act <action-id> [args]` | `buffy_action` | Ejecución autorizada de una acción del catálogo (9 acciones: verificar driver/temp/red/disco/procesos/shizuku, instalar herramienta, cambiar plan de energía) |

Interface adicional de diagnóstico (flujo dirigido, nunca ejecuta):

- `buffy diagnose "query" --json` → selección task-adaptive de checks,
  observaciones con freshness gating, acciones sugeridas y next-diagnostic.

## Boundaries

```text
Buffy Next    → observa / diagnostica / ejecuta acciones autorizadas
Agent         → razona / planifica / decide
Other tools   → tareas externas o específicas (código, web, memoria)
```

El agente pregunta a Buffy *"¿qué es verdad en esta máquina ahora?"* y
*"¿puedes arreglar X?"*; Buffy responde con evidencia freshness-aware y, si el
agente autoriza, ejecuta una acción de catálogo. Todo lo demás (leer código,
razonar, recordar proyectos) pertenece al agente o a otras herramientas.

## Safety

- **ActionGate es la autoridad final para acciones físicas.** Toda acción pasa
  por él: clasificación de nivel (`auto_safe` | `confirm` | `forbidden`),
  canonical request con sanitización, validación de plataforma y prerequisitos,
  token de autorización single-use para acciones `confirm`.
- **Nunca presentar Buffy Action como shell arbitrario.** No acepta comandos
  libres: solo IDs del catálogo, y una acción `forbidden` jamás se ejecuta.
- En modo no interactivo (`--json`) `buffy act` muestra el plan y **no ejecuta**.
- `buffy diagnose` solo observa y recomienda; nunca ejecuta.

## Relación con Buffy Context (no confundir)

`buffy-context` (<https://github.com/maneskinleon-del/buffy-context>) es un
proyecto **independiente y opcional**: memoria/knowledge/sesión entre sesiones.

```text
Buffy Next    = entorno vivo   (este contrato)
Buffy Context = memoria/knowledge/sesión (otro repo, otra capa)
```

Buffy Next funciona completamente sin él; no hay dependencia de código ni de
runtime. Ver `docs/COMPANION-ARCHITECTURE.md`.

## Mantenimiento del contrato

- Cualquier cambio de interfaces públicas debe reflejarse aquí y en la versión
  compacta.
- La versión compacta tiene presupuesto de inyección: **< 2048 bytes**,
  verificado por `tests/agent-contract.test.ts` (validación semántica, no de
  texto literal).
- Este contrato no añade código al runtime ni modifica módulos congelados.
