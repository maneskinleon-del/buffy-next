# Phase 2: T2 - Position early

## Prompt Structure
Position: early
Order: Buffy Context → Instructions → Query

## Response
Thinking...
*   Input: A JSON system context provided by "Buffy".
    *   Question: "¿Tengo suficiente RAM para compilar un proyecto grande d[1D[K
de Node.js? Di cuánta memoria tengo disponible y qué colchón hay." (Do I ha[2D[K
have enough RAM to compile a large Node.js project? Tell me how much memory[6D[K
memory I have available and what the cushion is.)
    *   Constraint: Answer concisely with specific data. If not in facts, s[1D[K
say so.

    *   `ram_gb`: 13.6
    *   `ram_available_gb`: 7.0

    *   Available RAM: 7.0 GB.
    *   Total RAM: 13.6 GB.
    *   Context: Compiling a "large" Node.js project. Usually, 7GB is decen[5D[K
decent, but "large" is subjective. However, the user asks specifically for [K
the available memory and the cushion.
    *   Cushion calculation: Total (13.6) - Available (7.0) = 6.6 GB curren[6D[K
currently used. The "cushion" for the project is the available 7.0 GB.

    *   Available RAM: 7.0 GB.
    *   Total RAM: 13.6 GB.
    *   Assessment: 7 GB is generally sufficient for most Node.js builds, t[1D[K
though "large" depends on the project.

    *   "Tienes 7.0 GB de RAM disponible de un total de 13.6 GB. Para un pr[2D[K
proyecto grande de Node.js, 7 GB suele ser suficiente, aunque depende de la[2D[K
la complejidad del proyecto."
...done thinking.

Tienes **7.0 GB** de RAM disponible (de un total de 13.6 GB). Generalmente [K
es suficiente para compilar la mayoría de proyectos de Node.js, aunque el "[1D[K
"colchón" depende de la magnitud exacta del proyecto.
