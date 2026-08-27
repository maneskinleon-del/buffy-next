Thinking...
*   Input: JSON object containing system facts (OS: EndeavourOS, Kernel: 6.[2D[K
6.18.45-2-lts, RAM: 13.6GB total / 7.1GB available, Storage: 217GB total / [K
88.2GB free / 58% used) and a user complaint ("El equipo me va lento última[6D[K
últimamente").
    *   Constraint: Answer concisely, use specific data from the facts, and[3D[K
and state if information is missing.

    *   RAM: 13.6 GB total, 7.1 GB available. This means about 48% of RAM i[1D[K
is in use. Not critical, but depends on what's running.
    *   Storage: 58% used (88.2 GB free). Plenty of space. SSD/HDD type is [K
not specified.
    *   CPU: Not mentioned.
    *   Processes/Load: Not mentioned.
    *   Swap: Not mentioned.

    *   *RAM:* 7.1 GB available is decent, but if the user is doing heavy t[1D[K
tasks, the remaining 6.5 GB might be causing paging.
    *   *Storage:* 88.2 GB free is enough to avoid write-amplification or s[1D[K
space-related slowness.
    *   *Missing info:* CPU usage, Disk I/O (IOPS), and specific processes [K
are not provided.

    *   Focus on what *is* there: RAM usage is at ~48% (6.5GB used).
    *   Focus on what *is not* there: CPU usage and Disk performance.
    *   Recommendation: Check CPU/Processes since RAM and Storage are curre[5D[K
currently within healthy limits.

    *   Review RAM first? Not necessarily, 7.1GB available is usually fine.[5D[K
fine.
    *   Review Storage? No, 88.2GB free (58% used) is healthy.
    *   Review CPU/Processes? Yes, because it's missing from the data and i[1D[K
is a likely cause of slowness.
...done thinking.

Revisaría primero el **uso de CPU y procesos activos**, ya que esa informac[8D[K
información **no está en los datos proporcionados**.

El resto de los indicadores actuales no sugieren un cuello de botella críti[5D[K
crítico:
*   **RAM:** Tienes 7.1 GB disponibles de 13.6 GB (~48% libre), lo cual es [K
saludable.
*   **Almacenamiento:** Tienes 88.2 GB libres (58% usado), espacio suficien[8D[K
suficiente para que el sistema opere sin lentitud por falta de espacio.
