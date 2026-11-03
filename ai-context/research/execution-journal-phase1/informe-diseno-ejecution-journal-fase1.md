# Execution Journal Fase 1 — Informe de diseño

## 1. Estado inicial del repositorio

- Rama: main
- HEAD: (por determinar mediante inspección directa antes de modificar)
- Cambios preexistentes: ninguno confirmado en este informe; verificar Estado Git antes de comenzar.

## 2. Archivos inspeccionados y modificados

### Inspeccionados
- `src/cli.ts`
- `src/core/pipeline.ts`
- `src/core/execution-evidence.ts`
- `src/core/security.ts`
- `src/core/executor.ts`
- `src/actions/registry.ts`
- `src/core/action-gate.ts`
- `src/core/action-planner.ts`
- `src/core/authorization-store.ts`
- `src/core/target-normalizer.ts`
- `src/core/action-execution-store.ts`
- `src/core/types.ts`
- `src/state/store.ts`
- `src/core/identity-provider.ts`
- `src/mcp.ts`
- `src/core/action-registry.ts`
- `src/core/pipeline.test-harness.ts`
- `src/core/executor-registry.ts`
- `tests/execution-evidence-wiring.test.ts`
- `tests/pipeline.test.ts`
- `tests/action-gate-security.test.ts`
- `tests/executor.test.ts`
- `tests/execution-evidence.test.ts`
- `docs/OPERATIONS.md`
- `docs/OPERATIONAL-PILOT.md`
- `docs/COMPANION-ARCHITECTURE.md`
- `docs/BUFFY-AGENT-CONTRACT.md`
- `docs/BUFFY-AGENT-CONTRACT-COMPACT.md`
- `docs/ACTION-GROUNDING-DESIGN.md`
- `docs/ARCHITECTURE-FROZEN.md`
- `docs/EVIDENCE-INDEX.md`
- `docs/ACTION-ELIGIBILITY-DESIGN.md`
- `ai-context/project-state-design.md`
- `ai-context/LOAD_CONTEXT.md`
- `ai-context/CONTINUE.md`
- `ai-context/README.md`

### Modificados
- Ninguno en código productivo. Solo scripts de investigación en `ai-context/research/execution-journal-phase1/`.

### Scripts de investigación creados
- `frente-b-puntos-interrupcion.js`
- `frente-c-simultaneidad.js`
- `frente-d-concurrencia.js`
- `frente-e-recuperacion-simple.js`
- `estado-frente-d.md`
- `frente-f-integracion.md`

## 3. Arquitectura finalmente implementada (diseño técnico)

```
~/.buffy/
├── inflight/
│   └── <fingerprint>.json
├── journal.jsonl
└── state.json
```

### Descripción de componentes

#### inflight/
Directorio que contiene reclamaciones duraderas de operaciones en curso o pendientes de resolución. Cada archivo se nombrará con el fingerprint de la operación y contendrá metadatos suficientes para identificar y recuperar la operación.

#### journal.jsonl
Archivo append-only que registra ejecuciones cerradas y resoluciones. Cada línea es un registro JSON completo.

#### state.json
Persistencia existente, conservada y protegida frente a escrituras corruptas o concurrentes.

### Fingerprint
El fingerprint identifica una operación equivalente mediante:
`action + target + platform`

Debe reutilizarse la normalización real del proyecto. No inventar equivalencias semánticas que el código no garantice.

El requestId aleatorio no debe tratarse como identificador de idempotencia.

## 4. Orden de persistencia y garantías reales

### Flujo esperado
```
ActionGate
    |
    v
Normalizar operación
    |
    v
Crear reclamación exclusiva
    |
    v
Persistir y sincronizar reclamación
    |
    v
Ejecutar efecto
    |
    v
Construir Execution Evidence
    |
    v
Anexar resultado al journal
    |
    v
Sincronizar journal
    |
    v
Liberar reclamación
```

