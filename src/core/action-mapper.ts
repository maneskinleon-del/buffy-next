// Buffy Next — Action Mapper (v0.7)
// Pure function: diagnostic results + platform → RecommendedAction[]
//
// Design constraints:
// - Pure function, no filesystem, no model, no network, no state
// - Deterministic: same input → same output
// - Called AFTER diagnosis, never replaces it
// - D5: hardcoded instructions, no LLM
// - D6: confidence affects output behavior

import type {
  CheckResult,
  PlatformName,
  RecommendedAction,
  Confidence,
  PlatformInstructions,
} from './types.js';
import { findActionsForChecks } from './action-registry.js';

// ─── Confidence evaluation ─────────────────────────────────

/**
 * Evaluates confidence for a recommended action.
 *
 * Confidence is NOT just metadata — it controls output:
 * - high:   "Haz esto"
 * - medium: "Puedes probar esto"
 * - low:    "Podría estar relacionado"
 * - (none via InstructionStatus.unsupported: "No tengo instrucciones")
 */
function evaluateConfidence(
  checkResults: CheckResult[],
  actionId: string,
  instructions: PlatformInstructions[],
): Confidence {
  // If any instruction is verified for the current platform, confidence is high
  const hasVerified = instructions.some(i => i.status === 'verified');
  if (hasVerified) return 'high';

  // If all instructions are partial, confidence is medium
  const hasPartial = instructions.some(i => i.status === 'partial');
  if (hasPartial) return 'medium';

  // If all are unsupported, confidence is low
  return 'low';
}

// ─── Action Mapper ─────────────────────────────────────────

/**
 * Maps diagnostic results to recommended actions.
 *
 * @param checkResults - Results from diagnosis (v0.5-B/v0.6)
 * @param platform - Current platform
 * @returns Array of recommended actions with grounding chain
 */
export function mapActions(
  checkResults: CheckResult[],
  platform: PlatformName,
): RecommendedAction[] {
  // Find matching actions from registry
  const actions = findActionsForChecks(checkResults);

  return actions.map(action => {
    // Filter instructions for current platform
    const platformInstructions = action.instructions.filter(
      i => i.platform === platform,
    );

    // If no instructions for this platform, mark all as unsupported
    const instructions = platformInstructions.length > 0
      ? platformInstructions
      : action.instructions.map(i => ({
          ...i,
          status: 'unsupported' as const,
        }));

    // Build observed/inferred/recommended chain
    const relevantChecks = checkResults.filter(
      c => action.triggers.includes(c.id),
    );

    const observed = relevantChecks
      .map(c => c.message)
      .join('; ') || 'Diagnóstico del sistema';

    const inferred = relevantChecks
      .map(c => c.suggestion || c.explanation || c.message)
      .join('; ') || 'Posible problema detectado';

    const confidence = evaluateConfidence(checkResults, action.id, instructions);

    return {
      id: action.id,
      observed,
      inferred,
      recommended: action.name,
      instructions,
      confidence,
    };
  });
}
