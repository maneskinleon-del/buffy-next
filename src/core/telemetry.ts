// Buffy Next — Telemetry (Observability & Operational Hardening)
// Minimal telemetry without heavy dependencies.
// No PII or sensitive data stored.

import type { CheckResult, GatedResult } from './types.js';
import type { AuditTrail } from './diagnose.js';

// ─── Types ─────────────────────────────────────────────────

export interface RequestMetrics {
  timestamp: string;
  query: string;
  queryType: 'factual' | 'dynamic' | 'stale' | 'unknown' | 'open';
  fieldsSelected: string[];
  fieldsOmitted: string[];
  staleFields: string[];
  refreshRequested: string[];
  refreshSuccess: string[];
  refreshLatencyMs: number;
  contextBytes: number;
  modelLatencyMs: number;
  totalLatencyMs: number;
  unsupportedClaims: number;
}

export interface FreshnessTelemetry {
  field: string;
  observedAt: string;
  ageMs: number;
  epistemicState: string;
  refreshRequired: boolean;
  refreshPerformed: boolean;
}

export interface ErrorRecord {
  timestamp: string;
  category: ErrorCategory;
  message: string;
  query: string;
  platform: string;
  model: string;
  input: unknown;
  expected: unknown;
  actual: unknown;
  trace: string;
}

export type ErrorCategory =
  | 'OBSERVATION_ERROR'
  | 'FRESHNESS_ERROR'
  | 'REFRESH_ERROR'
  | 'SELECTION_ERROR'
  | 'CONTEXT_ERROR'
  | 'MODEL_ERROR'
  | 'PLATFORM_ERROR'
  | 'EXECUTION_ERROR';

export interface PerformanceBaseline {
  observationLatencyMs: number;
  selectionLatencyMs: number;
  freshnessLatencyMs: number;
  refreshLatencyMs: number;
  contextLatencyMs: number;
  modelLatencyMs: number;
  totalLatencyMs: number;
}

// ─── In-memory telemetry store ─────────────────────────────

const requestMetrics: RequestMetrics[] = [];
const freshnessTelemetry: FreshnessTelemetry[] = [];
const errorRecords: ErrorRecord[] = [];
const performanceBaselines: PerformanceBaseline[] = [];

const MAX_STORE_SIZE = 1000;

// ─── Request Metrics ───────────────────────────────────────

/**
 * Record request metrics for a diagnosis.
 */
export function recordRequestMetrics(metrics: RequestMetrics): void {
  requestMetrics.push(metrics);
  if (requestMetrics.length > MAX_STORE_SIZE) {
    requestMetrics.shift();
  }
}

/**
 * Build request metrics from diagnosis results.
 */
export function buildRequestMetrics(
  query: string,
  selection: { checks: string[] },
  gating: GatedResult,
  observations: CheckResult[],
  audit: AuditTrail,
  totalLatencyMs: number,
): RequestMetrics {
  const selectedFields = selection.checks;
  const omittedFields = gating.omittedStale;
  const staleFields = gating.instrumentation
    .filter(i => i.epistemicStateBefore === 'stale')
    .map(i => i.field);
  const refreshRequested = gating.instrumentation
    .filter(i => i.refreshRequired)
    .map(i => i.field);
  const refreshSuccess = gating.instrumentation
    .filter(i => i.refreshPerformed)
    .map(i => i.field);

  // Determine query type
  const queryType = classifyQueryType(query);

  return {
    timestamp: new Date().toISOString(),
    query,
    queryType,
    fieldsSelected: selectedFields,
    fieldsOmitted: omittedFields,
    staleFields,
    refreshRequested,
    refreshSuccess,
    refreshLatencyMs: 0, // Calculated separately
    contextBytes: audit.contextBytes,
    modelLatencyMs: 0, // Calculated separately
    totalLatencyMs,
    unsupportedClaims: audit.unsupportedClaims,
  };
}

/**
 * Classify query type based on content.
 */
function classifyQueryType(query: string): RequestMetrics['queryType'] {
  const q = query.toLowerCase();

  // Stale indicators
  if (/stale|old|old|antigu|desactualiz/.test(q)) return 'stale';

  // Unknown indicators
  if (/unknown|no sé|no disponible|no tengo/.test(q)) return 'unknown';

  // Dynamic indicators
  if (/ahora|actual|current|now|estado/.test(q)) return 'dynamic';

  // Factual indicators
  if (/cuánto|cuánta|cuántos|how much|how many|cuál/.test(q)) return 'factual';

  // Default: open
  return 'open';
}

/**
 * Get all recorded request metrics.
 */
export function getRequestMetrics(): RequestMetrics[] {
  return [...requestMetrics];
}

// ─── Freshness Telemetry ───────────────────────────────────

/**
 * Record freshness telemetry for a field.
 */
export function recordFreshnessTelemetry(telemetry: FreshnessTelemetry): void {
  freshnessTelemetry.push(telemetry);
  if (freshnessTelemetry.length > MAX_STORE_SIZE) {
    freshnessTelemetry.shift();
  }
}

/**
 * Build freshness telemetry from gating results.
 */
export function buildFreshnessTelemetry(gating: GatedResult): FreshnessTelemetry[] {
  return gating.instrumentation.map(instr => ({
    field: instr.field,
    observedAt: '', // Will be filled by caller
    ageMs: instr.ageMsAfter,
    epistemicState: instr.epistemicStateAfter,
    refreshRequired: instr.refreshRequired,
    refreshPerformed: instr.refreshPerformed,
  }));
}

