# Phase 3: T1 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   Input: System context provided by "Buffy" (JSON format).
    *   Question: "Dime qué GPU tiene esta máquina y si su driver es uno ge[2D[K
genérico o uno específico del hardware. Justifica tu respuesta con la evide[5D[K
evidencia que tengas." (Tell me what GPU this machine has and if its driver[6D[K
driver is generic or hardware-specific. Justify with evidence.)
    *   Constraint: Use Buffy's facts, be concise, don't re-fetch existing [K
data.

    *   `hardware.gpu`: "AMD/ATI Picasso/Raven 2 [Radeon Vega Series]"
    *   `hardware.gpu_driver`: "amdgpu"

    *   GPU: AMD Radeon Vega Series (specifically Picasso/Raven 2).
    *   Driver: `amdgpu`.
    *   Analysis of driver: `amdgpu` is the official, modern open-source ke[2D[K
kernel driver specifically developed for AMD GPUs (as opposed to a generic [K
VESA or basic display driver).

    *   GPU: AMD Radeon Vega Series (Picasso/Raven 2).
    *   Driver: `amdgpu`.
    *   Type: Hardware-specific.
    *   Evidence: The context explicitly lists the GPU as "AMD/ATI Picasso/[8D[K
Picasso/Raven 2 [Radeon Vega Series]" and the driver as "amdgpu", which is [K
the specific driver for AMD hardware.
...done thinking.

La máquina tiene una GPU **AMD Radeon Vega Series** (específicamente el mod[3D[K
modelo Picasso/Raven 2).

Su driver es **específico del hardware**, ya que utiliza el driver `amdgpu`[8D[K
`amdgpu`, que es el controlador oficial desarrollado específicamente para l[1D[K
las tarjetas gráficas de AMD.
