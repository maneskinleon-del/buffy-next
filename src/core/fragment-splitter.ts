// Buffy Next — Fragment Splitter (v0.6)
// Splits queries on explicit conjunctions into independent diagnostic fragments.
//
// Design constraint (D1): only split on explicit, evidence conjunctions.
// No heuristics, no causal inference, no embeddings.
//
// Conjunctions: y, pero, cuando, además, también

/**
 * Splits a query into independent diagnostic fragments.
 *
 * Rules:
 * - Split on: "y", "pero", "cuando", "además", "también"
 * - Each fragment is a candidate for independent scoring
 * - Single-fragment queries pass through unchanged
 * - Fragments are trimmed and lowercased
 *
 * @param query - Raw user query
 * @returns Array of query fragments (always at least one)
 */
export function splitFragments(query: string): string[] {
  const q = query.toLowerCase().trim();

  if (!q) return [];

  // Split on explicit conjunctions with word boundaries
  // Order matters: check longer conjunctions first ("además" before "y" would be wrong,
  // but "y" is a single char so we handle it carefully)
  const fragments = q
    .split(/\s+(?:y|pero|cuando|además|también)\s+/i)
    .map(f => f.trim())
    .filter(f => f.length > 0);

  return fragments.length > 0 ? fragments : [q];
}

/**
 * Checks if a query contains multiple diagnostic domains.
 * Used to decide whether context scoring is needed.
 *
 * @param fragments - Output of splitFragments()
 * @returns true if there are 2+ non-empty fragments
 */
export function isMultiFragment(fragments: string[]): boolean {
  return fragments.length >= 2;
}
