# COMPANION-ARCHITECTURE — Buffy Next + Buffy Context

**Fecha:** 2026-08-29 · **Base:** auditoría `~/experiments/buffy-next-vs-context/RESULTS.md` (v0.2.2, `f44ae06`)

## Modelo

```text
Agent
 ├── Buffy Next
 │    ├── system state        (observación tipada, multiplataforma)
 │    ├── freshness           (por campo: observed/stale/unknown + gating)
 │    ├── diagnosis           (task-adaptive, determinista, next-best-check)
 │    └── safe actions        (ActionGate: canonical requests, tokens single-use)
 │
 └── Buffy Context
      ├── memory              (MEMORY.md / USER.md, persistente entre sesiones)
      ├── knowledge           (Knowledge/ + routing + búsqueda semántica)
      ├── skills              (43 manifiestos skill.yaml con nivel safe)
      └── session state       (CONTINUE.md / SESION.md / handoff)
```

## Principio rector

**La integración ocurre en el nivel del agente, no por dependencia entre repos.**

El agente hace dos preguntas distintas a dos sistemas distintos:

| Pregunta | Sistema | Contrato |
|---|---|---|
| ¿Qué es verdad en esta máquina **ahora**? | Buffy Next | `buffy.context/v1` (`buffy doctor --context`, JSON tipado con freshness) |
| ¿Qué sé yo de este usuario, proyecto y tarea? | Buffy Context | Protocolo LOAD_CONTEXT (`SNAPSHOT.md`, `MEMORY.md`, `CONTINUE.md`, skills) |

Esta separación replica la jerarquía de autoridad que Buffy Context ya usa
internamente (`buffy-source.sh:1-26`): los datos **real-time** (terreno de
Buffy Next) prevalecen sobre facts y snapshot (memoria). Ninguno de los dos
proyectos necesita conocer al otro para que esto funcione.

## Fronteras garantizadas

1. **Buffy Next funciona sin Buffy Context.** Cero imports, cero detección
   obligatoria, cero comportamiento condicionado. Verificado por auditoría:
   `src/` de Buffy Next no contiene ni una referencia a buffy-context.
2. **Buffy Context funciona sin Buffy Next.** Es bash + Markdown + YAML; se
   consume leyendo archivos o ejecutando sus scripts.
3. **La frontera de seguridad no se cruza.** ActionGate, canonical requests,
   executors privados y freshness gating permanecen intactos. La capa de
   memoria/knowledge nunca puede influir en la decisión de ejecución de una
   acción: Buffy Next es determinista, no parsea documentos externos y no
   mantiene estado de sesión.
4. **Sin shared state.** Buffy Next escribe en `~/.buffy/state.json`; Buffy
   Context en `~/ai-context/` y `~/.buffy/memories/` (convención propia).
   Directorios distintos, formatos distintos, dueños distintos.

## Lo que Buffy Next deliberadamente NO hace (non-goals)

- MCP dentro del core (el adapter es externo: `~/experiments/opencode-buffy-cplus/`)
- Auto-injection de contexto en agentes
- Memoria, knowledge, skills o sincronización con Buffy Context
- Dependencia npm, shared database o shared state directory

## Experiencia de instalación (propuesta documentada)

Hoy el onboarding termina en `buffy setup` (verificación de plataforma +
estado inicial, sin prompts). Lugar correcto para ofrecer el companion:

```text
buffy setup
  → ✅ verificación de plataforma
  → ✅ estado inicial guardado
  → ¿Quieres complementar Buffy Next con Buffy Context? [y/N]
       N (default) → fin, todo sigue igual
       y           → imprime instrucciones de clonado de Buffy Context
                     (solo texto; nunca ejecuta nada; nunca depende de ello)
```

**Decisión:** DEFERRED. Implementar el prompt requiere tocar `src/cli.ts`
(runtime). Es un cambio pequeño y compatible (prompt existente `promptUser`,
respuesta por defecto `N`), pero la regla actual es no modificar runtime
salvo por los tres criterios de reentrada. La vía doc-only (esta sección del
README + secciones siguientes) ya cubre el descubrimiento.

Rechazado como alternativa: hook `postinstall` de npm (ejecutaría código en
instalación sin que el usuario lo espere, contrario a la filosofía del
proyecto).

## Detección del companion (propuesta documentada)

¿Es trivial detectar Buffy Context sin convertirlo en dependencia? **Sí**, con
tres restricciones innegociables: (1) solo comprobar **existencia** de rutas
públicas convencionales, nunca leer su contenido; (2) ausencia = el feature
no existe, ningún cambio de comportamiento; (3) ninguna lógica core se ramifica
por ello — salida solo informativa.

```ts
// PROPUESTA — no implementada (deferred). Ubicación futura:
// src/core/companion-detect.ts — función pura, sin dependencias.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MARKERS = [
  join(homedir(), 'buffy-context', 'scripts', 'buffy-context.sh'), // repo clonado
  join(homedir(), 'ai-context', 'SNAPSHOT.md'),                    // artefacto runtime
  join(homedir(), '.buffy', 'memories', 'MEMORY.md'),              // memoria activa
];

export function detectCompanion(): 'detected' | 'not-installed' {
  return MARKERS.some((m) => existsSync(m)) ? 'detected' : 'not-installed';
}
```

Consumo propuesto: una línea informativa en `buffy capabilities` y/o al final
de `buffy setup` (complemento del prompt `[y/N]`). Estado: **DEFERRED** con el
mismo criterio que el prompt: pequeño y seguro, pero es runtime.

## Estado de las dos vías de consumo por agentes

| Vía | Proyecto | Estado |
|---|---|---|
| MCP (`buffy-tools`: buffy_context / buffy_capabilities / buffy_action) | Buffy Next | ✅ Validado (C+ PASS, cross-model) — adapter externo |
| Lectura de archivos / skills al inicio de sesión | Buffy Context | ✅ En uso por convención de agente (`~/.AGENTS.md`) |
