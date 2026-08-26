# Phase 3: T3 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   Input: System context provided by Buffy (JSON).
    *   Question: "¿Mi disco está casi lleno? Dime el porcentaje de uso y t[1D[K
tu evaluación de riesgo." (Is my disk almost full? Tell me the usage percen[6D[K
percentage and your risk evaluation.)
    *   Constraint: Use Buffy's facts, be concise, only use commands if dat[3D[K
data is missing/dynamic.

    *   `hardware.storage`: `[{"mount": "/", "total_gb": 217, "free_gb": 88[2D[K
88.3, "used_percent": 58}]`

    *   Used percentage: 58%.
    *   Free space: 88.3 GB out of 217 GB.
    *   Evaluation: 58% is not "almost full". There is plenty of space (nea[4D[K
(nearly 90 GB). Risk is low.

    *   Percentage: 58%.
    *   Evaluation: Low risk. The disk is not almost full; you have 88.3 GB[2D[K
GB available.
...done thinking.

Tu disco tiene un **58% de uso**.

**Evaluación de riesgo: Bajo.** No está casi lleno; aún dispones de 88.3 GB[2D[K
GB libres.