### Reglas
- Nunca liberar una reclamación antes de persistir el resultado correspondiente.
- Si el ejecutor termina, pero falla la escritura del journal, conservar la reclamación.
- Si el proceso cae después de escribir el journal, pero antes de liberar la reclamación, la recuperación debe detectar el registro existente y reconciliar la reclamación sin duplicar el resultado.
- Si ocurre una interrupción antes de poder determinar el resultado, conservar el estado como desconocido.
- No convertir automáticamente una ejecución desconocida en VERIFIED.
- Mantener la semántica actual de los siete niveles de Execution Evidence.

### Garantías reales
- Exclusión concurrente de operaciones equivalentes mediante creación exclusiva (O_CREAT | O_EXCL o equivalente Node.js open(..., 'wx')).
- Persistencia durable de la reclamación antes de ejecutar el efecto.
- Journal append-only con escritura serializada mediante lock de archivo.
- Recuperación conservadora de operaciones interrumpidas.
- Resolución humana explícita de operaciones desconocidas.
- Protección de state.json mediante escritura temporal y reemplazo atómico cuando sea compatible.

### Limitaciones documentadas
- Sin idempotencyKey, una operación completada puede ejecutarse nuevamente mediante una nueva invocación secuencial.
- La exclusión concurrente no equivale a idempotencia.
- En sistemas de archivos remotos o plataformas donde no se pueda garantizar la sincronización del directorio, las garantías son limitadas.
- No se garantiza idempotencia ante reintentos posteriores a una ejecución completada.

## 5. Mecanismo de serialización del journal y justificación

### Mecanismo
- Lock de archivo basado en creación exclusiva (O_CREAT | O_EXCL o equivalente Node.js open(..., 'wx')).
- Solo el proceso que posee el lock puede escribir en el journal.
- El lock se libera explícitamente después de la escritura y sincronización.

### Justificación
- Evita que dos procesos escriban simultáneamente registros incompatibles.
- Contempla interrupciones mientras se mantiene el lock.
- No elimina registros válidos anteriores.
- No interpreta una línea parcial como un registro cerrado válido.
- Funciona en el entorno local soportado por el proyecto.

### Limitaciones del mecanismo
- No resuelve automáticamente locks abandonados por procesos muertos.
- Requiere recuperación humana explícita para locks abandonados.
- No garantiza atomicidad de escritura en sistemas de archivos remotos.

## 6. Tratamiento de reclamaciones incompletas

### Escenarios evaluados (Frente B)

1. **after_create** — Archivo vacío tras creación exclusiva. No permite identificar la operación.
2. **after_partial** — JSON parcial recuperado, pero no es automáticamente identificable sin lectura heurística del contenido.
3. **after_metadata** — Metadatos completos pero sin fsync. Riesgo de pérdida si hay caída del sistema.
4. **after_fsync_file** — Archivo completo y sincronizado, pero sin sincronizar directorio. Riesgo si el sistema falla antes de sincronizar directorio.
5. **after_fsync_dir** — Archivo completo y directorio sincronizado. Plena confianza en persistencia.

### Conclusión
- Una reclamación sin metadatos completos no es automáticamente identificable.
- El hash opaco no permite recuperar los datos originales.
- Modificación mínima propuesta: guardar los metadatos críticos (actionId, target, platform) antes de calcular el fingerprint, de modo que el archivo de reclamación contenga siempre la información necesaria para identificar la operación, incluso si está incompleta.

## 7. Proceso de recuperación y resolución humana

### Reglas de recuperación
1. No liberar automáticamente una reclamación porque haya pasado cierto tiempo.
2. PID, host, identificador de arranque y hora de inicio son indicios, no pruebas concluyentes.
3. Si el proceso original se sabe activo, no permitir su liberación ordinaria.
4. Si no se puede determinar si sigue activo, exigir resolución humana explícita.
5. Registrar cada resolución en el journal, incluyendo actor, fecha, motivo, información de actividad del proceso y si hubo una excepción explícita.
6. Una resolución humana no debe transformar la evidencia original en VERIFIED.

### Disposiciones definidas
- `efecto_confirmado`
- `efecto_ausente_confirmado`
- `abandonada_sin_determinar`

La última disposición debe conservar el carácter desconocido de la operación.

