// Buffy Next — Check Selector v0.5-B
// Determines which checks to run based on user query
//
// v0.5-B changes from v0.5-A:
//   B1: Intent gate — non-diagnostic → [], vague → DEFAULT_DIAGNOSTIC_CHECKS
//   B2: ALL_CHECKS renamed to DEFAULT_DIAGNOSTIC_CHECKS (never returned for non-diagnostic)
//   B3: Expanded lexical vocabulary by semantic domain
//   B4: Contextual priority — specific domain > generic performance

import type { CheckName } from './types.js';

// ─── B2: Default checks for vague diagnostic intent ────────
// Only used when intent is diagnostic but no specific pattern matches.
// NEVER returned for non-diagnostic queries.
const DEFAULT_DIAGNOSTIC_CHECKS: CheckName[] = [
  'cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes',
];

// ─── B3: Patterns by semantic domain ───────────────────────

/**
 * Specific domain patterns — these always contribute their checks.
 * Ordered by specificity: most specific first.
 */
const SPECIFIC_PATTERNS: Array<{ pattern: RegExp; checks: CheckName[] }> = [
  // Network
  { pattern: /internet|red|wifi|conexi[oó]n|network|dns/i, checks: ['network'] },
  // Storage
  { pattern: /disco|lleno|almacenamiento|space|espacio|almacen/i, checks: ['storage'] },
  // Temperature (specific — includes "ventilador", "ruge")
  { pattern: /calien|temperatura|thermal|heat|overheat|ventilador|fan|ruge/i, checks: ['temperature', 'cpu', 'processes'] },
  // RAM
  { pattern: /\bram\b|memoria|memory/i, checks: ['ram', 'processes'] },
  // GPU
  { pattern: /gpu|tarjeta gr[aá]fica|video|driver|pantalla/i, checks: ['gpu'] },
  // Permissions
  { pattern: /permiso|admin|root|acceso|privilegio/i, checks: ['processes'] },
  // Tools
  { pattern: /instalar|install/i, checks: ['gpu'] },
  // Processes
  { pattern: /proceso|procesos|app|aplicaci[oó]n|servicio|virus|malware/i, checks: ['processes'] },
];

/**
 * Generic performance patterns — only included when NO specific pattern matches.
 * Prevents over-selection when a specific domain already matched.
 * Expanded vocabulary: congela, traba, tarda, demora, pesado, tirones, etc.
 */
const PERFORMANCE_PATTERNS: Array<{ pattern: RegExp; checks: CheckName[] }> = [
  {
    pattern: /lent[oa]?|lag(?:uea)?|slow|rendimiento|performance|fps|congela(?:do|da)?|traba(?:do|da)?|tarda(?:da)?|demora(?:da)?|pesado|tirones|anda mal|anda mejor|responde mal|responder mal|no funciona como|prender|freeze|stutter|laggy|choppy/i,
    checks: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
];

// ─── B1: Intent gate ───────────────────────────────────────

/**
 * Non-diagnostic phrases — if query matches and has no diagnostic signals, return [].
 * These are greetings, general questions, off-topic requests.
 */
const NON_DIAGNOSTIC_PATTERNS: RegExp[] = [
  /^(hola|hello|hey|buenos? d[ií]as?|buenas? tardes?|buenas? noches?)[\s!.]*$/i,
  /^(gracias?|thank|thx|ok|bien|perfecto|genial|dale)[\s!.]*$/i,
  /^(adi[oó]s?|bye|chao|nos vemos|hasta luego)[\s!.]*$/i,
  /^cu[aá]nto es|^cu[aá]l es|^qu[ié]n eres|^c[oó]mo te llamas/i,
  /^cu[eé]ntame|^recom/i,
  /^qu[eé] puedes|^qu[eé] sabes|^ay[uú]dame|^puedes/i,
];

/**
 * Diagnostic signals — words that indicate the user has a system problem.
 * If ANY of these appear, the query is diagnostic even if vague.
 */
const DIAGNOSTIC_SIGNALS = /lent[oa]?|congela|traba|tarda|demora|pesado|tirones|anda mal|responde mal|no funciona|problema|error|falla|crash|bug|raro|mal|algo|desde ayer|antes|como antes|virus|malware|calien|temperatura|ram|memoria|disco|espacio|wifi|internet|red|gpu|driver|proceso|app|permiso|admin/i;

// ─── Main selector ─────────────────────────────────────────

export function selectChecks(query: string): CheckName[] {
  const q = query.toLowerCase().trim();

  // B1: Non-diagnostic gate
  // If query is purely non-diagnostic (greeting, thanks, off-topic) → []
  const isNonDiagnostic = NON_DIAGNOSTIC_PATTERNS.some(p => p.test(q));
  if (isNonDiagnostic) {
    return [];
  }

  // Collect matched patterns by domain
  const specificMatches: CheckName[] = [];
  let performanceMatched = false;

  // Check specific domain patterns first
  for (const { pattern, checks } of SPECIFIC_PATTERNS) {
    if (pattern.test(q)) {
      specificMatches.push(...checks);
    }
  }

  // Check generic performance patterns
  // B4: Always include performance checks when matched — diagnostic tools
  // should err on the side of more data, not less.
  for (const { pattern, checks } of PERFORMANCE_PATTERNS) {
    if (pattern.test(q)) {
      performanceMatched = true;
      specificMatches.push(...checks);
    }
  }

  // If any checks were selected, return them (deduplicated)
  if (specificMatches.length > 0) {
    return [...new Set(specificMatches)];
  }

  // B1: Diagnostic intent check
  // If query has diagnostic signals but no pattern matched → DEFAULT
  const hasDiagnosticIntent = DIAGNOSTIC_SIGNALS.test(q);
  if (hasDiagnosticIntent) {
    return DEFAULT_DIAGNOSTIC_CHECKS;
  }

  // No diagnostic intent, no patterns → non-diagnostic
  return [];
}
