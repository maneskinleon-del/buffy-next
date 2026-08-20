// Buffy Next — Context Scorer (v0.6)
// Pure function: lexical candidates + query → CheckSelection
//
// Design constraints (D3):
// - Pure function, no filesystem, no model, no network, no state
// - Deterministic: same input → same output
// - Called AFTER selectChecks(), never replaces it
// - v0.5-B baseline preserved in selectChecks()

import type { CheckName, CheckSelection, Confidence } from './types.js';
import { selectChecks } from './check-selector.js';
import { splitFragments } from './fragment-splitter.js';
import { bindEntityModifier } from './entity-modifier.js';

// ─── Performance checks (same as check-selector.ts) ────────

const PERFORMANCE_CHECKS: CheckName[] = [
  'cpu', 'ram', 'gpu', 'temperature', 'processes',
];

// ─── Scoring logic ─────────────────────────────────────────

/**
 * Scores a single fragment by combining entity-modifier binding
 * with the original lexical checks.
 *
 * @param fragment - Single query fragment
 * @param lexicalChecks - Checks from selectChecks() for this fragment
 * @returns Refined checks after context scoring
 */
function scoreFragment(
  fragment: string,
  lexicalChecks: CheckName[],
): CheckName[] {
  const { checks: entityChecks, hasEntityBoundModifier } = bindEntityModifier(fragment);

  if (hasEntityBoundModifier) {
    // Entity-modifier binding found a specific domain
    // ADD entity checks to lexical, don't replace — diagnostic tools
    // should err on more data, not less
    return [...new Set([...lexicalChecks, ...entityChecks])];
  }

  // No entity binding — use original lexical checks
  return lexicalChecks;
}

/**
 * Context scoring: refines lexical check candidates using fragment splitting
 * and entity/modifier binding.
 *
 * @param query - Original user query
 * @param lexicalCandidates - Checks from selectChecks()
 * @returns CheckSelection with checks, ambiguity flag, and confidence
 */
export function scoreContext(
  query: string,
  lexicalCandidates: CheckName[],
): CheckSelection {
  // If no lexical candidates, nothing to score
  if (lexicalCandidates.length === 0) {
    return { checks: [], ambiguous: false, confidence: 'high' };
  }

  const fragments = splitFragments(query);

  // Single fragment — apply entity/modifier binding directly
  if (fragments.length === 1) {
    const scored = scoreFragment(fragments[0], lexicalCandidates);
    const allSame = scored.length === lexicalCandidates.length &&
      scored.every(c => lexicalCandidates.includes(c));
    return {
      checks: scored,
      ambiguous: false,
      confidence: allSame ? 'high' : 'medium',
    };
  }

  // Multi-fragment — score each fragment independently, then union
  const allChecks: CheckName[] = [];
  let anyEntityBound = false;

  for (const fragment of fragments) {
    // Get lexical checks for THIS specific fragment (not the whole query)
    const fragmentLexical = selectChecks(fragment);
    const { checks: entityChecks, hasEntityBoundModifier } = bindEntityModifier(fragment);

    if (hasEntityBoundModifier) {
      // Entity binding found — use entity checks for this fragment
      allChecks.push(...entityChecks);
      anyEntityBound = true;
    } else {
      // No entity binding — use this fragment's lexical checks
      allChecks.push(...fragmentLexical);
    }
  }

  const uniqueChecks = [...new Set(allChecks)];

  // Determine confidence
  let confidence: Confidence = 'high';
  if (uniqueChecks.length < lexicalCandidates.length) {
    // We removed some checks (entity binding filtered out generic ones)
    confidence = 'medium';
  }
  if (anyEntityBound && uniqueChecks.length > 0) {
    confidence = 'medium';
  }

  return {
    checks: uniqueChecks,
    ambiguous: false,
    confidence,
  };
}
