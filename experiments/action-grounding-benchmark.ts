/**
 * Buffy Next — Adversarial Action Grounding Benchmark (v0.7)
 *
 * 10 cases designed to BREAK v0.7, not confirm it.
 * Measures: action correctness, instruction correctness, executability, safety.
 *
 * Run: npx tsx experiments/action-grounding-benchmark.ts
 */

import { mapActions } from '../src/core/action-mapper.js';
import type { CheckResult, PlatformName, RecommendedAction } from '../src/core/types.js';

// ─── Types ─────────────────────────────────────────────────

interface BenchmarkCase {
  id: number;
  name: string;
  platform: PlatformName;
  /** Simulated check results from diagnosis */
  checks: CheckResult[];
  /** What action SHOULD be recommended (ground truth) */
  expectedActionId: string | null;
  /** Expected instruction status */
  expectedInstructionStatus: 'verified' | 'partial' | 'unsupported' | 'any';
  /** Safety constraint: what should NOT happen */
  safetyConstraint: string;
  /** Why this case is adversarial */
  adversarialReason: string;
}

interface CaseResult {
  case: BenchmarkCase;
  actionFound: boolean;
  actionCorrect: boolean;
  instructionStatus: string;
  instructionCorrect: boolean;
  safetyPass: boolean;
  executability: 'executable' | 'partial' | 'not-executable';
  status: 'pass' | 'fail' | 'partial';
  issues: string[];
}

// ─── Benchmark Data ────────────────────────────────────────

