# CONTINUE - Estado para retomar trabajo

## Estado del repositorio
- **Rama:** `ejecution-journal-fase2-idempotencia` (local, SIN push — no se pidió)
- **HEAD sustantivo:** `bec70ab` docs(research): evidencia verificada de D3 y matiz real del cache hit. Lo único posterior es el commit que sincroniza este propio archivo (solo `CONTINUE.md`), así que el código y los documentos descritos aquí están en `bec70ab`. Cadena de la ronda: `9ed9526` (HEAD anterior en este archivo), `8fd394a` (notas sin atribuciones ni alucinaciones), `7c49aa1` (revert del `else`), `6f521e1` (restauración de `design-v3.md`). 13 commits sobre la base y 14 archivos tocados hasta `bec70ab`.
- **Base:** `093c62a` (merge Phase 1) ← commit anterior `39bd834` en origin
- Working tree limpio tras los commits; diseño v2/v2.bak preservados y commiteados.

## Último checkpoint validado
**Fase 2 — idempotencia at-most-once (diseño v3, 2026-11-05) + ronda de revisión**
- Diseño canónico del usuario: `ai-context/reports/execution-journal-phase1/design-v3.md` (verbatim, verificado con los 4 comandos: 12 encabezados §1–§12, 17 filas T, 2 menciones de "incierto", §7 condiciones a–d). **No se modifica.**
- Desviaciones y límites documentados en `ai-context/reports/execution-journal-phase1/design-v3-notas.md`.
- Implementación §4–§8 en `src/core/execution-journal.ts`: `FAULT_POINTS`/`hitFaultPoint` (env `BUFFY_FAULT_POINT`), `validateIdempotencyKey` (1–256 ASCII imprimibles **+ sin `/` ni `\`**, ver D1 en notas), `keyHashOf`, `readBootId`/`readStarttime` (starttime = campo 22), `startedOwnerAlive` (hostname→bootId→pid→kill→starttime, fail-closed), entradas Phase2 `started|completed|failed|aborted|resolution`, `deriveKeyState` (key_conflict > started vivo=in_progress / muerto=needs_resolution > completed=cached > failed=needs_resolution > aborted=proceed), `beginKey`/`finishKey`/`lookupKey`/`resolveKey` con validación de reason/evidence (rechazos → exit 1).
- **Regla del lock (crítica):** `beginKey`/`resolveKey` ya sostienen `journal.lock` y usan `writeEntryLine` (append sin lock); `appendEntryUnderLock` (lock + write) solo para quien NO lo sostiene (`finishKey`). Volver a adquirir el lock en profundidad produce un deadlock de 5 s (evidencia: `write_failed` a 5001 ms con script de debug).
- Wiring: `ActionGate.execute(actionId, rawParams?, opts?: { idempotencyKey? })`; states con key → `success:false` + `details.state` (salvo `cached`); `ActionResult.persisted?: boolean` si el append terminal falla (claim no se libera); hooks `after_claim`/`after_execute`/`before_terminal_append`; path `cached` termina el registro de ejecución como no-ejecutado (D3).
- CLI: `buffy journal resolve --key <key> <resolution> <motivo...> [--evidence "<texto>"]` + `--json`. Fix de parseo: sin `--evidence` ya no se descarta la primera palabra del motivo.
- Tests: `tests/execution-journal-phase2.test.ts` T1–T17 con runner hijo `tests/fixtures/phase2-runner.ts` (`@@RESULT@@{json}`, crashes reales `process.exit(137)`, escenarios por punto con `freshDir()`). `tests/journal-cli.test.ts` +6 tests de subprocess para `--key` (needs_resolution→0, sin evidence→1, con evidence→0, completed→1 not_resolvable, key inválida→1, sin motivo→1).
- Verificación final: `npx tsc --noEmit` 0 errores; `npx vitest run` **751/751 pasados (49 archivos)** = 728 previos + 17 Fase 2 + 6 CLI.
- Bugs corregidos en el loop: lock anidado (deadlock 5 s), separadores de ruta en keys, `ioError` (EISDIR) separado de línea corrupta → `fallo_append_started`, fixture pasa la key vacía tal cual, `freshDir()` por punto en T8, conteos de executor en T7/T9, motivo del CLI sin `--evidence`.
- Avisos `[buffy:evidence]` de la suite: **preexistentes**, reproducidos en `093c62a` (`No "recordEvidence" export is defined on the "../src/state/store.js" mock`). No afectan el resultado.
- **Cierre de revisión (2026-11-06):** `design-v3.md` restaurado verbatim desde `0718c45` (129 líneas, diff vacío; antes estaba borrado y recreado con el §12 reemplazado) · revertido el `else` inalcanzable que `e43ff97` añadió al criterio de liberación de claim · notas sin atribuciones al operador (L4, cabecera) y D3 declara el efecto real en telemetría: `allRecords()` clasifica el registro `failed` como `outcome: 'exception'`, así que el `cached` deja el compuesto en `NOT_VERIFIED`, nunca `OBSERVED_EXECUTED` (evidencia en `ai-context/research/execution-journal-phase2-who-reads-fail.md`). Verificado tras los cambios: `tsc` 0 errores, 751/751.

## Tareas pendientes
- [ ] Decidir merge de `ejecution-journal-fase2-idempotencia` a master y push a origin (requiere OK del usuario).
- [ ] Fase 3 (deuda explícita): `journal unlock --confirm-dead-pid` para `journal.lock` huérfano (L3 en notas).
- [ ] Decidir si la misma fingerprint con keys distintas debe excluirse más allá del claim (L1 en notas).

## Riesgos conocidos
- Lock anidado: nunca re-adquirir `journal.lock` dentro de un bloque que ya lo sostiene; usar `writeEntryLine`.
- Misma fingerprint + keys distintas: el claim solo serializa mientras el ganador lo retiene (L1).
- Doble registro por ejecución con key (`execution` + keyed): divergencias cubiertas por T9 y resolución manual (L2).
- Sin `journal unlock`: lock huérfano bloquea escrituras hasta borrado manual (L3).
- Durabilidad ante caída del OS: fsync implementado; garantías dependen del FS.
- `lookupKey`/`resolveKey` fallan-cerrado ante línea corrupta que mencione la key consultada.

## Archivos importantes
- `src/core/execution-journal.ts` — Fase 1 + Fase 2 (append/fsync, estados, resolve)
- `src/core/action-gate.ts` — puerta única con `opts.idempotencyKey`
- `src/cli.ts` — `buffy journal resolve [--key ...]`
- `tests/execution-journal-phase2.test.ts` — T1–T17
- `tests/journal-cli.test.ts` — CLI de claims (5) + `--key` (6)
- `tests/fixtures/phase2-runner.ts` — runner de subprocess para fault injection
- `ai-context/reports/execution-journal-phase1/design-v3.md` — fuente de verdad (NO tocar)
- `ai-context/reports/execution-journal-phase1/design-v3-notas.md` — desviaciones y límites

## Pruebas que deben ejecutarse antes de modificar código
```bash
cd /home/mangonz/proyectos/buffy-next
npx tsc --noEmit
npx vitest run          # 751/751
```

## Notas
- `buffy-doctor.sh` no existe en PATH en este entorno (limitación anotada; no bloqueó).
- Modo autónomo ejecutado con tests primero (17/17 rojo en la primera corrida → evidencia), luego código y verde. Sin push.
