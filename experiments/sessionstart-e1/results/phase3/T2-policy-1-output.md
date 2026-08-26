# Phase 3: T2 - Condition policy

## Condition
Policy: Prefer Buffy facts first

## Response
Thinking...
*   User asks: "Do I have enough RAM to compile a large Node.js project? Te[2D[K
Tell me how much memory I have available and what the cushion is."
    *   Constraint: Use Buffy's provided context. Be concise.

    *   `ram_gb`: 13.6 (Total)
    *   `ram_available_gb`: 7.0 (Available)
    *   `node_version`: "v26.7.0" (Available)

    *   Total RAM: 13.6 GB.
    *   Available RAM: 7.0 GB.
    *   "Large project" compilation for Node.js: Usually, Node.js builds (n[2D[K
(npm install, build scripts) can be memory-intensive. 7 GB is generally suf[3D[K
sufficient for most large Node projects, but very massive ones (like compil[6D[K
compiling Node itself or huge Monorepos) might struggle if the heap limit i[1D[K
is hit or if parallel builds are aggressive.
    *   "Colchón" (Cushion): 7 GB is about 51% of total RAM.

    *   State available RAM: 7.0 GB.
    *   State total RAM: 13.6 GB.
    *   Assessment: Yes, 7 GB is usually enough for a large Node.js project[7D[K
project, providing a reasonable cushion (approx. 50% of total capacity).
...done thinking.

Tienes **7.0 GB** de RAM disponible (de un total de 13.6 GB).

Es suficiente para la mayoría de los proyectos grandes de Node.js, ya que c[1D[K
cuentas con un colchón de aproximadamente el **51% de tu memoria total**.
