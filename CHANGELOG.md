# Changelog

All notable changes to Buffy Next will be documented in this file.

## [Unreleased]

### Added — PR5: `buffy ctx` (delegador a Context) + `buffy env` (topología) (2026-09-27)

- **`buffy ctx <comando> [args]`** — delegación por subprocess a scripts de Buffy Context (`buffy-context/scripts/buffy-<cmd>.sh`). Pass-through estricto: args **verbatim** (flags incluidos — el tail se toma de argv crudo, no de stripFlags: los flags posteriores a `ctx <cmd>` son del script), streams sin mediación (`stdio: inherit`), exit code del script preservado (no colapsado). Sin args: lista comandos descubiertos, **exit 0**. Discovery por filesystem — Next no conoce la lista de subcomandos de Context (puede crecer sin tocar Next). Validación de nombre `[a-z0-9-]+` antes de interpolar en ruta (bloquea traversal). CWD = repo root de Context (convención de sus scripts). Errores nombran la capa y apuntan a `buffy env`.
- **`buffy env`** — topología de instalación: versión Next, presencia/ruta/versión de Context (lectura única documentada de `VERSION` — excepción a la no-lectura de archivos de Context), comandos ctx disponibles. Complementario a `health` (subsistemas internos). Diagnóstico para el riesgo de versionado cruzado (R3).
- **Señales (verificado empíricamente en modo producción):** kill programático al CLI → forward `SIGTERM` **al grupo de procesos del script** (`detached: true` + `kill(-pid)`) — nietos del script (p.ej. `sleep` interno de un bash) mueren también; cero huérfanos. En dev con `tsx` el wrapper intermedio absorbe la señal (artefacto del runner, no del binario).
- **Override:** `BUFFY_CONTEXT_REPO` ("REPO", no "HOME" — `BUFFY_HOME` ya existe en Context con semántica de estado generado; evitar el patrón H1 en el namespace de env vars).
- **Dispatch temprano:** `ctx`/`env` corren antes de `createAdapter` — comandos de topología, funcionan aunque el adapter esté roto.
- Tests: 668 → **679** (+11: validación, discovery, exec pass-through verbatim vía subprocess, exit codes, exit 0 sin args, guard de dispatch temprano, versión null honesta). tsc limpio, build OK.

### Added — PR4: superficie de discovery y desambiguación epistémica (2026-09-27)

- **H8 — `buffy capabilities` expone el catálogo de acciones.** `capabilities --json` ahora retorna `{ capabilities, actions }` con `id`, `name`, `level` (auto_safe/confirm/forbidden) y `prerequisites` por acción (`getActionCatalog()` en `src/actions/registry.ts`). El render humano agrega la sección "Acciones disponibles". Contract: discovery ≠ authorization — listar no autoriza, la ejecución sigue siendo exclusivamente via ActionGate. **BREAKING (JSON):** el output de `capabilities --json` deja de ser un array plano; el único consumidor conocido es subprocess CLI (sin superficie MCP en código).
- **H1 (D1-c) — instalado ≠ conectado.** `doctor` desambigua ADB en dos filas: `ADB (binario)` (de `capabilities`, instalación) y `ADB (dispositivo)` (de `privileges.adb`, dispositivo en estado `device`). La fila ambigua `priv-adb` ("ADB: disponible" — dos semánticas bajo una etiqueta) se elimina. `Capability` gana `deviceConnected?` para que el adapter pueda medir conectividad sin fabricar false. La fila genérica de dependencias ya no duplica ADB.
- **D3 (rename plan-mode) — docs-only.** Verificado: cero `--dry-run` en src/ (solo comentarios históricos). El reemplazo v2.2 por `ActionPlanner.preview` fue deliberado; `act --json` es el plan-mode. Sin alias, sin deprecation — si aparece un consumidor roto, recién entonces (c).

### Added — PR3: H6, brecha de serialización epistémica cerrada (2026-09-27)

- **`epistemicState` + `ageMs` por-observación en `diagnose`.** Los 9 sitios de push de `analyzeForQuery` serializan la clasificación de `classifyEpistemicState` (antes: cálculo muerto — se calculaba y se descartaba). `CheckResult` gana `epistemicState?` + `ageMs?`. El freshness gating re-stampea en el boundary (todo ítem que sale del gating lleva el campo). Telemetría agregada (`staleFields`/`refreshRequired`/`refreshPerformed`) intacta — ortogonal: describe el pipeline, no los ítems.

## [0.2.2] - 2026-08-28

### Onboarding & Version Consistency

- **Single source of truth for version.** Added `src/core/version.ts` — reads `package.json` at runtime so `buffy health`, `buffy doctor --context`, and all public interfaces report the same version. Works under `tsx` (dev) and the esbuild bundle (`dist/cli.js`).
- **`buffy --version` flag.** CLI now reports the version directly (`buffy-next v0.2.2`).
- **`buffy health` reports version.** `getHealthStatus()` now includes `version: BUFFY_VERSION` in its output.
- **README hardened.** Warning about npm `buffy` package (different project) and clear installation instructions from git clone.
- **docs-install.test.ts.** Validates that README instructions produce a working build.

