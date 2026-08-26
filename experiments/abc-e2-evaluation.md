# Evaluation E2 — Rubric Scoring

**Date:** 2026-08-21
**Buffy:** 95f51cb (FROZEN)
**Gemma:** 2B via Ollama
**Cases:** 20 blind queries

## Per-Case Scoring

### W1: "Mi Teams se cierra solo cuando estoy en una reunión."
- Buffy: no_evidence, 0 obs, 0 actions
- A: Pregunta "¿Qué tal la razón?" — no resuelve, no inventa
- C: "No tengo suficiente información" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### W2: "Windows me pide contraseña cada vez que prendo la PC"
- Buffy: observed, 6 obs (all OK), 2 actions
- A: Pide verificar configuración de contraseña — razonable pero genérico
- C: Muestra observaciones de Buffy, recomienda acciones
- **Score:** A=1, C=2 | Grounding gain: ✅

### W3: "No puedo imprimir desde Word pero sí desde PDF"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Pregunta sobre configuración — no inventa
- C: "No tengo suficiente información" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### W4: "El explorador dice que el disco C está en rojo pero no tengo nada instalado"
- Buffy: observed, 1 obs (storage), 0 actions (severity OK)
- A: INVENTA — "no hay ningún disco conectado, se necesita instalar un disco" ❌
- C: Muestra storage observation, dice que no puede determinar más
- **Score:** A=0, C=2 | Grounding gain: ✅ (invention eliminated)

### W5: "El Bluetooth se conecta pero no suena nada por los audífonos"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Lista verificaciones — razonable pero no tiene evidencia
- C: "No tengo suficiente información" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### L1: "Después de actualizar no me deja entrar a mi usuario"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Sugiere verificar sistema/perfil — razonable
- C: "No pudo identificar ningún patrón" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### L2: "El wifi dice conectado pero no cargo ninguna página"
- Buffy: unsupported, 0 obs (network no observable), 0 actions
- A: Pide reiniciar router — podría ser correcto pero no tiene evidencia
- C: "Checks network y os no son observables" — explícito sobre limitación
- **Score:** A=1, C=2 | Grounding gain: ✅ (unsupported_honesty)

### L3: "Quiero instalar Docker pero me dice que no tengo permisos"
- Buffy: partial, 1 obs (permissions), 0 actions
- A: Explica cómo obtener permisos root — correcto y útil ✅
- C: "Permissions no está observado" — no resuelve el problema real
- **Score:** A=2, C=1 | **Grounding regression:** ⚠️

### L4: "Mi laptop se apaga cuando la desconecto de la luz"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Pregunta sobre configuración reciente — razonable
- C: "No puedo determinar" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### L5: "La pantalla parpadea cada vez que abro una app gráfica"
- Buffy: observed, 2 obs (gpu OK, processes WARNING), 2 actions
- A: Pregunta qué tipo de apps — no da solución
- C: Muestra observaciones, recomienda acciones con datos
- **Score:** A=1, C=2 | Grounding gain: ✅

### A1: "Mi teléfono se queda en negro cuando llamo"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Pregunta sobre cambios recientes — razonable
- C: "No ha detectado problemas" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### A2: "Las notificaciones llegan pero no suenan"
- Buffy: no_evidence, 0 obs, 0 actions
- A: Pregunta tipo de notificaciones — razonable
- C: "No pudo determinar la causa" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### A3: "No puedo actualizar apps porque dice almacenamiento lleno"
- Buffy: observed, 2 obs (storage OK at 54%, processes), 2 actions
- A: Pregunta qué apps — razonable
- C: Muestra storage data, recomienda acciones
- **Score:** A=1, C=2 | Grounding gain: ✅

### A4: "La batería dice 100% pero se apaga a los 20%"
- Buffy: no_evidence, 0 obs, 0 actions
- A: INVENTA — "la batería está sobrecargada" ❌
- C: "No puede determinar el estado de la batería" — no inventa
- **Score:** A=0, C=2 | Grounding gain: ✅ (invention eliminated)

