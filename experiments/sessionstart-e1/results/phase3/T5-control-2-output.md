# Phase 3: T5 - Condition control

## Condition
Control: No policy instructions

## Response
Thinking...
*   User's computer is running slow ("Mi equipo está yendo lento").
    *   User wants to know what to check first and asks for a diagnosis bas[3D[K
based on the provided JSON context.
    *   Constraint: Answer concisely with specific data.
    *   Context: EndeavourOS (Linux), AMD Ryzen 5 3400G, 13.6GB RAM (7GB av[2D[K
available), SSD/HDD 217GB (58% used), Temp 43°C.

    *   *CPU:* Ryzen 5 3400G (4 cores/8 threads). Not high-end but capable [K
for general tasks.
    *   *RAM:* 13.6 GB total. *Available:* 7.0 GB. This means about 50% is [K
being used. Not critically low, but worth monitoring.
    *   *Storage:* / is 58% used. Plenty of space left (88.3 GB). Disk spac[4D[K
space is likely not the bottleneck.
    *   *Temperature:* 43°C. This is very cool/normal. Thermal throttling i[1D[K
is not the cause.
    *   *OS:* EndeavourOS (Arch-based). Generally efficient.

    *   *RAM usage:* 6.6 GB used. Depending on the apps running, this could[5D[K
could be normal or a sign of a leak.
    *   *CPU load:* The context tells me the hardware, but not the *current[8D[K
*current* load (CPU % usage).
    *   *Disk I/O:* Not provided in the static context.

    *   *Direct Diagnosis:*
        *   Temperature: OK (43°C).
        *   Storage: OK (42% free).
        *   RAM: Moderate usage (7GB free / 13.6GB total).
    *   *Primary suspect:* Since hardware basics (heat, space) are fine, th[2D[K
the slowness is likely due to a specific process consuming CPU or a memory [K
leak.

    *   Need to check `top` or `htop` to see CPU/RAM usage per process.
    *   Need to check `iostat` or `iotop` if it's a disk I/O issue (though [K
less likely given the specs).

    *   Keep it concise.
    *   Use specific data from the JSON.
    *   Suggest specific commands.
...done thinking.

Basado en los datos proporcionados, el hardware está en buen estado general[7D[K
general, pero hay puntos a analizar:

**Diagnóstico rápido:**
*   **Temperatura:** **43°C** (Óptima, no hay *thermal throttling*).
*   **Almacenamiento:** **42% libre** (88.3 GB), no es el cuello de botella[7D[K
botella.
*   **RAM:** Tienes **7.0 GB disponibles de 13.6 GB**. Estás usando casi el[2D[K
el 50% del sistema en reposo o carga ligera; dependiendo de tus apps, podrí[5D[K
podría haber un proceso consumiendo memoria excesiva.

**Qué revisaría primero:**
La lentitud probablemente se deba a un proceso específico consumiendo CPU o[1D[K
o un problema de I/O de disco, ya que el hardware base es suficiente.

**Comandos para verificar ahora mismo:**
1. `top` o `htop`: Para identificar procesos con alto uso de `%CPU` y `%MEM[5D[K
`%MEM`.
2. `iostat -xz 1 5` (si tienes `sysstat`): Para ver si hay latencia en el d[1D[K
disco (`%util`).
3. `free -h`: Para confirmar si el sistema está haciendo *swap* agresivo.

**Veredicto:** No es un problema térmico ni de espacio. Es un problema de *[1D[K
**carga de software (procesos)**.
