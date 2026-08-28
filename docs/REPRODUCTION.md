# Buffy Next — Reproduction Guide

## Environment

| Component | Version |
|-----------|---------|
| Node.js | v26.7.0 |
| npm | 12.0.2 |
| TypeScript | ^5.6.0 |
| esbuild | ^0.24.2 |
| Vitest | ^3.0.0 |

**Note:** Other Node.js versions (18+, 20+) should work but are not verified.

---

## Quick Start

```bash
# Clone
git clone <repo-url> buffy-next
cd buffy-next

# Install dependencies
npm install

# Verify
npm run typecheck    # May show pre-existing errors (see below)
npm test             # Should pass 569/569
npm run build        # Produces dist/cli.js (130.2kb)
```

---

## Reproduction Commands

### 1. Full Test Suite

```bash
cd buffy-next
npm test
```

**Expected output:**
```
Test Files  31 passed (31)
     Tests  569 passed (569)
  Duration  ~3s
```

### 2. Typecheck

```bash
cd buffy-next
npx tsc --noEmit
```

**Expected output:** 10 pre-existing errors (documented in ARCHITECTURE-FROZEN.md):
- `src/core/context.ts` — 8 errors (HardwareField type mismatch)
- `src/core/doctor.ts` — 1 error (generatedAt missing in DoctorReport)
- `src/core/telemetry.ts` — 1 error (AuditTrail not exported)

**Note:** Tests pass despite type errors. These are type-level mismatches, not runtime issues.

### 3. Build

```bash
cd buffy-next
npm run build
```

**Expected output:** `dist/cli.js` (130.2kb)

### 4. Cross-Platform Validation Tests

```bash
cd buffy-next
npx vitest run tests/cross-platform-validation.test.ts
```

**Expected:** 18/18 passed

### 5. Freshness Gating Tests

```bash
cd buffy-next
npx vitest run tests/freshness-gating.test.ts
```

**Expected:** 11/11 passed

### 6. Temporal Contract Tests

```bash
cd buffy-next
npx vitest run tests/temporal-contract.test.ts
```

**Expected:** 7/7 passed

### 7. Production Integration Tests

```bash
cd buffy-next
npx vitest run tests/production-integration.test.ts
```

**Expected:** 10/10 passed

### 8. Observability Tests

```bash
cd buffy-next
npx vitest run tests/observability.test.ts
```

**Expected:** 13/13 passed

### 9. External Validation Tests

```bash
cd buffy-next
npx vitest run tests/external-validation.test.ts
```

**Expected:** 6/6 passed

### 10. ActionGate Security Tests

```bash
cd buffy-next
npx vitest run tests/action-gate-security.test.ts
```

**Expected:** 44/44 passed

---

## Experiment Reproduction

### E4.2 — Freshness Gating

```bash
cd buffy-next
npx tsx experiments/e4-2/run-validation.ts
```

**Setup:** 5 fresh + 5 stale scenarios × 3 runs = 30 total
**Wait:** 5 seconds between fresh and stale phases
**Expected:** 0 stale violations, 100% refresh success

### MiniMax Smoke Test

```bash
cd buffy-next
npx tsx experiments/minimax-smoke/run-smoke.ts
```

**Setup:** 5 scenarios × 3 runs = 15 total
**Expected:** 15/15 passed, 0 failures

### Operational Pilot

```bash
cd buffy-next
npx tsx experiments/operational-pilot/run-pilot.ts
```

**Setup:** 25 queries across 5 categories
**Expected:** 25/25 passed, avg latency ~138ms

### Phase 3 — Real-World Validation

```bash
cd buffy-next
npx tsx experiments/phase3-real-world/run-quick.ts
```

**Setup:** 10 scenarios (5 static + 3 stale + 2 adversarial)
**Expected:** 10/10 passed, 0 stale violations

---

## Platform-Specific Notes

### Linux

- Adapter: `LinuxAdapter`
- Sources: `/proc/cpuinfo`, `/proc/meminfo`, `/sys/class/thermal`, `lspci`, `df`, `ps`
- No special setup required

### Windows

- Adapter: `WindowsAdapter`
- Sources: PowerShell + WMI
- Requires: PowerShell 5.1+ (default on Windows 10+)

### Android/Termux

- Adapter: `AndroidTermuxAdapter`
- Sources: `/proc`, `getprop`, `ADB`
- Requires: Termux app installed
- Optional: Shizuku for privileged operations

---

## Environment Variables

No environment variables are required for basic operation.

Optional:
- `RISH_APPLICATION_ID` — Override default rish app ID (default: `com.termux`)

---

## Supported Models

| Model/System | Integration | Status |
|--------------|-------------|--------|
| Buffy rule engine | Built-in | ✅ Production-ready |
| MiniMax | Smoke test | ✅ Validated |
| Gemma | E2 experiment | ✅ 90% correct |
| Claude Code | E1 experiment | ✅ 70% correct |

---

## Known Issues

1. **Typecheck errors:** 10 pre-existing TypeScript errors (tests pass)
2. **Linux cpuPercent:** Returns 0 for all processes (documented limitation)
3. **No sudoers pre-check:** install-tool may hang on non-sudoer systems
4. **Small pilot sample:** 25 queries is initial validation only

---

## Troubleshooting

### Tests fail after fresh clone

```bash
npm install
npm test
```

### Build fails

```bash
rm -rf node_modules dist
npm install
npm run build
```

### Typecheck shows errors

This is expected. See ARCHITECTURE-FROZEN.md for details. Tests are the source of truth.

### Permission denied on dist/cli.js

```bash
chmod +x dist/cli.js
```
