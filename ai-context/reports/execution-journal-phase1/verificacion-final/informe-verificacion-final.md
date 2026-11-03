# VERIFICACIÓN FINAL DE GARANTÍAS PENDIENTES

## 1. Exclusividad de claimInflight
**Cambio realizado:** Se modificó claimInflight para crear directamente el archivo final con `openSync(claimPath, 'wx')` (creación exclusiva). Se eliminó la lógica temp+rename con race condition.

**Prueba con procesos independientes:**
- BUFFY_DIR=/tmp/buffy-test-race8, dos procesos concurrentes intentando reclamar mismo fingerprint
- Resultado: true, false (exactamente un proceso obtiene claimed:true)

**Verificación:** Un claim preexistente nunca es reemplazado - open con 'wx' falla con EEXIST.

## 2. Aislamiento efectivo de BUFFY_DIR
**Revisión:**
- execution-journal.ts: getBuffyDir() lee process.env.BUFFY_DIR, todas las funciones usan getters dinámicos
- store.ts: usa getBuffyDir()/getStateFile() dinámicos
- Tests: execution-journal-phase1.test.ts y pipeline.test.ts usan beforeEach/afterEach con dirs temporales y BUFFY_DIR
- No se modificaron ni eliminaron datos reales en ~/.buffy

**Estado:** Aislado correctamente.

## 3. Protección de state.json ante corrupción
**Cambios:**
- loadState(): si archivo existe pero JSON corrupto o ilegible → lanza error (preserva archivo original, guarda backup .corrupt.*)
- updateState(): captura error de loadState() por corrupción/ilegibilidad y lo re-lanza sin sobrescribir archivo
- saveState/updateState usan lock completo, rename atómico sin fallbacks inseguros

**Resultado:** Corrupción/errores de lectura impiden actualización y no sobrescriben el original.

## 4. Reconciliación inequívoca
**Cambios en reconcileClaim():**
- Requiere correlación (executionId o requestId). Sin correlación → conservador, no libera
- Si ambos identificadores presentes, busca coincidencia exacta por cualquiera de ellos
- Solo libera si hay coincidencia exacta para esa correlación específica
- Verifica resultado de releaseInflight() y solo reporta reconciliado si se liberó
- No libera por coincidencia parcial de fingerprint únicamente

**Tests añadidos:** caso sin correlación verifica reconciled:false

## VALIDACIÓN
- TypeScript: npx tsc --noEmit → sin errores (exit 0)
- Tests journal: 10/10 passed (incluido nuevo test)
- Tests pipeline: 20/20 passed
- Suite completa: 47 archivos, 718 tests passed (exit 0)

## Cambio en tests/pipeline.test.ts
Se añadió aislamiento con BUFFY_DIR en beforeEach/afterEach. No se modificaron expectativas ni se debilitaron pruebas. Es corrección de configuración para evitar contaminación entre tests.

## Riesgos pendientes
- Idempotencia secuencial: Fase 1 NO garantiza ejecución exactamente una vez ante reintentos secuenciales (Fase 2)
- Locks abandonados: recuperación conservadora, requiere resolución humana
- Garantías de durabilidad dependen del FS (fsync best-effort)

## VEREDICTO
**FASE 1 CERRADA**

Todas las cuatro garantías verificadas con evidencia reproducible. Exclusividad garantizada con creación exclusiva, aislamiento efectivo, protección ante corrupción, reconciliación estrictamente correlacionada. Todos los tests pasan sin debilitar expectativas.
