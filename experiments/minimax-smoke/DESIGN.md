# MiniMax Production Smoke Test

## Estado: EJECUTANDO

**Fecha:** 2026-08-28
**Objetivo:** Validar Buffy Next con MiniMax sin modificar arquitectura

---

## Configuración CONGELADA

```
Task-adaptive
+ Freshness Contract
+ Freshness Gating
+ Compact
+ On-demand refresh
```

## Escenarios (5)

1. **Factual** — Consulta dependiente del sistema
2. **Dynamic** — Estado dinámico del sistema
3. **Stale** — Contexto stale detectado
4. **Unknown** — Campo no disponible
5. **Open** — Consulta abierta

## Condiciones

- MiniMax + Buffy (con gating)
- MiniMax Control (sin Buffy)
- 3 repeticiones por condición

## Métricas

- accuracy / correctness
- unsupported claims
- stale-context violations
- refresh success
- latency
- context size
- audit completeness
