// Operational Pilot — Real queries with telemetry
// 20-50 natural, varied queries

import { LinuxAdapter } from '../../src/adapters/linux.js';
import { diagnose } from '../../src/core/diagnose.js';
import {
  recordRequestMetrics,
  buildRequestMetrics,
  recordFreshnessTelemetry,
  buildFreshnessTelemetry,
  recordError,
  getRequestMetrics,
  analyzeFreshnessPatterns,
  getErrorRecords,
} from '../../src/core/telemetry.js';

// ─── Natural queries ───────────────────────────────────────

const QUERIES = [
  // Factual
  '¿Cuánta RAM tengo disponible?',
  '¿Qué CPU tengo?',
  '¿Cuánto espacio queda en disco?',
  '¿Qué GPU tengo instalada?',
  '¿Cuántos cores tiene mi procesador?',
  // Dynamic
  '¿Cómo está mi sistema ahora?',
  '¿Hay procesos consumiendo mucho CPU?',
  '¿Cómo está la temperatura?',
  '¿Qué pasa con mi memoria?',
  '¿Está funcionando bien mi equipo?',
  // Performance
  'Mi PC anda lenta',
  '¿Por qué se traba mi computador?',
  '¿Qué puedo hacer para mejorar el rendimiento?',
  '¿Necesito reiniciar mi PC?',
  '¿Hay algún problema con mi hardware?',
  // Hardware
  'Quiero instalar un modelo de IA local',
  '¿Puedo jugar juegos en mi PC?',
  '¿Mi GPU sirve para Deep Learning?',
  '¿Tengo suficiente RAM para virtualización?',
  '¿Mi disco es rápido suficiente?',
  // Diagnostics
  'Mi computador empezó a comportarse raro',
  '¿Por qué se calienta tanto mi PC?',
  '¿Hay algún virus en mi sistema?',
  '¿Por qué internet va lento?',
  '¿Qué necesita mi sistema para funcionar mejor?',
  // Mixed
  'Dame un resumen completo del estado de mi sistema',
  '¿Qué puedes afirmar con certeza sobre mi hardware?',
  '¿Está en buenas condiciones mi equipo?',
  '¿Qué información necesitas para diagnosticar?',
  '¿Qué revisarías primero si mi PC falla?',
];

// ─── Runner ────────────────────────────────────────────────

interface PilotResult {
  query: string;
  run: number;
  observations: number;
  staleDetected: number;
  refreshRequired: number;
  refreshPerformed: number;
  latencyMs: number;
  contextBytes: number;
  error: string | null;
  verdict: 'PASS' | 'FAIL';
}

async function runQuery(query: string, run: number): Promise<PilotResult> {
  const adapter = new LinuxAdapter();
  const startTime = Date.now();

  try {
    const response = await diagnose(adapter, query);
    const latency = Date.now() - startTime;

    // Record metrics
    if (response.audit) {
      const metrics = buildRequestMetrics(
        query,
        response.selection,
        response.gating ?? { included: [], refreshed: [], omittedStale: [], needsRefresh: [], instrumentation: [] },
        response.observations,
        response.audit,
        latency,
      );
      recordRequestMetrics(metrics);
    }

    // Record freshness telemetry
    if (response.gating) {
      const telemetry = buildFreshnessTelemetry(response.gating);
      for (const t of telemetry) {
        recordFreshnessTelemetry(t);
      }
    }

    // Analyze
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

    const hasViolation = staleDetected > 0 && refreshPerformed < staleDetected;

    return {
      query,
      run,
      observations: response.observations.length,
      staleDetected,
      refreshRequired,
      refreshPerformed,
      latencyMs: latency,
      contextBytes: response.audit?.contextBytes ?? 0,
      error: null,
      verdict: hasViolation ? 'FAIL' : 'PASS',
    };
  } catch (error) {
    const latency = Date.now() - startTime;

    // Record error
    recordError({
      timestamp: new Date().toISOString(),
      category: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : String(error),
      query,
      platform: 'linux',
      model: 'unknown',
      input: query,
      expected: 'valid response',
      actual: error,
      trace: error instanceof Error ? error.stack ?? '' : '',
    });

    return {
      query,
      run,
      observations: 0,
      staleDetected: 0,
      refreshRequired: 0,
      refreshPerformed: 0,
      latencyMs: latency,
      contextBytes: 0,
      error: error instanceof Error ? error.message : String(error),
      verdict: 'FAIL',
    };
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('Operational Pilot — Real Queries');
  console.log('='.repeat(60));

  const results: PilotResult[] = [];
  const totalRuns = 25; // 25 natural queries

  for (let i = 0; i < totalRuns; i++) {
    const query = QUERIES[i % QUERIES.length];
    console.log(`\n[${i + 1}/${totalRuns}] "${query}"`);

    const result = await runQuery(query, 1);
    results.push(result);

    console.log(`  → ${result.verdict} (${result.observations} obs, ${result.latencyMs}ms)`);
    if (result.error) {
      console.log(`  → Error: ${result.error}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.verdict === 'PASS').length;
  const failed = results.filter(r => r.verdict === 'FAIL').length;
  const totalStale = results.reduce((sum, r) => sum + r.staleDetected, 0);
  const totalRefresh = results.reduce((sum, r) => sum + r.refreshRequired, 0);
  const totalRefreshSuccess = results.reduce((sum, r) => sum + r.refreshPerformed, 0);
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log('\n' + '='.repeat(60));
  console.log('PILOT RESULTS');
  console.log('='.repeat(60));
  console.log(`Total queries: ${totalRuns}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Stale detected: ${totalStale}`);
  console.log(`Refresh required: ${totalRefresh}`);
  console.log(`Refresh success: ${totalRefreshSuccess}`);
  console.log(`Refresh rate: ${totalRefresh > 0 ? ((totalRefreshSuccess / totalRefresh) * 100).toFixed(1) : 'N/A'}%`);
  console.log(`Avg latency: ${avgLatency.toFixed(0)}ms`);
  console.log(`P50 latency: ${p50}ms`);
  console.log(`P95 latency: ${p95}ms`);

  const patterns = analyzeFreshnessPatterns();
  console.log(`\nFreshness patterns:`);
  console.log(`  Stale rate: ${(patterns.staleRate * 100).toFixed(1)}%`);
  if (patterns.mostStaleFields.length > 0) {
    console.log(`  Most stale: ${patterns.mostStaleFields[0].field} (${patterns.mostStaleFields[0].count})`);
  }

  const errors = getErrorRecords();
  console.log(`\nErrors: ${errors.length}`);
  if (errors.length > 0) {
    const byCategory = errors.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }
  }

  // Verdict
  const verdict = failed === 0 ? 'PASS ✅' : 'FAIL ❌';
  console.log(`\nVERDICT: ${verdict}`);

  // Save results
  const fs = await import('fs');
  fs.writeFileSync(
    'buffy-next/experiments/operational-pilot/results/pilot.json',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      totalQueries: totalRuns,
      passed,
      failed,
      staleDetected: totalStale,
      refreshRate: totalRefresh > 0 ? totalRefreshSuccess / totalRefresh : 1,
      avgLatency,
      p50,
      p95,
      patterns,
      errors: errors.length,
      verdict: failed === 0 ? 'PASS' : 'FAIL',
      results,
    }, null, 2),
  );

  console.log('\nResults saved to experiments/operational-pilot/results/pilot.json');
}

main().catch(console.error);
