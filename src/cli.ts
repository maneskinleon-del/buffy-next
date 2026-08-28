// Buffy Next — CLI Entry Point (v2.5 — Operational Pilot)
// Dispatches commands to the appropriate modules.
// Uses ActionGate for all action execution.

import { createAdapter } from './adapters/index.js';
import { runDoctor } from './core/doctor.js';
import { diagnose } from './core/diagnose.js';
import { buildContext } from './core/context.js';
import { findActionById } from './actions/registry.js';
import { executeWithGates } from './core/pipeline.js';
import {
  renderGreeting,
  renderDoctorReport,
  renderDiagnosticResponse,
  renderCapabilities,
  toJSON,
} from './core/presenter.js';
import { loadState, updateState, ensureBuffyDir } from './state/store.js';
import {
  recordRequestMetrics,
  buildRequestMetrics,
  getHealthStatus,
  getRequestMetrics,
  analyzeFreshnessPatterns,
  getAveragePerformanceBaseline,
  getErrorRecords,
} from './core/telemetry.js';

const args = process.argv.slice(2);
const command = args[0] || '';
const jsonMode = args.includes('--json');
const contextMode = args.includes('--context');
const pilotMode = args.includes('--pilot');

async function main() {
  // Mutual exclusion: --json and --context cannot coexist
  if (jsonMode && contextMode) {
    console.error('Error: --json y --context son mutuamente excluyentes.');
    console.error('Usa --json para DoctorReport o --context para BuffyContext.');
    process.exit(1);
  }

  ensureBuffyDir();

  try {
    const adapter = await createAdapter();

    switch (command) {
      case '':
        await cmdGreeting(adapter);
        break;
      case 'doctor':
        await cmdDoctor(adapter);
        break;
      case 'capabilities':
        await cmdCapabilities(adapter);
        break;
      case 'diagnose':
        await cmdDiagnose(adapter, args.slice(1).join(' '));
        break;
      case 'act':
        await cmdAct(adapter, args[1], args[2]);
        break;
      case 'setup':
        await cmdSetup(adapter);
        break;
      case 'health':
        await cmdHealth(adapter);
        break;
      case 'metrics':
        await cmdMetrics();
        break;
      case '--help':
      case '-h':
        showHelp();
        break;
      default:
        console.error(`Comando desconocido: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// ─── Commands ───────────────────────────────────────────────

async function cmdGreeting(adapter: Awaited<ReturnType<typeof createAdapter>>) {
  const report = await runDoctor(adapter);
  updateState({
    lastScan: report.timestamp,
    platform: report.platform.name,
    system: { gpu: { name: report.system.gpu.name, driver: report.system.gpu.driver, isGeneric: report.system.gpu.isGeneric } },
  });

  if (jsonMode) {
    console.log(toJSON(report));
  } else {
    console.log(renderGreeting(report));
  }
}

async function cmdDoctor(adapter: Awaited<ReturnType<typeof createAdapter>>) {
  const report = await runDoctor(adapter);
  updateState({ lastScan: report.timestamp });

  if (contextMode) {
    const context = buildContext(report);
    console.log(toJSON(context));
  } else if (jsonMode) {
    console.log(toJSON(report));
  } else {
    console.log(renderDoctorReport(report));
  }
}

async function cmdCapabilities(adapter: Awaited<ReturnType<typeof createAdapter>>) {
  const caps = await adapter.capabilities();

  if (jsonMode) {
    console.log(toJSON(caps));
  } else {
    console.log(renderCapabilities(caps));
  }
}

async function cmdDiagnose(adapter: Awaited<ReturnType<typeof createAdapter>>, query: string) {
  if (!query) {
    console.error('Uso: buffy diagnose "tu problema"');
    process.exit(1);
  }

  // SECURITY: diagnose = observe + recommend. NEVER executes actions.
  const startTime = Date.now();
  const response = await diagnose(adapter, query);
  const totalLatency = Date.now() - startTime;

  // Pilot mode: record metrics
  if (pilotMode && response.audit) {
    const metrics = buildRequestMetrics(
      query,
      response.selection,
      response.gating ?? { included: [], refreshed: [], omittedStale: [], needsRefresh: [], instrumentation: [] },
      response.observations,
      response.audit,
      totalLatency,
    );
    recordRequestMetrics(metrics);
  }

  if (jsonMode) {
    console.log(toJSON(response));
    return;
  }

  console.log(renderDiagnosticResponse(response));

  // Pilot mode: show audit summary
  if (pilotMode && response.audit) {
    console.log('\n📊 Pilot Audit:');
    console.log(`  Fields: ${response.audit.selectedFields.join(', ')}`);
    console.log(`  Stale: ${response.audit.staleFields.length > 0 ? response.audit.staleFields.join(', ') : 'none'}`);
    console.log(`  Refresh: ${response.audit.refreshPerformed.length > 0 ? response.audit.refreshPerformed.join(', ') : 'none'}`);
    console.log(`  Latency: ${response.audit.latencyMs}ms`);
    console.log(`  Context: ${response.audit.contextBytes} bytes`);
  }
}

async function cmdAct(adapter: Awaited<ReturnType<typeof createAdapter>>, actionId: string | undefined, rawParams?: string) {
  if (!actionId) {
    console.error('Uso: buffy act <action-id> [args]');
    console.error('Ejemplo: buffy act install-tool node');
    process.exit(1);
  }

  const action = findActionById(actionId);
  if (!action) {
    console.error(`Acción no encontrada: ${actionId}`);
    console.error('Usa: buffy capabilities para ver acciones disponibles');
    process.exit(1);
  }

  // Pass rawParams through the pipeline — no setInstallTarget, no global state
  await executeWithGates({ adapter, action, rawParams, jsonMode, promptUser });
}

async function cmdSetup(adapter: Awaited<ReturnType<typeof createAdapter>>) {
  const platform = await adapter.detect();

  if (jsonMode) {
    console.log(toJSON({ platform, status: 'ok' }));
    return;
  }

  console.log('\n🔍 Verificando Buffy...\n');
  console.log(`  ✅ Plataforma: ${platform.os} (${platform.arch})`);
  console.log(`  ✅ Buffy funciona correctamente`);
  console.log(`  ✅ Directorio ~/.buffy/ listo`);

  const state = loadState();
  console.log(`  ✅ Estado inicial guardado`);
  console.log('\nUsa: buffy doctor para ver el estado de tu sistema.\n');
}

// ─── Helpers ────────────────────────────────────────────────

async function cmdHealth(adapter: Awaited<ReturnType<typeof createAdapter>>) {
  const platform = await adapter.detect();
  const health = getHealthStatus(platform.name, adapter.name);

  if (jsonMode) {
    console.log(toJSON(health));
    return;
  }

  console.log('\n🏥 Buffy Health Status\n');
  console.log(`  Platform: ${health.platform}`);
  console.log(`  Adapter: ${health.adapter}`);
  console.log(`  Version: ${health.version}`);
  console.log('\n  Subsystems:');
  console.log(`    Observation: ${health.subsystems.observation === 'ok' ? '✅' : '❌'}`);
  console.log(`    Freshness: ${health.subsystems.freshness === 'ok' ? '✅' : '❌'}`);
  console.log(`    Actions: ${health.subsystems.actions === 'ok' ? '✅' : '❌'}`);
  console.log(`    State: ${health.subsystems.state === 'ok' ? '✅' : '❌'}`);
  console.log('\n  Metrics:');
  console.log(`    Total requests: ${health.metrics.totalRequests}`);
  console.log(`    Total errors: ${health.metrics.totalErrors}`);
  console.log(`    Stale rate: ${(health.metrics.staleRate * 100).toFixed(1)}%`);
  console.log(`    Avg latency: ${health.metrics.averageLatencyMs.toFixed(0)}ms`);

  // Exit with non-zero code if critical condition
  const hasCritical = health.subsystems.observation === 'error' ||
    health.subsystems.freshness === 'error';
  if (hasCritical) {
    process.exit(1);
  }
}

async function cmdMetrics() {
  const metrics = getRequestMetrics();
  const patterns = analyzeFreshnessPatterns();
  const baseline = getAveragePerformanceBaseline();
  const errors = getErrorRecords();

  if (jsonMode) {
    console.log(toJSON({
      totalRequests: metrics.length,
      patterns,
      baseline,
      errors: errors.length,
      errorsByCategory: errors.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    }));
    return;
  }

  console.log('\n📊 Buffy Metrics\n');
  console.log(`  Total requests: ${metrics.length}`);

  if (metrics.length > 0) {
    // Calculate percentiles
    const latencies = metrics.map(m => m.totalLatencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`  Avg latency: ${avgLatency.toFixed(0)}ms`);
    console.log(`  P50 latency: ${p50.toFixed(0)}ms`);
    console.log(`  P95 latency: ${p95.toFixed(0)}ms`);

    const avgContextBytes = metrics.reduce((a, m) => a + m.contextBytes, 0) / metrics.length;
    console.log(`  Avg context bytes: ${avgContextBytes.toFixed(0)}`);

    const totalStale = metrics.reduce((a, m) => a + m.staleFields.length, 0);
    const totalRefresh = metrics.reduce((a, m) => a + m.refreshRequested.length, 0);
    const totalRefreshSuccess = metrics.reduce((a, m) => a + m.refreshSuccess.length, 0);

    console.log(`  Stale fields detected: ${totalStale}`);
    console.log(`  Refresh requested: ${totalRefresh}`);
    console.log(`  Refresh success: ${totalRefreshSuccess}`);
    console.log(`  Refresh rate: ${totalRefresh > 0 ? ((totalRefreshSuccess / totalRefresh) * 100).toFixed(1) : 'N/A'}%`);
  }

  console.log('\n  Freshness patterns:');
  console.log(`    Stale rate: ${(patterns.staleRate * 100).toFixed(1)}%`);
  if (patterns.mostStaleFields.length > 0) {
    console.log(`    Most stale: ${patterns.mostStaleFields[0].field} (${patterns.mostStaleFields[0].count})`);
  }
  if (patterns.mostRefreshedFields.length > 0) {
    console.log(`    Most refreshed: ${patterns.mostRefreshedFields[0].field} (${patterns.mostRefreshedFields[0].count})`);
  }

  console.log(`\n  Errors: ${errors.length}`);
  if (errors.length > 0) {
    const byCategory = errors.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`    ${cat}: ${count}`);
    }
  }
}

function showHelp() {
  console.log(`
Buffy — Asistente técnico de diagnóstico

Uso:
  buffy                          Presentación + doctor rápido
  buffy doctor                   Auditoría completa del sistema
  buffy doctor --context         Contexto del sistema para agentes externos (JSON)
  buffy capabilities             Qué puede hacer Buffy
  buffy diagnose "tu problema"   Diagnóstico dirigido
  buffy diagnose "query" --pilot Modo piloto con telemetry
  buffy act <action-id> [args]    Ejecutar una acción
    ej: buffy act install-tool node
  buffy setup                    Bootstrap de Buffy
  buffy health                   Estado de salud del sistema
  buffy metrics                  Métricas agregadas
  --json                         Salida en formato JSON
  --pilot                        Activar modo piloto (telemetry)
  --help                         Esta ayuda
`);
}

function promptUser(): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write('> ');
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

main();
