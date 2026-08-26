# Phase 3: T2 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User Question: "¿Tengo suficiente RAM para compilar un proyecto grande [K
de Node.js? Di cuánta memoria tengo disponible y qué colchón hay." (Do I ha[2D[K
have enough RAM to compile a large Node.js project? Tell me how much memory[6D[K
memory I have available and what the cushion is.)
    *   Context Provided: A JSON object from "Buffy" containing system info[4D[K
information.
    *   Key Constraints: Use Buffy's facts as primary source, be concise, a[1D[K
avoid redundant commands.

    *   `hardware.ram_gb`: 13.6
    *   `hardware.ram_available_gb`: 7.0

    *   Total RAM: 13.6 GB.
    *   Available RAM: 7.0 GB.
    *   "Large Node.js project": Usually, Node.js builds (especially with T[1D[K
TypeScript or heavy Webpack/Vite configurations) can consume several GBs. 7[1D[K
7 GB is generally sufficient for most large projects, though extremely mass[4D[K
massive monorepos might hit limits. However, for a standard "large" project[7D[K
project, 7 GB is a healthy cushion.

    *   Memory available: 7.0 GB.
    *   Total memory: 13.6 GB.
    *   Cushion/Status: You have about half your total RAM available. This [K
is generally sufficient for a large Node.js project.
...done thinking.

Tienes **7.0 GB de RAM disponibles** (de un total de 13.6 GB).

Es suficiente para la mayoría de proyectos grandes de Node.js. Tienes un co[2D[K
colchón razonable (aproximadamente el 50% de tu memoria total libre), aunqu[5D[K
aunque si el proyecto es extremadamente masivo o usas muchos procesos en pa[2D[K
paralelo, podrías acercarte al límite.
