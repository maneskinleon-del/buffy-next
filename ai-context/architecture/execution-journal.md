# Execution Journal - Arquitectura

## Propósito
Proporcionar trazabilidad duradera y recuperación conservadora de ejecuciones de ActionGate, reduciendo pérdida de evidencia ante interrupciones.

## Componentes

### Inflight Claims
- **Ubicación:** `~/.buffy/inflight/<fingerprint>.json`
- **Propósito:** Reclamación durable antes de ejecutar efecto físico
- **Publicación atómica:** temp file + fsync + rename + fsync dir
- **Fingerprint:** `sha256(JSON.stringify({actionId, target, platform}, null, 0))`
- **Garantía:** Antes del rename no existe claim visible; después está completo

### Journal
- **Ubicación:** `~/.buffy/journal.jsonl`
- **Formato:** Append-only, una línea JSON por entrada
- **Escritura:** Serializada con lock exclusivo
- **Sincronización:** fsync antes de considerar persistido
- **Recuperación:** Ignora líneas parciales/corruptas

### Locks
- **journal.lock:** Protege escritura del journal
- **state.lock:** Protege operaciones read-modify-write de state.json
- **Política:** No auto-elimina locks abandonados; requiere análisis conservador

## Flujo de ejecución

1. **Normalizar** operación (target sanitizado)
2. **Validar** autorización y prerequisitos
3. **Claim inflight** - Publicación atómica, falla si ya existe claim equivalente
4. **Ejecutar** efecto via executor privado
5. **Append journal** - Registrar resultado ANTES de liberar claim
6. **Liberar claim** - Solo si journal se escribió exitosamente
7. **Continuar** con evidencia y estado

## Recuperación

- **Reconciliación:** Busca entrada en journal por executionId/requestId (preferido) o fingerprint
- **Conservador:** No libera claims con proceso activo conocido
- **Resolución humana:** Requiere registro en journal antes de liberar
- **Disposiciones:** `efecto_confirmado`, `efecto_ausente_confirmado`, `abandonada_sin_determinar`

## Limitaciones (Fase 1)
- **NO garantiza ejecución exactamente una vez** ante reintentos secuenciales
- **NO garantiza idempotencia** - aplazado a Fase 2
- **Fingerprint-based exclusión** previene concurrencia, no reintentos secuenciales
- **Durabilidad ante caída OS** depende del filesystem
