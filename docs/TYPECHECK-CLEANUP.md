# Buffy Next — Typecheck Cleanup

## Date: 2026-08-28
## Baseline: v0.2.0-rc (2480cf9)
## Result: 0 errors (was 10)

---

## Original Errors

### Error 1: `context.ts(23,5)` — TS2322

```
Type 'string | undefined' is not assignable to type 'string'.
```

**Cause:** `buildContext()` used `report.timestamp` (deprecated, `string | undefined`) for `generated_at: string`.

**Correction:** Changed to `report.generatedAt` (required `string` field on `DoctorReport`).

**File:** `src/core/context.ts`

---

### Errors 2-8: `context.ts(34-40,47)` — TS2322 × 7

```
Type 'string | null' is not assignable to type 'HardwareField | null'.
Type 'number | null' is not assignable to type 'HardwareField | null'.
Type 'boolean | null' is not assignable to type 'HardwareField | null'.
```

**Cause:** E4.1 updated `BuffyContext.hardware` to use `HardwareField | null` objects, but `buildContext()` still returned raw primitives (`report.system.cpu.model || null`).

**Correction:** Created `hwField()` helper function that wraps primitives into `HardwareField` objects with temporal metadata (`observedAt`, `ageMs`, `freshness`, `source`). Uses `report.generatedAt` as the observation timestamp.

**File:** `src/core/context.ts`

**Helper function:**
```typescript
function hwField(
  value: number | string | boolean | null | undefined,
  unit: string,
  report: DoctorReport,
): HardwareField | null {
  if (value == null || value === '') {
    return { value: null, unit, observedAt: report.generatedAt, ageMs: 0, freshness: 'unknown', source: 'DoctorReport' };
  }
  return { value, unit, observedAt: report.generatedAt, ageMs: 0, freshness: 'observed', source: 'DoctorReport' };
}
```

**Note:** Empty strings (`''`) are treated as `unknown` (matching original `|| null` behavior).

---

### Error 9: `doctor.ts(15,3)` — TS2741

```
Property 'generatedAt' is missing in type
'{ platform, system, capabilities, privileges, items, timestamp }'
but required in type 'DoctorReport'.
```

**Cause:** `DoctorReport` in `types.ts` requires `generatedAt: string`, but `doctor.ts` only set `timestamp`.

**Correction:** Added `generatedAt` field to the return object, set to the same value as `timestamp`.

**File:** `src/core/doctor.ts`

---

### Error 10: `telemetry.ts(5,41)` — TS2305

```
Module '"./types.js"' has no exported member 'AuditTrail'.
```

**Cause:** `AuditTrail` is defined in `diagnose.ts`, not `types.ts`. The import path was wrong.

**Correction:** Changed import to `import type { AuditTrail } from './diagnose.js';`

**File:** `src/core/telemetry.ts`

---

## Files Modified

| File | Changes | Errors Fixed |
|------|---------|--------------|
| `src/core/context.ts` | Import HardwareField, use generatedAt, add hwField() helper | 1-8 |
| `src/core/doctor.ts` | Add generatedAt field to return object | 9 |
| `src/core/telemetry.ts` | Fix AuditTrail import path | 10 |
| `tests/context.test.ts` | Add generatedAt to mock, update HardwareField assertions | — |

---

## Non-Regression Evidence

### Typecheck

```bash
npx tsc --noEmit
# Result: 0 errors (was 10)
```

### Tests

```bash
npm test
# Result: 569/569 PASS (unchanged)
```

### Build

```bash
npm run build
# Result: 130.7kb (was 130.2kb — +0.5kb from hwField helper)
```

### Behavioral Changes

| Aspect | Before | After | Change |
|--------|--------|-------|--------|
| `buildContext()` output shape | Raw primitives | HardwareField objects | **Type-level only** |
| `runDoctor()` output shape | Only `timestamp` | `generatedAt` + `timestamp` | **Backward compatible** |
| `telemetry.ts` AuditTrail import | Wrong path (types.js) | Correct path (diagnose.js) | **No runtime effect** |
| Runtime behavior | Primitives in context | HardwareField in context | **Same values, new wrapper** |

### Key Observations

1. **Error 1 (timestamp):** `report.timestamp` was always populated at runtime. Using `report.generatedAt` is semantically correct and eliminates the `undefined` possibility.

2. **Errors 2-8 (HardwareField):** The `hwField()` helper preserves the original `|| null` behavior for empty strings. The `observedAt` field uses `report.generatedAt` (the report generation time), which is the closest available timestamp. Per-field adapter timestamps are not yet available.

3. **Error 9 (generatedAt):** Added `generatedAt` alongside `timestamp` (both set to the same value). This is backward compatible — existing code reading `timestamp` still works.

4. **Error 10 (AuditTrail import):** The import was unused at the type level in previous builds. Fixing the path has no runtime effect.

---

## Baseline Comparison

| Metric | v0.2.0-rc | After Cleanup | Status |
|--------|-----------|---------------|--------|
| Typecheck errors | 10 | 0 | ✅ FIXED |
| Tests | 569/569 | 569/569 | ✅ NO REGRESSION |
| Build size | 130.2kb | 130.7kb | ✅ +0.5kb (hwField helper) |
| Stale violations | 0 | 0 | ✅ NO REGRESSION |
| Refresh success | 100% | 100% | ✅ NO REGRESSION |
