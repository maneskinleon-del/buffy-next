# CONTINUE - Estado para retomar trabajo

## Estado del repositorio
- **Rama:** `ejecution-journal-fase2-idempotencia` (local, SIN push — no se pidió)
- **HEAD:** `0718c45` feat(execution-journal): Fase 2 — idempotencia at-most-once (diseño v3 §12)
- **Base:** `093c62a` (merge Phase 1) ← commit anterior `39bd834` en origin
- Working tree limpio tras el commit (docs v2/v2.bak design preservados y commiteados).

## Último checkpoint validado
**Fase 2 completa — idempotencia at-most-once (diseño v3, 2026-11-05)**
- Diseño canónico del usuario: `ai-context/reports/execution-journal-phase1/design-v3.md` (verbatim, verificado con los 4 comandos: 12 encabezados §1–§12, 17 filas T, 2 menciones de "incierto", §7 condiciones a–d).
- Implementación (§4–§8): `src/core/execution-journal.ts` — `FAULT_POINTS`/`hitFaultPoint` (env `BUFFY_FAULT_POINT`), `validateIdempotencyKey` (1–256 ASCII imprimibles **+ sin `/` ni `\`**, por §10-T3), `keyHashOf`, `readBootId`/`readStarttime` (starttime=campo 22), `startedOwnerAlive` (hostname→bootId→pid→kill→starttime, fail-closed), entradas Phase2 `started|completed|failed|aborted|resolution`, `deriveKeyState` (key_conflict > started vivo=in_progress / muerto=needs_resolution > completed=cached > failed=needs_resolution > aborted=proceed), `beginKey`/`finishKey`/`lookupKey`/`resolveKey` (validación reason/evidence, rechazos exit 1). `writeEntryLine` (append sin lock) para `beginKey`/`resolveKey`; `appendEntryUnderLock` (lock+write) solo donde NO se sostiene el lock — evita el deadlock(sin(resp) del lock anidado detectado con evidencia (write_failed a 5001 ms).
- Wiring: `ActionGate.execute(actionId, rawParams?, opts?: { idempotencyKey? })` (invalid_key, begin fuera de hook, cached/needs_resolution/key_conflict/invalid_key → success false con `details.state`, `persisted?: boolean` en resultado si el append terminal falla sin liberar claim, hooks `after_claim`/`after_execute`/`before_terminal_append`). CLI: `buffy journal resolve --key <key> <resolution> <motivo> [--evidence <texto>]`.
- Tests: `tests/execution-journal-phase2.test.ts` T1–T17 con runner hijo `tests/fixtures/phase2-runner.ts` (`@@RESULT@@{json}`, crashes reales con `process.exit(137)`, escenarios por punto con `freshDir()`).
- Verificación final: `npx tsc --noEmit` 0 errores; `npx vitest run` **745/745 pasados (49 archivos)** = 728 previos + T1–T17.
- Bugs corregidos durante el loop: lock anidado (deadlock 5 s), exclusión de separadores de ruta en keys, `ioError` (EISDIR) separado de línea corrupta → `fallo_append_started`, fixture pasa la key vacía tal cual, escenario `freshDir()` por punto en T8 (claim huérfano no bloqueaba al punto 2), conteos de executor corregidos en T7/T9.

## Tareas pendientes
- [ ] Decidir si merge de `ejecution-journal-fase2-idempotencia` a master (requiere OK del usuario).
- [ ] Monitorear uso en producción/test.
- [ ] Push a origin cuando el usuario lo pida.

## Riesgos conocidos
- `journlock` anidado: regla de oro — nunca volver a adquirir `journal.lock` dentro de un bloque que ya lo sostiene; usar `writeEntryLine`.
- Durabilidad ante caída OS: fsync implementado; garantías dependen del FS.
- `lookupKey/resolveKey` fallan-cerrado ante línea corrupta que mencione la key consultada (fail-closed).
- Avit console WARNING preexisterte `[buffy:evidence]` en la suite completa (mock de store sin `recordEvidence`); NO es fallo (745/745 verde), existe a causa de políticas de logs de tests ajenos a Fase 2.

## Archivos importantes
- `src/core/execution-journal.ts` — Fase 1 + Fase 2 completa (append/syn, estados, resolve)
- `src/core/action-gate.ts` — puerta única con opts.idempotencyKey
- `src/cli.ts` — `buffy journal resolve --key ...`
- `tests/execution-journal-phase2.test.ts` — T1–T17 (diseño v3)
- `tests/fixtures/phase2-runner.ts` — runner de subprocess para fault injection
- `ai-context/reports/execution-journal-phase1/design-v3.md` — fuente de verdad (NO tocar)

## Pruebas que deben ejecutarse antes de modificar Código
```bash
cd /home/mangonz/proyectos/buffy-next
npx tsc --noEmit
npx vitest run          # 745/745
```

## Notas
- `buffy-doctor.sh` no existe en PATH en este entorno (limitación anotada; no bloqueó).
- Modo autónomo ejecutado: tests primero (17/17 rojo en la primera corrida → evidencia), luego código, luego verde. Sin push, sin pedir permisos.
