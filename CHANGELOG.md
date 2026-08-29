# Changelog

All notable changes to Buffy Next will be documented in this file.

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
