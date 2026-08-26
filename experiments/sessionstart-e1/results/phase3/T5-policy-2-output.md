# Phase 3: T5 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User's team/computer is running slow ("Mi equipo está yendo lento").
    *   Goal: What to check first? Diagnose based on provided system facts.[6D[K
facts.
    *   Constraint: Use Buffy's context as primary source. Be concise[7D[K
concise. Only suggest commands if data is missing or dynamic.

    *   OS: EndeavourOS (Linux).
    *   CPU: AMD Ryzen 5 3400G (8 cores).
    *   RAM: 13.6 GB total, 7.0 GB available.
    *   Storage: / mount, 217 GB total, 88.3 GB free (58% used).
    *   Temp: 43°C (Normal).
    *   RAM Availability: $\approx 51\%$ free.

    *   *CPU:* Hardware is decent (Ryzen 5). No indication of overheating ([1D[K
(43°C).
    *   *RAM:* 7 GB free out of 13.6 GB. Plenty of headroom for general use[3D[K
use.
    *   *Storage:* 88 GB free. Not full enough to cause significant swap th[2D[K
thrashing or disk-full slowdowns.
    *   *Software:* Node.js v26, Python 3.14, etc. (Very bleeding edge/futu[9D[K
edge/future versions, though this doesn't inherently slow down the system u[1D[K
unless a specific process is leaking).

    *   Based on the static facts provided by Buffy, there is no obvious ha[2D[K
hardware bottleneck (RAM is okay, Disk is okay, Temp is okay).
    *   Since the system *is* slow but the *capacity* is fine, the problem [K
must be *dynamic* (current resource usage).

    *   Check active processes (CPU/RAM spikes).
    *   Check I/O wait (disk activity).
    *   Check for zombie processes or memory leaks.

    *   Mention that based on Buffy's data, basic hardware capacity is fine[4D[K
fine (RAM and Disk have plenty of space, temperature is low).
    *   Point out that since capacity isn't the issue, we need to check *cu[3D[K
*current usage*.
    *   Suggested command: `top` or `htop` to identify resource-heavy proce[5D[K
processes.
...done thinking.

Basado en los datos de Buffy, tu hardware tiene capacidad suficiente y no h[1D[K
hay cuellos de botella evidentes en los recursos estáticos:

1.  **RAM:** Tienes 7 GB disponibles de 13.6 GB (~51% libre), lo cual es sa[2D[K
saludable.
2.  **Almacenamiento:** El disco `/` tiene 88.3 GB libres (solo 58% usado),[7D[K
usado), por lo que no hay lentitud por falta de espacio.
3.  **Temperatura:** 43°C es una temperatura óptima; no hay *thermal thrott[6D[K
throttling*.

**Diagnóstico:** El problema no es de capacidad, sino de **uso dinámico**.

**Qué revisar primero:**
Necesito verificar qué procesos están consumiendo los recursos en tiempo re[2D[K
real, ya que Buffy solo dio el estado general y no la carga actual. Ejecuta[7D[K
Ejecutaría:
*   `top` o `htop` para identificar procesos con alto uso de CPU o fugas de[2D[K
de memoria.
*   `iostat` o `iotop` para descartar que el disco esté saturado por operac[6D[K
operaciones de lectura/escritura (I/O wait).