/**
 * Get all recorded freshness telemetry.
 */
export function getFreshnessTelemetry(): FreshnessTelemetry[] {
  return [...freshnessTelemetry];
}

/**
 * Analyze freshness telemetry to find most stale fields.
 */
export function analyzeFreshnessPatterns(): {
  mostStaleFields: Array<{ field: string; count: number }>;
  mostRefreshedFields: Array<{ field: string; count: number }>;
  staleRate: number;
} {
  const staleCount: Record<string, number> = {};
  const refreshCount: Record<string, number> = {};

  for (const t of freshnessTelemetry) {
    if (t.epistemicState === 'stale') {
      staleCount[t.field] = (staleCount[t.field] || 0) + 1;
    }
    if (t.refreshPerformed) {
      refreshCount[t.field] = (refreshCount[t.field] || 0) + 1;
    }
  }

  const mostStaleFields = Object.entries(staleCount)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  const mostRefreshedFields = Object.entries(refreshCount)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  const totalFields = freshnessTelemetry.length;
  const staleFields = freshnessTelemetry.filter(t => t.epistemicState === 'stale').length;
  const staleRate = totalFields > 0 ? staleFields / totalFields : 0;

  return { mostStaleFields, mostRefreshedFields, staleRate };
}

// ─── Error Records ─────────────────────────────────────────

/**
 * Record an error.
 */
export function recordError(error: ErrorRecord): void {
  errorRecords.push(error);
  if (errorRecords.length > MAX_STORE_SIZE) {
    errorRecords.shift();
  }
}

/**
 * Get all recorded errors.
 */
export function getErrorRecords(): ErrorRecord[] {
  return [...errorRecords];
}

/**
 * Get errors by category.
 */
export function getErrorsByCategory(category: ErrorCategory): ErrorRecord[] {
  return errorRecords.filter(e => e.category === category);
}

// ─── Performance Baselines ─────────────────────────────────

/**
 * Record a performance baseline measurement.
 */
export function recordPerformanceBaseline(baseline: PerformanceBaseline): void {
  performanceBaselines.push(baseline);
  if (performanceBaselines.length > MAX_STORE_SIZE) {
    performanceBaselines.shift();
  }
}

/**
 * Get average performance baseline.
 */
export function getAveragePerformanceBaseline(): PerformanceBaseline | null {
  if (performanceBaselines.length === 0) return null;

  const avg = performanceBaselines.reduce(
    (acc, b) => ({
      observationLatencyMs: acc.observationLatencyMs + b.observationLatencyMs,
      selectionLatencyMs: acc.selectionLatencyMs + b.selectionLatencyMs,
      freshnessLatencyMs: acc.freshnessLatencyMs + b.freshnessLatencyMs,
      refreshLatencyMs: acc.refreshLatencyMs + b.refreshLatencyMs,
      contextLatencyMs: acc.contextLatencyMs + b.contextLatencyMs,
      modelLatencyMs: acc.modelLatencyMs + b.modelLatencyMs,
      totalLatencyMs: acc.totalLatencyMs + b.totalLatencyMs,
    }),
    {
      observationLatencyMs: 0,
      selectionLatencyMs: 0,
      freshnessLatencyMs: 0,
      refreshLatencyMs: 0,
      contextLatencyMs: 0,
      modelLatencyMs: 0,
      totalLatencyMs: 0,
    },
  );

  const count = performanceBaselines.length;
  return {
    observationLatencyMs: avg.observationLatencyMs / count,
    selectionLatencyMs: avg.selectionLatencyMs / count,
    freshnessLatencyMs: avg.freshnessLatencyMs / count,
    refreshLatencyMs: avg.refreshLatencyMs / count,
    contextLatencyMs: avg.contextLatencyMs / count,
    modelLatencyMs: avg.modelLatencyMs / count,
    totalLatencyMs: avg.totalLatencyMs / count,
  };
}

// ─── Health Check ──────────────────────────────────────────

export interface HealthStatus {
  timestamp: string;
  platform: string;
  adapter: string;
  subsystems: {
    observation: 'ok' | 'error';
    freshness: 'ok' | 'error';
    actions: 'ok' | 'error';
    state: 'ok' | 'error';
  };
  metrics: {
    totalRequests: number;
    totalErrors: number;
    staleRate: number;
    averageLatencyMs: number;
  };
  version: string;
}

/**
 * Get current health status.
 */
export function getHealthStatus(
  platform: string,
  adapter: string,
): HealthStatus {
  const totalRequests = requestMetrics.length;
  const totalErrors = errorRecords.length;
  const patterns = analyzeFreshnessPatterns();
  const baseline = getAveragePerformanceBaseline();

  return {
    timestamp: new Date().toISOString(),
    platform,
    adapter,
    subsystems: {
      observation: totalErrors === 0 ? 'ok' : 'error',
      freshness: patterns.staleRate < 0.5 ? 'ok' : 'error',
      actions: 'ok',
      state: 'ok',
    },
    metrics: {
      totalRequests,
      totalErrors,
      staleRate: patterns.staleRate,
      averageLatencyMs: baseline?.totalLatencyMs ?? 0,
    },
    version: '2.4.0',
  };
}

// ─── Reset (for testing) ───────────────────────────────────

/**
 * Reset all telemetry data (for testing only).
 */
export function resetTelemetry(): void {
  requestMetrics.length = 0;
  freshnessTelemetry.length = 0;
  errorRecords.length = 0;
  performanceBaselines.length = 0;
}
