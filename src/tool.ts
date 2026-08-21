// Buffy Tool — Transport layer for external agents
//
// Thin adapter: query in → structured JSON out.
// NO diagnostic logic. NO action execution. NO reinterpretation.
// This is a transport layer, not a brain.

import { diagnose as coreDiagnose } from './core/diagnose.js';
import type { DiagnosticResponse, Observability } from './core/diagnose.js';
import type { PlatformAdapter, PlatformName } from './core/types.js';
import { getActionIds } from './core/action-registry.js';

// ─── Types ─────────────────────────────────────────────────

export interface BuffyToolResponse extends DiagnosticResponse {
  /** Tool identifier for versioning */
  tool: 'buffy';
  /** Schema version for contract identification */
  schemaVersion: '0.8';
}

export interface BuffyCapabilities {
  tool: 'buffy';
  schemaVersion: '0.8';
  /** Available check domains */
  checks: string[];
  /** Available action IDs */
  actions: string[];
  /** Supported platforms */
  platforms: PlatformName[];
  /** What this tool does (for Gemma context) */
  description: string;
}

export interface BuffyVersion {
  tool: 'buffy';
  schemaVersion: '0.8';
  version: string;
  /** Which pipeline modules are active */
  modules: string[];
}

// ─── Static data (no system access) ────────────────────────

const AVAILABLE_CHECKS = [
  'cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes',
  'network', 'os',
];

const AVAILABLE_PLATFORMS: PlatformName[] = [
  'windows', 'linux', 'android-termux',
];

const MODULES = [
  'check-selector v0.5-B',
  'context-scorer v0.6',
  'fragment-splitter v0.6',
  'entity-modifier v0.6',
  'action-mapper v0.8',
  'action-registry v0.8',
  'diagnose pipeline v0.8',
];

// ─── Tool operations ───────────────────────────────────────

/**
 * Diagnose: observe system + recommend actions.
 * NEVER executes actions. Pure transport to canonical pipeline.
 */
export async function diagnose(
  adapter: PlatformAdapter,
  query: string,
): Promise<BuffyToolResponse> {
  const result = await coreDiagnose(adapter, query);

  return {
    ...result,
    tool: 'buffy',
    schemaVersion: '0.8',
  };
}

/**
 * Capabilities: declarative info about what Buffy can do.
 * Does NOT touch the system. Pure static data.
 */
export function capabilities(): BuffyCapabilities {
  return {
    tool: 'buffy',
    schemaVersion: '0.8',
    checks: AVAILABLE_CHECKS,
    actions: getActionIds(),
    platforms: AVAILABLE_PLATFORMS,
    description: 'Asistente técnico de diagnóstico. Analiza el sistema, detecta problemas y recomienda acciones con instrucciones específicas por plataforma.',
  };
}

/**
 * Version: static build info.
 * Does NOT touch the system.
 */
export function version(): BuffyVersion {
  return {
    tool: 'buffy',
    schemaVersion: '0.8',
    version: '0.8.0',
    modules: MODULES,
  };
}
