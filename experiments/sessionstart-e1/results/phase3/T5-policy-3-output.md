# Phase 3: T5 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User says: "Mi equipo está yendo lento. ¿Qué revisarías primero? Diagnó[6D[K
Diagnóstica con los datos que tengas." (My team/computer is going slow. Wha[3D[K
What would you check first? Diagnose with the data you have.)
    *   Input provided: System context from "Buffy" (JSON).

    *   OS: EndeavourOS (Linux).
    *   CPU: AMD Ryzen 5 3400G (8 cores).
    *   RAM: 13.6 GB total, **7.0 GB available**.
    *   GPU: Radeon Vega Series.
    *   Storage: / is 58% used (88.3 GB free).
    *   Temp: 43°C (Normal).
    *   Kernel: 6.18.45-2-lts.

    *   *Temperature:* 43°C is healthy. No thermal throttling likely.
    *   *Storage:* 58% used. plenty of space (88.3 GB free). Not a disk spa[3D[K
space issue.
    *   *RAM:* 13.6 GB total, 7.0 GB available. This is about 51% usage. No[2D[K
Not critically low, but depends on what's running.
    *   *CPU:* Ryzen 5 3400G is decent, but we don't have *current* load/us[7D[K
load/usage (CPU usage % per process).

    *   *What is missing?* Current CPU load and memory usage per process (t[2D[K
(top/htop data).
    *   *What's the diagnosis?* Based on the facts:
        *   Temperature is fine.
        *   Disk space is fine.
        *   RAM is at ~50% capacity (not critical, but could be an issue if[2D[K
if there are spikes).
        *   The root cause isn't visible in the static system facts; it's l[1D[K
likely a dynamic resource spike.

    *   Start with what we know.
    *   Exclude what is healthy.
    *   Identify the gap.
    *   Suggest the next step.
...done thinking.

Basado en los datos de Buffy, descarto los siguientes problemas:
*   **Temperatura:** 43°C es una temperatura normal; no hay estrangulamient[15D[K
estrangulamiento térmico (*thermal throttling*).
*   **Almacenamiento:** Tienes 88.3 GB libres (58% de uso), por lo que no e[1D[K
es falta de espacio en disco.

**Diagnóstico actual:**
Tu memoria RAM está al **~51% de uso** (7.0 GB disponibles de 13.6 GB). Aun[3D[K
Aunque no está agotada, es el punto más cercano a un cuello de botella si t[1D[K
tienes aplicaciones pesadas abiertas.

**¿Qué revisaría primero?**
Como los datos estáticos están bien, el problema es **dinámico**. Necesito [K
verificar el uso de CPU y RAM en tiempo real para identificar procesos "zom[4D[K
"zombis" o fugas de memoria.

**Siguiente paso:** Ejecutaría `top` o `htop` para ver qué proceso está con[3D[K
consumiendo los recursos en este momento.
