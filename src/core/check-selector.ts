// Buffy Next — Check Selector
// Determines which checks to run based on user query
// Much simpler than the old router: QUERY → checks → diagnosis

import type { CheckName } from './types.js';

const ALL_CHECKS: CheckName[] = [
  'os', 'cpu', 'ram', 'gpu', 'storage', 'temperature',
  'processes', 'network', 'permissions', 'tools',
];

const CHECK_PATTERNS: Array<{ pattern: RegExp; checks: CheckName[] }> = [
  { pattern: /lent|lag|laguea|lento|slow|rendimiento|performance|fps/i, checks: ['cpu', 'ram', 'gpu', 'temperature', 'processes'] },
  { pattern: /internet|red|wifi|conexi[oó]n|network|dns/i, checks: ['network', 'os'] },
  { pattern: /disco|lleno|almacenamiento|space|espacio|almacen/i, checks: ['storage'] },
  { pattern: /calien|temperatura|thermal|heat|overheat/i, checks: ['temperature', 'cpu', 'processes'] },
  { pattern: /ram|memoria|memory/i, checks: ['ram', 'processes'] },
  { pattern: /gpu|tarjeta gr[aá]fica|video|driver|pantalla/i, checks: ['gpu'] },
  { pattern: /permiso|admin|root|acceso|privilegio/i, checks: ['permissions', 'tools'] },
  { pattern: /driver|instalar|install/i, checks: ['tools', 'gpu'] },
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

  // If no specific checks matched, run the full doctor
  if (selected.size === 0) {
    return ALL_CHECKS;
  }

  return Array.from(selected);
}
