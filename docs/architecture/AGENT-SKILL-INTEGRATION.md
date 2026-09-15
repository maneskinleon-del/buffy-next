# Agent Skill Integration

## Estado

**CHECKPOINT — DESCUBRIMIENTO / NO IMPLEMENTAR TODAVÍA**

Este documento registra un descubrimiento arquitectónico observado durante una
conversación de trabajo. No representa una decisión de implementación ni crea
obligación de construir adaptadores. Ver sección *Estado de evidencia*.

## Hallazgo

Revisión del repositorio de referencia: https://github.com/tt-a1i/archify

Archify demuestra un patrón relevante para Buffy:

- Existe una **capacidad/skill canónica común** (una sola definición de la
  capacidad, mantenida en un único lugar).
- Distintos agentes pueden requerir **mecanismos diferentes** para descubrir,
  instalar o cargar esa capacidad.
- La lógica/capacidad **no se duplica por agente**: lo único que varía es la
  integración.
- La integración se **adapta a las convenciones reales de cada agente**.

Archify documenta mecanismos de integración diferentes para agentes/entornos
como **Claude Code, Codex CLI, OpenCode y Cursor**.

La conclusión NO es copiar Archify, sino registrar este patrón arquitectónico:

```
                 Buffy
                   │
          capacidad canónica
                   │
             Skill / reglas
                   │
       ┌───────────┼───────────┐
       │           │           │
    Claude       Codex      OpenCode
    adapter      adapter      adapter
       │           │           │
       └───────────┼───────────┘
                   │
            misma capacidad Buffy
```

## Implicación para Buffy

Buffy Context + Buffy Next deberían mantener una **capacidad canónica común**
y permitir **mecanismos específicos de discovery/bootstrap por agente** cuando
las convenciones reales del agente lo requieran.

Esto complementa la dirección existente del proyecto:

- `~/ai-context/README.md` como punto de descubrimiento global.
- Buffy Context y Buffy Next mantienen responsabilidades separadas.
- La capacidad operativa de Buffy puede tener una representación/skill canónica.
- La integración con cada agente debe adaptarse al mecanismo real de ese agente.
- **No asumir que todos los agentes descubren/cargan Skills mediante la misma ruta.**

Este hallazgo es consistente con lo ya documentado en `docs/AGENT-DISCOVERY.md`
(el contrato compacto es idéntico para todos los harnesses; solo cambia el
mecanismo de inyección) — lo confirma desde un ejemplo externo (Archify) sin
introducir nuevos compromisos de diseño.

## Modelo conceptual

```text
capacidad Buffy
    ↓
skill/instrucciones canónicas
    ↓
integración específica del agente
```

- La **capacidad** vive en Buffy (Context + Next) y no se ramifica.
- La **skill/instrucciones canónicas** son la representación única de esa
  capacidad, consumible por cualquier agente.
- La **integración específica** es una capa fina por agente que adapta
  discovery/bootstrap a las convenciones de ese agente (p. ej. `CLAUDE.md` /
  skills en Claude Code, `AGENTS.md` en Codex CLI / OpenCode, reglas en
  Cursor). No contiene lógica propia.

## Agentes relevantes

- Claude Code
- Codex CLI
- Gemini CLI / AGY
- OpenCode
- Cursor
- otros que posteriormente se investiguen

## Estado de evidencia

| Nivel | Estado | Alcance |
|---|---|---|
| **OBSERVADO** | ✅ | Archify utiliza una capacidad/skill común con mecanismos de integración específicos por agente/entorno (Claude Code, Codex CLI, OpenCode, Cursor documentados en su repo). |
| **INFERENCIA ARQUITECTÓNICA** | ⚠️ | Este patrón puede ser útil para Buffy. Es una hipótesis de diseño, no una decisión adoptada. |
| **PENDIENTE** | ⏳ | Comprobar mecánicamente cómo cada agente descubre/carga Buffy (rutas reales de discovery: `CLAUDE.md`, `AGENTS.md`, skills, MCP config, etc.). |
| **NO PROBADO** | ❌ | No afirmar todavía que un mecanismo concreto funciona para Claude Code, Codex, Gemini CLI/AGY, OpenCode, etc. No hay evidencia experimental en este repositorio para esos agentes (OpenCode tiene evidencia propia previa vía MCP, pero eso no valida este patrón de skills canónicas). |

Regla de lectura: cualquier afirmación sobre un agente concreto que no esté
respaldada por evidencia en este repositorio debe tratarse como **NO PROBADO**.

## Referencia

- https://github.com/tt-a1i/archify
- Doc relacionado (patrón convergente interno): `docs/AGENT-DISCOVERY.md`
