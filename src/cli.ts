// Buffy Next — CLI Entry Point (v2.2)
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

const args = process.argv.slice(2);
const command = args[0] || '';
const jsonMode = args.includes('--json');
const contextMode = args.includes('--context');

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
  const response = await diagnose(adapter, query);

  if (jsonMode) {
    console.log(toJSON(response));
    return;
  }

  console.log(renderDiagnosticResponse(response));
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

function showHelp() {
  console.log(`
Buffy — Asistente técnico de diagnóstico

Uso:
  buffy                          Presentación + doctor rápido
  buffy doctor                   Auditoría completa del sistema
  buffy doctor --context         Contexto del sistema para agentes externos (JSON)
  buffy capabilities             Qué puede hacer Buffy
  buffy diagnose "tu problema"   Diagnóstico dirigido
  buffy act <action-id> [args]    Ejecutar una acción
    ej: buffy act install-tool node
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
