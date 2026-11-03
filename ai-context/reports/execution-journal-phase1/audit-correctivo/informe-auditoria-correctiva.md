# AUDITORÍA CORRECTIVA Y CIERRE DE EXECUTION JOURNAL FASE 1

## 1. Estado inicial
- Rama: master
- HEAD: 795b61b test(mcp): buffy_search schema, delegation, structural guards
- Archivos modificados (working tree): src/core/action-gate.ts, src/state/store.ts
- Archivos sin rastrear: ai-context/, src/core/execution-journal.ts, tests/execution-journal-phase1.test.ts, tmp
- Datos en ~/.buffy: inspeccionados en modo lectura; no se limpiaron ni modificaron.

## 2. Hallazgos
| Problema | Evidencia | Riesgo | Resolución |
|---------|-----------|--------|------------|
| BUFFY_DIR calculado al cargar módulo (homedir). Tests podían escribir fuera de dirs temporales. | src/core/execution-journal.ts líneas 30-40 (original), tests/execution-journal-phase1.test.ts sin aislamiento. | Contaminación entre tests / escritura en ~/.buffy real. | Añadido soporte BUFFY_DIR via env; getBuffyDir()/getters dinámicos; aislamiento con beforeEach/afterEach en tests de journal y pipeline. |
| store.ts usaba constantes BUFFY_DIR/STATE_FILE estáticas. | src/state/store.ts líneas 11-15 (original). | Aislamiento de tests comprometido. | Convertido a funciones dinámicas (getBuffyDir/getStateFile); uso consistente. |
| updateState/read-modify-write expuesto si se hace fuera de lock. | Requisito de auditoría. | Pérdida de actualizaciones concurrentes. | updateState ya adquiría lock completo (lectura+modificación+escritura dentro de lock). Se mantiene sin fallback inseguro. |
| reconcileClaim liberaba claims con mismo fingerprint sin correlación suficiente. | src/core/execution-journal.ts reconcileClaim (original). | Liberación incorrecta de claim nuevo basándose en entrada antigua. | Reescrito para exigir executionId/requestId; sin correlación → conservador (no libera); solo libera con coincidencia exacta por correlación. |
| Enlaces rotos en ai-context/README.md | README.md referenciaba architecture/system-overview.md, architecture/actiongate.md inexistentes. | Documentación incorrecta. | Corregidos enlaces a documentos existentes. |

## 3. Cambios realizados
| Archivo | Cambio | Motivo |
|---------|--------|--------|
| src/core/execution-journal.ts | Soporte BUFFY_DIR por env, getters dinámicos, reconcileClaim más conservador | Aislamiento de tests y recuperación segura |
| src/state/store.ts | Rutas dinámicas por BUFFY_DIR, sin fallbacks inseguros | Aislamiento y protección ante escritura corrupta/truncada |
| src/core/action-gate.ts | Integración con journal (claim antes de ejecutar, journal antes de liberar claim) | Cumplir orden obligatorio |
| tests/execution-journal-phase1.test.ts | Aislamiento con dirs temporales | Cumplir requisito de aislamiento |
| tests/pipeline.test.ts | Aislamiento con dirs temporales | Evitar contaminación entre tests |
| ai-context/README.md | Corregidos enlaces rotos | Documentación coherente |

## 4. Pruebas
| Prueba | Escenario | Resultado | Código de salida | Evidencia |
|---------|-----------|-----------|------------------|-----------|
| TypeScript | npx tsc --noEmit | OK | 0 | Sin errores |
| Journal tests | tests/execution-journal-phase1.test.ts | 9/9 passed | 0 | Aislados en temp dir, BUFFY_DIR configurado |
| Pipeline tests | tests/pipeline.test.ts | 20/20 passed | 0 | Aislados tras corrección |
| Suite completa | npx vitest run | 47 files, 717 tests passed | 0 | Todos los tests pasan |

Comandos ejecutados:
- cd /home/mangonz/proyectos/buffy-next && npx tsc --noEmit
- cd /home/mangonz/proyectos/buffy-next && npx vitest run tests/execution-journal-phase1.test.ts
- cd /home/mangonz/proyectos/buffy-next && npx vitest run tests/pipeline.test.ts
- cd /home/mangonz/proyectos/buffy-next && npx vitest run

## 5. Garantías
| Garantía | Estado | Notas |
|----------|--------|-------|
| ActionGate única puerta de ejecución | DEMOSTRADO | Integración correcta, claim antes de efecto |
| Claim precede a efecto físico | DEMOSTRADO | claimInflight antes de ejecutar executor |
| Journal persistido antes de liberar claim | DEMOSTRADO | appendToJournal antes de releaseInflight; si falla no se libera |
| Fallo de persistencia no libera claim automáticamente | DEMOSTRADO | ActionGate conserva claim si journal write falla |
| Recuperación identifica ejecución concreta | OBSERVADO | reconcileClaim con correlación; requiere ejecuciónId/requestId |
| Claims desconocidos conservados | DEMOSTRADO | Sin correlación → no auto-liberación |
| state.json protegido en RMW completo | DEMOSTRADO | Lock adquirido durante lectura+modificación+escritura; sin fallbacks inseguros |
| Tests aislados de ~/.buffy | DEMOSTRADO | BUFFY_DIR por env, dirs temporales, teardown |
| 7 niveles de evidencia mantenidos | OBSERVADO | Sin cambios en semántica |
| Contratos CLI/MCP preservados | OBSERVADO | Sin cambios en interfaces públicas |

## 6. Riesgos pendientes
- Idempotencia secuencial: Fase 1 NO garantiza ejecución exactamente una vez ante reintentos secuenciales (aplaudo a Fase 2).
- Locks abandonados: sistema conservador, no auto-elimina; requiere resolución humana.
- Durabilidad ante caída del SO: fsync implementado con best-effort en algunos puntos; garantías dependen del FS.
- reconcileClaim más estricto puede requerir que callers pasen correlación correctamente (ya lo hace ActionGate).

## 7. Veredicto
**FASE 1 CERRADA**

Se cumplen las garantías críticas: aislamiento de tests, protección de state.json en RMW completo, journal antes de liberar claim, recuperación conservadora con correlación, ActionGate como única puerta. Todos los tests pasan (47 archivos, 717 tests) y TypeScript compila sin errores. No se hicieron commit/push/merge/deploy.
