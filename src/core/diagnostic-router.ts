// Buffy Next — Diagnostic Router (v0.9)
// Determines the next best diagnostic check based on symptom and available evidence
//
// This is a DETERMINISTIC component, not an LLM.
// It answers: "Given what we know and what we can check, what should we check next?"

import type {
  CheckResult,
  CheckSelection,
  Observability,
  DiagnosticRouting,
  NextDiagnostic,
  EvidenceGap,
  DiagnosticConclusions,
} from './types.js';

// ─── Symptom Domain Mapping ────────────────────────────────

interface SymptomPattern {
  /** Regex pattern to match symptom keywords */
  pattern: RegExp;
  /** Domain this symptom concerns */
  domain: string;
  /** Priority of this domain for this symptom */
  priority: 'high' | 'medium' | 'low';
  /** What evidence would be needed */
  requiredEvidence: string[];
}

const SYMPTOM_PATTERNS: SymptomPattern[] = [
  {
    pattern: /internet|red|wifi|conexi[oó]n|network|dns|descarga|download/i,
    domain: 'network',
    priority: 'high',
    requiredEvidence: ['interface_status', 'packet_loss', 'latency', 'throughput'],
  },
  {
    pattern: /disco|lleno|almacenamiento|space|espacio|install|instalar/i,
    domain: 'storage',
    priority: 'high',
    requiredEvidence: ['disk_space', 'io_usage'],
  },
  {
    pattern: /lent[oa]?|lag|slow|rendimiento|performance|congela|traba/i,
    domain: 'performance',
    priority: 'medium',
    requiredEvidence: ['cpu_usage', 'memory_usage', 'process_list'],
  },
  {
    pattern: /calien|temperatura|thermal|heat|overheat/i,
    domain: 'temperature',
    priority: 'high',
    requiredEvidence: ['cpu_temp', 'fan_speed'],
  },
  {
    pattern: /ram|memoria|memory/i,
    domain: 'memory',
    priority: 'medium',
    requiredEvidence: ['memory_usage', 'process_memory'],
  },
  {
    pattern: /gpu|tarjeta|video|driver|pantalla/i,
    domain: 'gpu',
    priority: 'medium',
    requiredEvidence: ['gpu_driver', 'gpu_usage'],
  },
  {
    pattern: /proceso|procesos|app|aplicaci[oó]n|servicio|virus/i,
    domain: 'processes',
    priority: 'medium',
    requiredEvidence: ['process_list', 'cpu_usage'],
  },
];

// ─── Observable Checks ─────────────────────────────────────

const OBSERVABLE_CHECKS = new Set([
  'cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes',
]);

// ─── Main Router Function ──────────────────────────────────

/**
 * Determine the next best diagnostic check.
 *
 * @param query - User's symptom description
 * @param selection - What checks were selected
 * @param observations - What was observed
 * @param observability - What couldn't be observed
 * @returns Diagnostic routing recommendation
 */
export function computeNextDiagnostic(
  query: string,
  selection: CheckSelection,
  observations: CheckResult[],
  observability: Observability,
): DiagnosticRouting {
  // 1. Identify symptom domain
  const symptomDomain = identifySymptomDomain(query);

  // 2. Check what's observable vs what's needed
  const evidenceGaps = computeEvidenceGaps(
    symptomDomain,
    selection.checks,
    observations,
    observability,
  );

  // 3. Determine next diagnostic
  const nextDiagnostic = determineNextCheck(
    symptomDomain,
    selection.checks,
    observations,
    observability,
    evidenceGaps,
  );

  // 4. Compute current conclusions
  const currentConclusion = computeConclusions(observations, observability);

  return {
    symptomDomain: symptomDomain?.domain || 'unknown',
    nextDiagnostic,
    evidenceGaps,
    currentConclusion,
  };
}

// ─── Symptom Domain Identification ─────────────────────────

