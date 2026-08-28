// Phase 3 — Real-World Operational Validation Runner
// Executes all scenarios and generates results

import { LinuxAdapter } from '../../../src/adapters/linux.js';
import { diagnose } from '../../../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../../../src/core/freshness.js';
import { STATIC_SCENARIOS } from '../scenarios/static.js';
import { DYNAMIC_SCENARIOS } from '../scenarios/dynamic.js';
import { STALE_SCENARIOS } from '../scenarios/stale.js';
import { ADVERSARIAL_SCENARIOS } from '../scenarios/adversarial.js';
import type { Scenario, GroundTruth } from '../scenarios/static.js';
import type { CheckResult } from '../../../src/core/types.js';

// ─── Types ─────────────────────────────────────────────────

interface AuditLog {
  query: string;
  selectedFields: string[];
  staleFields: string[];
  refreshRequired: string[];
  refreshPerformed: string[];
  toolCalls: number;
  contextBytes: number;
  latencyMs: number;
  finalCorrect: boolean;
  unsupportedClaims: number;
}

interface ValidationResult {
  scenarioId: string;
  type: string;
  query: string;
  auditLog: AuditLog;
  groundTruth: GroundTruth;
  observations: CheckResult[];
  gatingInstrumentation: any[];
  verdict: 'PASS' | 'FAIL';
  notes: string;
}

// ─── Metrics ───────────────────────────────────────────────

interface Metrics {
  totalScenarios: number;
  passed: number;
  failed: number;
  staleViolations: number;
  refreshSuccessRate: number;
  freshnessDecisionAccuracy: number;
  unsupportedClaimRate: number;
  averageLatencyMs: number;
  totalContextBytes: number;
}

// ─── Runner ────────────────────────────────────────────────

