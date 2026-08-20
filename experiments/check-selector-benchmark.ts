/**
 * Buffy Next — Check Selector Benchmark
 * 
 * 50 queries across 5 categories, each with ground-truth expected checks.
 * Run: npx tsx experiments/check-selector-benchmark.ts
 * 
 * NO modifica check-selector.ts. Solo mide.
 */

import { selectChecks } from '../src/core/check-selector.js';
import { scoreContext } from '../src/core/context-scorer.js';

// ─── Types ─────────────────────────────────────────────────

type CheckName = string;

interface BenchmarkQuery {
  id: number;
  category: 'direct' | 'natural' | 'indirect' | 'non-diagnostic' | 'multi-domain';
  query: string;
  /** Ground-truth: checks that SHOULD be selected. Empty array = should return [] (not ALL_CHECKS) */
  expected: CheckName[];
  /** If true, query should return ALL_CHECKS (no specific match) */
  expectAll?: boolean;
}

interface QueryResult {
  query: BenchmarkQuery;
  actual: CheckName[];
  matched: CheckName[];    // expected ∩ actual (true positives)
  missed: CheckName[];     // expected − actual (false negatives)
  extra: CheckName[];      // actual − expected (false positives)
  isAllChecks: boolean;
  precision: number;
  recall: number;
  status: 'correct' | 'over-selected' | 'under-selected' | 'wrong-default' | 'empty-correct';
}

// ─── Benchmark Data ────────────────────────────────────────

