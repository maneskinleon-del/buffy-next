import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  recordRequestMetrics,
  buildRequestMetrics,
  getRequestMetrics,
  recordFreshnessTelemetry,
  buildFreshnessTelemetry,
  getFreshnessTelemetry,
  analyzeFreshnessPatterns,
  recordError,
  getErrorRecords,
  getErrorsByCategory,
  recordPerformanceBaseline,
  getAveragePerformanceBaseline,
  getHealthStatus,
  resetTelemetry,
} from '../src/core/telemetry.js';
import type { GatedResult, AuditTrail, FreshnessTelemetry } from '../src/core/types.js';

// ─── Helpers ───────────────────────────────────────────────

function createMockGating(overrides?: Partial<GatedResult>): GatedResult {
  return {
    included: [],
    refreshed: [],
    omittedStale: [],
    needsRefresh: [],
    instrumentation: [
      {
        field: 'ram-status',
        epistemicStateBefore: 'stale',
        refreshRequired: true,
        refreshPerformed: true,
        epistemicStateAfter: 'observed',
        ageMsAfter: 500,
        includedInContext: true,
      },
    ],
    ...overrides,
  };
}

function createMockAudit(overrides?: Partial<AuditTrail>): AuditTrail {
  return {
    query: 'test query',
    selectedFields: ['ram'],
    staleFields: ['ram-status'],
    refreshRequired: ['ram-status'],
    refreshPerformed: ['ram-status'],
    toolCalls: 0,
    contextBytes: 1024,
    latencyMs: 150,
    finalCorrect: true,
    unsupportedClaims: 0,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Telemetry — Request Metrics', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('should record request metrics', () => {
    const metrics = {
      timestamp: new Date().toISOString(),
      query: 'test query',
      queryType: 'factual' as const,
      fieldsSelected: ['ram'],
      fieldsOmitted: [],
      staleFields: [],
      refreshRequested: [],
      refreshSuccess: [],
      refreshLatencyMs: 0,
      contextBytes: 1024,
      modelLatencyMs: 100,
      totalLatencyMs: 150,
      unsupportedClaims: 0,
    };

    recordRequestMetrics(metrics);
    const stored = getRequestMetrics();

    expect(stored.length).toBe(1);
    expect(stored[0].query).toBe('test query');
  });

  it('should build request metrics from diagnosis results', () => {
    const gating = createMockGating();
    const audit = createMockAudit();

    const metrics = buildRequestMetrics(
      'chequea RAM',
      { checks: ['ram'] },
      gating,
      [],
      audit,
      150,
    );

    expect(metrics.query).toBe('chequea RAM');
    expect(metrics.fieldsSelected).toContain('ram');
    expect(metrics.staleFields).toContain('ram-status');
    expect(metrics.refreshRequested).toContain('ram-status');
    expect(metrics.refreshSuccess).toContain('ram-status');
  });

  it('should classify query types', () => {
    const gating = createMockGating();
    const audit = createMockAudit();

    const factual = buildRequestMetrics('¿Cuánta RAM tengo?', { checks: ['ram'] }, gating, [], audit, 100);
    expect(factual.queryType).toBe('factual');

    const dynamic = buildRequestMetrics('¿Cómo está mi CPU ahora?', { checks: ['cpu'] }, gating, [], audit, 100);
    expect(dynamic.queryType).toBe('dynamic');

    const open = buildRequestMetrics('Mi PC anda lenta', { checks: ['cpu', 'ram'] }, gating, [], audit, 100);
    expect(open.queryType).toBe('open');
  });

  it('should limit store size', () => {
    for (let i = 0; i < 1100; i++) {
      recordRequestMetrics({
        timestamp: new Date().toISOString(),
        query: `query ${i}`,
        queryType: 'open',
        fieldsSelected: [],
        fieldsOmitted: [],
        staleFields: [],
        refreshRequested: [],
        refreshSuccess: [],
        refreshLatencyMs: 0,
        contextBytes: 0,
        modelLatencyMs: 0,
        totalLatencyMs: 0,
        unsupportedClaims: 0,
      });
    }

    const stored = getRequestMetrics();
    expect(stored.length).toBe(1000);
  });
});

