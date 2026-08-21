/**
 * Buffy Next — Adversarial Action Grounding Benchmark v2
 *
 * Expanded from v1 (10 cases) to cover all 15 actions.
 * Detects: safe-reboot over-firing, action contradictions, severity sensitivity.
 *
 * Run: npx tsx experiments/action-grounding-benchmark-v2.ts
 *
 * Constraints: NO runtime changes. Evaluation artifact only.
 */

import { mapActions } from '../src/core/action-mapper.js';
import type { CheckResult, PlatformName, RecommendedAction } from '../src/core/types.js';

// ─── Types ─────────────────────────────────────────────────

interface BenchmarkCase {
  id: number;
  name: string;
  platform: PlatformName;
  checks: CheckResult[];
  /** Actions that SHOULD appear */
  expectedActions: string[];
  /** At least one of these must appear (for same-family resolver cases) */
  eitherActions?: string[];
  /** Actions that MUST NOT appear */
  forbiddenActions: string[];
  /** Why this case exists */
  reason: string;
  /** Category for reporting */
  category: 'coverage' | 'safe-reboot' | 'contradiction' | 'severity' | 'platform' | 'benign';
}

interface CaseResult {
  case: BenchmarkCase;
  actualActions: string[];
  expectedFound: string[];
  expectedMissing: string[];
  forbiddenFound: string[];
  status: 'pass' | 'fail';
  issues: string[];
}

// ─── Benchmark Data ────────────────────────────────────────

