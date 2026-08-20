// Buffy Next — Check Selector
// Determines which checks to run based on user query
// Selector léxico: QUERY → checks → diagnosis
//
// Semántica:
//   query con patrón conocido → checks específicos
//   query con intención diagnóstica vaga → DEFAULT_DIAGNOSTIC_CHECKS
//   query no diagnóstica / vacía → []

import type { CheckName } from './types.js';

/**
 * Bounded default for vague diagnostic queries.
 * NOT the full doctor — only the most common performance-related checks.
 */
const DEFAULT_DIAGNOSTIC_CHECKS: CheckName[] = [
  'cpu', 'ram', 'gpu', 'temperature', 'processes',
];

/**
 * Detects vague diagnostic intent — queries that suggest a problem
 * but don't specify what kind.
 */
const DIAGNOSTIC_INTENT = /\b(mi\s+pc|computadora|equipo|ordenador|pc|laptop|port[aá]til).{0,20}(raro|extra[ñn]o|mal|falla|problema|issue|weird|strange|broken|raros?|cosas?)\b/i;

const CHECK_PATTERNS: Array<{ pattern: RegExp; checks: CheckName[] }> = [
  { pattern: /lent|lag|laguea|lento|slow|rendimiento|performance|fps|congel|freeze|stutter/i, checks: ['cpu', 'ram', 'gpu', 'temperature', 'processes'] },
  { pattern: /internet|red|wifi|conexi[oó]n|network|dns/i, checks: ['storage', 'processes'] },
  { pattern: /disco|lleno|almacenamiento|space|espacio|almacen/i, checks: ['storage'] },
  { pattern: /calien|temperatura|thermal|heat|overheat/i, checks: ['temperature', 'cpu', 'processes'] },
  { pattern: /ram|memoria|memory/i, checks: ['ram', 'processes'] },
  { pattern: /gpu|tarjeta gr[aá]fica|video|driver|pantalla/i, checks: ['gpu'] },
  { pattern: /permiso|admin|root|acceso|privilegio/i, checks: [] },
  { pattern: /driver|instalar|install/i, checks: ['gpu'] },
  { pattern: /proceso|app|aplicaci[oó]n|servicio/i, checks: ['processes'] },
];

export function selectChecks(query: string): CheckName[] {
  const q = query.toLowerCase();
  const selected = new Set<CheckName>();

  for (const { pattern, checks } of CHECK_PATTERNS) {
    if (pattern.test(q)) {
      for (const check of checks) {
        selected.add(check);
      }
    }
  }

  // Specific patterns matched → return those checks
  if (selected.size > 0) {
    return Array.from(selected);
  }

  // Vague diagnostic intent → bounded default
  if (DIAGNOSTIC_INTENT.test(q)) {
    return DEFAULT_DIAGNOSTIC_CHECKS;
  }

  // Non-diagnostic or unrecognized → no checks
  return [];
}