function identifySymptomDomain(
  query: string,
): SymptomPattern | null {
  for (const pattern of SYMPTOM_PATTERNS) {
    if (pattern.pattern.test(query)) {
      return pattern;
    }
  }
  return null;
}

// ─── Evidence Gap Analysis ─────────────────────────────────

function computeEvidenceGaps(
  symptomDomain: SymptomPattern | null,
  selectedChecks: string[],
  observations: CheckResult[],
  observability: Observability,
): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];

  // Check if symptom domain is unsupported
  if (symptomDomain) {
    const isSupported = OBSERVABLE_CHECKS.has(symptomDomain.domain);
    // Check both category name AND observation IDs for a match
    const isObserved = observations.some(
      (o) => o.category.toLowerCase() === symptomDomain.domain
        || o.id.toLowerCase().includes(symptomDomain.domain),
    );

    if (!isSupported || !isObserved) {
      gaps.push({
        domain: symptomDomain.domain,
        importance: 'critical',
        reason: `User symptom concerns ${symptomDomain.domain} but no evidence is available`,
      });
    }
  }

  // Check for other unsupported domains
  if (observability.unsupportedChecks) {
    for (const check of observability.unsupportedChecks) {
      if (!gaps.some((g) => g.domain === check)) {
        gaps.push({
          domain: check,
          importance: 'useful',
          reason: `${check} could not be checked but may be relevant`,
        });
      }
    }
  }

  return gaps;
}

// ─── Next Check Determination ──────────────────────────────

function determineNextCheck(
  symptomDomain: SymptomPattern | null,
  selectedChecks: string[],
  observations: CheckResult[],
  observability: Observability,
  evidenceGaps: EvidenceGap[],
): NextDiagnostic {
  // If we have a symptom domain with a critical gap, that's the priority
  const criticalGap = evidenceGaps.find((g) => g.importance === 'critical');
  if (criticalGap && symptomDomain) {
    return {
      domain: criticalGap.domain,
      check: `${criticalGap.domain}_diagnostic`,
      reason: `User symptom concerns ${criticalGap.domain} behavior and no ${criticalGap.domain} evidence is available`,
      priority: 'high',
      requiredEvidence: symptomDomain.requiredEvidence,
    };
  }

  // If we have observable checks that haven't been run, suggest those
  const observableNotRun = selectedChecks.filter(
    (check) =>
      OBSERVABLE_CHECKS.has(check) &&
      !observations.some((o) => o.id.includes(check)),
  );

  if (observableNotRun.length > 0) {
    return {
      domain: observableNotRun[0],
      check: `${observableNotRun[0]}_check`,
      reason: `${observableNotRun[0]} check was selected but not yet performed`,
      priority: 'medium',
      requiredEvidence: [`${observableNotRun[0]}_status`],
    };
  }

  // If all checks are done, suggest review
  return {
    domain: 'review',
    check: 'full_review',
    reason: 'All selected checks have been performed. Review results for next steps.',
    priority: 'low',
    requiredEvidence: [],
  };
}

// ─── Conclusion Computation ────────────────────────────────

function computeConclusions(
  observations: CheckResult[],
  observability: Observability,
): DiagnosticConclusions {
  const supported: string[] = [];
  const uncertain: string[] = [];
  const unsupported: string[] = [];

  // Observations become supported conclusions
  for (const obs of observations) {
    if (obs.severity === 'ok') {
      supported.push(`${obs.category}: healthy`);
    } else if (obs.severity === 'warning') {
      supported.push(`${obs.category}: warning - ${obs.message}`);
    } else if (obs.severity === 'error') {
      supported.push(`${obs.category}: error - ${obs.message}`);
    }
  }

  // Unsupported checks become unsupported conclusions
  if (observability.unsupportedChecks) {
    for (const check of observability.unsupportedChecks) {
      unsupported.push(`${check}: no evidence available`);
    }
  }

  // Selected but not observed checks are uncertain
  if (observability.status === 'partial') {
    uncertain.push('Some diagnostic areas could not be fully assessed');
  }

  return { supported, uncertain, unsupported };
}
