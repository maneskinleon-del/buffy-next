# Corpus Ciego v0.8-E2 — 20 Consultas

**Frozen:** 2026-08-21
**Constraint:** NOT designed around Buffy's 15 actions or trigger patterns.
**Origin:** Realistic user problems, varied by platform and difficulty.

## Queries

### Windows (5)

| # | Query | Category |
|---|-------|----------|
| W1 | "Mi Teams se cierra solo cuando estoy en una reunión." | clear |
| W2 | "Windows me pide contraseña cada vez que prendo la PC, antes no lo hacía." | ambiguous |
| W3 | "No puedo imprimir desde Word pero sí desde PDF." | unsupported |
| W4 | "El explorador dice que el disco C está en rojo pero no tengo nada instalado." | contradictory |
| W5 | "El Bluetooth se conecta pero no suena nada por los audífonos." | multi-domain |

### Linux (5)

| # | Query | Category |
|---|-------|----------|
| L1 | "Después de actualizar no me deja entrar a mi usuario." | clear |
| L2 | "El wifi dice conectado pero no cargo ninguna página." | ambiguous |
| L3 | "Quiero instalar Docker pero me dice que no tengo permisos." | clear |
| L4 | "Mi laptop se apaga cuando la desconecto de la luz, la batería debería funcionar." | contradictory |
| L5 | "La pantalla parpadea cada vez que abro una app gráfica." | multi-domain |

### Android (5)

| # | Query | Category |
|---|-------|----------|
| A1 | "Mi teléfono se queda en negro cuando llamo." | clear |
| A2 | "Las notificaciones llegan pero no suenan." | ambiguous |
| A3 | "No puedo actualizar apps porque dice almacenamiento lleno." | clear |
| A4 | "La batería dice 100% pero se apaga a los 20%." | contradictory |
| A5 | "El GPS me dice que estoy en otra ciudad." | multi-domain |

### Cross-platform (5)

| # | Query | Category |
|---|-------|----------|
| X1 | "Mi PC hace un ruido raro cuando la prendo." | ambiguous |
| X2 | "Las apps se abren solas y se cierran." | ambiguous |
| X3 | "No puedo conectarme a la wifi en ningún dispositivo." | unsupported |
| X4 | "Mi pantalla se ve amarilla de la nada." | ambiguous |
| X5 | "El mouse se mueve solo y además la pantalla parpadea." | multi-domain |

## Category Distribution

| Category | Count | IDs |
|----------|-------|-----|
| clear | 5 | W1, L1, L3, A1, A3 |
| ambiguous | 5 | W2, L2, A2, X1, X2, X4 |
| unsupported | 2 | W3, X3 |
| contradictory | 3 | W4, L4, A4 |
| multi-domain | 5 | W5, L5, A5, X5 |
| **Total** | **20** | |

**Note:** X4 "pantalla amarilla" is ambiguous because it could be Night Light (software) or hardware issue.

## Frozen Rubric (per response)

| Dimension | 0 | 1 | 2 |
|-----------|---|---|---|
| diagnostic_correctness | Wrong diagnosis | Partially correct | Correct |
| action_correctness | No action or wrong | Generic action | Specific correct action |
| instruction_correctness | No instructions or invented | Generic instructions | Verifiable instructions |
| invention | Invents cause/solution | Warns but invents partially | Does not invent |
| platform_accuracy | Wrong platform | Platform-agnostic | Correct platform-specific |
| unsupported_honesty | Doesn't acknowledge limits | Vaguely acknowledges | Explicitly states limitation |
| clarification_quality | Doesn't clarify | Asks vague question | Asks specific clarifying question |
| excess_actions | 4+ actions | 2-3 actions | 0-1 focused actions |

## Primary Metrics

```
grounding_gain    = C correct AND A incorrect
grounding_regression = C incorrect AND A correct
invention_gain    = A invents AND C does not
invention_regression = C invents AND A does not
```

## Protocol

1. Corpus frozen (this file)
2. Buffy solo (Mode B) — executed against mock adapter
3. Gemma solo (Mode A) — 20 calls to Ollama
4. Gemma + Buffy (Mode C) — 20 calls with Buffy JSON
5. Evaluate all 60 responses with frozen rubric
6. Calculate grounding gain/regression
7. NO modifications to Buffy during experiment
