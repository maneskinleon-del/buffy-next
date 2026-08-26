# Phase 3: T5 - Condition control

## Condition
Control: No policy instructions

## Response
Thinking...
*   User reports their computer is running slow.
    *   Provided system context (JSON) shows:
        *   OS: EndeavourOS (Linux)
        *   CPU: AMD Ryzen 5 3400G (8 cores)
        *   RAM: 13.6 GB total, 7.0 GB available (approx. 51% used).
        *   Storage: 217 GB total, 88.3 GB free (58% used).
        *   Temp: 43°C (Normal).
        *   GPU: Radeon Vega.
    *   Goal: Diagnose based on provided data and suggest first checks.

    *   *RAM:* 7 GB available out of 13.6 GB. It's not completely exhausted[9D[K
exhausted, but since it's an APU (Ryzen 3400G), some RAM is shared with the[3D[K
the GPU. If the user is running heavy apps, this might be a bottleneck.
    *   *CPU:* 8 cores (4 physical, 4 virtual). Should be sufficient for ba[2D[K
basic tasks, but could be pinned by a process.
    *   *Disk:* 58% used. Not critical (SSD/HDD slowdowns usually happen ab[2D[K
above 80-90%).
    *   *Temperature:* 43°C. Excellent, no thermal throttling.
    *   *OS:* EndeavourOS (Arch-based). Generally lean.

    *   The static data doesn't show *current* usage spikes, only a snapsho[7D[K
snapshot.
    *   Available RAM is okay, but not plenty.
    *   Temperature is fine.

    *   Since it's Linux, I need to see what's currently consuming resource[8D[K
resources.
    *   `top` or `htop` for CPU/RAM.
    *   `iostat` or `iotop` for Disk I/O.

    *   *Observation 1:* Temperature is 43°C $\rightarrow$ No thermal throt[5D[K
throttling.
    *   *Observation 2:* Storage is 58% $\rightarrow$ No space crisis.
    *   *Observation 3:* RAM is at ~50% $\rightarrow$ Moderate, but could b[1D[K
be a factor if the GPU is hogging it.
    *   *Critical missing info:* Current process load (CPU/IO wait).

    *   Check current processes (`top`/`htop`).
    *   Check for high I/O wait (disk bottleneck).
    *   Check ZRAM/Swap usage (common in Linux for perceived "slowness").
...done thinking.

Basado en los datos actuales, el hardware está en buen estado térmico (43°C[5D[K
(43°C) y el almacenamiento no está saturado (58%). Sin embargo, hay puntos [K
críticos:

1.  **RAM:** Tienes **7.0 GB disponibles de 13.6 GB**. Al usar una APU (Ryz[4D[K
(Ryzen 3400G), parte de esa RAM es compartida con la GPU Vega. Si abres apl[3D[K
aplicaciones pesadas, podrías estar entrando en *swap*, lo que ralentiza el[2D[K
el sistema.
2.  **Carga Dinámica:** El JSON es una foto estática. No sabemos si hay un [K
proceso consumiendo el 100% de un núcleo o si hay un cuello de botella de I[1D[K
I/O (disco).

**Lo primero que revisaría:**
*   **Procesos activos:** Buscar picos de CPU o fugas de memoria.
*   **I/O Wait:** Verificar si el disco está saturado aunque tenga espacio.[8D[K
espacio.
*   **Swap:** Ver si el sistema está moviendo datos al disco por fa[2D[K
falta de RAM física.

Para diagnosticar con precisión, necesito ejecutar:
`top -b -n 1 | head -n 20 && free -h`