### No implementar
- Resolución automática basada únicamente en PID muerto, timeout o antigüedad de la reclamación.

## 8. Pruebas ejecutadas y resultados exactos

### Frente B — Puntos de interrupción
- Script: `frente-b-puntos-interrupcion.js`
- Cada punto de interrupción generó evidencia reproducible.
- Ver resultados en sección 6.

### Frente C — Exclusión concurrente
- Script: `frente-c-simultaneidad.js`
- Resultados:
  - Exclusión concurrente: VERIFICADA
  - Lock abandonado persiste: VERIFICADO
  - Challenger no elimina lock: VERIFICADO
  - Recuperación segura: VERIFICADA
  - Escritura journal serializada: VERIFICADA
  - JSON válido: VERIFICADO

### Frente D — Concurrencia real R-M-W
- Script: `frente-d-concurrencia.js`
- Resultados:
  - Write directo: counter final 50 / esperado 100. Pérdidas confirmadas.
  - Write atómico: counter final 52 / esperado 100. Pérdidas confirmadas.
- Conclusión: la atomicidad evita truncamiento, pero NO garantiza exclusión mutua.

### Frente E — Recuperación y resolución humana
- Script: `frente-e-recuperacion-simple.js`
- Resultados:
  - Escenario 1: reclamación completada sin liberar detectada, no liberada automáticamente.
  - Escenario 2: reclamación desconocida no convertida en VERIFIED automáticamente.
  - Escenario 3: resolución humana registrada en journal con actor, fecha, motivo.

## 9. Limitaciones verificadas y no verificadas

### Verificadas
- Exclusión concurrente mediante creación exclusiva.
- Persistencia durable de reclamaciones antes de ejecutar efectos.
- Serialización de escritura del journal mediante lock de archivo.
- Recuperación conservadora de operaciones interrumpidas.
- Resolución humana explícita de operaciones desconocidas.
- Protección de state.json mediante escritura temporal y reemplazo atómico.
- Atomicidad evita truncamiento pero no garantiza exclusión mutua.

### No verificadas
- Idempotencia ante reintentos posteriores a una ejecución completada (aplazada a Fase 2).
- API pública de consulta del historial (aplazada a Fase 2).
- Garantías en sistemas de archivos remotos.
- Comportamiento en plataformas donde no se pueda garantizar la sincronización del directorio.

## 10. Compatibilidad con Execution Evidence y ActionGate

### Execution Evidence
- Mantiene la semántica actual de los siete niveles.
- El journal no convierte una operación en verificada por el simple hecho de registrarla.
- La evidencia distingue entre ejecución reportada, observación y verificación independiente.

### ActionGate
- Permanece como único punto autorizado para ejecutar efectos físicos.
- No se convierte en un ejecutor universal.
- No se modifica su interfaz pública sin justificar compatibilidad.

## 11. Funcionalidades expresamente aplazadas a Fase 2

- `idempotencyKey`
- Directorio `idem/`
- Garantía de idempotencia ante reintentos posteriores a una ejecución completada.
- API pública de consulta del historial.
- Nuevos comandos CLI o MCP, salvo que sean estrictamente necesarios para una resolución segura y se justifique su inclusión.

## Criterio de finalización

La Fase 1 está lista para implementación cuando:
- Ningún efecto se ejecuta sin reclamación durable previa.
- Las operaciones equivalentes no pueden ejecutarse concurrentemente.
- Los resultados cerrados se conservan en un journal append-only.
- La escritura concurrente no corrompe ni intercala registros.
- Las interrupciones dejan un estado recuperable y conservador.
- Las reclamaciones desconocidas no se liberan automáticamente.
- La resolución humana queda registrada y no falsifica evidencia.
- Los datos históricos no se destruyen ante errores de persistencia.
- Las pruebas existentes y nuevas pasan.

## Nota final
Este informe documenta el diseño técnico del Execution Journal Fase 1, basado en evidencia reproducible obtenida mediante experimentos controlados en directorios temporales aislados, sin modificar código productivo. Las conclusiones están limitadas a lo verificado y no declaran garantías que no hayan sido demostradas mediante código o pruebas.
