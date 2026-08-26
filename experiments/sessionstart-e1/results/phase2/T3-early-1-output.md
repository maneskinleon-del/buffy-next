# Phase 2: T3 - Position early

## Prompt Structure
Position: early
Order: Buffy Context → Instructions → Query

## Response
Thinking...
*   Input: System context (JSON) and a question in Spanish.
    *   Question: "¿Mi disco está casi lleno? Dime el porcentaje de uso y t[1D[K
tu evaluación de riesgo." (Is my disk almost full? Tell me the usage percen[6D[K
percentage and your risk assessment.)
    *   Constraints: Answer concisely, use specific data from the provided [K
facts, state if information is missing.

    *   Storage section: `{"mount": "/", "total_gb": 217, "free_gb": 88.3, [K
"used_percent": 58}`.
    *   `used_percent`: 58%.

    *   Usage: 58%.
    *   Risk evaluation: 58% is moderate usage; it's not "almost full" (typ[4D[K
(typically >80-90%). Risk is low.

    *   Percentage: 58%.
    *   Risk: Bajo (Low), since there is still plenty of free space (88.3 G[1D[K
GB).
...done thinking.

El uso de tu disco es del **58%**. El riesgo es **bajo**, ya que aún dispon[6D[K
dispones de 88.3 GB libres.
