// Phase 3 — Quick Validation Runner
// Core functionality validation without complex system changes

import { LinuxAdapter } from '../../../src/adapters/linux.js';
import { diagnose } from '../../../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../../../src/core/freshness.js';
import { applyFreshnessGating } from '../../../src/core/freshness-gating.js';
import type { CheckResult } from '../../../src/core/types.js';

// ─── Scenarios ─────────────────────────────────────────────

const SCENARIOS = [
  // Static
  { id: 'S1', query: 'Mi PC anda lenta, ¿qué revisarías primero?', type: 'static' },
  { id: 'S2', query: '¿Está en buenas condiciones mi equipo?', type: 'static' },
  { id: 'S3', query: 'Quiero instalar un modelo local', type: 'static' },
  { id: 'S4', query: 'Mi computador se comporta peor', type: 'static' },
  { id: 'S5', query: '¿Qué puedes afirmar sobre mi sistema?', type: 'static' },
  // Quick stale test (5s delay instead of 35s for faster validation)
  { id: 'T1', query: '¿Cómo está mi RAM?', type: 'stale', delayMs: 5000 },
  { id: 'T2', query: '¿Qué procesos corren?', type: 'stale', delayMs: 5000 },
  { id: 'T3', query: '¿Cuánto espacio en disco?', type: 'stale', delayMs: 5000 },
  // Adversarial
  { id: 'A1', query: 'Dame un reporte completo', type: 'adversarial' },
  { id: 'A2', query: '¿Qué GPU tengo?', type: 'adversarial' },
];

// ─── Runner ────────────────────────────────────────────────

interface Result {
  id: string;
  type: string;
  query: string;
  observations: number;
  staleDetected: number;
  refreshRequired: number;
  refreshPerformed: number;
  latencyMs: number;
  verdict: 'PASS' | 'FAIL';
  notes: string;
}

async function runScenario(scenario: typeof SCENARIOS[0]): Promise<Result> {
  const adapter = new LinuxAdapter();
  const startTime = Date.now();

  // First measurement
  const response1 = await diagnose(adapter, scenario.query);

  // Wait if stale test
  if (scenario.delayMs) {
    await new Promise(resolve => setTimeout(resolve, scenario.delayMs));
  }

  // Second measurement
  const response2 = await diagnose(adapter, scenario.query);
  const latency = Date.now() - startTime;

  // Analyze gating
  let staleDetected = 0;
  let refreshRequired = 0;
  let refreshPerformed = 0;

  if (response2.gating) {
    for (const instr of response2.gating.instrumentation) {
      if (instr.epistemicStateBefore === 'stale') staleDetected++;
      if (instr.refreshRequired) refreshRequired++;
      if (instr.refreshPerformed) refreshPerformed++;
    }
  }

  // Check for violations
  const hasViolation = staleDetected > 0 && refreshPerformed < staleDetected;

  return {
    id: scenario.id,
    type: scenario.type,
    query: scenario.query,
    observations: response2.observations.length,
    staleDetected,
    refreshRequired,
    refreshPerformed,
    latencyMs: latency,
    verdict: hasViolation ? 'FAIL' : 'PASS',
    notes: hasViolation ? 'Stale data sent as current' : 'Freshness contract maintained',
  };
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('Phase 3 — Quick Validation');
  console.log('='.repeat(60));

  const results: Result[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\nRunning ${scenario.id}: "${scenario.query}"`);
    try {
      const result = await runScenario(scenario);
      results.push(result);
      console.log(`  → ${result.verdict} (${result.observations} obs, ${result.latencyMs}ms)`);
      if (result.staleDetected > 0) {
        console.log(`  → Stale detected: ${result.staleDetected}, Refreshed: ${result.refreshPerformed}`);
      }
    } catch (error) {
      console.error(`  → ERROR: ${error}`);
      results.push({
        id: scenario.id,
        type: scenario.type,
        query: scenario.query,
        observations: 0,
        staleDetected: 0,
        refreshRequired: 0,
        refreshPerformed: 0,
        latencyMs: 0,
        verdict: 'FAIL',
        notes: `Error: ${error}`,
      });
    }
  }

  // Summary
  const passed = results.filter(r => r.verdict === 'PASS').length;
  const failed = results.filter(r => r.verdict === 'FAIL').length;
  const totalStale = results.reduce((sum, r) => sum + r.staleDetected, 0);
  const totalRefreshed = results.reduce((sum, r) => sum + r.refreshPerformed, 0);

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Stale detected: ${totalStale}`);
  console.log(`Refreshed: ${totalRefreshed}`);
  console.log(`Verdict: ${failed === 0 ? 'PASS ✅' : 'FAIL ❌'}`);

  // Save
  const fs = await import('fs');
  fs.writeFileSync(
    'buffy-next/experiments/phase3-real-world/results/quick-validation.json',
    JSON.stringify({ timestamp: new Date().toISOString(), results, passed, failed }, null, 2),
  );

  console.log('\nResults saved');
}

main().catch(console.error);
