// Buffy Next — Unified Execution Pipeline
// Single path for ALL action execution (cmdAct + cmdDiagnose)
// Gates: forbidden → platform → prerequisites → auth → execute → verify → persist

import type { ActionDefinition, PlatformAdapter } from './types.js';
import { isForbidden, requiresAuth } from './security.js';
import { buildExecutionPlan, executeAction } from './executor.js';
import { renderActionResult, toJSON } from './presenter.js';
import { loadState, updateState } from '../state/store.js';

export interface PipelineOptions {
  adapter: PlatformAdapter;
  action: ActionDefinition;
  jsonMode?: boolean;
  promptUser?: () => Promise<string>;
}

/**
 * Execute an action through the full gate pipeline.
 * This is the ONLY execution path — both `buffy act` and `buffy diagnose` use it.
 *
 * Gates: forbidden → platform → prerequisites → auth → execute → verify → persist
 */
export async function executeWithGates(options: PipelineOptions): Promise<void> {
  const { adapter, action, jsonMode = false, promptUser } = options;

  // Gate 1: Forbidden
  if (isForbidden(action)) {
    console.error(`Acción prohibida: ${action.name}`);
    return;
  }

  // Gate 2: Platform + prerequisites + dryRun
  const capabilities = await adapter.capabilities();
  const system = await adapter.systemInfo();
  const privileges = system.privileges;
  const plan = await buildExecutionPlan(action, adapter.name, capabilities, privileges);

  if (!plan.prerequisitesValid) {
    console.error(`\n❌ Prerequisito no satisfecho`);
    for (const p of plan.missingPrerequisites) {
      const isPrivilege = ['shell', 'shizuku', 'root', 'adb'].includes(p.toLowerCase());
      if (isPrivilege) {
        console.error(`   Necesario: ${p}`);
        console.error(`   Disponible: no`);
        console.error(`   Sugerencia: inicia ${p} y vuelve a intentarlo.`);
      } else {
        console.error(`   ${p}: no instalado`);
      }
    }
    console.error('');
    return;
  }

  if (!plan.platformValid) {
    console.error('Acción no disponible en esta plataforma');
    return;
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

  // Gate 3: Authorization
  if (requiresAuth(action)) {
    if (!promptUser) {
      console.error('Se requiere interacción del usuario pero no hay promptUser');
      return;
    }
    const answer = await promptUser();
    if (answer.toLowerCase() !== 'sí' && answer.toLowerCase() !== 'si' && answer.toLowerCase() !== 'y') {
      console.log('Acción cancelada.');
      return;
    }
  }

  // Execute
  const result = await executeAction(action);
  console.log(renderActionResult(result));

  // Persist
  updateState({
    actionHistory: [
      ...loadState().actionHistory,
      { actionId: action.id, timestamp: new Date().toISOString(), success: result.success, message: result.message },
    ].slice(-50),
  });
}
