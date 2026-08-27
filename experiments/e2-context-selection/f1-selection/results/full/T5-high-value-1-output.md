Thinking...
*   Input: A JSON object containing system context (OS: EndeavourOS/Linux, [K
Kernel: 6.18.45-2-lts, RAM: 13.6GB total, 7.1GB available, Storage: 217GB t[1D[K
total, 88.2GB free, 58% used) and a user query ("El equipo me va lento últi[4D[K
últimamente. Analiza la situación y dime qué revisarías primero y por qué."[5D[K
qué.")
    *   Constraint 1: Answer concisely.
    *   Constraint 2: Use specific data from the system facts.
    *   Constraint 3: If information is not in the facts, say so.
    *   Language: Spanish (based on the prompt).

    *   *RAM:* 13.6GB total, 7.1GB available. This means ~48% of RAM is use[3D[K
used. This is generally healthy; not a critical bottleneck unless a specifi[7D[K
specific process is spiking.
    *   *Storage:* 217GB total, 88.2GB free (58% used). Plenty of space lef[3D[K
left; not a bottleneck.
    *   *OS/Kernel:* EndeavourOS, Kernel 6.18.45-2-lts. (Standard Linux env[3D[K
environment).
    *   *CPU:* Not provided.
    *   *Processes/Load:* Not provided.
    *   *GPU:* Not provided.

    *   *Observation:* RAM and storage levels are currently stable (7.1GB a[1D[K
available RAM and 88.2GB free storage).
    *   *Conclusion:* The slowness is likely not caused by lack of storage [K
space or total RAM exhaustion.
    *   *What to check first?* CPU usage and active processes, as these are[3D[K
are not in the data.

    *   *Draft 1 (Mental):* Tus datos muestran que tienes 7.1GB de RAM disp[4D[K
disponibles de 13.6GB y 88.2GB de espacio libre en disco. No parece ser fal[3D[K
falta de memoria o disco. Revisaría primero la CPU y los procesos, pero esa[3D[K
esa información no está en los datos.

    *   *Refining for "Concise" and "Specific data":*
        Revisaría primero la **carga de CPU y procesos activos**, ya que es[2D[K
esa información **no está en los datos**.
        
        Tus recursos actuales son suficientes:
        - **RAM:** Tienes 7.1 GB disponibles de 13.6 GB.
        - **Almacenamiento:** Tienes 88.2 GB libres (58% usado).
        
        Ninguno de estos dos puntos sugiere un cuello de botella evidente.
...done thinking.

Revisaría primero la **carga de CPU y los procesos activos**, ya que esa in[2D[K
información **no está en los datos proporcionados**.

Tus recursos actuales no indican un cuello de botella evidente:
* **RAM:** Tienes 7.1 GB disponibles de 13.6 GB (aprox. 52% libre).
* **Almacenamiento:** Tienes 88.2 GB libres (58% de uso en `/`).
