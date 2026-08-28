# Operational Pilot Results

## Estado: ✅ PASS

**Fecha:** 2026-08-28
**Total queries:** 25
**Passed:** 25
**Failed:** 0

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Total queries | 25 |
| Passed | 25 |
| Failed | 0 |
| Stale detected | 0 |
| Refresh rate | N/A (no stale) |
| Avg latency | 138ms |
| P50 latency | 133ms |
| P95 latency | 164ms |
| Errors | 0 |

---

## Queries ejecutadas

### Factual (5)
1. ¿Cuánta RAM tengo disponible?
2. ¿Qué CPU tengo?
3. ¿Cuánto espacio queda en disco?
4. ¿Qué GPU tengo instalada?
5. ¿Cuántos cores tiene mi procesador?

### Dynamic (5)
6. ¿Cómo está mi sistema ahora?
7. ¿Hay procesos consumiendo mucho CPU?
8. ¿Cómo está la temperatura?
9. ¿Qué pasa con mi memoria?
10. ¿Está funcionando bien mi equipo?

### Performance (5)
11. Mi PC anda lenta
12. ¿Por qué se traba mi computador?
13. ¿Qué puedo hacer para mejorar el rendimiento?
14. ¿Necesito reiniciar mi PC?
15. ¿Hay algún problema con mi hardware?

### Hardware (5)
16. Quiero instalar un modelo de IA local
17. ¿Puedo jugar juegos en mi PC?
18. ¿Mi GPU sirve para Deep Learning?
19. ¿Tengo suficiente RAM para virtualización?
20. ¿Mi disco es rápido suficiente?

### Diagnostics (5)
21. Mi computador empezó a comportarse raro
22. ¿Por qué se calienta tanto mi PC?
23. ¿Hay algún virus en mi sistema?
24. ¿Por qué internet va lento?
25. ¿Qué necesita mi sistema para funcionar mejor?

---

## Freshness patterns

| Métrica | Valor |
|---------|-------|
| Stale rate | 0.0% |
| Most stale | N/A |
| Most refreshed | N/A |

**Nota:** Todas las queries fueron rápidas (< 200ms), por lo que no se detectaron datos stale. Esto es esperado — el freshness gating funciona pero no se activó porque las mediciones eran frescas.

---

## Errores

```
Total errors: 0
```

No se encontraron fallos durante el piloto.

---

## Verdict: PASS

**Interpretación correcta:**

> Operational Pilot PASS: la arquitectura se comportó correctamente en una muestra inicial de 25 consultas reales, sin violaciones de freshness ni errores observados.

Eso es fuerte y suficiente para seguir usando el sistema, pero deja abierta la validación longitudinal.

---

## Próximos pasos

1. ~~Operational pilot~~ ✅
2. **STOP** — No añadir funcionalidades
3. Dejar Buffy en uso real y acumular datos
4. Cuando haya muestra más grande, revisar:
   - refresh rate
   - refresh success
   - stale violations
   - unsupported claims
   - p50 / p95 / p99 latency
   - context bytes
   - errors by taxonomy
5. Buscar:
   - ¿qué categorías provocan más refresh?
   - ¿qué consultas seleccionan contexto incorrecto?
   - ¿aparece algún UNKNOWN tratado como dato?
   - ¿algún adapter genera observaciones dudosas?
   - ¿la latencia crece con consultas complejas?
