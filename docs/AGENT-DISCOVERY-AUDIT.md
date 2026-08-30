# AGENT-DISCOVERY-AUDIT — Auditoría del contrato de descubrimiento

**Fecha:** 2026-08-29 · **Artefactos auditados:** `BUFFY-AGENT-CONTRACT.md`,
`BUFFY-AGENT-CONTRACT-COMPACT.md`, `AGENT-DISCOVERY.md`,
`tests/agent-contract.test.ts` · **Base:** v0.2.2+ (`d1561c6`)

## 1. ¿El contrato representa fielmente Buffy Next?

**Sí.** Cada afirmación del contrato está anclada a una interfaz pública real,
verificada en el código (auditoría previa del repo):

| Afirmación del contrato | Evidencia en el repo |
|---|---|
| "environment specialist for AI agents" | README.md ("motor de operaciones que otros agentes pueden usar como herramienta"), `src/tool.ts:4-5` ("transport layer, not a brain") |
| context → `buffy doctor --context` → `buffy.context/v1` | `src/cli.ts:114-116`, `src/core/context.ts:20`, contrato en `src/core/types.ts:429-476` |
| capabilities → `buffy capabilities --json` | `src/cli.ts:124-132` |
| action → `buffy act <id>` con niveles auto_safe/confirm/forbidden | `src/cli.ts:176-192`, `src/core/action-gate.ts:80-199`, `src/core/types.ts:79` |
| MCP: buffy_context / buffy_capabilities / buffy_action | adapter externo `~/experiments/opencode-buffy-cplus/adapter/buffy-mcp-server.js:55,115,164` (no forma parte del repo, y el contrato lo dice) |
| "not memory" | `~/.buffy/state.json` solo guarda lastScan + historial de acciones (`src/state/store.ts`); sin memoria entre sesiones |
| "never a shell" | Solo 9 acciones de catálogo; `forbidden` jamás se ejecuta (`action-gate.ts:97-99`); `--json` en act no ejecuta (`pipeline.ts:442-446`) |
| "observes and recommends; the agent reasons and decides" | `diagnose.ts:3` ("observe + recommend, NEVER executes") |

Matices de fidelidad asumidos deliberadamente: el contrato no promete
provenance por medición (la granularidad temporal real es por scan — hallazgo
de auditoría `context.ts:150-160`), y no menciona `buffy diagnose` en la
versión compacta para mantener el presupuesto; sí aparece en el contrato
completo como interface adicional.

## 2. ¿Es suficientemente pequeño?

**Sí.** Medición del compacto (ver sección Métrica en el informe de la tarea):

```text
bytes:    1000 (presupuesto contractual: < 2048, test en CI)
palabras: 126
tokens:   ~250 aprox. (heurística chars/4; sin tokenizer instalado)
```

Eso es ~0.3% de una ventana de 100k tokens: inyectable incluso en agentes con
contexto mínimo. La validación semántica incluye el presupuesto como test
(`< 2048 bytes`), así que el tamaño es parte del contrato, no una esperanza.

## 3. ¿Qué información necesita un agente para decidir usar Buffy?

Exactamente los 7 elementos que exige el contrato (y que el test garantiza):

1. **Identity** — qué es ("environment specialist") y qué no es.
2. **Role** — observa/diagnostica/ejecuta autorizadas.
3. **Context** — cómo obtener el estado actual (`buffy.context/v1`).
4. **Capabilities** — cómo listar lo disponible.
5. **Action** — cómo ejecutar algo autorizado.
6. **Safety boundary** — ActionGate como autoridad final; no es un shell.
7. **Non-goals** — "never for": código, razonamiento, memoria, shell arbitrario.

Los non-goals son tan decisivos como los usos: evitan que el agente intente
usar Buffy como grep, como shell o como memoria — los tres usos erróneos más
probables.

## 4. ¿Qué información NO necesita?

- Detalles de implementación (módulos core, política de freshness por
  categoría, estructura interna de `GatedResult`).
- Historia del proyecto, experimentos E1–E4.2, evidencia de validación.
- La relación con buffy-context (una línea en el contrato completo basta;
  el compacto ni la necesita — "not memory" cubre el caso práctico).
- Instrucciones de instalación (el agente consume, no instala).
- Diferencias de plataforma internas (adapters); `buffy.context/v1` ya
  abstrae eso.
- Mecanismos propios del harness (cómo registrar un MCP, etc.): eso lo sabe
  el harness, y está en `AGENT-DISCOVERY.md` para el humano que configura.

## 5. ¿Puede reutilizarse entre OpenCode, ZCode, Codex y Claude sin cambiar la definición de Buffy?

**Sí** — ese es el diseño. La definición vive en el contrato (independiente del
harness); solo cambia el mecanismo de inyección (`~/.AGENTS.md` / `AGENTS.md` /
`CLAUDE.md` / `instructions` de opencode.json) y el transporte de herramientas
(MCP o subprocess CLI). `AGENT-DISCOVERY.md` documenta los cuatro patrones con
el mismo flujo:

```text
harness → discovery contract → Buffy tools → Buffy Next
```

Evidencia de portabilidad real: el spike C+ ya validó el transporte MCP con 10
modelos distintos vía OpenCode+OmniRoute (cross-model PASS); el contrato solo
formaliza lo que esos modelos ya consumieron.

## Cobertura de la validación semántica

`tests/agent-contract.test.ts` (patrón de `docs-install.test.ts` — marcadores
semánticos, no texto literal):

| Test | Garantía |
|---|---|
| identity + role | "environment specialist" + "ai agents" |
| 3 interfaces canónicas | context / capabilities / action |
| entry points reales | `buffy doctor --context`, `buffy.context/v1`, `buffy capabilities --json`, `buffy act` |
| frontera de seguridad | ActionGate + auto_safe |
| non-goals | "never for" + "arbitrary shell" + "memory" |
| autoexplicativo | no remite a otros docs como lectura obligada |
| presupuesto | < 2048 bytes |

Riesgo de fragilidad: bajo — si se reescribe el compacto, fallan solo los
tests de los elementos eliminados, que es exactamente la señal deseada.
