// Buffy Next — Entity/Modifier Binding (v0.6)
// Associates generic modifiers (lento, rápido, caliente) with their closest entity domain.
//
// Design constraint: deterministic, no embeddings, no LLM.
// Uses word proximity and entity dictionaries.

import type { CheckName } from './types.js';

// ─── Entity dictionaries ───────────────────────────────────

/** Known entities and their associated check domains */
const ENTITY_DOMAINS: Record<string, CheckName[]> = {
  // Network
  'wifi': ['network', 'os'],
  'internet': ['network', 'os'],
  'red': ['network', 'os'],
  'dns': ['network', 'os'],
  'conexión': ['network', 'os'],
  'conexion': ['network', 'os'],

  // Storage
  'disco': ['storage'],
  'almacenamiento': ['storage'],
  'espacio': ['storage'],

  // Input devices
  'mouse': ['gpu'],
  'teclado': ['processes'],
  'pantalla': ['gpu'],
  'monitor': ['gpu'],

  // Apps
  'chrome': ['processes'],
  'firefox': ['processes'],
  'word': ['processes'],
  'roblox': ['cpu', 'gpu', 'temperature', 'processes'],
  'juego': ['cpu', 'gpu', 'temperature', 'processes'],
  'game': ['cpu', 'gpu', 'temperature', 'processes'],

  // Hardware
  'ventilador': ['temperature', 'cpu', 'processes'],
  'fan': ['temperature', 'cpu', 'processes'],
  'gpu': ['gpu'],
  'cpu': ['cpu'],
  'ram': ['ram', 'processes'],
  'memoria': ['ram', 'processes'],
};

/** Generic modifiers that are context-dependent */
const GENERIC_MODIFIERS = new Set([
  'lento', 'lenta', 'rápido', 'rapido', 'rápida', 'rapida',
  'caliente', 'calor', 'frío', 'frio',
  'pesado', 'pesada',
  // Note: 'lleno/llena' is NOT a generic modifier — it's storage-specific
  // and already handled by SPECIFIC_PATTERNS in check-selector.ts
]);

// ─── Binding logic ─────────────────────────────────────────

interface TokenInfo {
  word: string;
  index: number; // position in the token array
}

/**
 * Tokenizes a fragment into words with positions.
 */
function tokenize(fragment: string): TokenInfo[] {
  return fragment
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => ({ word: word.replace(/[^a-záéíóúñü]/g, ''), index }))
    .filter(t => t.word.length > 0);
}

/**
 * Finds the closest entity to a modifier within a token window.
 *
 * @param tokens - Tokenized fragment
 * @param modifierIndex - Index of the modifier token
 * @param windowSize - How many tokens to look in each direction
 * @returns The entity domain if found, null otherwise
 */
function findClosestEntity(
  tokens: TokenInfo[],
  modifierIndex: number,
  windowSize: number = 4,
): CheckName[] | null {
  for (let offset = 1; offset <= windowSize; offset++) {
    // Look backward
    const backIdx = modifierIndex - offset;
    if (backIdx >= 0) {
      const entity = ENTITY_DOMAINS[tokens[backIdx].word];
      if (entity) return entity;
    }
    // Look forward
    const fwdIdx = modifierIndex + offset;
    if (fwdIdx < tokens.length) {
      const entity = ENTITY_DOMAINS[tokens[fwdIdx].word];
      if (entity) return entity;
    }
  }
  return null;
}

/**
 * Analyzes a single fragment and returns entity-bound checks.
 *
 * For each generic modifier found:
 * - If a nearby entity exists → return entity's domain (not generic performance)
 * - If no entity found → return null (caller should use generic performance checks)
 *
 * @param fragment - A single query fragment (lowercase, trimmed)
 * @returns Array of checks derived from entity-modifier binding
 */
export function bindEntityModifier(fragment: string): {
  checks: CheckName[];
  hasEntityBoundModifier: boolean;
} {
  const tokens = tokenize(fragment);
  const checks: CheckName[] = [];
  let hasEntityBoundModifier = false;

  for (const token of tokens) {
    if (GENERIC_MODIFIERS.has(token.word)) {
      const entityDomain = findClosestEntity(tokens, token.index);
      if (entityDomain) {
        checks.push(...entityDomain);
        hasEntityBoundModifier = true;
      }
      // If no entity found, don't add anything — let caller handle generic case
    }
  }

  return {
    checks: [...new Set(checks)],
    hasEntityBoundModifier,
  };
}
