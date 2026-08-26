# Phase 3: T1 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   Input: A system context JSON provided by "Buffy".
    *   Question: "Dime qué GPU tiene esta máquina y si su driver es uno ge[2D[K
genérico o uno específico del hardware. Justifica tu respuesta con la evide[5D[K
evidencia que tengas." (Tell me what GPU this machine has and if its driver[6D[K
driver is generic or hardware-specific. Justify your answer with evidence.)[10D[K
evidence.)
    *   Constraint: Use Buffy's facts as the primary source. Only[4D[K
Only use tools if data is missing or dynamic. Answer concisely.

    *   `hardware.gpu`: "AMD/ATI Picasso/Raven 2 [Radeon Vega Series]"
    *   `hardware.gpu_driver`: "amdgpu"

    *   GPU: AMD/ATI Picasso/Raven 2 [Radeon Vega Series].
    *   Driver: `amdgpu`.
    *   Generic vs. Specific: `amdgpu` is the official, open-source, hardwa[6D[K
hardware-specific kernel driver for modern AMD GPUs. It is not a generic dr[2D[K
driver (like `vesa` or `fbdev`).

    *   GPU: AMD/ATI Picasso/Raven 2 [Radeon Vega Series].
    *   Driver: `amdgpu`.
    *   Reasoning: The `amdgpu` driver is the specific driver developed for[3D[K
for AMD hardware.
...done thinking.

La máquina tiene una GPU **AMD/ATI Picasso/Raven 2 [Radeon Vega Series]**.

El driver es **específico del hardware**, ya que utiliza `amdgpu`, que es e[1D[K
el controlador especializado para GPUs modernas de AMD, y no un driver gené[4D[K
genérico (como VESA o FBDEV).
