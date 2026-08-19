// Buffy Next — Format utilities
// Colors, separators, and text formatting

export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

export const icons = {
  ok: '✅',
  warn: '⚠️ ',
  err: '❌',
  info: 'ℹ️ ',
  tool: '🛠️ ',
  gear: '🔧',
  temp: '🌡️ ',
  clip: '📋',
  heart: '💡',
  rocket: '🎯',
} as const;

export function separator(): string {
  return `${colors.dim}${'━'.repeat(40)}${colors.reset}`;
}

export function severityIcon(severity: string): string {
  switch (severity) {
    case 'ok': return icons.ok;
    case 'warning': return icons.warn;
    case 'error': return icons.err;
    default: return icons.info;
  }
}

export function formatGB(gb: number): string {
  return `${gb} GB`;
}

export function formatPercent(pct: number): string {
  return `${pct}%`;
}
