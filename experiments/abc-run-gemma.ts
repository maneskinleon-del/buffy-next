/**
 * A/B/C Experiment — Gemma 2B via Ollama
 *
 * Mode A: Gemma solo (user → Gemma → response)
 * Mode C: Gemma + Buffy (user → Gemma → Buffy JSON → Gemma → response)
 *
 * Buffy is FROZEN. Do NOT modify.
 *
 * Run: npx tsx experiments/abc-run-gemma.ts
 */

import { diagnose, capabilities } from '../src/tool.js';
import { createAdapter } from '../src/adapters/index.js';
import type { BuffyToolResponse } from '../src/tool.js';
import * as fs from 'node:fs';

// ─── Ollama API ────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma:2b';

async function callGemma(prompt: string): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 512,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { response: string };
  return data.response.trim();
}

// ─── Cases ─────────────────────────────────────────────────

const CASES = [
  { id: 'CASE-01', query: 'El mouse se mueve solo.' },
  { id: 'CASE-02', query: 'Desde ayer mi PC está lenta y Chrome se queda pegado.' },
  { id: 'CASE-03', query: 'Mi impresora imprime con colores raros.' },
  { id: 'CASE-04', query: 'Mi laptop se calienta mucho cuando juego.' },
  { id: 'CASE-05', query: 'No me deja instalar nada porque el disco está lleno.' },
  { id: 'CASE-06', query: 'Gracias por la ayuda.' },
  { id: 'CASE-07', query: 'Algo anda mal con mi computadora.' },
  { id: 'CASE-08', query: 'El internet se corta cada vez que descargo algo pesado.' },
  { id: 'CASE-09', query: 'Tengo poca RAM y además la temperatura sube.' },
  { id: 'CASE-10', query: 'Estoy frustrado, nada funciona bien en mi PC.' },
];

// ─── Prompts ───────────────────────────────────────────────

function modeAPrompt(query: string): string {
  return `Eres un asistente técnico de computadoras. Un usuario te describe un problema con su PC. Responde de forma breve y útil en español. Si no tienes información suficiente, di "No tengo suficiente información para diagnosticar este problema."

Usuario: ${query}

Asistente:`;
}

function modeCPrompt(query: string, buffyJson: string): string {
  return `Eres un asistente técnico de computadoras. Un usuario describe un problema con su PC.

El sistema de diagnóstico Buffy ha analizado el sistema y produjo estos resultados:

${buffyJson}

Basándote EXCLUSIVAMENTE en los resultados de Buffy, responde al usuario en español. Si Buffy no encontró problemas, di "No se detectaron problemas en el sistema." Si Buffy no tiene información para esta consulta, di "No tengo un procedimiento verificado para este caso."

NO inventes diagnósticos o acciones que no estén en los resultados de Buffy.

Usuario: ${query}

Asistente:`;
}

// ─── Runner ────────────────────────────────────────────────

interface ExperimentResult {
  id: string;
  query: string;
  modeA: string | null;
  modeC: string | null;
  buffyJson: BuffyToolResponse | null;
  error: string | null;
}

async function runExperiment(): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = [];

  let adapter;
  try {
    adapter = await createAdapter();
  } catch {
    console.error('Could not create adapter. Using mock.');
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
    console.log(`\n  Running ${c.id}: "${c.query}"...`);

    let buffyJson: BuffyToolResponse | null = null;
    let modeA: string | null = null;
    let modeC: string | null = null;
    let error: string | null = null;

    try {
      // Get Buffy output (Mode B — already executed, but we need the JSON for Mode C)
      buffyJson = await diagnose(adapter, c.query);
      console.log(`    Buffy: ${buffyJson.actions.length} actions, ${buffyJson.observations.length} observations`);

      // Mode A: Gemma solo
      console.log(`    Mode A: calling Gemma...`);
      modeA = await callGemma(modeAPrompt(c.query));
      console.log(`    Mode A: ${modeA.substring(0, 80)}...`);

      // Mode C: Gemma + Buffy
      console.log(`    Mode C: calling Gemma with Buffy JSON...`);
      modeC = await callGemma(modeCPrompt(c.query, JSON.stringify(buffyJson, null, 2)));
      console.log(`    Mode C: ${modeC.substring(0, 80)}...`);

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.log(`    ERROR: ${error}`);
    }

    results.push({ id: c.id, query: c.query, modeA, modeC, buffyJson, error });
  }

  return results;
}

// ─── Report ────────────────────────────────────────────────

function printReport(results: ExperimentResult[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('  A/B/C EXPERIMENT — Gemma 2B Results');
  console.log('  ' + new Date().toISOString());
  console.log('═'.repeat(70));

  for (const r of results) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${r.id}: "${r.query}"`);
    console.log(`${'─'.repeat(70)}`);

    if (r.error) {
      console.log(`  ❌ ERROR: ${r.error}`);
      continue;
    }

    // Buffy (Mode B)
    console.log(`\n  🅱️  Buffy Solo:`);
    if (r.buffyJson) {
      console.log(`     checks: [${r.buffyJson.selection.checks.join(', ')}]`);
      console.log(`     observations: ${r.buffyJson.observations.length}`);
      console.log(`     actions: ${r.buffyJson.actions.length}`);
      if (r.buffyJson.actions.length > 0) {
        for (const a of r.buffyJson.actions) {
          console.log(`       → ${a.recommended} (${a.confidence})`);
        }
      }
    }

    // Mode A
    console.log(`\n  🅰️  Gemma Solo:`);
    console.log(`     ${r.modeA?.replace(/\n/g, '\n     ')}`);

    // Mode C
    console.log(`\n  🅲️  Gemma + Buffy:`);
    console.log(`     ${r.modeC?.replace(/\n/g, '\n     ')}`);
  }

  // Save raw output
  const rawOutput = results.map(r => ({
    id: r.id,
    query: r.query,
    buffyJson: r.buffyJson,
    modeA: r.modeA,
    modeC: r.modeC,
    error: r.error,
  }));

  fs.writeFileSync(
    new URL('./abc-experiment-gemma-results.json', import.meta.url),
    JSON.stringify(rawOutput, null, 2),
  );
  console.log(`\n  Raw output saved to: experiments/abc-experiment-gemma-results.json`);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('🧛 Buffy A/B/C Experiment — Gemma 2B via Ollama');
  console.log(`  Model: ${MODEL}`);
  console.log(`  Cases: ${CASES.length}`);

  const caps = capabilities();
  console.log(`  Buffy checks: ${caps.checks.join(', ')}`);
  console.log(`  Buffy actions: ${caps.actions.length}`);
  console.log('');

  const results = await runExperiment();
  printReport(results);
}

main().catch(console.error);
