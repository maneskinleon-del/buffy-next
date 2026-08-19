#!/usr/bin/env node

// Buffy Next — CLI Entry Point
// Dispatches commands to the appropriate modules

import { createAdapter } from './adapters/index.js';
import { runDoctor } from './core/doctor.js';
import { diagnose } from './core/diagnose.js';
import { findActionById } from './actions/registry.js';
import { buildExecutionPlan, executeAction } from './core/executor.js';
import { requiresAuth, isForbidden } from './core/security.js';
import {
  renderGreeting,
  renderDoctorReport,
  renderDiagnosticReport,
  renderProposal,
  renderActionResult,
  renderCapabilities,
  toJSON,
} from './core/presenter.js';
import { loadState, updateState, ensureBuffyDir } from './state/store.js';

const args = process.argv.slice(2);
const command = args[0] || '';
const jsonMode = args.includes('--json');

async function main() {
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
        await cmdAct(adapter, args[1]);
        break;
      case 'setup':
        await cmdSetup(adapter);
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

  if (jsonMode) {
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

  const result = await diagnose(adapter, query);

  if (jsonMode) {
    console.log(toJSON(result));
    return;
  }

  console.log(renderDiagnosticReport(result.items));

  for (const action of result.suggestedActions) {
    const dryRunResult = action.dryRun ? await action.dryRun() : undefined;
    console.log(renderProposal({
      name: action.name,
      description: action.description,
      level: action.level,
      reversible: action.reversible,
      dryRun: dryRunResult,
    }));

    if (requiresAuth(action)) {
      const answer = await promptUser();
      if (answer.toLowerCase() === 'sí' || answer.toLowerCase() === 'si' || answer.toLowerCase() === 'y') {
        const result = await executeAction(action);
        console.log(renderActionResult(result));
      } else {
        console.log('Acción cancelada.');
      }
    }
  }
}

async function cmdAct(adapter: Awaited<ReturnType<typeof createAdapter>>, actionId: string | undefined) {
  if (!actionId) {
    console.error('Uso: buffy act <action-id>');
    process.exit(1);
  }

  const action = findActionById(actionId);
  if (!action) {
    console.error(`Acción no encontrada: ${actionId}`);
    console.error('Usa: buffy capabilities para ver acciones disponibles');
    process.exit(1);
  }

  if (isForbidden(action)) {
    console.error(`Acción prohibida: ${action.name}`);
    process.exit(1);
  }

  // P0-1: Validate prerequisites against adapter capabilities
  const capabilities = await adapter.capabilities();
  const plan = await buildExecutionPlan(action, adapter.name, capabilities);

  if (!plan.prerequisitesValid) {
    console.error(`Faltan dependencias: ${plan.missingPrerequisites.join(', ')}`);
    console.error('Instálalas antes de ejecutar esta acción.');
    process.exit(1);
  }

  if (!plan.platformValid) {
    console.error('Acción no disponible en esta plataforma');
    process.exit(1);
  }

  if (jsonMode) {
    console.log(toJSON(plan));
    return;
  }

  if (plan.dryRunResult) {
    console.log(`\n📋 ${action.name}`);
    console.log(`   ${action.description}`);
    console.log(`   Acción: ${plan.dryRunResult}`);
    console.log('');
  }

  // Revalidate auth per spec v2.1
  if (requiresAuth(action)) {
    const answer = await promptUser();
    if (answer.toLowerCase() !== 'sí' && answer.toLowerCase() !== 'si' && answer.toLowerCase() !== 'y') {
      console.log('Acción cancelada.');
      return;
    }
  }

  const result = await executeAction(action);
  console.log(renderActionResult(result));

  // P0-3: Register action in state.json
  updateState({
    actionHistory: [
      ...loadState().actionHistory,
      { actionId: action.id, timestamp: new Date().toISOString(), success: result.success, message: result.message },
    ].slice(-50), // Keep last 50
  });
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

function showHelp() {
  console.log(`
Buffy — Asistente técnico de diagnóstico

Uso:
  buffy                          Presentación + doctor rápido
  buffy doctor                   Auditoría completa del sistema
  buffy capabilities             Qué puede hacer Buffy
  buffy diagnose "tu problema"   Diagnóstico dirigido
  buffy act <action-id>          Ejecutar una acción
  buffy setup                    Bootstrap de Buffy
  --json                         Salida en formato JSON
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
