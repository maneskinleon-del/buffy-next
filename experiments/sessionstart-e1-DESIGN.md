# E1-SessionStart — ¿Aporta Buffy contexto si el agente ya tiene contexto enorme?

> Diseño experimental. Baseline congelado: `a981ca9` (integración SessionStart portable).
> Estado: DISEÑO — no ejecutado aún. Sin cambios en `src/`.

## Pregunta central

No es "¿obedeció el hook?" (ya demostrado en el clone limpio). Es:

> **¿Aporta algo una capa de contexto seleccionada cuando el agente puede consumir
> un contexto enorme por sí mismo?**

## Condiciones

| Condición | Setup |
|---|---|
| **CONTROL** | clone de `a981ca9` con `.claude/settings.json` desactivado (renombrado a `settings.json.off`) |
| **BUFFY** | clone idéntico de `a981ca9`, SessionStart activo → `buffy.context/v1` inyectado |

Constantes: mismo modelo, mismo repo (commit fijado), misma tarea, mismo cwd.
Variable única: presencia del contexto inyectado.

⚠️ Contaminación: cada corrida debe ser una **sesión fresca** (nunca el mismo
agente que ya conoce el repo/sistema). El experimentador no participa como sujeto.

**Sujeto (decisión 2026-08-25): fases.**
- **Fase A:** Claude Code real con/sin hook — máxima fidelidad end-to-end.
- **Fase B (solo si A es ruidoso):** contexto pasado manualmente al prompt para
  aislar variables.

**Baseline sellado:** tag `integration-baseline` → `a981ca9`.

## Tareas

Criterio de diseño: la respuesta debe estar en `buffy.context/v1` y ser
**verificable contra ground truth real** del sistema. Prohibido inventar tareas.

| # | Tarea | Dato en Buffy | Ground truth | Trampa |
|---|---|---|---|---|
| T1 | "¿Qué GPU tengo y su driver está genérico?" | `hardware.gpu*` | `lspci -k` / reporte Buffy | sin Buffy tiende a asumir driver |
| T2 | "¿Puedo compilar un proyecto que necesita 8GB RAM?" | `ram_available_gb` | `free -m` | dato volátil: snapshot ≠ consulta posterior |
| T3 | "¿El disco raíz está cerca de llenarse?" | `storage[0]` | `df -h /` | umbral explícito |
| T4 | "¿Qué SO/kernel corre esta máquina?" | `platform.*` | `uname -a` | trivial con shell; mide si Buffy ahorra la consulta |
| T5 | Diagnóstico abierto: "el equipo va lento" | temperatura+RAM+disco | juicio ciego de 2 evaluadores | calidad de priorización, no dato único |

## Métricas

1. **Correctitud**: respuesta vs ground truth (binario por tarea).
2. **Invención rate**: afirmaciones fácticas sin fuente (crítico — señal fuerte en E2).
3. **Consultas al sistema**: nº de comandos ejecutados para responder (Buffy debería reducirlos a ~0 en T1–T4).
4. **Tiempo/latencia** hasta respuesta final.
5. En T5: ranking de prioridades — ¿coincide con lo que el sistema realmente reporta como problema?

## Protocolo

1. Preparar los dos clones + fixtures de tareas con redacción ciega.
2. n≥3 corridas por condición por tarea (sesiones frescas), orden aleatorizado.
3. Salidas anonimizadas (quitar marcas de condición) antes de puntuar.
4. Puntuación ciega por 2 evaluadores + ground truth automático donde exista.
5. Registro crudo en `experiments/sessionstart-e1-results/` (sin commitear hasta análisis).

## Reglas metodológicas (congeladas — no negociables)

1. **Diseño congelado antes de ejecutar:** las tareas NO se modifican después de ver
   resultados parciales. Orden estricto: diseño → CONTROL completo → BUFFY completo →
   outputs crudos → puntuación. Prohibido "mejorar" tareas a mitad de experimento.
2. **Métricas estrictamente separadas, sin score compuesto.** Se analiza el PERFIL:
   correctitud / invención / system queries / latencia / priorización, cada una sola.
   Un resultado tipo "accuracy ≈ igual, invención ↓ mucho, queries ↓" es una victoria;
   "todo ≈ igual o peor" también es un resultado útil (coste no justificado para agentes
   de contexto enorme). La agregación en un score único queda PROHIBIDA hasta que el
   perfil esté discutido y documentado.
3. **Outputs crudos intactos:** las salidas de cada sesión se conservan sin resumir ni
   editar. La puntuación se hace sobre copias anonimizadas; los crudos quedan como
   evidencia primaria.
4. **Ground truth capturado POR CORRIDA** (no una vez): RAM disponible es volátil —
   `capture-ground-truth.sh` registra el estado real del sistema junto a cada output,
   con timestamp comparable al `generated_at` del snapshot de Buffy (relevante para T2).
5. **Timing del ground truth:** capturar INMEDIATAMENTE después de la respuesta final
   del agente — ni antes (el dato no correspondería a la corrida), ni mucho después.
   En T2 la relación temporal ES parte de la prueba: se distingue "Buffy observó X en
   generated_at Y" de "había Z al momento de responder" SIN llamar automáticamente a
   ninguna de las dos "incorrecta".
6. **No ayudar al agente accidentalmente:** al pegar T1–T5, pegar EXACTAMENTE el texto
   de la tarea y esperar la respuesta final. PROHIBIDO durante la corrida: aclarar,
   corregir, sugerir comandos, explicar Buffy o reaccionar a preguntas intermedias.
   Cualquier intervención humana es una variable experimental.

## Infraestructura Fase A (preparada 2026-08-25)

```text
~/e1/control/   ← clone A: SessionStart DESACTIVADO (settings.json renombrado)
~/e1/buffy/     ← clone B: SessionStart ACTIVO (dist compilado, verificado rc=0)
experiments/sessionstart-e1/tasks/T{1..5}.md        ← prompts ciegos listos para pegar
experiments/sessionstart-e1/capture-ground-truth.sh ← captura por corrida (verificada)
experiments/sessionstart-e1/results/control|buffy/  ← outputs crudos + ground truth (untracked)
```

Uso por corrida:
`experiments/sessionstart-e1/capture-ground-truth.sh <control|buffy> <T#> <run#>`
y guardar la salida cruda del agente junto al ground truth con el mismo nombre.

Ambos clones parten del tag `integration-baseline`. Los clones viven fuera del repo
principal para que el sujeto nunca vea el directorio de experimentos.

## Criterio de éxito

- BUFFY > CONTROL en invención rate y consultas al sistema, sin pérdida de correctitud.
- Resultado nulo también es publicable internamente: si un agente de contexto enorme
  no se beneficia, la propuesta de valor de Buffy se reformula (¿agentes pequeños?
  ¿entornos sin shell? ¿costo por token?).

## Fuera de alcance (congelado)

UserPromptSubmit · `buffy bootstrap` · telemetría adicional · adapters Codex/Gemini ·
cambios en `src/` · auto-build/auto-install.