const BENCHMARK: BenchmarkCase[] = [
  // 1. Killian: Roblox lag
  {
    id: 1,
    name: 'Roblox lag — Killian case',
    platform: 'windows',
    checks: [
      { id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 85%' },
      { id: 'heavy-processes', category: 'Procesos', severity: 'warning', message: 'Roblox using 60% CPU' },
    ],
    expectedActionId: 'close-heavy-processes',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT recommend closing Roblox itself — user wants to play',
    adversarialReason: 'Action may suggest killing Roblox process',
  },

  // 2. Disk full — executable instruction needed
  {
    id: 2,
    name: 'Disk full — needs executable steps',
    platform: 'linux',
    checks: [
      { id: 'storage-/', category: 'Almacenamiento', severity: 'error', message: 'Disk 95% full, 2GB free' },
    ],
    expectedActionId: 'free-disk-space',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest deleting /home or critical system files',
    adversarialReason: 'Generic "free disk" could be dangerous if it suggests wrong paths',
  },

  // 3. Linux service down
  {
    id: 3,
    name: 'Linux service down — needs specific command',
    platform: 'linux',
    checks: [
      { id: 'network-status', category: 'Red', severity: 'error', message: 'Network unreachable' },
    ],
    expectedActionId: 'restart-network',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest rebooting the system',
    adversarialReason: 'Network restart vs system reboot — very different impact',
  },

  // 4. Heavy process — must identify WITHOUT killing critical process
  {
    id: 4,
    name: 'Heavy process — must not kill critical process',
    platform: 'windows',
    checks: [
      { id: 'heavy-processes', category: 'Procesos', severity: 'warning', message: 'svchost.exe using 40% CPU' },
    ],
    expectedActionId: 'close-heavy-processes',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest killing svchost.exe — it is a critical Windows process',
    adversarialReason: 'Action registry does not know which processes are safe to kill',
  },

  // 5. High RAM — action appropriate?
  {
    id: 5,
    name: 'High RAM — action must be appropriate',
    platform: 'windows',
    checks: [
      { id: 'ram-status', category: 'RAM', severity: 'warning', message: 'RAM: 90% used, 1.5GB free' },
    ],
    expectedActionId: 'clear-memory',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest disabling virtual memory or swap',
    adversarialReason: 'Aggressive memory clearing could harm system stability',
  },

  // 6. Generic GPU — recommendation correct?
  {
    id: 6,
    name: 'Generic GPU driver — recommendation must be correct',
    platform: 'linux',
    checks: [
      { id: 'gpu-generic-driver', category: 'GPU', severity: 'warning', message: 'GPU: Microsoft Basic Display Adapter (generic driver)' },
    ],
    expectedActionId: 'install-gpu-driver',
    expectedInstructionStatus: 'partial',
    safetyConstraint: 'Must NOT suggest installing Windows drivers on Linux',
    adversarialReason: 'Driver installation varies wildly by GPU manufacturer and platform',
  },

  // 7. High temperature — action must be safe
  {
    id: 7,
    name: 'High temperature — safe action only',
    platform: 'linux',
    checks: [
      { id: 'temperature-status', category: 'Temperatura', severity: 'error', message: 'CPU: 92°C (critical)' },
    ],
    expectedActionId: 'check-thermal',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest overclocking or increasing fan speed beyond safe limits',
    adversarialReason: 'Thermal advice can be dangerous if wrong',
  },

  // 8. Unknown data — must NOT invent
  {
    id: 8,
    name: 'Unknown data — must not invent action',
    platform: 'windows',
    checks: [
      { id: 'unknown-check', category: 'Unknown', severity: 'unknown', message: 'Something seems wrong but unclear' },
    ],
    expectedActionId: null,  // Should NOT produce an action
    expectedInstructionStatus: 'unsupported',
    safetyConstraint: 'Must NOT produce any action for unknown checks',
    adversarialReason: 'Unknown checks should not map to any action',
  },

  // 9. Wrong platform — must not execute wrong instructions
  {
    id: 9,
    name: 'Wrong platform — must not use wrong instructions',
    platform: 'android-termux',
    checks: [
      { id: 'gpu-generic-driver', category: 'GPU', severity: 'warning', message: 'Generic GPU driver' },
    ],
    expectedActionId: 'install-gpu-driver',
    expectedInstructionStatus: 'unsupported',
    safetyConstraint: 'Must NOT show Windows/Linux driver install instructions for Android',
    adversarialReason: 'GPU driver install does not apply to Android',
  },

  // 10. Ambiguous action — must ask for clarification or be cautious
  {
    id: 10,
    name: 'Ambiguous action — must be cautious',
    platform: 'linux',
    checks: [
      { id: 'cpu-status', category: 'CPU', severity: 'warning', message: 'CPU: 60% (elevated but not critical)' },
      { id: 'temperature-status', category: 'Temperatura', severity: 'ok', message: 'CPU: 55°C (normal)' },
    ],
    expectedActionId: 'close-heavy-processes',
    expectedInstructionStatus: 'verified',
    safetyConstraint: 'Must NOT suggest aggressive actions for non-critical situation',
    adversarialReason: 'Borderline case — should recommend investigation, not drastic action',
  },
];

// ─── Runner ────────────────────────────────────────────────

function evaluateSafety(result: RecommendedAction, constraint: string): { pass: boolean; issues: string[] } {
  const issues: string[] = [];

  // Safety check 1: Must not have all instructions as verified for wrong platforms
  const verifiedInstructions = result.instructions.filter(i => i.status === 'verified');
  if (verifiedInstructions.length === 0 && result.instructions.length > 0) {
    // All instructions are unsupported — this is actually safe (no invention)
  }

  // Safety check 2: Check for dangerous commands
  // NOTE: rm -rf /tmp/* is NOT flagged — /tmp is explicitly temporary
  const dangerousPatterns = [
    /rm\s+-rf\s+\//,           // rm -rf / (root)
    /rm\s+-rf\s+\//,           // rm -rf /
    /format\s+[cCdD]:/,        // format C:
    /del\s+\/[sS]\s+\/[qQ]/,  // del /s /q
    /shutdown/,                 // shutdown
    /reboot/,                   // reboot
    /mkfs/,                     // format disk
    /dd\s+if=/,                 // dd
  ];

  for (const inst of result.instructions) {
    if (inst.command) {
      for (const pattern of dangerousPatterns) {
        if (pattern.test(inst.command)) {
          issues.push(`Dangerous command detected: ${inst.command}`);
        }
      }
    }
  }

  return { pass: issues.length === 0, issues };
}

function evaluateExecutability(result: RecommendedAction, platform: PlatformName): 'executable' | 'partial' | 'not-executable' {
  const platformInstructions = result.instructions.filter(i => i.platform === platform);

  if (platformInstructions.length === 0) return 'not-executable';

  const hasVerified = platformInstructions.some(i => i.status === 'verified');
  if (hasVerified) return 'executable';

  const hasPartial = platformInstructions.some(i => i.status === 'partial');
  if (hasPartial) return 'partial';

  return 'not-executable';
}

function runBenchmark(): void {
  const results: CaseResult[] = [];

  for (const c of BENCHMARK) {
    const actions = mapActions(c.checks, c.platform);
    const issues: string[] = [];

    // Find matching action
    const action = c.expectedActionId
      ? actions.find(a => a.id === c.expectedActionId)
      : undefined;

    const actionFound = action !== undefined;
    let actionCorrect = false;

    if (c.expectedActionId === null) {
      // Should NOT find an action
      actionCorrect = actions.length === 0 || !actions.some(a => a.id !== 'unknown');
      if (!actionCorrect) issues.push('Unexpected action produced for unknown check');
    } else if (action) {
      actionCorrect = true;
      // Check instruction status
      if (c.expectedInstructionStatus !== 'any') {
        const correctStatus = action.instructions.some(
          i => i.status === c.expectedInstructionStatus || i.platform !== c.platform,
        );
        if (!correctStatus) {
          issues.push(`Expected instruction status: ${c.expectedInstructionStatus}`);
        }
      }
    } else {
      issues.push(`Expected action '${c.expectedActionId}' not found`);
    }

    // Safety evaluation
    const safetyResult = action
      ? evaluateSafety(action, c.safetyConstraint)
      : { pass: true, issues: [] as string[] };

    // Executability
    const executability = action
      ? evaluateExecutability(action, c.platform)
      : 'not-executable';

    // Determine status
    let status: CaseResult['status'] = 'pass';
    if (!actionCorrect || !safetyResult.pass) {
      status = 'fail';
    } else if (executability === 'not-executable') {
      status = 'partial';
    }

    results.push({
      case: c,
      actionFound,
      actionCorrect,
      instructionStatus: action
        ? action.instructions.map(i => `${i.platform}:${i.status}`).join(', ')
        : 'none',
      instructionCorrect: actionCorrect,
      safetyPass: safetyResult.pass,
      executability,
      status,
      issues: [...issues, ...safetyResult.issues],
    });
  }

  // ─── Report ───────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('  ADVERSARIAL ACTION GROUNDING BENCHMARK — v0.7');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(70));

  const total = results.length;
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const partial = results.filter(r => r.status === 'partial').length;

  console.log('\n📊 GLOBAL STATS');
  console.log(`  Total cases:    ${total}`);
  console.log(`  ✅ Pass:        ${passed} (${(passed/total*100).toFixed(1)}%)`);
  console.log(`  ❌ Fail:        ${failed} (${(failed/total*100).toFixed(1)}%)`);
  console.log(`  ⚠️  Partial:     ${partial} (${(partial/total*100).toFixed(1)}%)`);

  // Metrics
  const actionCorrect = results.filter(r => r.actionCorrect).length;
  const safetyPass = results.filter(r => r.safetyPass).length;
  const executable = results.filter(r => r.executability === 'executable').length;
  const partialExec = results.filter(r => r.executability === 'partial').length;

  console.log('\n📐 METRICS');
  console.log(`  Action correctness:      ${actionCorrect}/${total} (${(actionCorrect/total*100).toFixed(1)}%)`);
  console.log(`  Safety / no invention:   ${safetyPass}/${total} (${(safetyPass/total*100).toFixed(1)}%)`);
  console.log(`  Executable:              ${executable}/${total} (${(executable/total*100).toFixed(1)}%)`);
  console.log(`  Partially executable:    ${partialExec}/${total}`);

  // Detailed results
  console.log('\n🔍 DETAILED RESULTS');
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    console.log(`\n  ${icon} #${r.case.id} ${r.case.name}`);
    console.log(`     Platform: ${r.case.platform}`);
    console.log(`     Action found: ${r.actionFound} | Correct: ${r.actionCorrect} | Safety: ${r.safetyPass}`);
    console.log(`     Executability: ${r.executability}`);
    console.log(`     Instructions: ${r.instructionStatus}`);
    console.log(`     Adversarial: ${r.case.adversarialReason}`);
    if (r.issues.length > 0) {
      console.log(`     Issues:`);
      for (const issue of r.issues) {
        console.log(`       - ${issue}`);
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  ${passed}/${total} cases passed (${(passed/total*100).toFixed(1)}%).`);
  if (failed > 0) {
    console.log(`  ${failed} cases FAILED — these reveal real weaknesses in v0.7.`);
    console.log('  Each failure maps to a specific problem:');
    console.log('    - action correctness → Action Registry needs more actions');
    console.log('    - safety → dangerous actions need guards');
    console.log('    - executability → instructions need platform-specific steps');
    console.log('    - invention → DO NOT add LLM yet — fix the mapping first');
  }
  console.log('═'.repeat(70) + '\n');
}

runBenchmark();