describe('Telemetry — Freshness', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('should record freshness telemetry', () => {
    const telemetry: FreshnessTelemetry = {
      field: 'ram-status',
      observedAt: new Date().toISOString(),
      ageMs: 500,
      epistemicState: 'observed',
      refreshRequired: true,
      refreshPerformed: true,
    };

    recordFreshnessTelemetry(telemetry);
    const stored = getFreshnessTelemetry();

    expect(stored.length).toBe(1);
    expect(stored[0].field).toBe('ram-status');
  });

  it('should build freshness telemetry from gating', () => {
    const gating = createMockGating();
    const telemetry = buildFreshnessTelemetry(gating);

    expect(telemetry.length).toBe(1);
    expect(telemetry[0].field).toBe('ram-status');
    expect(telemetry[0].epistemicState).toBe('observed');
    expect(telemetry[0].refreshRequired).toBe(true);
    expect(telemetry[0].refreshPerformed).toBe(true);
  });

  it('should analyze freshness patterns', () => {
    // Add some telemetry
    recordFreshnessTelemetry({
      field: 'ram-status',
      observedAt: '',
      ageMs: 500,
      epistemicState: 'stale',
      refreshRequired: true,
      refreshPerformed: true,
    });
    recordFreshnessTelemetry({
      field: 'cpu-status',
      observedAt: '',
      ageMs: 100,
      epistemicState: 'observed',
      refreshRequired: false,
      refreshPerformed: false,
    });
    recordFreshnessTelemetry({
      field: 'ram-status',
      observedAt: '',
      ageMs: 600,
      epistemicState: 'stale',
      refreshRequired: true,
      refreshPerformed: true,
    });

    const patterns = analyzeFreshnessPatterns();

    expect(patterns.mostStaleFields[0].field).toBe('ram-status');
    expect(patterns.mostStaleFields[0].count).toBe(2);
    expect(patterns.mostRefreshedFields[0].field).toBe('ram-status');
    expect(patterns.staleRate).toBe(2 / 3);
  });
});

describe('Telemetry — Errors', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('should record errors', () => {
    recordError({
      timestamp: new Date().toISOString(),
      category: 'OBSERVATION_ERROR',
      message: 'Failed to read CPU',
      query: 'test',
      platform: 'linux',
      model: 'minimax',
      input: null,
      expected: null,
      actual: null,
      trace: 'stack trace',
    });

    const errors = getErrorRecords();
    expect(errors.length).toBe(1);
    expect(errors[0].category).toBe('OBSERVATION_ERROR');
  });

  it('should filter errors by category', () => {
    recordError({
      timestamp: new Date().toISOString(),
      category: 'OBSERVATION_ERROR',
      message: 'Error 1',
      query: 'test',
      platform: 'linux',
      model: 'minimax',
      input: null,
      expected: null,
      actual: null,
      trace: '',
    });
    recordError({
      timestamp: new Date().toISOString(),
      category: 'FRESHNESS_ERROR',
      message: 'Error 2',
      query: 'test',
      platform: 'linux',
      model: 'minimax',
      input: null,
      expected: null,
      actual: null,
      trace: '',
    });

    const observationErrors = getErrorsByCategory('OBSERVATION_ERROR');
    expect(observationErrors.length).toBe(1);
    expect(observationErrors[0].message).toBe('Error 1');
  });
});

describe('Telemetry — Performance', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('should record performance baselines', () => {
    recordPerformanceBaseline({
      observationLatencyMs: 50,
      selectionLatencyMs: 10,
      freshnessLatencyMs: 5,
      refreshLatencyMs: 0,
      contextLatencyMs: 20,
      modelLatencyMs: 100,
      totalLatencyMs: 185,
    });

    const baseline = getAveragePerformanceBaseline();
    expect(baseline).not.toBeNull();
    expect(baseline!.observationLatencyMs).toBe(50);
    expect(baseline!.totalLatencyMs).toBe(185);
  });

  it('should calculate average baselines', () => {
    recordPerformanceBaseline({
      observationLatencyMs: 50,
      selectionLatencyMs: 10,
      freshnessLatencyMs: 5,
      refreshLatencyMs: 0,
      contextLatencyMs: 20,
      modelLatencyMs: 100,
      totalLatencyMs: 185,
    });
    recordPerformanceBaseline({
      observationLatencyMs: 60,
      selectionLatencyMs: 12,
      freshnessLatencyMs: 6,
      refreshLatencyMs: 0,
      contextLatencyMs: 22,
      modelLatencyMs: 110,
      totalLatencyMs: 210,
    });

    const baseline = getAveragePerformanceBaseline();
    expect(baseline!.observationLatencyMs).toBe(55);
    expect(baseline!.totalLatencyMs).toBe(197.5);
  });
});

describe('Telemetry — Health', () => {
  afterEach(() => {
    resetTelemetry();
  });

  it('should return health status', () => {
    const health = getHealthStatus('linux', 'LinuxAdapter');

    expect(health.timestamp).toBeDefined();
    expect(health.platform).toBe('linux');
    expect(health.adapter).toBe('LinuxAdapter');
    expect(health.subsystems.observation).toBe('ok');
    expect(health.subsystems.freshness).toBe('ok');
    expect(health.version).toBe('2.4.0');
  });

  it('should report error state when errors exist', () => {
    recordError({
      timestamp: new Date().toISOString(),
      category: 'OBSERVATION_ERROR',
      message: 'Test error',
      query: 'test',
      platform: 'linux',
      model: 'minimax',
      input: null,
      expected: null,
      actual: null,
      trace: '',
    });

    const health = getHealthStatus('linux', 'LinuxAdapter');
    expect(health.subsystems.observation).toBe('error');
    expect(health.metrics.totalErrors).toBe(1);
  });
});
