// Runner de proceso hijo para Execution Journal Fase 2 (diseño v3 §9-§10).
// Uso: npx tsx tests/fixtures/phase2-runner.ts <execute|resolve|lookup> <key> [extra]
// Imprime exactamente una línea "@@RESULT@@{json}" en stdout.
import { appendFileSync } from 'node:fs';
import { ActionGate } from '../../src/core/action-gate.js';
import { resolveKey, lookupKey, type JournalResolution } from '../../src/core/execution-journal.js';
import type { ActionDefinition, ActionResult, PlatformAdapter, ActionExecutor } from '../../src/core/types.js';

const [mode = 'execute', key = '', extra = ''] = process.argv.slice(2) as string[];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const adapter: PlatformAdapter = {
  name: 'linux',
  detect: async () => ({ name: 'linux' as const, os: 'Test', version: '1.0', arch: 'x64' }),
  systemInfo: async () => ({
    os: { name: 'Test', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test', cores: 4 },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'GPU', driver: '1.0', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
  }),
  capabilities: async () => [],
};

const action: ActionDefinition = {
  id: 'test-fase2',
  name: 'test-fase2',
  description: 'acción de prueba para hijos de fault injection (Fase 2)',
  level: 'auto_safe',
  reversible: false,
  platforms: ['linux', 'windows', 'android-termux'],
  prerequisites: [],
};

const execLog = process.env.BUFFY_EXEC_LOG;
const executor: ActionExecutor = async (request): Promise<ActionResult> => {
  if (execLog) appendFileSync(execLog, `${request.requestId}\n`);
  const delay = Number(process.env.BUFFY_EXEC_DELAY ?? '0');
  if (delay > 0) await sleep(delay);
  if (process.env.BUFFY_EXEC_MODE === 'throw') throw new Error('executor explotó');
  return { success: true, message: 'ejecutado' };
};

const registry = {
  get: (id: string): ActionExecutor | undefined => (id === 'test-fase2' ? executor : undefined),
  has: (id: string): boolean => id === 'test-fase2',
};

const gate = new ActionGate({ adapter, actionDefinitions: [action], executorRegistry: registry });

function emit(payload: Record<string, unknown>): void {
  console.log('@@RESULT@@' + JSON.stringify(payload));
}

async function main(): Promise<void> {
  if (mode === 'execute') {
    // La key siempre se pasa tal cual (incluida la vacía): el gate es quien valida.
    const r = await gate.execute('test-fase2', 'node', { idempotencyKey: key });
    emit({ success: r.success, message: r.message, persisted: r.persisted, details: r.details });
    return;
  }
  if (mode === 'resolve') {
    const outcome = resolveKey(key, extra, {
      reason: process.env.BUFFY_RESOLVE_REASON ?? 'motivo de prueba',
      evidence: process.env.BUFFY_RESOLVE_EVIDENCE,
      resolvedBy: 'test-runner',
    });
    emit(outcome as unknown as Record<string, unknown>);
    return;
  }
  if (mode === 'lookup') {
    const info = lookupKey(key);
    emit(info as unknown as Record<string, unknown>);
    return;
  }
  emit({ error: `modo desconocido: ${mode}` });
}

main().catch((e: unknown) => {
  emit({ fatal: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
});
