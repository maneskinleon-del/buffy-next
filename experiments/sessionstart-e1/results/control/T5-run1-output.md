[claude-code:unrecognized_model] {"model":"minimax/minimax-m3:free","query_source":"generate_session_title"}
Asumiendo que "el equipo" se refiere a tu sistema de agentes/herramientas (por el contexto del repo `e1/control` con `Buffy Next`, hooks de SessionStart y acciones), esto es lo que revisaría, en orden de señal/ruido:

**1. ¿Qué cambió recientemente? (regresiones)**
"Últimamente" implica que antes funcionaba. Un cambio reciente es la causa más probable y la más barata de descartar. Concretos en tu repo:
- `git log --since="2 weeks ago" --oneline` — busca cambios en hooks, settings, modelos, prompts del sistema.
- El `git status` ya muestra algo sospechoso: **`.claude/settings.json` está borrado y existe `.claude/settings.json.off`**. Si ese archivo contiene hooks o permisos, los agentes acaban de perderlos. Es lo primero que miraría.
- Cambios de versión del CLI/modelo, nuevos rate limits, o un provider degradado.

**2. Dónde se va el tiempo (lugar del bloqueo)**
Antes deoptimizar, mide. Tres candidatos habituales:
- **Latencia de herramientas / red** — ¿las acciones tardan más? Mira logs de las acciones que más se invocan (las 4 que recientemente se extendieron a Linux son candidatas obvias: si su implementación Linux es más lenta que la macOS, todo se resiente).
- **Espera por permisos / prompts** — cada `needs-permission` es un round-trip humano. ¿subió la frecuencia?
- **Reintentos por fallos transitorios** — ¿se ven más errores en logs que antes?

**3. Claridad del objetivo (retrabajo)**
La causa #1 de lentitud en equipos (humanos o IA) no es la velocidad de ejecución, es hacer lo incorrecto dos veces. Señales:
- Outputs que se descartan y se vuelven a pedir.
- Patches que se contradicen entre sí.
- Preguntas recurrentes sobre "qué quieres decir con X".

Si esto pasa, ningún提速 de infra compensa; hay que subir al nivel de la spec.

**4. Carga de contexto**
Específico de agentes: ¿los transcripts están creciendo? ¿se releen archivos grandes cada turno? ¿se pierde estado entre sesiones? Un SessionStart hook roto (como el que arreglaste en `73be405`) puede estar dejando a cada sesión empezar a ciegas.

**5. Infra base**
Disco, memoria, red. El commit `check-disk-space` sugiere que ya os topasteis con esto; verificaría que no haya vuelto a pasar.

**Mi recomendación: empieza por (1) + el `.claude/settings.json` desaparecido.** Es lo único que el propio `git status` está gritando, y si los hooks/permisos están desactivados sin querer, explica *todo* lo demás: más prompts, más reintentos, agentes que vuelven a preguntar lo que ya sabían.

¿"El equipo" son los agentes de aquí, o un equipo humano que usa este sistema? La siguiente ronda de preguntas cambia si me dices cuál.
