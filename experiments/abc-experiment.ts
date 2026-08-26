/**
 * Buffy A/B/C Experiment — 10 blind cases
 *
 * Modes:
 *   A = Gemma 2B solo (user → Gemma → response)
 *   B = Buffy solo (user → Buffy → JSON)
 *   C = Gemma + Buffy (user → Gemma → Buffy → Gemma → response)
 *
 * Buffy is FROZEN at 4ac9f68. Do NOT modify during experiment.
 *
 * Run: npx tsx experiments/abc-experiment.ts
 */

import { diagnose, capabilities, version } from '../src/tool.js';
import { createAdapter } from '../src/adapters/index.js';
import type { BuffyToolResponse } from '../src/tool.js';

// ─── Cases ─────────────────────────────────────────────────

interface ExperimentCase {
  id: string;
  query: string;
  /** What a correct response should include */
  groundTruth: {
    shouldDetect: string[];
    shouldRecommend: boolean;
    expectedBehavior: string;
  };
  /** Why this case exists */
  purpose: string;
}

const CASES: ExperimentCase[] = [
  // ── Ambiguous (test uncertainty handling) ──────────────
  {
    id: 'CASE-01',
    query: 'El mouse se mueve solo.',
    groundTruth: {
      shouldDetect: [],
      shouldRecommend: false,
      expectedBehavior: 'Ambiguous — no sufficient evidence. Should NOT invent a cause.',
    },
    purpose: 'Test: does the system invent diagnoses for ambiguous queries?',
  },

  // ── Multi-fragment (test grounding) ───────────────────
  {
    id: 'CASE-02',
    query: 'Desde ayer mi PC está lenta y Chrome se queda pegado.',
    groundTruth: {
      shouldDetect: ['cpu', 'processes'],
      shouldRecommend: true,
      expectedBehavior: 'Performance + process investigation. Should recommend inspecting processes, not a list of 8 things.',
    },
    purpose: 'Test: can the system ground multiple symptoms into focused actions?',
  },

  // ── Out of coverage (test unsupported handling) ───────
  {
    id: 'CASE-03',
    query: 'Mi impresora imprime con colores raros.',
    groundTruth: {
      shouldDetect: [],
      shouldRecommend: false,
      expectedBehavior: 'No procedure for printer issues. Should say "no tengo instrucciones verificadas" NOT invent a solution.',
    },
    purpose: 'Test: does the system invent solutions when it has no knowledge?',
  },

  // ── Simple performance ────────────────────────────────
  {
    id: 'CASE-04',
    query: 'Mi laptop se calienta mucho cuando juego.',
    groundTruth: {
      shouldDetect: ['temperature', 'cpu', 'gpu'],
      shouldRecommend: true,
      expectedBehavior: 'Temperature + performance checks. Should recommend thermal investigation.',
    },
    purpose: 'Test: straightforward thermal + gaming scenario.',
  },

  // ── Storage ───────────────────────────────────────────
  {
    id: 'CASE-05',
    query: 'No me deja instalar nada porque el disco está lleno.',
    groundTruth: {
      shouldDetect: ['storage'],
      shouldRecommend: true,
      expectedBehavior: 'Storage check. Should recommend free-disk-space or inspect-storage-detail.',
    },
    purpose: 'Test: clear storage issue with specific symptom.',
  },

  // ── Non-diagnostic ────────────────────────────────────
  {
    id: 'CASE-06',
    query: 'Gracias por la ayuda.',
    groundTruth: {
      shouldDetect: [],
      shouldRecommend: false,
      expectedBehavior: 'Non-diagnostic. Should return empty, not try to diagnose.',
    },
    purpose: 'Test: does the system try to diagnose non-technical messages?',
  },

  // ── Vague diagnostic ──────────────────────────────────
  {
    id: 'CASE-07',
    query: 'Algo anda mal con mi computadora.',
    groundTruth: {
      shouldDetect: ['cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes'],
      shouldRecommend: true,
      expectedBehavior: 'Vague diagnostic — should run default checks and report findings.',
    },
    purpose: 'Test: vague query with diagnostic intent — should investigate broadly.',
  },

  // ── Network ───────────────────────────────────────────
  {
    id: 'CASE-08',
    query: 'El internet se corta cada vez que descargo algo pesado.',
    groundTruth: {
      shouldDetect: ['network'],
      shouldRecommend: true,
      expectedBehavior: 'Network check. Should recommend network investigation.',
    },
    purpose: 'Test: network-specific issue with clear pattern.',
  },

  // ── Cross-domain ──────────────────────────────────────
  {
    id: 'CASE-09',
    query: 'Tengo poca RAM y además la temperatura sube.',
    groundTruth: {
      shouldDetect: ['ram', 'temperature'],
      shouldRecommend: true,
      expectedBehavior: 'Two domains: RAM + temperature. Should recommend investigation for both without over-selecting.',
    },
    purpose: 'Test: multi-domain query — should not over-select actions.',
  },

  // ── Emotional / non-technical ─────────────────────────
  {
    id: 'CASE-10',
    query: 'Estoy frustrado, nada funciona bien en mi PC.',
    groundTruth: {
      shouldDetect: ['cpu', 'ram', 'gpu', 'storage', 'temperature', 'processes'],
      shouldRecommend: true,
      expectedBehavior: 'Emotional but implies system issues. Should investigate broadly but not overwhelm.',
    },
    purpose: 'Test: emotional query — should investigate without over-reacting.',
  },
];

