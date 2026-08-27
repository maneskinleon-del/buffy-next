Thinking...
*   Input: A JSON object with `hardware` details (`ram_gb: 13.6`, `ram_avai[9D[K
`ram_available_gb: 7.1`).
    *   User Question: "Estoy evaluando compilar un proyecto grande que nec[3D[K
necesita unos 8 GB de RAM libres. ¿Puedo lanzarlo ahora mismo?" (I am evalu[5D[K
evaluating compiling a large project that needs about 8 GB of free RAM. Can[3D[K
Can I launch it right now?)
    *   Constraint 1: Respond with "sí/no" (yes/no).
    *   Constraint 2: Include reasoning.
    *   Constraint 3: Answer concisely with specific data from system facts[5D[K
facts.
    *   Constraint 4: If information is missing, say so.

    *   RAM required: 8 GB.
    *   RAM available: 7.1 GB.
    *   Comparison: 7.1 GB < 8 GB.

    *   Decision: No.
    *   Reasoning: Available RAM is 7.1 GB, which is less than the required[8D[K
required 8 GB.

    *   "No. Solo tienes 7.1 GB de RAM disponible, y el proyecto requiere 8[1D[K
8 GB."
...done thinking.

No. Tienes 7.1 GB de RAM disponible, lo cual es insuficiente para los 8 GB [K
que requiere el proyecto.
