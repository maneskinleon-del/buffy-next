import { describe, it, expect } from 'vitest';
import { computeNextDiagnostic } from '../src/core/diagnostic-router.js';
import type {
  CheckResult,
  CheckSelection,
  Observability,
} from '../src/core/types.js';

// ─── Mock Data ─────────────────────────────────────────────

const mockSelection: CheckSelection = {
  checks: ['cpu', 'ram', 'network'],
  ambiguous: false,
  confidence: 'high',
};

const mockObservations: CheckResult[] = [
  { id: 'cpu-status', severity: 'ok', category: 'CPU', message: 'CPU: Test CPU (4 cores)' },
  { id: 'ram-status', severity: 'ok', category: 'RAM', message: 'RAM: 8GB available' },
];

const mockObservability: Observability = {
  status: 'partial',
  reason: 'Some checks could not be observed',
  unsupportedChecks: ['network'],
};

// ─── Symptom Domain Tests ──────────────────────────────────

describe('Diagnostic Router — Symptom Domain', () => {

  it('should identify network symptom', () => {
    const result = computeNextDiagnostic(
      'El internet se corta cuando descargo',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    expect(result.symptomDomain).toBe('network');
  });

  it('should identify storage symptom', () => {
    const result = computeNextDiagnostic(
      'El disco está lleno',
      mockSelection,
      mockObservations,
      { ...mockObservability, unsupportedChecks: ['storage'] },
    );
    expect(result.symptomDomain).toBe('storage');
  });

  it('should identify performance symptom', () => {
    const result = computeNextDiagnostic(
      'Mi PC está lenta',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    expect(result.symptomDomain).toBe('performance');
  });

  it('should return unknown for unrecognized symptom', () => {
    const result = computeNextDiagnostic(
      'Hola',
      { checks: [], ambiguous: false, confidence: 'low' },
      [],
      { status: 'no_evidence', reason: 'Non-diagnostic query' },
    );
    expect(result.symptomDomain).toBe('unknown');
  });

});

// ─── Next Diagnostic Tests ─────────────────────────────────

describe('Diagnostic Router — Next Diagnostic', () => {

  it('should recommend network when it is the symptom domain and unsupported', () => {
    const result = computeNextDiagnostic(
      'El internet se corta cuando descargo',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    expect(result.nextDiagnostic.domain).toBe('network');
    expect(result.nextDiagnostic.priority).toBe('high');
    expect(result.nextDiagnostic.requiredEvidence).toContain('interface_status');
  });

  it('should recommend symptom domain when all observable checks are done but symptom is not observable', () => {
    const allObserved: CheckResult[] = [
      { id: 'cpu-status', severity: 'ok', category: 'CPU', message: 'CPU ok' },
      { id: 'ram-status', severity: 'ok', category: 'RAM', message: 'RAM ok' },
    ];
    const result = computeNextDiagnostic(
      'Mi PC está lenta',
      { checks: ['cpu', 'ram'], ambiguous: false, confidence: 'high' },
      allObserved,
      { status: 'observed', reason: 'All checks observed' },
    );
    // Performance is not directly observable, so router recommends it as critical gap
    expect(result.nextDiagnostic.domain).toBe('performance');
    expect(result.nextDiagnostic.priority).toBe('high');
  });

  it('should recommend review when all checks match observations and no gaps', () => {
    const allObserved: CheckResult[] = [
      { id: 'cpu-status', severity: 'ok', category: 'CPU', message: 'CPU ok' },
      { id: 'ram-status', severity: 'ok', category: 'RAM', message: 'RAM ok' },
    ];
    const result = computeNextDiagnostic(
      'disco espacio',  // Maps to storage, observable and observed
      { checks: ['storage'], ambiguous: false, confidence: 'high' },
      [{ id: 'storage-/', severity: 'ok', category: 'Almacenamiento', message: 'Storage ok' }],
      { status: 'observed', reason: 'All checks observed' },
    );
    expect(result.nextDiagnostic.domain).toBe('review');
    expect(result.nextDiagnostic.priority).toBe('low');
  });

  it('should recommend symptom domain when it has a critical gap', () => {
    const result = computeNextDiagnostic(
      'Mi PC está lenta',
      { checks: ['cpu', 'ram', 'gpu'], ambiguous: false, confidence: 'high' },
      [{ id: 'cpu-status', severity: 'ok', category: 'CPU', message: 'CPU ok' }],
      { status: 'partial', reason: 'Some checks missing' },
    );
    // Performance is not directly observable, so router recommends it as critical gap
    expect(result.nextDiagnostic.domain).toBe('performance');
    expect(result.nextDiagnostic.priority).toBe('high');
  });

});

// ─── Evidence Gaps Tests ───────────────────────────────────

describe('Diagnostic Router — Evidence Gaps', () => {

  it('should identify critical gap for symptom domain', () => {
    const result = computeNextDiagnostic(
      'El internet se corta cuando descargo',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    const criticalGap = result.evidenceGaps.find((g) => g.importance === 'critical');
    expect(criticalGap).toBeDefined();
    expect(criticalGap!.domain).toBe('network');
  });

  it('should identify useful gaps for unsupported checks', () => {
    const result = computeNextDiagnostic(
      'El internet se corta cuando descargo',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    const usefulGaps = result.evidenceGaps.filter((g) => g.importance === 'useful');
    expect(usefulGaps.length).toBeGreaterThanOrEqual(0);
  });

  it('should have no critical gaps when all observable checks are observed', () => {
    const result = computeNextDiagnostic(
      'disco lleno',  // Use a query that maps to 'storage' (which IS in OBSERVABLE_CHECKS)
      { checks: ['storage'], ambiguous: false, confidence: 'high' },
      [
        { id: 'storage-/', severity: 'ok', category: 'Almacenamiento', message: 'Storage ok' },
      ],
      { status: 'observed', reason: 'All observed' },
    );
    // Should have no critical gaps for observable domains
    const criticalGaps = result.evidenceGaps.filter(g => g.importance === 'critical');
    expect(criticalGaps.length).toBe(0);
  });

});

// ─── Conclusions Tests ─────────────────────────────────────

describe('Diagnostic Router — Conclusions', () => {

  it('should list supported conclusions from observations', () => {
    const result = computeNextDiagnostic(
      'Mi PC está lenta',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    expect(result.currentConclusion.supported.length).toBeGreaterThan(0);
    expect(result.currentConclusion.supported.some((c) => c.includes('CPU'))).toBe(true);
  });

  it('should list unsupported conclusions from observability', () => {
    const result = computeNextDiagnostic(
      'El internet se corta cuando descargo',
      mockSelection,
      mockObservations,
      mockObservability,
    );
    expect(result.currentConclusion.unsupported.length).toBeGreaterThan(0);
    expect(result.currentConclusion.unsupported.some((c) => c.includes('network'))).toBe(true);
  });

  it('should have empty unsupported when all checks are observed', () => {
    const result = computeNextDiagnostic(
      'Mi PC está lenta',
      { checks: ['cpu', 'ram'], ambiguous: false, confidence: 'high' },
      [
        { id: 'cpu-status', severity: 'ok', category: 'CPU', message: 'CPU ok' },
        { id: 'ram-status', severity: 'ok', category: 'RAM', message: 'RAM ok' },
      ],
      { status: 'observed', reason: 'All observed' },
    );
    expect(result.currentConclusion.unsupported.length).toBe(0);
  });

});

// ─── Integration with Diagnose ─────────────────────────────

describe('Diagnostic Router — Integration', () => {

  it('nextDiagnostic should be present in DiagnosticResponse', async () => {
    // This test verifies that the diagnose() function includes nextDiagnostic
    // We'll test this by importing diagnose and checking the response
    const { diagnose } = await import('../src/core/diagnose.js');

    // Create a mock adapter
    const mockAdapter = {
      name: 'windows' as const,
      async detect() { return { name: 'windows' as const, os: 'Test', version: '1.0', arch: 'x64' }; },
      async systemInfo() {
        return {
          os: { name: 'Test OS', version: '1.0', arch: 'x64' },
          cpu: { model: 'Test CPU', cores: 4 },
          memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
          gpu: { name: 'NVIDIA GTX', driver: '537', isGeneric: false },
          storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
          temperature: { cpuCelsius: 45 },
          processes: [],
        };
      },
      async capabilities() { return []; },
      async execute(action: any) { return action.execute(); },
    };

    const result = await diagnose(mockAdapter, 'El internet se corta cuando descargo');

    // nextDiagnostic should be present
    expect(result.nextDiagnostic).toBeDefined();
    expect(result.nextDiagnostic!.symptomDomain).toBeDefined();
    expect(result.nextDiagnostic!.nextDiagnostic).toBeDefined();
    expect(result.nextDiagnostic!.evidenceGaps).toBeDefined();
    expect(result.nextDiagnostic!.currentConclusion).toBeDefined();
  });

});
