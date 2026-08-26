# Phase 3: T5 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User says their team (computer/system) is slow.
    *   Question: "What would you check first? Diagnose with the data you h[1D[K
have."
    *   Constraint: Use Buffy's context. Be concise. Only request commands [K
if necessary.

    *   OS: EndeavourOS (Linux).
    *   CPU: AMD Ryzen 5 3400G (8 cores).
    *   RAM: Total 13.6 GB, Available 7.0 GB (Approx 51% used).
    *   Storage: `/` has 88.3 GB free (58% used).
    *   Temperature: 43°C (Normal/Cool).
    *   GPU: Radeon Vega.

    *   *CPU:* 43°C is great, no thermal throttling.
    *   *RAM:* 7 GB available out of 13.6 GB. Not completely exhausted, but[3D[K
but half is gone. This is usually fine unless a specific process is spiking[7D[K
spiking.
    *   *Disk:* 42% free space. Not a bottleneck usually unless it's a very[4D[K
very slow HDD or nearly full (which it isn't).
    *   *Hardware:* Mid-range CPU/integrated graphics.

    *   Since basic hardware specs and current availability look okay, the [K
"slowness" is likely due to:
        1.  Current process load (CPU/RAM spikes).
        2.  I/O Wait (Disk activity).
        3.  Zombie processes or memory leaks.

    *   *Direct diagnosis:* The hardware is healthy (temp 43°C) and there i[1D[K
is enough RAM/Storage for general use.
    *   *Missing info:* Real-time process usage (top/htop), I/O wait, or sp[2D[K
specific application logs.

    *   *Observations:* Temp is low (43°C), RAM is at ~50%, and storage is [K
not full (58% used). No obvious hardware bottleneck.
    *   *Next step:* Check real-time resource usage (`top` or `htop`) to fi[2D[K
find specific processes consuming CPU or causing I/O wait.
...done thinking.

Basado en los datos de Buffy, el hardware parece estar en buen estado:
- **Temperatura:** 43°C (está fresca, no hay *thermal throttling*).
- **RAM:** 7 GB disponibles de 13.6 GB (~50% de uso), lo cual es aceptable.[10D[K
aceptable.
- **Almacenamiento:** 88.3 GB libres (58% usado), no hay saturaci[8D[K
saturación de disco.

**Diagnóstico:** No hay un cuello de botella evidente en los recursos estát[5D[K
estáticos o temperatura. 

**Qué revisar primero:**
Para encontrar la causa de la lentitud, necesito ver la carga en tiempo rea[3D[K
real. Ejecutaría `top` o `htop` para identificar:
1. Procesos con alto consumo de **CPU**.
2. El valor de **%wa (I/O wait)** para ver si el disco está lento procesand[9D[K
procesando datos.
3. Si hay algún proceso consumiendo la RAM de forma agresiva (Memory Leak).