#### Files Added

- `src/core/version.ts` — package.json reader for version identity
- `tests/docs-install.test.ts` — install instruction validation

#### Files Modified

- `src/cli.ts` — imports version.ts, adds `--version`/`-V` flag
- `src/core/telemetry.ts` — version in health status
- `README.md` — installation instructions, npm warning

#### Verified

- 569/569 tests pass
- Typecheck clean
- `buffy --version` → `buffy-next v0.2.2`
- `buffy health` → `version: 0.2.2`

---

## [0.2.1] - 2026-08-28

### Typecheck Cleanup

Maintenance release — resolves 10 pre-existing TypeScript errors from E4.1 type migration without changing runtime behavior.

#### Files Modified

- `src/core/context.ts` — Use `generatedAt`, wrap hardware values in `HardwareField` with `observedAt`, `ageMs`, `freshness`, `source`
- `src/core/doctor.ts` — Add `generatedAt` field to `DoctorReport`
- `src/core/telemetry.ts` — Fix `AuditTrail` import path
- `tests/context.test.ts` — Updated assertions for new HardwareField shape

#### Verified

- 569/569 tests pass
- Typecheck clean
- 0 runtime behavior changes

---

## [0.4.0] - 2026-08-20

### Diagnostic Architecture Upgrade

The diagnostic model now separates measured facts from derived inferences, producing more honest and transparent system analysis.

#### Changed

- **Separated Observations from Inferences.** The diagnostic pipeline now explicitly distinguishes between what Buffy *measured* (Observations) and what Buffy *infers* from those measurements (Inferences). Previously these were conflated in `CheckResult[]`.
- **Removed `confidence` score.** The old `confidence = facts.length / total` metric was semantically meaningless — it measured check coverage, not diagnostic certainty. Eliminated entirely.
- **Explicit category → action mapping.** `findActionsForIssue()` now uses a `CATEGORY_TO_ACTIONS` record instead of fragile string matching on action IDs. More maintainable and predictable.
- **Diagnostics can report problems without requiring a fix.** Buffy can now detect and explain a problem even when no action exists to solve it (e.g., low storage). This prevents "diagnosing only what Buffy can fix."

#### Architecture

```
SystemInfo (measured data)
    ↓
Observations (facts + threshold classification)
    ↓
Inferences (possible causes — never confirmed)
    ↓
SuggestedActions (derived from observations, not inferences)
    ↓
executeWithGates()
    ↓
verify()
```

#### New Types (types.ts)

- `Observation` — measured fact with category, severity, optional threshold
- `Inference` — possible cause derived from observations (`basedOn`, `statement`, `possible`)
- `DiagnosticResult` — refactored to use `observations` + `inferences` instead of `items`: `{ observations, inferences, suggestedActions }`

#### New Functions

- `deriveInferences(observations)` — pure function that derives possible causes from observations (diagnose.ts)
- `buildObservations(systemInfo, checks)` — maps system data to typed observations (diagnose.ts)

#### Files Modified

- `src/core/types.ts` — Added `Observation`, `Inference`, `DiagnosticResult` interfaces
- `src/core/diagnose.ts` — Refactored to produce `Observation[]` + `Inference[]` instead of `CheckResult[]`
- `src/core/presenter.ts` — `renderDiagnosticReport()` now takes `(observations, inferences)` separately
- `src/actions/registry.ts` — `findActionsForIssue()` accepts `Observation[]`, returns `SuggestedAction[]`
- `src/cli.ts` — `cmdDiagnose` uses new `DiagnosticResult` shape
- `tests/diagnose.test.ts` — Updated for new types + 3 new inference tests
- `tests/flow.test.ts` — Updated GPU test to use observation-based flow

#### Verified

- 101/101 tests pass
- Typecheck clean
- Tested in vivo on Android/Termux (Mi 10, Snapdragon 865, HyperOS)

---

## [0.3.0] - 2026-08-19

### Termux Real Testing

- RAM, storage, processes now report real values on Android/Termux
- Adapter detection relaxed (`isTermux || isAndroid`)
- Build functional in Termux (esbuild via node wrapper)
- `pipeline.ts` extracted — `executeWithGates` testable independently
- 39 new tests (87 total, was 48)
- Dead code eliminated

---

## [0.2.0] - 2026-08-18

### Initial MVP

- Core pipeline: CLI → Check Selector → Adapter → Diagnosis → Action Registry → Security → Executor → Verify → Presenter
- 6 actions: check-gpu-driver, check-driver-status, check-system-temp, list-processes, install-tool, change-power-plan
- Windows + Android/Termux adapters
- Security model: AUTO_SAFE / CONFIRM / FORBIDDEN
- State persistence: `~/.buffy/state.json`
