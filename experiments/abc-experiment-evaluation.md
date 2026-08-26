# A/B/C Experiment — Results

**Date:** 2026-08-21
**Buffy version:** 4ac9f68 (frozen)
**Adapter:** Linux (AMD Ryzen 5 3400G, 16GB RAM)

## Mode B — Buffy Solo

### CASE-01: "El mouse se mueve solo."
```
Selection: checks=[], ambiguous=false, confidence=high
Observations: 0
Actions: 0
```
**Veredicto:** ✅ Correcto. No inventa causa para consulta ambigua.

### CASE-02: "Desde ayer mi PC está lenta y Chrome se queda pegado."
```
Selection: checks=[cpu, ram, gpu, temperature, processes]
Observations: 5 (cpu OK, ram OK, gpu OK, temp OK, processes WARNING)
Actions: 2 (inspect-processes, close-heavy-processes) — confidence: high
```
**Veredicto:** ✅ Correcto. focalizado en procesos, no lista de 8 cosas.

### CASE-03: "Mi impresora imprime con colores raros."
```
Selection: checks=[cpu, ram, gpu, storage, temperature, processes] (DEFAULT)
Observations: 6 (all OK except processes WARNING)
Actions: 2 (inspect-processes, close-heavy-processes)
```
**Veredicto:** ⚠️ PROBLEMA. "impresora" no matchea ningún patrón → cayó a DEFAULT_DIAGNOSTIC_CHECKS. Buffy no reconoce que está fuera de cobertura y ejecuta checks genéricos. Debería devolver [] o indicar unsupported.

### CASE-04: "Mi laptop se calienta mucho cuando juego."
```
Selection: checks=[temperature, cpu, processes]
Observations: 3 (cpu OK, temp OK, processes WARNING)
Actions: 2 (inspect-processes, close-heavy-processes)
```
**Veredicto:** ✅ Correcto. Temperatura + procesos.

### CASE-05: "No me deja instalar nada porque el disco está lleno."
```
Selection: checks=[storage, tools, gpu]
Observations: 2 (gpu OK, storage OK at 56%)
Actions: 0
```
**Veredicto:** ⚠️ PROBLEMA. Detecta storage pero no recomienda acción. El disco está al 56% (no ≥85%), por tanto `free-disk-space` no califica por minSeverity='warning'. El usuario dice "disco lleno" pero el sistema real no confirma. Buffy es correcto técnicamente, pero la respuesta no ayuda al usuario.

### CASE-06: "Gracias por la ayuda."
```
Selection: checks=[], ambiguous=false, confidence=high
Observations: 0
Actions: 0
```
**Veredicto:** ✅ Correcto. No-diagnóstico → vacío.

### CASE-07: "Algo anda mal con mi computadora."
```
Selection: checks=[cpu, ram, gpu, temperature, processes]
Observations: 5 (all OK except processes WARNING)
Actions: 2 (inspect-processes, close-heavy-processes)
```
**Veredicto:** ✅ Correcto. Vague → default checks → findings.

### CASE-08: "El internet se corta cada vez que descargo algo pesado."
```
Selection: checks=[network, os, cpu, ram, gpu, temperature, processes]
Observations: 5 (no network observation — adapter no provee network data)
Actions: 2 (inspect-processes, close-heavy-processes)
```
**Veredicto:** ⚠️ PROBLEMA. Selecta network pero `analyzeForQuery` no produce network observation (no hay check de red en el adapter). La selección es correcta pero la observación falta. `mapActions` no tiene acción para network sin evidencia.

### CASE-09: "Tengo poca RAM y además la temperatura sube."
```
Selection: checks=[ram, processes, temperature, cpu]
Observations: 4 (cpu OK, ram OK, temp OK, processes WARNING)
Actions: 2 (inspect-processes, close-heavy-processes)
```
**Veredicto:** ✅ Correcto. Multi-dominio, acciones focalizadas.

### CASE-10: "Estoy frustrado, nada funciona bien en mi PC."
```
Selection: checks=[], ambiguous=false, confidence=high
Observations: 0
Actions: 0
```
**Veredicto:** ⚠️ AMBIGUO. "frustrado" no es término diagnóstico → intent gate devuelve []. Técnicamente correcto por v0.5-B, pero el usuario espera que se investigue. Este es un gap del selector léxico, no del pipeline.

## Resumen Mode B

| Caso | Selection | Actions | ¿Correcto? |
|------|-----------|---------|------------|
| 01 mouse solo | [] | 0 | ✅ |
| 02 PC lenta+Chrome | [5 checks] | 2 | ✅ |
| 03 impresora | [DEFAULT 6] | 2 | ⚠️ fuera de cobertura |
| 04 laptop caliente | [3 checks] | 2 | ✅ |
| 05 disco lleno | [3 checks] | 0 | ⚠️ umbral no alcanzado |
| 06 gracias | [] | 0 | ✅ |
| 07 algo anda mal | [5 checks] | 2 | ✅ |
| 08 internet corta | [7 checks] | 2 | ⚠️ sin observación red |
| 09 RAM+temp | [4 checks] | 2 | ✅ |
| 10 frustrado | [] | 0 | ⚠️ gap léxico |

**Score B:** 5/10完全正确o, 4/10 con gaps, 1/10 ambiguo

## Gaps detectados (NO corregir — documentar para análisis)

1. **CASE-03:** Selector léxico no tiene patrón para "impresora" → cae a DEFAULT
2. **CASE-05:** Disco al 56% no califica por minSeverity, usuario dice "lleno"
3. **CASE-08:** Adapter no provee datos de red → selección correcta sin observación
4. **CASE-10:** "frustrado" no es término diagnóstico → intent gate correcto pero UX pobre

## Modos A y C — Pendientes (requieren Gemma 2B)

Para cada caso, ejecutar:

**Modo A (Gemma solo):**
```
Usuario: [query]
Gemma: [respuesta]
```

**Modo C (Gemma + Buffy):**
```
Usuario: [query]
Gemma → consulta Buffy
Buffy → [JSON]
Gemma → [respuesta basada en JSON]
```

Guardar salida exacta de cada modo. Evaluar con rúbrica:

| Criterio | 0 | 1 | 2 |
|----------|---|---|---|
| Diagnóstico | Incorrecto | Parcial | Correcto |
| Acción recomendada | Ninguna/inapropiada | Correcta pero vaga | Correcta y específica |
| Instrucciones | No tiene/inventadas | Genéricas | Verificables |
| Seguridad | Inventa soluciones | Advierte pero inventa parcialmente | No inventa |
| Plataforma | Incorrecta | No específica | Correcta |
| Incertidumbre | No la reconoce | La menciona pero no respeta | La respeta |
| Utilidad | No ayuda | Ayuda parcialmente | Resuelve el problema |
| Sobrecarga | Lista de 8+ cosas | 4-5 cosas | 1-3 acciones focalizadas |
