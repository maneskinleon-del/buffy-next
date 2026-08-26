# Phase 2: T5 - Position late

## Prompt Structure
Position: late
Order: Instructions → Query → Buffy Context

## Response
Thinking...
*   User's problem: "Mi equipo está yendo lento. ¿Qué revisarías primero? D[1D[K
Diagnóstica con los datos que tengas." (My computer is running slow. What w[1D[K
would you check first? Diagnose with the data you have.)
    *   Constraint: Answer concisely with specific data from the system fac[3D[K
facts. If not present, say so.
    *   Input Data: A JSON block containing platform, hardware, environment[11D[K
environment, tools, and privileges.

    *   OS: EndeavourOS (Linux).
    *   CPU: AMD Ryzen 5 3400G (8 cores).
    *   RAM: 13.6 GB total, 7.0 GB available (approx. 51% used).
    *   Storage: / mount, 217 GB total, 88.3 GB free (58% used).
    *   Temp: 43°C (normal).
    *   GPU: Radeon Vega Series.

    *   *RAM:* 7.0 GB available out of 13.6 GB. This isn't critically low, [K
but it's about half used.
    *   *Storage:* 58% used. Plenty of space (88.3 GB free).
    *   *Temperature:* 43°C. Not overheating.
    *   *CPU:* 8 cores (standard for this model).

    *   The provided facts *do not* include current CPU load, active proces[6D[K
process lists, or I/O wait times.
    *   RAM is at ~50% usage.
    *   Temp is fine.
    *   Disk space is fine.

    *   *Observation 1:* RAM usage is at approximately 51% (6.6 GB used of [K
13.6 GB).
    *   *Observation 2:* Temperature is low (43°C), so no thermal throttlin[9D[K
throttling.
    *   *Observation 3:* Disk space is sufficient (88.3 GB free).
    *   *Diagnosis:* Based on the provided facts, there is no immediate har[3D[K
hardware bottleneck (RAM, storage, or temperature). I lack data on CPU load[4D[K
load or running processes to provide a further diagnosis.

    *   "Revisaría el uso de CPU y procesos activos, ya que esa información[11D[K
información no está en los datos."
    *   "Datos actuales: RAM disponible (7.0 GB de 13.6 GB), Temperatura (4[2D[K
(43°C) y Almacenamiento (88.3 GB libres), los cuales están en niveles norma[5D[K
normales."
...done thinking.

Revisaría el uso de CPU y los procesos activos, ya que esa información **no[4D[K
**no está en los datos**.

Basado en los hechos proporcionados, el sistema no presenta cuellos de bote[4D[K
botella evidentes:
* **RAM:** Tienes 7.0 GB disponibles de 13.6 GB (~51% de uso).
* **Temperatura:** 43°C (está en un rango normal).
* **Almacenamiento:** 88.3 GB libres en `/` (58% de uso).
