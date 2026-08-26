# E1-SessionStart: Resultados Consolidados (Fases 0-4)

## Resumen Ejecutivo

**Buffy funciona como capa de contexto factual.** El modelo (gemma4:cloud) lee y utiliza los datos provistos por Buffy sin necesidad de instrucciones explícitas.

## Fase 0: Integridad del Pipeline ✅

| Aspecto | Resultado |
|---------|-----------|
| Buffy context se inyecta correctamente | ✅ ~4.3 KB |
| Datos factuales correctos | ✅ GPU, RAM, disco, kernel |
| Bug de temperatura corregido | ✅ thermal_zone0 → k10temp |

## Fase 1: Formato (JSON vs Semantic) ✅

| Métrica | JSON | Semantic | Δ |
|---------|------|----------|---|
| Tamaño | 1,101 B | 547 B | -50% |
| Accuracy T1-T4 | 8.5/8.5 | 8.2/8.5 | -0.3 |
| Tool mentions (T1-T4) | 0.0 | 0.0 | = |

**Hallazgo:** JSON produce accuracy ligeramente mejor en T2 (RAM). Queda como baseline.

## Fase 2: Posición (Early vs Late) ✅

| Métrica | Early | Late | Δ |
|---------|-------|------|---|
| Accuracy T1-T4 | 8.2/8.5 | 8.5/8.5 | +0.3 |
| Latencia promedio | 2,247ms | 2,018ms | -229ms |

**Hallazgo:** Sin efecto relevante de posición.

## Fase 3: Política de Herramientas ✅

| Métrica | Control | Policy | Δ |
|---------|---------|--------|---|
| Buffy references (T1-T4) | 1.1 | 1.4 | +27% |
| Tool mentions (T1-T4) | 0.0 | 0.15 | ≈ |
| Latencia promedio | 3,355ms | 4,121ms | +23% |
| Accuracy T1-T4 | 8.5/8.5 | 8.5/8.5 | = |

**Hallazgo:** El modelo YA usa Buffy espontáneamente. La política agrega overhead sin mejorar comportamiento.

## Fase 4: Outcome Consolidado

### Accuracy por Tarea (max score)

| Tarea | Descripción | Score Máximo | Control | Policy |
|-------|-------------|--------------|---------|--------|
| T1 | GPU + driver | 3.0 | 3.0 ✅ | 3.0 ✅ |
| T2 | RAM disponible | 2.0 | 1.5 | 1.5 |
| T3 | Disco + riesgo | 2.0 | 2.0 ✅ | 2.0 ✅ |
| T4 | OS + kernel | 2.0 | 2.0 ✅ | 2.0 ✅ |
| **Total** | | **9.0** | **8.5** | **8.5** |

### Tool Usage por Tarea

| Tarea | Control | Policy | Interpretación |
|-------|---------|--------|----------------|
| T1 GPU | 0.0 | 0.0 | Buffy suficiente |
| T2 RAM | 0.0 | 0.3 | Policy agrega verificación innecesaria |
| T3 Disco | 0.0 | 0.3 | Policy agrega verificación innecesaria |
| T4 OS | 0.0 | 0.0 | Buffy suficiente |
| T5 Diagnóstico | 5.3 | 4.3 | Tarea dinámica requiere tools |

## Hallazgos Principales

1. **Buffy se utiliza espontáneamente** — no necesita instrucción explícita
2. **JSON es formato óptimo** — mejor accuracy que semantic (leve)
3. **Posición no importa** — early ≈ late
4. **La política no reduce tools** — pero sí incrementa overhead
5. **Tareas dinámicas (T5) siempre necesitan tools** — Buffy no puede reemplazar observación directa

## Arquitectura Confirmada

```
                 BUFFY
                   │
          contexto factual
                   │
                   ▼
                AGENTE
                   │
          ┌────────┴────────┐
          │                 │
     contexto suficiente   necesita verificar
          │                 │
          ▼                 ▼
       razonar             TOOL
          │                 │
          └────────┬────────┘
                   ▼
                RESULTADO
```

**Buffy funciona como caché factual/estado observado.** No reemplaza herramientas; mejora el razonamiento sobre datos disponibles.

## Próximos Pasos

1. **Fase 5: Ablación por campos** — si Fase 4 justifica continuar
2. **Validar con agente real** — usando `claude -p` con herramientas
3. **Probar con múltiples modelos** — generalizar hallazgos
