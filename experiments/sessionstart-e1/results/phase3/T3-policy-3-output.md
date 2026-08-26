# Phase 3: T3 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User Question: "¿Mi disco está casi lleno? Dime el porcentaje de uso y [K
tu evaluación de riesgo." (Is my disk almost full? Tell me the usage percen[6D[K
percentage and your risk assessment.)
    *   Context: JSON provided by "Buffy".
    *   Constraint: Use Buffy's facts as primary source. Be concise.

    *   `hardware.storage`: `[{"mount": "/", "total_gb": 217, "free_gb": 88[2D[K
88.3, "used_percent": 58}]`

    *   Usage percentage: 58%.
    *   Risk assessment: 58% is generally considered low to moderate risk. [K
There is still plenty of free space (88.3 GB).

    *   Percentage: 58%.
    *   Evaluation: Low risk. You have 88.3 GB free.
...done thinking.

Tu disco tiene un **58% de uso**.

**Evaluación de riesgo: Bajo.** Aún dispones de 88.3 GB libres, por lo que [K
no está casi lleno.
