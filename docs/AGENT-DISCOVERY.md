# AGENT-DISCOVERY — Cómo consumen el contrato los harnesses

**Fecha:** 2026-08-29 · **Estado:** documentación de patrones. **Ningún adapter
está implementado todavía** — este documento define el camino, no el código.

## Flujo general

```text
harness (OpenCode | ZCode | Codex | Claude Code)
   → discovery contract (docs/BUFFY-AGENT-CONTRACT-COMPACT.md)
   → Buffy tools (CLI: buffy doctor --context / capabilities / act
                  · o MCP: buffy_context / buffy_capabilities / buffy_action)
   → Buffy Next (buffy.context/v1 + ActionGate)
```

Dos mecanismos de consumo, sin cambios en Buffy Next:

1. **Inyección del contrato compacto** — el texto de
   `BUFFY-AGENT-CONTRACT-COMPACT.md` (< 2048 bytes) se añade a las
   instrucciones del harness (archivo de sistema/proyecto del agente). El
   agente aprende *qué es Buffy, cuándo usarla y qué no pedirle*.
2. **Herramientas** — el agente invoca las tres interfaces por CLI
   (subprocess) o por MCP (el adapter externo `buffy-tools` ya validado en
   `~/experiments/opencode-buffy-cplus/`). Buffy Next no conoce al harness:
   la integración siempre es a nivel de agente.

## Patrones por harness (solo documentación)

| Harness | Inyección del contrato | Herramientas | Estado |
|---|---|---|---|
| **OpenCode** | `~/.AGENTS.md` o `instructions` en `opencode.json` | MCP server `buffy-tools` (adapter externo) | ✅ Validado experimentalmente (C+ PASS, cross-model); el compacto aún no inyectado |
| **ZCode** | `AGENTS.md` global o de proyecto / skill de referencia | MCP o CLI subprocess | 📋 Patrón, no implementado |
| **Codex** | `AGENTS.md` del repo o del entorno | CLI subprocess | 📋 Patrón, no implementado |
| **Claude Code** | `CLAUDE.md` / skill con el compacto | MCP o CLI subprocess | 📋 Patrón, no implementado |

Notas comunes:

- El compacto es idéntico para los cuatro harnesses: **la definición de Buffy
  no cambia por harness**; solo cambia el mecanismo de inyección.
- Los cuatro pueden combinar ambos mecanismos (contrato inyectado + herramientas).
- Sin contrato inyectado, un agente con el MCP `buffy-tools` puede descubrir
  parcialmente a Buffy por las descripciones de las tools, pero pierde los
  non-goals ("never for"): se recomienda siempre inyectar el compacto.

## Reglas de implementación futura (cuando toque)

- Ningún harness detecta ni modifica Buffy Next; Buffy Next no detecta harnesses.
- El adapter MCP permanece **fuera** del repo (`docs/VERSION-MCP-AUDIT.md:53`).
- Toda acción física sigue requiriendo ActionGate; el contrato no otorga
  autorización, solo la declara.
- Cualquier adapter específico de harness entra por los criterios de reentrada
  del proyecto (fallo reproducible / necesidad funcional / evidencia), no "ya
  que estamos".