const BENCHMARK: BenchmarkCase[] = [
  // ═══ CATEGORY: Coverage (9 uncovered actions) ═════════════

  // 8. close-chrome-tabs
  {
    id: 11,
    name: 'Chrome tabs — should fire close-chrome-tabs',
    platform: 'windows',
    checks: [{ id: 'heavy-processes', category: 'Procesos', severity: 'warning', message: 'Chrome using 4GB' }],
    expectedActions: ['close-chrome-tabs'],
    forbiddenActions: [],
    reason: 'Chrome is the heavy process — should trigger Chrome-specific action',
    category: 'coverage',
  },

  // 9. inspect-processes or check-startup (both investigate family)
  {
    id: 12,
    name: 'Process inspection — investigate CPU',
    platform: 'linux',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 85%' }],
    expectedActions: [],
    eitherActions: ['inspect-processes', 'check-startup'],
    forbiddenActions: [],
    reason: 'High CPU should trigger investigation (inspect or startup check)',
    category: 'coverage',
  },

  // 10. check-startup
  {
    id: 13,
    name: 'Startup check — should fire check-startup',
    platform: 'windows',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 85%' }],
    expectedActions: ['check-startup'],
    forbiddenActions: [],
    reason: 'High CPU could be caused by startup programs',
    category: 'coverage',
  },

  // 11. clear-app-cache (Android)
  {
    id: 14,
    name: 'App cache — Android storage',
    platform: 'android-termux',
    checks: [{ id: 'storage-/', category: 'Storage', severity: 'error', message: 'Storage 95% full' }],
    expectedActions: ['clear-app-cache'],
    forbiddenActions: [],
    reason: 'Android storage full should trigger app cache cleanup',
    category: 'coverage',
  },

  // 12. inspect-storage-detail
  {
    id: 15,
    name: 'Storage detail — disk full',
    platform: 'linux',
    checks: [{ id: 'storage-/', category: 'Storage', severity: 'error', message: 'Disk 95% full' }],
    expectedActions: ['inspect-storage-detail'],
    forbiddenActions: [],
    reason: 'Disk full should trigger detailed storage inspection',
    category: 'coverage',
  },

  // 13. restart-service or restart-network (both mitigate family)
  {
    id: 16,
    name: 'Service restart — network failure',
    platform: 'linux',
    checks: [{ id: 'network-status', category: 'Red', severity: 'error', message: 'Network unreachable' }],
    expectedActions: [],
    eitherActions: ['restart-service', 'restart-network'],
    forbiddenActions: [],
    reason: 'Network failure should trigger mitigation (service or network restart)',
    category: 'coverage',
  },

  // 14. check-permissions or check-tools-availability (both inform family)
  {
    id: 17,
    name: 'Permissions check',
    platform: 'windows',
    checks: [{ id: 'tools-status', category: 'Tools', severity: 'warning', message: 'Some tools missing' }],
    expectedActions: [],
    eitherActions: ['check-permissions', 'check-tools-availability'],
    forbiddenActions: [],
    reason: 'Missing tools should trigger info check (permissions or tools)',
    category: 'coverage',
  },

  // 15. check-tools-availability
  {
    id: 18,
    name: 'Tools availability',
    platform: 'linux',
    checks: [{ id: 'tools-status', category: 'Tools', severity: 'warning', message: 'ADB not found' }],
    expectedActions: ['check-tools-availability'],
    forbiddenActions: [],
    reason: 'Missing tools should trigger availability check',
    category: 'coverage',
  },

  // ═══ CATEGORY: safe-reboot sensitivity ════════════════════

  // Normal CPU — should NOT trigger safe-reboot
  {
    id: 20,
    name: 'safe-reboot: normal CPU (40%) — should NOT fire',
    platform: 'windows',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'ok', message: 'CPU: 40%' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Normal CPU should not trigger reboot',
    category: 'safe-reboot',
  },

  // Moderate CPU — should NOT trigger safe-reboot
  {
    id: 21,
    name: 'safe-reboot: moderate CPU (60%) — should NOT fire',
    platform: 'windows',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 60%' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Moderate CPU should not trigger reboot — investigate first',
    category: 'safe-reboot',
  },

  // High CPU — MAY trigger safe-reboot (borderline)
  {
    id: 22,
    name: 'safe-reboot: high CPU (95%) — borderline',
    platform: 'windows',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'error', message: 'CPU: 95%' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Even high CPU should investigate before rebooting',
    category: 'safe-reboot',
  },

  // Normal temperature — should NOT trigger safe-reboot
  {
    id: 23,
    name: 'safe-reboot: normal temp (45°C) — should NOT fire',
    platform: 'linux',
    checks: [{ id: 'temperature-status', category: 'Temp', severity: 'ok', message: 'CPU: 45°C' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Normal temperature should not trigger reboot',
    category: 'safe-reboot',
  },

  // Elevated temperature — should NOT trigger safe-reboot
  {
    id: 24,
    name: 'safe-reboot: elevated temp (75°C) — should NOT fire',
    platform: 'linux',
    checks: [{ id: 'temperature-status', category: 'Temp', severity: 'warning', message: 'CPU: 75°C' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Elevated temp should trigger thermal check, not reboot',
    category: 'safe-reboot',
  },

  // Critical temperature — MAY trigger safe-reboot
  {
    id: 25,
    name: 'safe-reboot: critical temp (95°C) — borderline',
    platform: 'linux',
    checks: [{ id: 'temperature-status', category: 'Temp', severity: 'error', message: 'CPU: 95°C' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Critical temp should trigger thermal check, not immediate reboot',
    category: 'safe-reboot',
  },

  // CPU + temp combination — should NOT trigger safe-reboot
  {
    id: 26,
    name: 'safe-reboot: CPU 70% + temp 65°C — should NOT fire',
    platform: 'windows',
    checks: [
      { id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 70%' },
      { id: 'temperature-status', category: 'Temp', severity: 'warning', message: 'CPU: 65°C' },
    ],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'Moderate CPU + moderate temp should investigate, not reboot',
    category: 'safe-reboot',
  },

  // ═══ CATEGORY: Contradictions ═════════════════════════════

  // CPU warning — should NOT produce contradictory actions
  {
    id: 30,
    name: 'Contradiction: CPU warning — no conflicting actions',
    platform: 'windows',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 70%' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot'],
    reason: 'CPU warning should not trigger reboot — contradicts investigation actions',
    category: 'contradiction',
  },

  // Network failure — should NOT produce duplicate restart actions
  {
    id: 31,
    name: 'Contradiction: network failure — no duplicate restarts',
    platform: 'linux',
    checks: [{ id: 'network-status', category: 'Red', severity: 'error', message: 'Network unreachable' }],
    expectedActions: ['restart-network'],
    forbiddenActions: ['safe-reboot'],
    reason: 'Network failure should restart network, not reboot',
    category: 'contradiction',
  },

  // Heavy process — should NOT produce close + inspect contradiction
  {
    id: 32,
    name: 'Contradiction: heavy process — close should not conflict with reboot',
    platform: 'windows',
    checks: [{ id: 'heavy-processes', category: 'Procesos', severity: 'warning', message: 'Chrome using 4GB' }],
    expectedActions: ['close-chrome-tabs'],
    forbiddenActions: ['safe-reboot'],
    reason: 'Heavy process should close tabs, not reboot',
    category: 'contradiction',
  },

  // ═══ CATEGORY: Severity sensitivity ═══════════════════════

  // Mild CPU — should produce investigation, not drastic action
  {
    id: 40,
    name: 'Severity: mild CPU (55%) — investigation only',
    platform: 'linux',
    checks: [{ id: 'cpu-status', category: 'CPU', severity: 'ok', message: 'CPU: 55%' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot', 'close-heavy-processes'],
    reason: 'Mild CPU should not trigger any invasive action',
    category: 'severity',
  },

  // OK temperature — should NOT trigger any action
  {
    id: 41,
    name: 'Severity: OK temperature (50°C) — no action',
    platform: 'linux',
    checks: [{ id: 'temperature-status', category: 'Temp', severity: 'ok', message: 'CPU: 50°C' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot', 'check-thermal'],
    reason: 'Normal temperature should not trigger any action',
    category: 'severity',
  },

  // ═══ CATEGORY: Platform correctness ═══════════════════════

  // Android + GPU driver — must NOT show Windows instructions
  {
    id: 50,
    name: 'Platform: Android GPU driver — no Windows instructions',
    platform: 'android-termux',
    checks: [{ id: 'gpu-generic-driver', category: 'GPU', severity: 'warning', message: 'Generic GPU' }],
    expectedActions: ['install-gpu-driver'],
    forbiddenActions: [],
    reason: 'GPU driver on Android should be unsupported',
    category: 'platform',
  },

  // Linux + app cache — must be unsupported
  {
    id: 51,
    name: 'Platform: Linux app cache — should be unsupported',
    platform: 'linux',
    checks: [{ id: 'storage-/', category: 'Storage', severity: 'error', message: 'Storage full' }],
    expectedActions: ['clear-app-cache'],
    forbiddenActions: [],
    reason: 'App cache cleanup is Android-specific',
    category: 'platform',
  },

  // ═══ CATEGORY: Benign cases ═══════════════════════════════

  // No issues — should produce NO actions
  {
    id: 60,
    name: 'Benign: all OK — no actions',
    platform: 'windows',
    checks: [],
    expectedActions: [],
    forbiddenActions: ['safe-reboot', 'close-heavy-processes', 'free-disk-space'],
    reason: 'No issues detected should mean no actions recommended',
    category: 'benign',
  },

  // Minor CPU + normal temp — should NOT produce invasive actions
  {
    id: 61,
    name: 'Benign: minor CPU (50%) + normal temp — no invasive action',
    platform: 'linux',
    checks: [
      { id: 'cpu-status', category: 'CPU', severity: 'ok', message: 'CPU: 50%' },
      { id: 'temperature-status', category: 'Temp', severity: 'ok', message: 'CPU: 50°C' },
    ],
    expectedActions: [],
    forbiddenActions: ['safe-reboot', 'close-heavy-processes', 'check-thermal'],
    reason: 'Minor CPU + normal temp is not a problem',
    category: 'benign',
  },

  // Unknown check — should produce NO actions
  {
    id: 62,
    name: 'Benign: unknown check — no invention',
    platform: 'windows',
    checks: [{ id: 'unknown-check', category: 'Unknown', severity: 'unknown', message: 'Something unclear' }],
    expectedActions: [],
    forbiddenActions: ['safe-reboot', 'close-heavy-processes', 'free-disk-space', 'check-thermal'],
    reason: 'Unknown checks should not trigger any action',
    category: 'benign',
  },
];

// ─── Runner ────────────────────────────────────────────────

function runBenchmark(): void {
  const results: CaseResult[] = [];

  for (const c of BENCHMARK) {
    const actions = mapActions(c.checks, c.platform);
    const actualIds = actions.map(a => a.id);
    const issues: string[] = [];

    // Check expected actions
    const expectedFound = c.expectedActions.filter(e => actualIds.includes(e));
    const expectedMissing = c.expectedActions.filter(e => !actualIds.includes(e));

    // Check eitherActions (at least one must appear)
    const eitherFound = c.eitherActions?.filter(e => actualIds.includes(e)) ?? [];
    const eitherMissing = (c.eitherActions && c.eitherActions.length > 0 && eitherFound.length === 0)
      ? c.eitherActions
      : [];

    // Check forbidden actions
    const forbiddenFound = c.forbiddenActions.filter(f => actualIds.includes(f));

    if (expectedMissing.length > 0) {
      issues.push(`Missing expected: ${expectedMissing.join(', ')}`);
    }
    if (eitherMissing.length > 0) {
      issues.push(`Neither expected action found: ${eitherMissing.join(' or ')}`);
    }
    if (forbiddenFound.length > 0) {
      issues.push(`Forbidden actions found: ${forbiddenFound.join(', ')}`);
    }

    const status: CaseResult['status'] =
      (expectedMissing.length > 0 && eitherMissing.length > 0) || forbiddenFound.length > 0 ? 'fail' : 'pass';

    results.push({
      case: c,
      actualActions: actualIds,
      expectedFound,
      expectedMissing,
      forbiddenFound,
      status,
      issues,
    });
  }

  // ─── Report ───────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('  ADVERSARIAL BENCHMARK v2 — COVERAGE + SAFETY + CONTRADICTIONS');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(70));

  const total = results.length;
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log('\n📊 GLOBAL');
  console.log(`  Total: ${total}  Pass: ${passed}  Fail: ${failed}`);

  // By category
  const categories = ['coverage', 'safe-reboot', 'contradiction', 'severity', 'platform', 'benign'] as const;
  console.log('\n📋 BY CATEGORY');
  for (const cat of categories) {
    const catResults = results.filter(r => r.case.category === cat);
    const catPass = catResults.filter(r => r.status === 'pass').length;
    const catFail = catResults.filter(r => r.status === 'fail').length;
    console.log(`  ${cat.padEnd(15)} ${catPass}/${catResults.length} pass${catFail > 0 ? `  ❌ ${catFail} fail` : ''}`);
  }

  // Failed cases
  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    console.log('\n❌ FAILURES');
    for (const f of failures) {
      console.log(`\n  #${f.case.id} ${f.case.name}`);
      console.log(`     Category: ${f.case.category}`);
      console.log(`     Platform: ${f.case.platform}`);
      console.log(`     Actual: [${f.actualActions.join(', ')}]`);
      console.log(`     Expected: [${f.case.expectedActions.join(', ')}]`);
      console.log(`     Forbidden: [${f.case.forbiddenActions.join(', ')}]`);
      for (const issue of f.issues) {
        console.log(`     ⚠️  ${issue}`);
      }
      console.log(`     Reason: ${f.case.reason}`);
    }
  }

  // Coverage summary
  console.log('\n📈 COVERAGE');
  const allActions = new Set<string>();
  for (const r of results) {
    for (const a of r.actualActions) allActions.add(a);
  }
  console.log(`  Actions exercised: ${allActions.size}/15`);

  // Forbidden action rate
  const totalForbidden = results.reduce((sum, r) => sum + r.forbiddenFound.length, 0);
  console.log(`  Forbidden actions found: ${totalForbidden}`);

  console.log('\n' + '═'.repeat(70));
  console.log('═'.repeat(70) + '\n');
}

runBenchmark();
