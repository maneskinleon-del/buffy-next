Thinking...
*   Input: A JSON-like system context (buffy.context/v1) containing hardwar[7D[K
hardware, environment, and tool information.
    *   Question: Is the root disk of the machine close to being full? Prov[4D[K
Provide the used percentage and a risk assessment.
    *   Constraint: Answer concisely with specific data. If info is missing[7D[K
missing, state it.

    *   Path: `hardware` -> `storage`
    *   Storage entry for mount `/`:
        *   `total_gb`: 217
        *   `free_gb`: 88.2
        *   `used_percent`: 58

    *   Percentage used: 58%
    *   Risk assessment: 58% usage is generally considered low to moderate [K
risk. There is still plenty of free space (88.2 GB).

    *   Used percentage: 58%.
    *   Risk: Low. More than 40% of the disk is still available.
...done thinking.

El disco raíz (`/`) tiene un **58% de uso**. El riesgo es **bajo**, ya que [K
aún dispone de 88.2 GB libres.