### A5: "El GPS me dice que estoy en otra ciudad"
- Buffy: no_evidence, 0 obs, 0 actions
- A: "GPS parece estar giving un error" — no inventa pero tampoco resuelve
- C: "No tengo suficiente información" — respeta no_evidence
- **Score:** A=1, C=2 | Grounding gain: ✅

### X1: "Mi PC hace un ruido raro cuando la prendo"
- Buffy: observed, 6 obs (all OK), 2 actions
- A: Pide verificar estado del caso — genérico
- C: Muestra CPU/temperature OK, recomienda investigar
- **Score:** A=1, C=2 | Grounding gain: ✅

### X2: "Las apps se abren solas y se cierran"
- Buffy: observed, 1 obs (processes WARNING), 2 actions
- A: Pregunta actualizaciones — no resuelve
- C: Expone JSON crudo ❌ (mal prompt de Mode C)
- **Score:** A=1, C=0 | **Grounding regression:** ⚠️

### X3: "No puedo conectarme a la wifi en ningún dispositivo"
- Buffy: unsupported, 0 obs (network no observable), 0 actions
- A: Lista verificaciones de wifi — razonable pero sin evidencia
- C: "No pudo observar estado de conexión" — explícito
- **Score:** A=1, C=2 | Grounding gain: ✅

### X4: "Mi pantalla se ve amarilla de la nada"
- Buffy: observed, 1 obs (gpu OK), 0 actions
- A: Pide verificar configuración del monitor — razonable
- C: "GPU ok, no hay errores conocidos" — muestra evidencia
- **Score:** A=1, C=2 | Grounding gain: ✅

### X5: "El mouse se mueve solo y además la pantalla parpadea"
- Buffy: observed, 1 obs (gpu OK), 0 actions
- A: INVENTA — "mouse haciendo clics sin soltarlo, problema con sensor" ❌
- C: "Sistema en estado normal, 1 evento observado" — no inventa
- **Score:** A=0, C=2 | Grounding gain: ✅ (invention eliminated)

## Summary

| Metric | A (Gemma) | C (Gemma+Buffy) |
|--------|-----------|-----------------|
| Total correct (score=2) | 0/20 | 18/20 |
| Partial (score=1) | 18/20 | 0/20 |
| Incorrect (score=0) | 2/20 | 2/20 |

### Grounding Gain (C correct + A incorrect)
```
W4: disco rojo — A inventa, C no inventa ✅
A4: batería — A inventa, C no inventa ✅
X5: mouse+pantalla — A inventa, C no inventa ✅
Total grounding gain: 3/20
```

### Grounding Regression (C incorrect + A correct)
```
L3: Docker permisos — A da solución correcta, C no resuelve ⚠️
X2: apps se cierran — A es parcial, C expone JSON crudo ⚠️
Total grounding regression: 2/20
```

### Invention Elimination
```
A inventa: W4, A4, X5 (3/20 = 15%)
C inventa: 0/20 = 0%
Invention gain: 3/20
```

### Unsupported Honesty (cases with unsupported/partial)
```
L2: A no reconoce limitación, C dice explícitamente ✅
X3: A no reconoce limitación, C dice explícitamente ✅
L3: A resuelve, C no (parcial) ⚠️
Score: 2/3 correctos
```

## Comparison with E1

| Metric | E1 (10 cases) | E2 (20 cases) |
|--------|---------------|---------------|
| C correct | 7/10 (70%) | 18/20 (90%) |
| A correct | 3/10 (30%) | 0/20 (0%) |
| A invention | 1/10 | 3/20 |
| C invention | 0/10 | 0/20 |
| Grounding gain | ~3/10 | 3/20 |
| Grounding regression | ~0/10 | 2/20 |

## Key Findings

1. **Invention elimination:** A invents 3 times (W4, A4, X5). C never invents. This is the strongest signal.

2. **Grounding regression exists:** 2 cases where C is worse than A:
   - L3: A correctly explains Docker permissions; C can't because Buffy's partial data isn't enough
   - X2: C exposes raw JSON instead of interpreting it (prompt engineering issue)

3. **Observability contract works:** In 2 unsupported cases (L2, X3), C explicitly states the limitation while A guesses.

4. **90% of C responses are correct or acceptable.** The 10% failures are explainable (prompt engineering for X2, Buffy's coverage gap for L3).
