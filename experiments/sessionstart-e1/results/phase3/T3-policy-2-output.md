# Phase 3: T3 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   Input: System context JSON (from Buffy) and a user question in Spanish.[8D[K
Spanish.
    *   User question: "¿Mi disco está casi lleno? Dime el porcenta[8D[K
porcentaje de uso y tu evaluación de riesgo." (Is my disk almost full? Tell[4D[K
Tell me the usage percentage and your risk assessment.)
    *   Policy: Use Buffy's facts as the primary source. Do not re-fetch if[2D[K
if provided. Answer concisely.

    *   `storage`: `[{"mount": "/", "total_gb": 217, "free_gb": 88.3, "used[5D[K
"used_percent": 58}]`
    *   Used percentage: 58%
    *   Total: 217 GB
    *   Free: 88.3 GB

    *   Usage percentage: 58%.
    *   Risk assessment: 58% is generally considered low-to-moderate. It's [K
not "almost full". Plenty of space (88.3 GB) remains.

    *   Porcentaje de uso: 58%.
    *   Evaluación: No, no está casi lleno. El riesgo es bajo, ya que tiene[5D[K
tienes 88.3 GB libres.
...done thinking.

Tu disco tiene un **58% de uso**.

**Evaluación de riesgo:** Bajo. No está casi lleno; aún dispones de 88.3 GB[2D[K
GB libres, lo cual es suficiente para el funcionamiento normal del sistema.
