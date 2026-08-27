Thinking...
*   Input: A JSON structure containing system information (`buffy.context/v[17D[K
(`buffy.context/v1`) and a specific question in Spanish.
    *   Question: "¿El disco raíz de esta máquina está cerca de llenarse? D[1D[K
Dame el porcentaje usado y tu lectura del riesgo." (Is the root disk of thi[3D[K
this machine close to being full? Give me the percentage used and your risk[4D[K
risk assessment.)
    *   Constraint: Answer concisely with specific data from the system fac[3D[K
facts. If info is missing, say so.

    *   `platform`: EndeavourOS, kernel 6.18.45-2-lts.
    *   `hardware.ram_gb`: 13.6
    *   `hardware.storage`:
        *   mount: "/" (Root disk)
        *   total_gb: 217
        *   free_gb: 88.2
        *   used_percent: 58

    *   Disk: Root (`/`)
    *   Percentage used: 58%
    *   Risk assessment: 58% is generally considered moderate/low. It's not[3D[K
not "close to filling up" (usually > 80-90% is critical).

    *   Percentage used: 58%
    *   Risk: Low. 88.2 GB are still free.
...done thinking.

El disco raíz (`/`) tiene un **58%** de uso. El riesgo es **bajo**, ya que [K
aún dispone de 88.2 GB libres.
