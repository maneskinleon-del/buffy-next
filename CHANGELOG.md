# Changelog

All notable changes to Buffy Next will be documented in this file.

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
