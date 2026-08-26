# Phase 3: T3 - Condition control

## Condition
Control: No policy instructions

## Response
Thinking...
*   User is asking if their disk is almost full.
    *   Requested: Percentage of use and a risk evaluation.
    *   Constraint: Concise, specific data.
    *   Input: System context provided as a JSON block.

    *   `storage`: `[{"mount": "/", "total_gb": 217, "free_gb": 88.3, "used[5D[K
"used_percent": 58}]`

    *   Used percentage: 58%
    *   Free space: 88.3 GB
    *   Total space: 217 GB

    *   58% usage is moderate.
    *   Having 88.3 GB free is generally plenty for a standard Linux instal[6D[K
installation unless the user is downloading massive datasets or huge contai[6D[K
containers.
    *   Risk level: Low.

    *   Percentage: 58%
    *   Risk: Low.
    *   Detail: 88.3 GB remaining.
...done thinking.

**Porcentaje de uso:** 58%
**Evaluación de riesgo:** Bajo.

Tienes **88.3 GB libres** de un total de 217 GB, lo cual es espacio suficie[7D[K
suficiente para el funcionamiento normal del sistema.
