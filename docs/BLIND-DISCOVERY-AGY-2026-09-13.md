# BLIND-DISCOVERY-AGY — Experimento de descubrimiento ciego (AGY)

**Fecha:** 2026-09-13
**Agente:** AGY
**Commit de Buffy Next bajo prueba:** `eaad4a9d79a756eb13f8f3c8f02830f1559308e6`
**Estado del commit de distribución:** realizado en `master` local, **todavía SIN PUSH** (verificado: único commit en `origin/master..HEAD` al momento del registro).

Checkpoint de documentación. No se ejecutó un nuevo experimento ni se modificó
código, `scripts/buffy-distribute.sh` ni tests.

---

## OBSERVACIÓN

Experimento de descubrimiento ciego: se utilizó una pregunta ciega que NO
mencionaba Buffy, `~/ai-context/README.md`, `buffy-next`, `buffy-context` ni
rutas específicas. La intención era observar si AGY descubría espontáneamente
el mecanismo global de capacidades/contexto disponible para agentes.

Primeras acciones reales de AGY (en orden):

1. `~/.gemini/antigravity-cli/mcp`
2. `~/.gemini/antigravity-cli/mcp/codegraph`
3. lectura de `instructions.md`
4. lectura de `codegraph_explore.json`
5. búsqueda de `.codegraph` bajo `/home/mangonz`

AGY identificó CodeGraph como el mecanismo de capacidades disponible y
construyó su conclusión alrededor de MCP.

**NO consultó `~/ai-context/README.md` durante este experimento.**

**Contexto experimental previo:** existe un experimento anterior en el que AGY
siguió otro camino de descubrimiento (`.buffy` / `.codegraph` / repositorio
Buffy) y tampoco consultó inicialmente `~/ai-context/README.md`. Esa
comparación se registra como evidencia separada, no como conclusión causal.

## HIPÓTESIS

Las siguientes afirmaciones NO están demostradas por este experimento. Se
registran como hipótesis de trabajo:

1. > AGY parece tender a fijar rápidamente su modelo del entorno sobre
   > mecanismos que detecta directamente en su preflight/harness,
   > particularmente MCP/CodeGraph.

2. > El problema relevante ya no es únicamente si Buffy existe o puede ser
   > descubierto, sino si un agente que ya dispone de un mecanismo propio de
   > herramientas (por ejemplo MCP/CodeGraph) decide consumir Buffy frente a
   > sus mecanismos nativos.

## ACCIÓN

Solo documentación/checkpoint: este reporte. No se diseñó ni ejecutó el
próximo experimento.

No se afirma, ni debe leerse así:

- que Buffy no estaba disponible;
- que `~/ai-context/README.md` no existía;
- que AGY nunca puede descubrir Buffy;
- que el causante demostrado sea exclusivamente el harness.

## EVIDENCIA

**Resultado del experimento:** `DISCOVERY FAIL — GLOBAL RESOURCE NOT CONSUMED`

Lo que sí está demostrado por esta ejecución:

- el agente tenía acceso a un mecanismo MCP/CodeGraph;
- lo consultó primero;
- lo tomó como mecanismo principal de descubrimiento;
- no consumió el punto de entrada global `~/ai-context/README.md` en esta
  ejecución.

Coordenadas verificadas mecánicamente (existen al momento del registro):

| Elemento | Ruta |
|---|---|
| Superficie MCP explorada | `~/.gemini/antigravity-cli/mcp` |
| Adapter CodeGraph | `~/.gemini/antigravity-cli/mcp/codegraph` |
| `instructions.md` leído | `~/.gemini/antigravity-cli/mcp/codegraph/instructions.md` |
| `codegraph_explore.json` leído | `~/.gemini/antigravity-cli/mcp/codegraph/codegraph_explore.json` |
| Búsqueda `.codegraph` bajo home | `~/.codegraph` |
| Punto de entrada global no consumido | `~/ai-context/README.md` (existía) |
| Estado repo al registrar | `master` 1 commit adelante de `origin/master` (sin push) |

## CONCLUSIÓN

Se registra el resultado `DISCOVERY FAIL — GLOBAL RESOURCE NOT CONSUMED` como
resultado de este experimento, manteniendo la separación explícita entre
evidencia (rutas, orden de acceso, resultado) e hipótesis (tendencia del
preflight, competencia con mecanismos nativos).

## ESTADO / PRÓXIMO EXPERIMENTO

- `eaad4a9` (distribución verificada: manifest + plantilla + discovery
  global) está en `master` local, SIN PUSH.
- Próximo experimento de interés (NO diseñado ni ejecutado): evaluar si un
  agente que ya dispone de mecanismo propio de herramientas (p. ej.
  MCP/CodeGraph) decide consumir Buffy frente a sus mecanismos nativos.