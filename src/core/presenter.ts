// Buffy Next — Presenter
// Formats output for human display and JSON

import type { DoctorReport, DiagnosticItem, Capability, ActionResult, PlatformInfo, SystemInfo, CheckResult, RecommendedAction } from './types.js';
import type { DiagnosticResponse } from './diagnose.js';

// ─── Colors ─────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const E = {
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
};

// ─── Greeting ───────────────────────────────────────────────

export function renderGreeting(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${C.bold}Hola, soy Buffy.${C.reset}`);
  lines.push('');
  lines.push('Soy tu asistente técnico. Puedo revisar tu sistema, detectar');
  lines.push('problemas y ayudarte a solucionarlos.');
  lines.push('');
  lines.push(renderSeparator());
  lines.push(`  ${E.clip} Tu sistema`);
  lines.push(renderSeparator());

  // Platform summary
  lines.push(`  ${report.platform.os} · ${report.system.cpu.model}`);
  lines.push(`  RAM: ${report.system.memory.totalGB} GB · GPU: ${report.system.gpu.name}`);

  // Problems
  const problems = report.items.filter(i => i.severity !== 'ok');
  if (problems.length > 0) {
    lines.push('');
    lines.push(renderSeparator());
    lines.push(`  ${E.warn} Problemas detectados`);
    lines.push(renderSeparator());
    for (const item of problems) {
      lines.push(`  ${severityIcon(item.severity)} ${item.message}`);
      if (item.explanation) {
        lines.push(`     ${C.dim}${item.explanation}${C.reset}`);
      }
    }
  }

  // Capabilities
  const installed = report.capabilities.filter(c => c.status === 'installed');
  lines.push('');
  lines.push(renderSeparator());
  lines.push(`  ${E.rocket} Qué puedo hacer`);
  lines.push(renderSeparator());
  lines.push(`  ${E.ok} Diagnosticar tu sistema`);
  lines.push(`  ${E.ok} Detectar problemas comunes`);
  if (installed.some(c => c.name === 'winget' || c.name === 'pkg')) {
    lines.push(`  ${E.ok} Instalar herramientas (con tu permiso)`);
  }
  lines.push(`  ${E.ok} Aplicar configuraciones (con tu permiso)`);

  lines.push('');
  lines.push(`Usa: buffy doctor | buffy diagnose "tu problema" | buffy setup`);
  lines.push('');

  return lines.join('\n');
}

// ─── Doctor Report ──────────────────────────────────────────

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${C.bold}${E.clip} Doctor — Auditoría del sistema${C.reset}`);
  lines.push('');

  // Group items by category
  const categories = new Map<string, DiagnosticItem[]>();
  for (const item of report.items) {
    const cat = item.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(item);
  }

  for (const [category, items] of categories) {
    lines.push(`${C.cyan}${category}${C.reset}`);
    for (const item of items) {
      const icon = severityIcon(item.severity);
      lines.push(`  ${icon} ${item.message}`);
    }
    lines.push('');
  }

  // Summary
  const ok = report.items.filter(i => i.severity === 'ok').length;
  const warn = report.items.filter(i => i.severity === 'warning').length;
  const err = report.items.filter(i => i.severity === 'error').length;
  lines.push(`${C.green}✅ OK: ${ok}${C.reset}  ${C.yellow}⚠️  Advertencias: ${warn}${C.reset}  ${C.red}❌ Errores: ${err}${C.reset}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Diagnostic Report ──────────────────────────────────────

export function renderDiagnosticReport(items: DiagnosticItem[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${C.bold}🔍 Diagnosticando...${C.reset}`);
  lines.push('');

  for (const item of items) {
    const icon = severityIcon(item.severity);
    lines.push(`  ${icon} ${item.message}`);
    if (item.explanation) {
      lines.push(`     ${C.dim}${item.explanation}${C.reset}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Proposal ───────────────────────────────────────────────

export function renderProposal(action: { name: string; description: string; level: string; reversible: boolean; dryRun?: string }): string {
  const lines: string[] = [];

  lines.push(`${C.bold}${E.heart} Propuesta${C.reset}`);
  lines.push('');
  lines.push(`${action.name}`);
  lines.push(`  ${action.description}`);
  lines.push('');
  lines.push(`  Nivel: ${action.level.toUpperCase()} · Reversible: ${action.reversible ? 'Sí' : 'No'}`);
  if (action.dryRun) {
    lines.push(`  Acción: ${action.dryRun}`);
  }
  lines.push('');
  lines.push(`¿Me autorizas? [sí/no]`);
  lines.push('');

  return lines.join('\n');
}

// ─── Action Result ──────────────────────────────────────────

export function renderActionResult(result: ActionResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(`${E.gear} ${result.message}`);
    lines.push(`${E.ok} Listo.`);
  } else {
    lines.push(`${E.err} ${result.message}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Capabilities Report ────────────────────────────────────

export function renderCapabilities(capabilities: Capability[]): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${C.bold}${E.rocket} Capacidades${C.reset}`);
  lines.push('');

  const installed = capabilities.filter(c => c.status === 'installed');
  const missing = capabilities.filter(c => c.status === 'missing');

  if (installed.length > 0) {
    lines.push(`${C.green}Instalado:${C.reset}`);
    for (const c of installed) {
      lines.push(`  ${E.ok} ${c.name}${c.version ? ` (${c.version})` : ''}`);
    }
    lines.push('');
  }

  if (missing.length > 0) {
    lines.push(`${C.yellow}Faltante:${C.reset}`);
    for (const c of missing) {
      lines.push(`  ${E.warn} ${c.name}${c.description ? ` — ${c.description}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Helpers ────────────────────────────────────────────────

function severityIcon(severity: string): string {
  switch (severity) {
    case 'ok': return E.ok;
    case 'warning': return E.warn;
    case 'error': return E.err;
    default: return E.info;
  }
}

function renderSeparator(): string {
  return `${C.dim}${'━'.repeat(40)}${C.reset}`;
}

// ─── Diagnostic Response (v0.8) ───────────────────────────

export function renderDiagnosticResponse(response: DiagnosticResponse): string {
  const lines: string[] = [];

  // Selection summary
  lines.push('');
  lines.push(`${C.bold}🔍 Diagnosticando: ${C.cyan}"${response.query}"${C.reset}`);
  lines.push('');
  lines.push(`  Checks: ${response.selection.checks.join(', ') || '(ninguno)'}`);
  lines.push(`  Confianza: ${response.selection.confidence}`);
  if (response.selection.ambiguous) {
    lines.push(`  ${C.yellow}⚠  Selección ambigua${C.reset}`);
  }
  lines.push('');

  // Observations
  lines.push(`${C.bold}📋 Observaciones${C.reset}`);
  lines.push(renderSeparator());
  for (const obs of response.observations) {
    const icon = severityIcon(obs.severity);
    lines.push(`  ${icon} ${obs.message}`);
    if (obs.explanation) {
      lines.push(`     ${C.dim}${obs.explanation}${C.reset}`);
    }
  }
  lines.push('');

  // Actions
  if (response.actions.length > 0) {
    lines.push(`${C.bold}🎯 Acciones recomendadas${C.reset}`);
    lines.push(renderSeparator());
    for (const action of response.actions) {
      const confIcon = action.confidence === 'high' ? E.ok
        : action.confidence === 'medium' ? E.warn
        : E.info;
      lines.push(`  ${confIcon} ${action.recommended}`);
      lines.push(`     ${C.dim}Observado: ${action.observed}${C.reset}`);
      lines.push(`     ${C.dim}Inferido: ${action.inferred}${C.reset}`);

      // Platform-specific instructions
      const platformInst = action.instructions.find(i =>
        i.platform === response.platform,
      );
      if (platformInst) {
        if (platformInst.status === 'verified') {
          if (platformInst.ui_path) {
            lines.push(`     ${C.green}📍 ${platformInst.ui_path}${C.reset}`);
          }
          if (platformInst.command) {
            lines.push(`     ${C.green}💻 ${platformInst.command}${C.reset}`);
          }
        } else if (platformInst.status === 'partial') {
          lines.push(`     ${C.yellow}⚠  Pasos parciales disponibles${C.reset}`);
        } else {
          lines.push(`     ${C.dim}ℹ  Sin instrucciones verificadas para esta plataforma${C.reset}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push(`${C.dim}No se recomiendan acciones para esta consulta.${C.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── JSON output ────────────────────────────────────────────

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