async function runScenario(scenario: Scenario): Promise<ValidationResult> {
  const adapter = new LinuxAdapter();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${scenario.id} — ${scenario.description}`);
  console.log(`Query: "${scenario.query}"`);
  console.log(`${'='.repeat(60)}`);

  // Setup
  if (scenario.setup) {
    await scenario.setup();
  }

  // Initial measurement
  console.log('  → Taking initial measurement...');
  const startTime = Date.now();
  const initialResponse = await diagnose(adapter, scenario.query);
  const initialTime = Date.now() - startTime;

  console.log(`  → Initial observations: ${initialResponse.observations.length}`);
  console.log(`  → Latency: ${initialTime}ms`);

  // Apply change
  if (scenario.change) {
    console.log('  → Applying system change...');
    await scenario.change();
    console.log('  → Change applied');
  }

  // Second measurement (after change/staleness)
  console.log('  → Taking second measurement...');
  const secondStartTime = Date.now();
  const secondResponse = await diagnose(adapter, scenario.query);
  const secondTime = Date.now() - secondStartTime;

  console.log(`  → Second observations: ${secondResponse.observations.length}`);
  console.log(`  → Latency: ${secondTime}ms`);

  // Get ground truth
  const groundTruth = await scenario.groundTruth();

  // Analyze freshness
  const staleFields: string[] = [];
  const refreshRequired: string[] = [];
  const refreshPerformed: string[] = [];

  if (secondResponse.gating) {
    for (const instr of secondResponse.gating.instrumentation) {
      if (instr.epistemicStateBefore === 'stale') {
        staleFields.push(instr.field);
      }
      if (instr.refreshRequired) {
        refreshRequired.push(instr.field);
      }
      if (instr.refreshPerformed) {
        refreshPerformed.push(instr.field);
      }
    }
  }

  // Check for stale violations
  let staleViolation = false;
  for (const obs of secondResponse.observations) {
    if (obs.observedAt) {
      // Map observation category to freshness category
      const categoryMap: Record<string, string> = {
        'CPU': 'cpu',
        'RAM': 'memory',
        'GPU': 'gpu',
        'Temperatura': 'temperature',
        'Procesos': 'processes',
        'Almacenamiento': 'storage',
        'Red': 'network',
      };
      const category = categoryMap[obs.category] ?? obs.category.toLowerCase();
      try {
        const state = classifyEpistemicState(obs.observedAt, category as any);
        if (state === 'stale') {
          // Check if this was a relevant field that wasn't refreshed
          if (scenario.expectedFields.some(f => obs.id.includes(f))) {
            staleViolation = true;
          }
        }
      } catch {
        // Category not in policy — skip
      }
    }
  }

  // Build audit log
  const auditLog: AuditLog = {
    query: scenario.query,
    selectedFields: initialResponse.selection.checks,
    staleFields,
    refreshRequired,
    refreshPerformed,
    toolCalls: 0,
    contextBytes: JSON.stringify(secondResponse).length,
    latencyMs: secondTime,
    finalCorrect: !staleViolation,
    unsupportedClaims: staleViolation ? 1 : 0,
  };

  const result: ValidationResult = {
    scenarioId: scenario.id,
    type: scenario.type,
    query: scenario.query,
    auditLog,
    groundTruth,
    observations: secondResponse.observations,
    gatingInstrumentation: secondResponse.gating?.instrumentation ?? [],
    verdict: staleViolation ? 'FAIL' : 'PASS',
    notes: staleViolation
      ? 'Stale relevant data was sent as current'
      : 'Freshness contract maintained',
  };

  console.log(`  → Verdict: ${result.verdict}`);
  if (staleViolation) {
    console.log('  → ⚠️ STALE VIOLATION: Relevant stale data sent as current');
  }

  return result;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('Phase 3 — Real-World Operational Validation');
  console.log('='.repeat(60));

  const allScenarios = [
    ...STATIC_SCENARIOS,
    ...DYNAMIC_SCENARIOS,
    ...STALE_SCENARIOS,
    ...ADVERSARIAL_SCENARIOS,
  ];

  console.log(`\nTotal scenarios: ${allScenarios.length}`);
  console.log(`  Static: ${STATIC_SCENARIOS.length}`);
  console.log(`  Dynamic: ${DYNAMIC_SCENARIOS.length}`);
  console.log(`  Stale: ${STALE_SCENARIOS.length}`);
  console.log(`  Adversarial: ${ADVERSARIAL_SCENARIOS.length}`);

  const results: ValidationResult[] = [];

  for (const scenario of allScenarios) {
    try {
      const result = await runScenario(scenario);
      results.push(result);
    } catch (error) {
      console.error(`  ❌ Error running ${scenario.id}:`, error);
      results.push({
        scenarioId: scenario.id,
        type: scenario.type,
        query: scenario.query,
        auditLog: {
          query: scenario.query,
          selectedFields: [],
          staleFields: [],
          refreshRequired: [],
          refreshPerformed: [],
          toolCalls: 0,
          contextBytes: 0,
          latencyMs: 0,
          finalCorrect: false,
          unsupportedClaims: 1,
        },
        groundTruth: {
          actualState: {},
          timestamp: new Date().toISOString(),
          expectedCorrect: false,
          notes: 'Scenario failed to execute',
        },
        observations: [],
        gatingInstrumentation: [],
        verdict: 'FAIL',
        notes: `Error: ${error}`,
      });
    }
  }

  // Calculate metrics
  const metrics: Metrics = {
    totalScenarios: results.length,
    passed: results.filter(r => r.verdict === 'PASS').length,
    failed: results.filter(r => r.verdict === 'FAIL').length,
    staleViolations: results.filter(r => r.verdict === 'FAIL').length,
    refreshSuccessRate: 0,
    freshnessDecisionAccuracy: 0,
    unsupportedClaimRate: 0,
    averageLatencyMs: 0,
    totalContextBytes: 0,
  };

  // Calculate rates
  const totalRefreshRequired = results.reduce(
    (sum, r) => sum + r.auditLog.refreshRequired.length, 0,
  );
  const totalRefreshPerformed = results.reduce(
    (sum, r) => sum + r.auditLog.refreshPerformed.length, 0,
  );
  metrics.refreshSuccessRate = totalRefreshRequired > 0
    ? totalRefreshPerformed / totalRefreshRequired
    : 1;

  const totalUnsupportedClaims = results.reduce(
    (sum, r) => sum + r.auditLog.unsupportedClaims, 0,
  );
  metrics.unsupportedClaimRate = totalUnsupportedClaims / results.length;

  metrics.averageLatencyMs = results.reduce(
    (sum, r) => sum + r.auditLog.latencyMs, 0,
  ) / results.length;

  metrics.totalContextBytes = results.reduce(
    (sum, r) => sum + r.auditLog.contextBytes, 0,
  );

  // Determine verdict
  let verdict: 'PASS' | 'PARTIAL' | 'FAIL' = 'PASS';

  if (metrics.staleViolations > 0) {
    verdict = 'FAIL';
  } else if (metrics.refreshSuccessRate < 0.95 ||
             metrics.freshnessDecisionAccuracy < 0.90 ||
             metrics.unsupportedClaimRate > 0.05) {
    verdict = 'PARTIAL';
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total scenarios: ${metrics.totalScenarios}`);
  console.log(`Passed: ${metrics.passed}`);
  console.log(`Failed: ${metrics.failed}`);
  console.log(`Stale violations: ${metrics.staleViolations}`);
  console.log(`Refresh success rate: ${(metrics.refreshSuccessRate * 100).toFixed(1)}%`);
  console.log(`Unsupported claim rate: ${(metrics.unsupportedClaimRate * 100).toFixed(1)}%`);
  console.log(`Average latency: ${metrics.averageLatencyMs.toFixed(0)}ms`);
  console.log(`Total context bytes: ${metrics.totalContextBytes}`);
  console.log(`\nVERDICT: ${verdict}`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    metrics,
    verdict,
    results,
  };

  const fs = await import('fs');
  fs.writeFileSync(
    'buffy-next/experiments/phase3-real-world/results/validation.json',
    JSON.stringify(output, null, 2),
  );

  console.log('\nResults saved to experiments/phase3-real-world/results/validation.json');
}

main().catch(console.error);
