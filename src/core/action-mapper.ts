// Buffy Next — Action Mapper (v0.8)
// Pure function: diagnostic results + platform → RecommendedAction[]
//
// v0.8 changes from v0.7:
// - Eligibility filter: minSeverity, matchMode, minMatches
// - Family grouping: investigate > mitigate > inform > maintenance > escalate
// - Conflict resolution: 1 per family, max 3 actions total

import type {
  CheckResult,
  PlatformName,
  RecommendedAction,
  Confidence,
  PlatformInstructions,
} from './types.js';
import { findActionsForChecks, type ActionFamily } from './action-registry.js';

// ─── Conflict Resolution ──────────────────────────────────

const FAMILY_PRIORITY: Record<ActionFamily, number> = {
  investigate: 1,
  mitigate: 2,
  inform: 3,
  maintenance: 4,
  escalate: 5,
};

const MAX_ACTIONS = 3;

interface EligibleAction {
  entry: { id: string; name: string; family: ActionFamily; triggers: string[] };
  checkResults: CheckResult[];
}

function groupByFamily(eligible: EligibleAction[]): Map<ActionFamily, EligibleAction[]> {
  const groups = new Map<ActionFamily, EligibleAction[]>();
  for (const e of eligible) {
    const family = e.entry.family;
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push(e);
  }
  return groups;
}

function resolveConflicts(eligible: EligibleAction[]): EligibleAction[] {
  const groups = groupByFamily(eligible);
  const result: EligibleAction[] = [];

  const sortedFamilies = Array.from(groups.entries()).sort(
    ([a], [b]) => FAMILY_PRIORITY[a] - FAMILY_PRIORITY[b],
  );

  for (const [, actions] of sortedFamilies) {
    // Prefer: most matching checks first, then fewer triggers (= more specific)
    const sorted = [...actions].sort((a, b) => {
      const checkDiff = b.checkResults.length - a.checkResults.length;
      if (checkDiff !== 0) return checkDiff;
      return a.entry.triggers.length - b.entry.triggers.length;
    });
    result.push(sorted[0]);
    if (result.length >= MAX_ACTIONS) break;
  }

  return result;
}

// ─── Confidence evaluation ─────────────────────────────────

function evaluateConfidence(
  _checkResults: CheckResult[],
  _actionId: string,
  instructions: PlatformInstructions[],
): Confidence {
  const hasVerified = instructions.some(i => i.status === 'verified');
  if (hasVerified) return 'high';
  const hasPartial = instructions.some(i => i.status === 'partial');
  if (hasPartial) return 'medium';
  return 'low';
}

// ─── Action Mapper ─────────────────────────────────────────

export function mapActions(
  checkResults: CheckResult[],
  platform: PlatformName,
): RecommendedAction[] {
  const eligible = findActionsForChecks(checkResults);

  const eligibleWithChecks: EligibleAction[] = eligible.map(entry => ({
    entry,
    checkResults: checkResults.filter(c => entry.triggers.includes(c.id)),
  }));
  const resolved = resolveConflicts(eligibleWithChecks);

  return resolved.map(({ entry: action }) => {
    const platformInstructions = action.instructions.filter(
      i => i.platform === platform,
    );

    const instructions = platformInstructions.length > 0
      ? platformInstructions
      : action.instructions.map(i => ({
          ...i,
          status: 'unsupported' as const,
        }));

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
