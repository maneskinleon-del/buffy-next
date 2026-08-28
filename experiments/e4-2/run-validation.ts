// E4.2 Mini Validation Script
// 5 fresh cases + 5 stale cases × 3 runs

import { LinuxAdapter } from '../../src/adapters/linux.js';
import { diagnose } from '../../src/core/diagnose.js';

const adapter = new LinuxAdapter();

interface ValidationResult {
  query: string;
  type: 'fresh' | 'stale';
  run: number;
  observations: number;
  refreshRequired: boolean;
  refreshPerformed: boolean;
  staleRelevantSentAsFresh: boolean;
  timestamp: string;
}

const results: ValidationResult[] = [];

const freshQueries = [
  'mi PC está lento',
  'chequea la RAM',
  'CPU usando mucho',
  'temperatura alta',
  'procesos consumiendo recursos',
];

const staleQueries = [
  'disco lleno',
  'GPU driver problema',
  'red lenta',
  'almacenamiento bajo',
  'internet no funciona',
];

async function runValidation() {
  console.log('E4.2 Mini Validation');
  console.log('='.repeat(60));

  // Run fresh cases
  for (const query of freshQueries) {
    for (let run = 1; run <= 3; run++) {
      const response = await diagnose(adapter, query);
      const gating = response.gating;

      const result: ValidationResult = {
        query,
        type: 'fresh',
        run,
        observations: response.observations.length,
        refreshRequired: gating?.instrumentation.some(i => i.refreshRequired) ?? false,
        refreshPerformed: gating?.instrumentation.some(i => i.refreshPerformed) ?? false,
        staleRelevantSentAsFresh: false,
        timestamp: new Date().toISOString(),
      };

      // Check if any stale observation was sent as fresh
      if (gating) {
        for (const instr of gating.instrumentation) {
          if (instr.epistemicStateBefore === 'stale' && instr.includedInContext && !instr.refreshPerformed) {
            result.staleRelevantSentAsFresh = true;
          }
        }
      }

      results.push(result);
    }
  }

  // Run stale cases (with delay to ensure staleness)
  console.log('\nWaiting 5 seconds to ensure staleness...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  for (const query of staleQueries) {
    for (let run = 1; run <= 3; run++) {
      const response = await diagnose(adapter, query);
      const gating = response.gating;

      const result: ValidationResult = {
        query,
        type: 'stale',
        run,
        observations: response.observations.length,
        refreshRequired: gating?.instrumentation.some(i => i.refreshRequired) ?? false,
        refreshPerformed: gating?.instrumentation.some(i => i.refreshPerformed) ?? false,
        staleRelevantSentAsFresh: false,
        timestamp: new Date().toISOString(),
      };

      // Check if any stale observation was sent as fresh
      if (gating) {
        for (const instr of gating.instrumentation) {
          if (instr.epistemicStateBefore === 'stale' && instr.includedInContext && !instr.refreshPerformed) {
            result.staleRelevantSentAsFresh = true;
          }
        }
      }

      results.push(result);
    }
  }

  // Calculate metrics
  const totalRuns = results.length;
  const staleRelevantSentAsFresh = results.filter(r => r.staleRelevantSentAsFresh).length;
  const refreshRequired = results.filter(r => r.refreshRequired).length;
  const refreshPerformed = results.filter(r => r.refreshPerformed).length;
  const refreshSuccessRate = refreshRequired > 0 ? refreshPerformed / refreshRequired : 1;

  console.log('\nResults:');
  console.log('='.repeat(60));
  console.log(`Total runs: ${totalRuns}`);
  console.log(`Stale relevant sent as fresh: ${staleRelevantSentAsFresh}`);
  console.log(`Refresh required: ${refreshRequired}`);
  console.log(`Refresh performed: ${refreshPerformed}`);
  console.log(`Refresh success rate: ${(refreshSuccessRate * 100).toFixed(1)}%`);

  // Verdict
  const pass = staleRelevantSentAsFresh === 0 && refreshSuccessRate >= 0.90;
  console.log('\nVerdict:', pass ? 'PASS ✅' : 'FAIL ❌');

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    metrics: {
      totalRuns,
      staleRelevantSentAsFresh,
      refreshRequired,
      refreshPerformed,
      refreshSuccessRate,
    },
    verdict: pass ? 'PASS' : 'FAIL',
    results,
  };

  const fs = await import('fs');
  fs.writeFileSync(
    'buffy-next/experiments/e4-2/results/validation.json',
    JSON.stringify(output, null, 2),
  );

  console.log('\nResults saved to experiments/e4-2/results/validation.json');
}

runValidation().catch(console.error);
