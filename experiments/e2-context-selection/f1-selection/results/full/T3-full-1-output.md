Thinking...
*   Question: Is the root disk near full?
    *   Required output: Percentage used, risk assessment.
    *   Constraint: Concise, based only on provided system facts.

    *   `hardware` -> `storage` -> `mount: "/"`
    *   `total_gb`: 217
    *   `free_gb`: 88.2
    *   `used_percent`: 58

    *   Percentage used: 58%
    *   Risk: Low (58% is well below a critical threshold like 90%+).
...done thinking.

El disco raíz (`/`) tiene un **58%** de uso. El riesgo es **bajo**, ya que [K
dispone de 88.2 GB libres.
