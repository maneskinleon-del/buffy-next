# Frente F — Diseño de integración con ActionGate / store / evidence

## Objetivo
Diseñar cómo se integraría el Execution Journal en el flujo existente de buffy-next, sin convertir buffy-next en un ejecutor universal ni crear un sistema EVC independiente.

## Principios de integración
- ActionGate permanece como único punto autorizado para ejecutar efectos físicos.
- El Execution Journal registra resultados de ejecución, no autorza nuevas ejecuciones.
- La clasificación de evidencia permanece en su componente actual.
- No se duplica lógica entre pipeline.ts y pipeline.test-harness.ts.
- No se incorpora almacenamiento remoto de artefactos en esta fase.

## Flujo de integración propuesto

### 1. Antes de ejecutar
ActionGate normaliza la operación y calcula el fingerprint.
Si existe una reclamación equivalente, rechaza la nueva ejecución.
Si no, crea la reclamación exclusiva y persiste los metadatos.

### 2. Durante la ejecución
ActionGate ejecuta el efecto físico.
Si el ejecutor termina, construye Execution Evidence.
Si falla la escritura del journal, la reclamación no se libera.

### 3. Después de la ejecución
Se anexa el resultado al journal.
Se sincroniza el journal.
Se libera la reclamación.

### 4. Recuperación
Si hay una reclamación pendiente, el sistema verifica si el PID sigue activo.
Si el PID está activo, no se libera.
Si no se puede determinar, se marca como unknown y se requiere resolución humana.
La resolución humana se registra en el journal.

## Componentes involucrados

### ActionGate
- Responsable de ejecutar efectos físicos.
- Crea y libera reclamaciones.
- No se convierte en un ejecutor universal.

### ExecutionEvidence
- Clasifica la evidencia de ejecución.
- No se modifica su semántica actual.
- El journal no convierte una operación en verificada.

### ActionExecutionStore
- Registra ejecuciones.
- No se duplica lógica con el journal.

### State (state.json)
- Persistencia existente, conservada y protegida.
- No se modifica sin necesidad demostrada.

## Puntos de integración reales a inspeccionar

1. **ActionGate.execute** — punto de entrada principal.
2. **ActionGate.getExecutionStore** — obtener el store de ejecución.
3. **executeWithGatesInternal** — función interna usada por tests.
4. **pipeline.ts** — flujo principal de ejecución.
5. **pipeline.test-harness.ts** — harness de tests, duplica lógica.

## Archivos a inspeccionar para auditoría técnica

- `src/core/action-gate.ts`
- `src/core/action-execution-store.ts`
- `src/core/execution-evidence.ts`
- `src/core/pipeline.ts`
- `src/core/pipeline.test-harness.ts`
- `src/state/store.ts`
- `tests/pipeline.test.ts`
- `tests/action-gate-security.test.ts`
- `tests/execution-evidence.test.ts`

## Limitaciones verificadas

- Sin idempotencyKey, una operación completada puede ejecutarse nuevamente mediante nueva invocación secuencial.
- La exclusión concurrente no equivale a idempotencia.
- El journal no es un segundo sistema de autorización.
- La resolución humana no evita ActionGate para nuevas ejecuciones.

## Funcionalidades aplazadas a Fase 2

- idempotencyKey
- Directorio idem/
- Garantía de idempotencia ante reintentos posteriores
- API pública de consulta del historial
- Nuevos comandos CLI o MCP

## Conclusión
El Execution Journal puede integrarse con los componentes existentes manteniendo los principios arquitectónicos actuales. No se requiere crear un sistema EVC independiente ni modificar buffy-context. La integración es viable si se confirma que los puntos de integración reales soportan el flujo propuesto.