// ─── Runner ────────────────────────────────────────────────

interface CaseResult {
  case: ExperimentCase;
  buffyOutput: BuffyToolResponse | null;
  error: string | null;
}

async function runExperiment(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  let adapter;
  try {
    adapter = await createAdapter();
  } catch {
    console.error('Could not create adapter. Using mock.');
    // Fallback: create a minimal mock
    adapter = {
      name: 'linux',
      detect: async () => ({ name: 'linux', os: 'Linux', version: '', arch: 'x64' }),
      systemInfo: async () => ({
        os: { name: 'Linux', version: '', arch: 'x64' },
        cpu: { model: 'Unknown', cores: 4 },
        memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
        gpu: { name: 'Unknown', driver: 'unknown', isGeneric: true },
        storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
        temperature: null,
        processes: [],
      }),
      capabilities: async () => [],
      execute: async () => ({ success: false, message: 'Mock' }),
    };
  }

  for (const c of CASES) {
    try {
      const output = await diagnose(adapter, c.query);
      results.push({ case: c, buffyOutput: output, error: null });
    } catch (err) {
      results.push({
        case: c,
        buffyOutput: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

// ─── Report ────────────────────────────────────────────────

async function printReport(results: CaseResult[]): Promise<void> {
  console.log('\n' + '═'.repeat(70));
  console.log('  A/B/C EXPERIMENT — Buffy Solo (Mode B)');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(70));

  // Capabilities
  const caps = capabilities();
  const v = version();
  console.log(`\n  Tool: ${v.tool} v${v.version}`);
  console.log(`  Schema: ${v.schemaVersion}`);
  console.log(`  Checks: ${caps.checks.join(', ')}`);
  console.log(`  Actions: ${caps.actions.length} available`);
  console.log(`  Platforms: ${caps.platforms.join(', ')}`);

  for (const r of results) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${r.case.id}: "${r.case.query}"`);
    console.log(`  Purpose: ${r.case.purpose}`);
    console.log(`${'─'.repeat(70)}`);

    if (r.error) {
      console.log(`  ❌ ERROR: ${r.error}`);
      continue;
    }

    const o = r.buffyOutput!;

    // Selection
    console.log(`\n  📋 Selection:`);
    console.log(`     checks: [${o.selection.checks.join(', ')}]`);
    console.log(`     ambiguous: ${o.selection.ambiguous}`);
    console.log(`     confidence: ${o.selection.confidence}`);

    // Observations
    console.log(`\n  🔍 Observations (${o.observations.length}):`);
    for (const obs of o.observations) {
      const icon = obs.severity === 'ok' ? '✅' : obs.severity === 'warning' ? '⚠️ ' : '❌';
      console.log(`     ${icon} [${obs.id}] ${obs.message}`);
    }

    // Actions
    console.log(`\n  🎯 Actions (${o.actions.length}):`);
    for (const act of o.actions) {
      console.log(`     → ${act.recommended} (confidence: ${act.confidence})`);
      const platformInst = act.instructions.find(i => i.platform === o.platform);
      if (platformInst) {
        if (platformInst.status === 'verified') {
          if (platformInst.command) console.log(`       💻 ${platformInst.command}`);
          if (platformInst.ui_path) console.log(`       📍 ${platformInst.ui_path}`);
        } else if (platformInst.status === 'partial') {
          console.log(`       ⚠  Partial instructions`);
        } else {
          console.log(`       ℹ  Unsupported on ${o.platform}`);
        }
      }
    }

    // Ground truth comparison
    console.log(`\n  📊 Ground truth:`);
    console.log(`     Expected behavior: ${r.case.groundTruth.expectedBehavior}`);

    // Quick assessment
    const detected = r.case.groundTruth.shouldDetect;
    const actual = o.selection.checks;
    const detectionMatch = detected.length === 0
      ? actual.length === 0
      : detected.some(d => actual.includes(d));
    console.log(`     Detection match: ${detectionMatch ? '✅' : '⚠️'}`);

    if (r.case.groundTruth.shouldRecommend && o.actions.length === 0) {
      console.log(`     ⚠  Expected recommendation but got none`);
    }
    if (!r.case.groundTruth.shouldRecommend && o.actions.length > 0) {
      console.log(`     ⚠  Got recommendations but expected none`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  MODE B SUMMARY');
  console.log('═'.repeat(70));

  let emptyCount = 0;
  let recommendCount = 0;
  let errorCount = 0;
  for (const r of results) {
    if (r.error) { errorCount++; continue; }
    if (r.buffyOutput!.actions.length === 0) emptyCount++;
    if (r.buffyOutput!.actions.length > 0) recommendCount++;
  }

  console.log(`  Total cases: ${results.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  With recommendations: ${recommendCount}`);
  console.log(`  Without recommendations: ${emptyCount}`);
  console.log('');

  // Save raw JSON
  const rawOutput = results.map(r => ({
    id: r.case.id,
    query: r.case.query,
    purpose: r.case.purpose,
    groundTruth: r.case.groundTruth,
    buffyOutput: r.buffyOutput,
    error: r.error,
  }));

  const fs = await import('node:fs');
  const outPath = new URL('./abc-experiment-results.json', import.meta.url);
  fs.writeFileSync(outPath, JSON.stringify(rawOutput, null, 2));
  console.log(`  Raw output saved to: experiments/abc-experiment-results.json`);
  console.log('');
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const results = await runExperiment();
  await printReport(results);
}

main().catch(console.error);
