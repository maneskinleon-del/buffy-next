// Buffy Next — Action Gate (v2.2 → v2.3)
// The ONLY public API capable of initiating a physical effect.
//
// Flow: normalize → validate → authorize → claim → execute → verify → persist
//
// Design invariants:
// - ActionDefinition is metadata only (no execute/dryRun/rollback/verify)
// - PlatformAdapter has no execute() method
// - Caller provides only actionId + rawParams
// - Caller CANNOT provide: platform, capabilities, privileges, token, target, executor
// - Token is LOCAL to execute() invocation — no instance state
// - UNKNOWN runtime level → DENY
// - FORBIDDEN → DENY
// - CONFIRM requires explicit PromptProvider
// - AUTO_SAFE still goes through platform/prerequisite validation
// - ExecutorRegistry is immutable after construction — no registerExecutor()
// - Each ActionGate instance has its own registry — no shared mutable state

import type {
  ActionDefinition,
  ActionResult,
  AuthorizationToken,
  CanonicalRequest,
  PlatformAdapter,
  PlatformCapabilities,
  PromptProvider,
} from './types.js';
import { classifyAction, isForbidden, requiresAuth, validateAction, checkPrerequisites } from './security.js';
import { normalizeTarget } from './target-normalizer.js';
import { IdentityProvider } from './identity-provider.js';
import { AuthorizationStore } from './authorization-store.js';
import { ActionExecutionStore } from './action-execution-store.js';
import { ActionPlanner } from './action-planner.js';
import { ExecutorRegistry } from './executor-registry.js';

// ─── Action Gate ───────────────────────────────────────────

export interface ActionGateOptions {
  adapter: PlatformAdapter;
  actionDefinitions: ActionDefinition[];
  executorRegistry: ExecutorRegistry;
  promptUser?: PromptProvider;
  identityProvider?: IdentityProvider;
  authorizationStore?: AuthorizationStore;
  executionStore?: ActionExecutionStore;
  actionPlanner?: ActionPlanner;
}

export class ActionGate {
  private readonly adapter: PlatformAdapter;
  private readonly actions: Map<string, ActionDefinition>;
  private readonly registry: ExecutorRegistry;
  private readonly promptUser?: PromptProvider;
  private readonly identityProvider: IdentityProvider;
  private readonly authStore: AuthorizationStore;
  private readonly execStore: ActionExecutionStore;
  private readonly planner: ActionPlanner;

  constructor(options: ActionGateOptions) {
    this.adapter = options.adapter;
    this.actions = new Map(options.actionDefinitions.map(a => [a.id, a]));
    this.registry = options.executorRegistry;
    this.promptUser = options.promptUser;
    this.identityProvider = options.identityProvider ?? new IdentityProvider();
    this.authStore = options.authorizationStore ?? new AuthorizationStore();
    this.execStore = options.executionStore ?? new ActionExecutionStore();
    this.planner = options.actionPlanner ?? new ActionPlanner();
  }

  // ─── Public API ────────────────────────────────────────

  /**
   * Execute an action through the full gate pipeline.
   * This is the ONLY way to produce physical effects.
   *
   * @param actionId - The action to execute
   * @param rawParams - Raw parameters (e.g., tool name for install-tool)
   * @returns The result of the execution
   */
  async execute(actionId: string, rawParams?: string): Promise<ActionResult> {
    // ── 1. Lookup ──────────────────────────────────────
    const action = this.actions.get(actionId);
    if (!action) {
      return { success: false, message: `Acción no encontrada: ${actionId}` };
    }

    // ── 2. Classify & validate level ───────────────────
    const level = classifyAction(action);

    // UNKNOWN runtime level → DENY (V4 fix)
    const validLevels = new Set(['auto_safe', 'confirm', 'forbidden']);
    if (!validLevels.has(level as string)) {
      return { success: false, message: `Nivel de seguridad desconocido: "${level}" — DENEGADO` };
    }

    // FORBIDDEN → DENY (V1 fix)
    if (isForbidden(action)) {
      return { success: false, message: `Acción prohibida: ${action.name}` };
    }

    // ── 3. Normalize target ────────────────────────────
    let request: CanonicalRequest;
    try {
      request = normalizeTarget(actionId, rawParams, this.adapter.name as any);
    } catch (error) {
      return {
        success: false,
        message: `Target inválido: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // ── 4. Platform validation ─────────────────────────
    const platformValidation = validateAction(action, this.adapter.name);
    if (!platformValidation.valid) {
      return { success: false, message: platformValidation.reason ?? 'Acción no disponible en esta plataforma' };
    }

    // ── 5. Prerequisites ───────────────────────────────
    const capabilities = await this.adapter.capabilities();
    const system = await this.adapter.systemInfo();
    const privileges = system.privileges;
    const prereqCheck = checkPrerequisites(action, capabilities, privileges);
    if (!prereqCheck.valid) {
      return {
        success: false,
        message: `Prerequisito(s) faltante(s): ${prereqCheck.missing.join(', ')}`,
        details: { missing: prereqCheck.missing },
      };
    }

    // ── 6. Preview (informational) ─────────────────────
    const preview = this.planner.preview(action, request);

    // ── 7. Authorization (CONFIRM only) ────────────────
    let token: AuthorizationToken | null = null;

    if (requiresAuth(action)) {
      if (!this.promptUser) {
        return { success: false, message: 'Se requiere interacción del usuario pero no hay promptUser' };
      }

      const answer = await this.promptUser();
      if (answer.toLowerCase() !== 'sí' && answer.toLowerCase() !== 'si' && answer.toLowerCase() !== 'y') {
        return { success: false, message: 'Acción cancelada por el usuario' };
      }

      // Issue token (local variable — not instance state)
      const identity = this.identityProvider.getIdentity();
      token = this.authStore.issue(identity, request);
    }

    // ── 8. Claim token (if issued) ────────────────────
    if (token) {
      const claimed = this.authStore.claim(token.tokenId, request);
      if (!claimed) {
        return { success: false, message: 'Autorización inválida o expirada' };
      }
      token = claimed;
    }

    // ── 9. Track execution ─────────────────────────────
    const executionTokenId = token?.tokenId ?? 'auto-safe';
    const execRecord = this.execStore.start(executionTokenId, actionId);

    // ── 10. Execute via private executor ───────────────
    const executor = this.registry.get(actionId);
    if (!executor) {
      const failResult: ActionResult = {
        success: false,
        message: `No hay executor registrado para: ${actionId}`,
      };
      this.execStore.fail(execRecord.executionId, failResult);
      if (token) this.authStore.consume(token.tokenId);
      return failResult;
    }

    let result: ActionResult;
    try {
      result = await executor(request, this.adapter);
    } catch (error) {
      result = {
        success: false,
        message: `Error ejecutando ${action.name}: ${error instanceof Error ? error.message : String(error)}`,
      };
      this.execStore.fail(execRecord.executionId, result);
      if (token) this.authStore.consume(token.tokenId);
      return result;
    }

    // ── 11. Consume token ──────────────────────────────
    if (token) {
      this.authStore.consume(token.tokenId);
    }

    // ── 12. Record completion ──────────────────────────
    this.execStore.complete(execRecord.executionId, result);

    return result;
  }

  // ─── Inspection (for testing/audit only) ────────────────

  /** Get the action metadata (without executor) */
  getAction(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /** Get the execution store (for testing) */
  getExecutionStore(): ActionExecutionStore {
    return this.execStore;
  }

  /** Get the authorization store (for testing) */
  getAuthorizationStore(): AuthorizationStore {
    return this.authStore;
  }
}
