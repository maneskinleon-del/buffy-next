# Phase 3: T5 - Condition control

## Condition
Control: No policy instructions

## Response
Thinking...
*   User reports the system is running slow ("Mi equipo está yendo lento").[8D[K
lento").
    *   Provided context: System specs (EndeavourOS, Ryzen 5 3400G,[6D[K
3400G, 13.6GB RAM, SSD storage).
    *   Current state from JSON:
        *   RAM: 13.6GB total, 7.0GB available (about 50% used).
        *   Storage: 217GB total, 58% used.
        *   Temperature: 43°C (Normal).
        *   CPU: Ryzen 5 3400G.

    *   *RAM:* 7GB available is decent, but if there are memory-intensive a[1D[K
apps (like Docker, which is installed) running, it could be swapping.
    *   *Storage:* 58% used is fine. Not enough to cause slow-down unless i[1D[K
it's a very small partition or failing.
    *   *Temperature:* 43°C is very healthy. No thermal throttling.
    *   *CPU:* 8 cores (logical).
    *   *OS:* EndeavourOS (Arch-based), generally fast.

    *   CPU spikes (process hogging).
    *   I/O wait (disk congestion).
    *   Swap usage (RAM exhaustion causing disk paging).
    *   Background services (Docker containers).

    *   Check current processes (top/htop).
    *   Check swap usage (free -m).
    *   Check disk I/O (iotop or vmstat).

    *   *Diagnosis based on data:* RAM is 50% used, Temp is fine, Storage i[1D[K
is fine.
    *   *First thing to check:* Current CPU load and Swap usage, as 7GB ava[3D[K
available might hide heavy paging if the active set is larger.
...done thinking.

Basado en los datos proporcionados, el hardware está en condiciones saludab[7D[K
saludables (Temp: 43°C, Almacenamiento: 42% libre), pero hay un punto críti[5D[K
crítico:

**Diagnóstico inicial:**
*   **RAM:** Tienes 13.6GB totales y solo **7.0GB disponibles**. Tienes un [K
consumo del ~50% en reposo o carga ligera. Si tienes Docker activo (está in[2D[K
instalado), podrías estar sufriendo de *swapping* (uso de disco como RAM), [K
lo que ralentiza drásticamente el sistema.

**Qué revisaría primero (en orden):**
1.  **Uso de CPU y Procesos:** Identificar si hay un proceso "zombie" o con[3D[K
consumiendo ciclos excesivos.
2.  **Uso de Swap:** Verificar si el sistema está moviendo datos al disco p[1D[K
por falta de RAM física disponible.
3.  **Contenedores Docker:** Verificar cuántos contenedores están corriendo[9D[K
corriendo en segundo plano.

**Para confirmar, necesito ejecutar:**
```zsh
top -n 1 -b | head -n 20 && free -h
```
*(Esto me dirá exactamente quién consume la CPU y cuánta Swap se está utili[5D[K
utilizando).*
