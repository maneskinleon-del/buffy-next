Thinking...
*   Input: A JSON object containing system information (OS, kernel, RAM, st[2D[K
storage).
    *   Query: "Estoy evaluando compilar un proyecto grande que necesita un[2D[K
unos 8 GB de RAM libres. ¿Puedo lanzarlo ahora mismo? Responde sí/no con tu[2D[K
tu razonamiento." (I am evaluating compiling a large project that needs abo[3D[K
about 8 GB of free RAM. Can I launch it right now? Answer yes/no with your [K
reasoning.)
    *   Constraints: Answer concisely, use specific data from the system fa[2D[K
facts, if information is missing, say so.

    *   `ram_available_gb`: 7.1

    *   Required RAM: 8 GB.
    *   Available RAM: 7.1 GB.
    *   Comparison: $7.1 < 8$.

    *   Can I launch it? No.
    *   Reasoning: Available RAM (7.1 GB) is less than required RAM (8 GB).
...done thinking.

No. Tienes 7.1 GB de RAM disponibles (`ram_available_gb`), lo cual es insuf[5D[K
insuficiente para los 8 GB requeridos.
