# E2-ContextSelection: Diseño Experimental

## Pregunta de Investigación

> **¿Qué contexto debe seleccionar Buffy, cuánto debe entregar y cuándo debe actualizarlo?**

## Contexto: De E1 a E2

E1-SessionStart demostró que:
- Buffy funciona como capa de contexto factual
- El modelo lo usa espontáneamente
- OS/kernel, RAM y Disco son campos de alto valor
- GPU, CPU y Temperatura no mostraron utilidad marginal

**E2 busca responder**: ¿cómo optimizar la selección y entrega de contexto?

## Dimensiones de Exploración

### 1. Selección de Contexto

**Pregunta**: ¿Qué campos incluir según la tarea?

| Condición | Descripción |
|-----------|-------------|
| **Full** | Todos los campos (baseline E1) |
| **High-value only** | OS/kernel + RAM + Disco |
| **Task-adaptive** | Seleccionar según tipo de tarea |
| **Minimal** | Solo el campo específico de la tarea |

**Hipótesis**: Task-adaptive produce mejor outcome que Full con menos tokens.

### 2. Cantidad de Contexto

**Pregunta**: ¿Cuánto contexto enviar?

| Condición | Tamaño | Contenido |
|-----------|--------|-----------|
| **Compact** | ~200B | Solo valores clave |
| **Standard** | ~500B | Valores + contexto mínimo |
| **Full** | ~1KB | JSON completo (E1 baseline) |
| **Verbose** | ~2KB | JSON + metadata + historial |

**Hipótesis**: Hay un punto óptimo; más contexto no siempre es mejor.

### 3. Timing de Actualización

**Pregunta**: ¿Cuándo actualizar el contexto?

| Condición | Descripción |
|-----------|-------------|
| **Static** | Contexto fijo al inicio (E1 baseline) |
| **On-demand** | Actualizar solo cuando el usuario pregunta |
| **Periodic** | Actualizar cada N interacciones |
| **Event-driven** | Actualizar cuando cambia un valor crítico |

**Hipótesis**: On-demand es suficiente para la mayoría de tareas.

## Tareas para E2

### Tareas Estáticas (no cambian)
- T1: Identificar GPU
- T2: Evaluar RAM para compilar
- T3: Assess disk space
- T4: Describe OS/kernel

### Tareas Dinámicas (cambian entre runs)
- T5: "¿Qué proceso consume más CPU ahora?"
- T6: "¿Hay suficiente RAM para abrir esta app?"
- T7: "¿El disco se está llenando?"

### Tareas de Cambio de Estado
- T8: "Después de instalar Docker, ¿qué cambió?"
- T9: "Mi equipo se calientó, ¿qué pasó?"
- T10: "¿Sigue funcionando el servidor?"

## Métricas

### Primarias
1. **Accuracy** — ¿respuesta correcta contra Ground Truth?
2. **Tokens used** — ¿cuánto contexto se envió?
3. **Latency** — ¿tiempo de respuesta?

### Secundarias
4. **Context efficiency** — accuracy / tokens
5. **Update frequency** — ¿cuántas actualizaciones necesarias?
6. **Staleness tolerance** — ¿cuánto puede envejecer el contexto?

## Diseño Experimental

### Fase 1: Selección de Contexto
- 4 condiciones × 5 tareas × 3 runs = 60 corridas
- Medir: accuracy, tokens, latency

### Fase 2: Cantidad de Contexto
- 4 condiciones × 5 tareas × 3 runs = 60 corridas
- Medir: accuracy, tokens, efficiency

### Fase 3: Timing de Actualización
- 4 condiciones × 5 tareas × 3 runs = 60 corridas
- Medir: accuracy, staleness, update cost

**Total: 180 corridas**

## Modelo

Usar `gemma4:cloud` (gratis) como E1 para consistencia.

## Éxito

E2 tendrá éxito si:
1. Identifica óptimo de selección de campos
2. Determina punto óptimo de cantidad de contexto
3. Caracteriza tolerancia a stale data
4. Produce recomendaciones accionables para Buffy

## Riesgos

1. **Modelo limitado** — gemma4:cloud puede no generalizar
2. **Tareas dinámicas** — difícil simular cambios reales
3. **Ground Truth** — requiere captura en tiempo real

## Próximos Pasos

1. [ ] Definir tareas dinámicas específicas
2. [ ] Implementar generador de contextos adaptativos
3. [ ] Crear harness de ejecución
4. [ ] Ejecutar Fase 1
