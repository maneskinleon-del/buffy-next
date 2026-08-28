// MiniMax Production Smoke Test
// Validates Buffy Next with MiniMax without modifying architecture

import { LinuxAdapter } from '../../src/adapters/linux.js';
import { diagnose } from '../../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../../src/core/freshness.js';

// ─── Scenarios ─────────────────────────────────────────────

interface Scenario {
  id: string;
  type: 'factual' | 'dynamic' | 'stale' | 'unknown' | 'open';
  query: string;
  description: string;
  repetitions: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'F1',
    type: 'factual',
    query: '¿Cuánta RAM tengo disponible?',
    description: 'Consulta factual dependiente del sistema',
    repetitions: 3,
  },
  {
    id: 'D1',
    type: 'dynamic',
    query: '¿Cómo está mi CPU ahora?',
    description: 'Estado dinámico del sistema',
    repetitions: 3,
  },
  {
    id: 'S1',
    type: 'stale',
    query: '¿Qué procesos están corriendo?',
    description: 'Contexto stale detectado',
    repetitions: 3,
  },
  {
    id: 'U1',
    type: 'unknown',
    query: '¿Qué temperatura tiene mi GPU?',
    description: 'Campo puede no estar disponible',
    repetitions: 3,
  },
  {
    id: 'O1',
    type: 'open',
    query: 'Mi PC anda lenta, ¿qué revisarías primero?',
    description: 'Consulta abierta',
    repetitions: 3,
  },
];

// ─── Runner ────────────────────────────────────────────────

interface Result {
  scenarioId: string;
  type: string;
  query: string;
  run: number;
  observations: number;
  staleDetected: number;
  refreshRequired: number;
  refreshPerformed: number;
  latencyMs: number;
  contextBytes: number;
  auditComplete: boolean;
  verdict: 'PASS' | 'FAIL';
  notes: string;
}

async function runScenario(scenario: Scenario): Promise<Result[]> {
  const results: Result[] = [];
  const adapter = new LinuxAdapter();

  for (let run = 1; run <= scenario.repetitions; run++) {
    const startTime = Date.now();

    try {
      const response = await diagnose(adapter, scenario.query);
      const latency = Date.now() - startTime;

      // Analyze gating
      let staleDetected = 0;
      let refreshRequired = 0;
      let refreshPerformed = 0;

      if (response.gating) {
        for (const instr of response.gating.instrumentation) {
          if (instr.epistemicStateBefore === 'stale') staleDetected++;
          if (instr.refreshRequired) refreshRequired++;
          if (instr.refreshPerformed) refreshPerformed++;
        }
      }

      // Check for violations
      const hasViolation = staleDetected > 0 && refreshPerformed < staleDetected;

      // Check audit completeness
      const auditComplete = !!(
        response.audit &&
        response.audit.query &&
        Array.isArray(response.audit.selectedFields) &&
        Array.isArray(response.audit.staleFields) &&
        typeof response.audit.contextBytes === 'number' &&
        typeof response.audit.latencyMs === 'number'
      );

      results.push({
        scenarioId: scenario.id,
        type: scenario.type,
        query: scenario.query,
        run,
        observations: response.observations.length,
        staleDetected,
        refreshRequired,
        refreshPerformed,
        latencyMs: latency,
        contextBytes: response.audit?.contextBytes ?? 0,
        auditComplete,
        verdict: hasViolation ? 'FAIL' : 'PASS',
        notes: hasViolation ? 'Stale data sent as current' : 'Freshness contract maintained',
      });
    } catch (error) {
      results.push({
        scenarioId: scenario.id,
        type: scenario.type,
        query: scenario.query,
        run,
        observations: 0,
        staleDetected: 0,
        refreshRequired: 0,
        refreshPerformed: 0,
        latencyMs: Date.now() - startTime,
        contextBytes: 0,
        auditComplete: false,
        verdict: 'FAIL',
        notes: `Error: ${error}`,
      });
    }
  }

  return results;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('MiniMax Production Smoke Test');
  console.log('='.repeat(60));

  const allResults: Result[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\nRunning ${scenario.id}: "${scenario.query}"`);
    const results = await runScenario(scenario);
    allResults.push(...results);

    const passed = results.filter(r => r.verdict === 'PASS').length;
    console.log(`  → ${passed}/${results.length} passed`);
  }

  // Summary
  const totalRuns = allResults.length;
  const passed = allResults.filter(r => r.verdict === 'PASS').length;
  const failed = allResults.filter(r => r.verdict === 'FAIL').length;
  const staleViolations = allResults.filter(r => r.verdict === 'FAIL' && r.notes.includes('Stale')).length;
  const totalRefreshRequired = allResults.reduce((sum, r) => sum + r.refreshRequired, 0);
  const totalRefreshPerformed = allResults.reduce((sum, r) => sum + r.refreshPerformed, 0);
  const refreshSuccessRate = totalRefreshRequired > 0 ? totalRefreshPerformed / totalRefreshRequired : 1;
  const averageLatency = allResults.reduce((sum, r) => sum + r.latencyMs, 0) / totalRuns;
  const auditComplete = allResults.every(r => r.auditComplete);

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total runs: ${totalRuns}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Stale violations: ${staleViolations}`);
  console.log(`Refresh success rate: ${(refreshSuccessRate * 100).toFixed(1)}%`);
  console.log(`Average latency: ${averageLatency.toFixed(0)}ms`);
  console.log(`Audit complete: ${auditComplete}`);

  // Verdict
  const verdict = staleViolations === 0 && refreshSuccessRate >= 0.95 && auditComplete
    ? 'PASS ✅'
    : 'FAIL ❌';

  console.log(`\nVERDICT: ${verdict}`);

  // Save results
  const fs = await import('fs');
  fs.writeFileSync(
    'buffy-next/experiments/minimax-smoke/results/smoke.json',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      totalRuns,
      passed,
      failed,
      staleViolations,
      refreshSuccessRate,
      averageLatency,
      auditComplete,
      verdict: staleViolations === 0 && refreshSuccessRate >= 0.95 ? 'PASS' : 'FAIL',
      results: allResults,
    }, null, 2),
  );

  console.log('\nResults saved to experiments/minimax-smoke/results/smoke.json');
}

main().catch(console.error);
