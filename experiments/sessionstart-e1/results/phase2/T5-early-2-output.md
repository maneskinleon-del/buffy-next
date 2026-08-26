# Phase 2: T5 - Position early

## Prompt Structure
Position: early
Order: Buffy Context → Instructions → Query

## Response
Thinking...
*   Input: System context JSON (Buffy).
    *   Constraint: Answer concisely using specific data from the provided [K
facts. If not available, say so.
    *   Language: Spanish.
    *   Question: "My computer is running slow. What would you check first?[6D[K
first? Diagnose with the data you have."

    *   OS: EndeavourOS (Linux).
    *   CPU: AMD Ryzen 5 3400G (8 cores).
    *   RAM: 13.6 GB total, 7.0 GB available (~51% used).
    *   GPU: Radeon Vega Series.
    *   Storage: / mount, 217 GB total, 88.3 GB free (58% used).
    *   Temperature: 43°C.

    *   *CPU:* 8 cores, seems fine.
    *   *RAM:* 7.0 GB available out of 13.6 GB. Not fully exhausted, but ab[2D[K
about half is used.
    *   *Storage:* 88.3 GB free (41% free). Not critically low.
    *   *Temperature:* 43°C. This is very cool/normal.

    *   RAM: 7GB available is decent, but check if a specific process is ho[2D[K
hogging the other 6.6GB.
    *   Storage: 58% used is fine.
    *   Temp: 43°C is optimal.
    *   Conclusion: Based *only* on these static snapshots, there is no obv[3D[K
obvious hardware bottleneck (CPU, RAM, Disk space, or Heat).

    *   Start with the most suspicious data point: RAM (since it's the only[4D[K
only one showing significant usage, though not critical).
    *   Mention temperature is fine.
    *   Mention storage is fine.
    *   Conclude that the data doesn't show a clear cause.
...done thinking.

Revisaría primero la **memoria RAM**, ya que tienes **7.0 GB disponibles de[2D[K
de 13.6 GB** (aproximadamente un 51% en uso).

Diagnóstico con los datos disponibles:
*   **Temperatura:** 43°C (Normal/Óptima, no hay estrangulamiento térmico).[9D[K
térmico).
*   **Almacenamiento:** 88.3 GB libres (41% disponible, no hay sat[3D[K
saturación de disco).
*   **CPU:** 8 núcleos (Suficiente para tareas generales).

No hay un cuello de botella evidente en los datos proporcionados; la lentit[6D[K
lentitud podría deberse a un proceso específico consumiendo esos 6.6 GB de [K
RAM o a un problema de software no reflejado aquí.