const BENCHMARK: BenchmarkQuery[] = [
  // ── 1. DIRECT (10) ──────────────────────────────────────
  {
    id: 1, category: 'direct',
    query: 'mi PC está lento',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 2, category: 'direct',
    query: 'tengo poca RAM',
    expected: ['ram', 'processes'],
  },
  {
    id: 3, category: 'direct',
    query: 'mi GPU está dando problemas',
    expected: ['gpu'],
  },
  {
    id: 4, category: 'direct',
    query: 'el disco está lleno',
    expected: ['storage'],
  },
  {
    id: 5, category: 'direct',
    query: 'la temperatura está alta',
    expected: ['temperature', 'cpu', 'processes'],
  },
  {
    id: 6, category: 'direct',
    query: 'no funciona el wifi',
    expected: ['network', 'os'],
  },
  {
    id: 7, category: 'direct',
    query: 'necesito instalar un driver',
    expected: ['tools', 'gpu'],
  },
  {
    id: 8, category: 'direct',
    query: 'una app está consumiendo mucho CPU',
    expected: ['processes'],
  },
  {
    id: 9, category: 'direct',
    query: 'necesito permisos de admin',
    expected: ['permissions', 'tools'],
  },
  {
    id: 10, category: 'direct',
    query: 'el sistema va con FPS bajo',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },

  // ── 2. NATURAL (12) ─────────────────────────────────────
  {
    id: 11, category: 'natural',
    query: 'se me congela el PC cuando abro Word',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 12, category: 'natural',
    query: 'Roblox me pega tirones',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 13, category: 'natural',
    query: 'el equipo se pone demasiado caliente',
    expected: ['temperature', 'cpu', 'processes'],
  },
  {
    id: 14, category: 'natural',
    query: 'se traba cada vez que abro Chrome',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 15, category: 'natural',
    query: 'la pantalla parpadea',
    expected: ['gpu'],
  },
  {
    id: 16, category: 'natural',
    query: 'no me deja guardar porque no hay espacio',
    expected: ['storage'],
  },
  {
    id: 17, category: 'natural',
    query: 'la página no carga, dice DNS error',
    expected: ['network', 'os'],
  },
  {
    id: 18, category: 'natural',
    query: 'el juego va lento en gráficos bajos',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 19, category: 'natural',
    query: 'tarda mucho en prender',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 20, category: 'natural',
    query: 'el ventilador ruge mucho',
    expected: ['temperature', 'cpu', 'processes'],
  },
  {
    id: 21, category: 'natural',
    query: 'se pone lento cuando tengo muchas pestañas',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 22, category: 'natural',
    query: 'el mouse se mueve solo',
    expected: ['gpu'],
  },

  // ── 3. INDIRECT (10) ────────────────────────────────────
  {
    id: 23, category: 'indirect',
    query: 'desde ayer todo anda pesado',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 24, category: 'indirect',
    query: 'cuando abro varias cosas empieza a responder mal',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 25, category: 'indirect',
    query: 'no sé qué pasa pero va lento',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 26, category: 'indirect',
    query: 'antes andaba mejor',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 27, category: 'indirect',
    query: 'algo anda mal con mi computador',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 28, category: 'indirect',
    query: 'se demora en abrir los programas',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 29, category: 'indirect',
    query: 'no funciona como antes',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 30, category: 'indirect',
    query: 'creo que tiene un virus',
    expected: ['processes'],
  },
  {
    id: 31, category: 'indirect',
    query: 'el mouse está lento',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 32, category: 'indirect',
    query: 'tarda en responder los clicks',
    expected: ['cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },

  // ── 4. NON-DIAGNOSTIC (10) ──────────────────────────────
  {
    id: 33, category: 'non-diagnostic',
    query: 'hola',
    expected: [],
  },
  {
    id: 34, category: 'non-diagnostic',
    query: 'qué puedes hacer',
    expected: [],
  },
  {
    id: 35, category: 'non-diagnostic',
    query: 'ayúdame',
    expected: [],
  },
  {
    id: 36, category: 'non-diagnostic',
    query: 'gracias',
    expected: [],
  },
  {
    id: 37, category: 'non-diagnostic',
    query: 'cuál es tu nombre',
    expected: [],
  },
  {
    id: 38, category: 'non-diagnostic',
    query: 'cuánto es 2+2',
    expected: [],
  },
  {
    id: 39, category: 'non-diagnostic',
    query: 'cuéntame un chiste',
    expected: [],
  },
  {
    id: 40, category: 'non-diagnostic',
    query: 'recomiéndame una película',
    expected: [],
  },
  {
    id: 41, category: 'non-diagnostic',
    query: 'buenos días',
    expected: [],
  },
  {
    id: 42, category: 'non-diagnostic',
    query: 'adiós',
    expected: [],
  },

  // ── 5. MULTI-DOMAIN (8) ─────────────────────────────────
  {
    id: 43, category: 'multi-domain',
    query: 'cuando juego se calienta y además me queda poco espacio',
    expected: ['temperature', 'cpu', 'processes', 'storage'],
  },
  {
    id: 44, category: 'multi-domain',
    query: 'tengo poca RAM y muchos procesos',
    expected: ['ram', 'processes'],
  },
  {
    id: 45, category: 'multi-domain',
    query: 'el wifi es lento y la temperatura sube',
    expected: ['network', 'os', 'temperature', 'cpu', 'processes'],
  },
  {
    id: 46, category: 'multi-domain',
    query: 'disco lleno y el PC se congela',
    expected: ['storage', 'cpu', 'ram', 'gpu', 'temperature', 'processes'],
  },
  {
    id: 47, category: 'multi-domain',
    query: 'necesito instalar un driver de GPU y tengo permisos de admin',
    expected: ['tools', 'gpu', 'permissions'],
  },
  {
    id: 48, category: 'multi-domain',
    query: 'la app consume mucho y el wifi se corta',
    expected: ['processes', 'network', 'os'],
  },
  {
    id: 49, category: 'multi-domain',
    query: 'tengo poca RAM, el disco lleno y va lento',
    expected: ['ram', 'processes', 'storage', 'cpu', 'gpu', 'temperature'],
  },
  {
    id: 50, category: 'multi-domain',
    query: 'la temperatura sube cuando abro Chrome y el mouse se pone lento',
    expected: ['temperature', 'cpu', 'processes', 'gpu'],
  },
];

// ─── Runner ────────────────────────────────────────────────

function runBenchmark(mode: 'v0.5-B' | 'v0.6' = 'v0.5-B'): void {
  const results: QueryResult[] = [];
  const byCategory: Record<string, QueryResult[]> = {};

  for (const q of BENCHMARK) {
    const lexical = selectChecks(q.query);
    const actual = mode === 'v0.6'
      ? scoreContext(q.query, lexical).checks
      : lexical;
    const isAllChecks = actual.length >= 9; // ALL_CHECKS has 10 items
    const expectedSet = new Set(q.expected);
    const actualSet = new Set(actual);

    const matched = q.expected.filter(e => actualSet.has(e));
    const missed = q.expected.filter(e => !actualSet.has(e));
    const extra = actual.filter(a => !expectedSet.has(a));

    const precision = actual.length > 0 ? matched.length / actual.length : 0;
    const recall = q.expected.length > 0 ? matched.length / q.expected.length : 0;

    let status: QueryResult['status'];
    if (q.expected.length === 0 && actual.length === 0) {
      status = 'correct';
    } else if (q.expected.length === 0 && isAllChecks) {
      status = 'wrong-default';
    } else if (q.expected.length === 0 && actual.length > 0) {
      status = 'over-selected';
    } else if (missed.length > 0 && extra.length > 0) {
      status = 'under-selected'; // both missed and extra
    } else if (missed.length > 0) {
      status = 'under-selected';
    } else if (extra.length > 0) {
      status = 'over-selected';
    } else {
      status = 'correct';
    }

    const result: QueryResult = {
      query: q,
      actual,
      matched,
      missed,
      extra,
      isAllChecks,
      precision,
      recall,
      status,
    };

    results.push(result);
    if (!byCategory[q.category]) byCategory[q.category] = [];
    byCategory[q.category].push(result);
  }

  // ─── Report ───────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('  BUFFY NEXT — CHECK SELECTOR BENCHMARK');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(70));

  // Global stats
  const total = results.length;
  const correct = results.filter(r => r.status === 'correct').length;
  const overSelected = results.filter(r => r.status === 'over-selected').length;
  const underSelected = results.filter(r => r.status === 'under-selected').length;
  const wrongDefault = results.filter(r => r.status === 'wrong-default').length;
  const avgPrecision = results.reduce((s, r) => s + r.precision, 0) / total;
  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / total;

  console.log('\n📊 GLOBAL STATS');
  console.log(`  Total queries:      ${total}`);
  console.log(`  ✅ Correct:         ${correct} (${(correct/total*100).toFixed(1)}%)`);
  console.log(`  ⚠️  Over-selected:   ${overSelected} (${(overSelected/total*100).toFixed(1)}%)`);
  console.log(`  ❌ Under-selected:  ${underSelected} (${(underSelected/total*100).toFixed(1)}%)`);
  console.log(`  🔄 Wrong DEFAULT:   ${wrongDefault} (${(wrongDefault/total*100).toFixed(1)}%)`);
  console.log(`  📐 Avg Precision:   ${(avgPrecision*100).toFixed(1)}%`);
  console.log(`  📐 Avg Recall:      ${(avgRecall*100).toFixed(1)}%`);

  // By category
  const categories = ['direct', 'natural', 'indirect', 'non-diagnostic', 'multi-domain'] as const;
  console.log('\n📋 BY CATEGORY');
  console.log('  ┌─────────────────────┬───────┬─────────┬────────┬──────────┬─────────┐');
  console.log('  │ Category            │ Total │ Correct │ Over   │ Under    │ Recall  │');
  console.log('  ├─────────────────────┼───────┼─────────┼────────┼──────────┼─────────┤');

  for (const cat of categories) {
    const catResults = byCategory[cat] || [];
    const catTotal = catResults.length;
    const catCorrect = catResults.filter(r => r.status === 'correct').length;
    const catOver = catResults.filter(r => r.status === 'over-selected').length;
    const catUnder = catResults.filter(r => r.status === 'under-selected').length;
    const catRecall = catResults.length > 0
      ? catResults.reduce((s, r) => s + r.recall, 0) / catResults.length
      : 0;
    console.log(
      `  │ ${cat.padEnd(19)} │ ${String(catTotal).padStart(5)} │ ${String(catCorrect).padStart(7)} │ ${String(catOver).padStart(6)} │ ${String(catUnder).padStart(8)} │ ${(catRecall*100).toFixed(0).padStart(6)}% │`
    );
  }
  console.log('  └─────────────────────┴───────┴─────────┴────────┴──────────┴─────────┘');

  // Detailed failures
  const failures = results.filter(r => r.status !== 'correct');
  if (failures.length > 0) {
    console.log('\n🔍 DETAILED FAILURES');
    for (const f of failures) {
      const icon = f.status === 'over-selected' ? '⚠️ ' : f.status === 'under-selected' ? '❌' : '🔄';
      console.log(`\n  ${icon} #${f.query.id} [${f.query.category}] "${f.query.query}"`);
      console.log(`     Status:    ${f.status}`);
      console.log(`     Expected:  [${f.query.expected.join(', ')}]${f.query.expectAll ? ' (ALL_CHECKS)' : ''}`);
      console.log(`     Actual:    [${f.actual.join(', ')}]${f.isAllChecks ? ' (ALL_CHECKS)' : ''}`);
      if (f.missed.length > 0) console.log(`     Missed:    [${f.missed.join(', ')}]`);
      if (f.extra.length > 0) console.log(`     Extra:     [${f.extra.join(', ')}]`);
      console.log(`     Precision: ${(f.precision*100).toFixed(0)}%  Recall: ${(f.recall*100).toFixed(0)}%`);
    }
  }

  // Pattern analysis
  console.log('\n🧩 PATTERN ANALYSIS');

  // Which checks are most over-selected?
  const extraCounts: Record<string, number> = {};
  const missedCounts: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.extra) extraCounts[e] = (extraCounts[e] || 0) + 1;
    for (const m of r.missed) missedCounts[m] = (missedCounts[m] || 0) + 1;
  }

  console.log('  Most over-selected checks:');
  const sortedExtra = Object.entries(extraCounts).sort((a, b) => b[1] - a[1]);
  for (const [check, count] of sortedExtra.slice(0, 5)) {
    console.log(`    ${check}: ${count} times`);
  }

  console.log('  Most missed checks:');
  const sortedMissed = Object.entries(missedCounts).sort((a, b) => b[1] - a[1]);
  for (const [check, count] of sortedMissed.slice(0, 5)) {
    console.log(`    ${check}: ${count} times`);
  }

  // Non-diagnostic analysis
  const nonDiag = byCategory['non-diagnostic'] || [];
  const nonDiagWrongDefault = nonDiag.filter(r => r.status === 'wrong-default');
  console.log(`\n  Non-diagnostic queries hitting ALL_CHECKS: ${nonDiagWrongDefault.length}/${nonDiag.length}`);
  if (nonDiagWrongDefault.length > 0) {
    console.log('  → These queries should return [] but return ALL_CHECKS (over-selection by design)');
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Selector ${mode} results.`);
  console.log(`  ${correct}/${total} queries correct (${(correct/total*100).toFixed(1)}%).`);
  console.log(`  Main issues:`);
  if (wrongDefault > 0) console.log(`    - ${wrongDefault} non-diagnostic queries hit ALL_CHECKS (should be [])`);
  if (overSelected > 0) console.log(`    - ${overSelected} queries over-select checks`);
  if (underSelected > 0) console.log(`    - ${underSelected} queries under-select checks`);
  console.log(`  Next: decide if v0.5-B needs better patterns, hybrid selector, or router.`);
  console.log('═'.repeat(70) + '\n');
}

// Run both modes
console.log('\n' + '▓'.repeat(70));
console.log('  MODE: v0.5-B (lexical only)');
console.log('▓'.repeat(70));
runBenchmark('v0.5-B');

console.log('\n' + '▓'.repeat(70));
console.log('  MODE: v0.6 (lexical + context scoring)');
console.log('▓'.repeat(70));
runBenchmark('v0.6');
