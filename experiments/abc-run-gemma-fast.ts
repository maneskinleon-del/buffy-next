/**
 * A/B/C Experiment — Gemma 2B (fast version with mock adapter)
 * Runs case by case, saves results incrementally.
 *
 * Run: npx tsx experiments/abc-run-gemma-fast.ts
 */

import { diagnose } from '../src/tool.js';
import type { BuffyToolResponse } from '../src/tool.js';
import type { PlatformAdapter, SystemInfo, PlatformName } from '../src/core/types.js';
import * as fs from 'node:fs';

// ─── Mock Adapter (instant, no system calls) ───────────────

const MOCK_SYSTEM: SystemInfo = {
  os: { name: 'Linux', version: '6.1', arch: 'x64' },
  cpu: { model: 'AMD Ryzen 5 3400G', cores: 4, usage: 35 },
  memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
  gpu: { name: 'AMD Radeon Vega', driver: 'amdgpu', isGeneric: false },
  storage: [{ mount: '/', totalGB: 500, freeGB: 230, usedPercent: 54 }],
  temperature: { cpuCelsius: 42 },
  processes: [
    { pid: 1234, name: 'firefox', cpuPercent: 65, memoryMB: 1800 },
    { pid: 5678, name: 'code', cpuPercent: 15, memoryMB: 900 },
  ],
};

const mockAdapter: PlatformAdapter = {
  name: 'linux' as PlatformName,
  detect: async () => ({ name: 'linux' as PlatformName, os: 'Linux', version: '6.1', arch: 'x64' }),
  systemInfo: async () => MOCK_SYSTEM,
  capabilities: async () => [],
  execute: async () => ({ success: false, message: 'Mock' }),
};

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

// ─── Ollama ────────────────────────────────────────────────

async function callGemma(prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma:2b',
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 300 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response.trim();
}

// ─── Prompts ───────────────────────────────────────────────

function promptA(query: string): string {
  return `Eres un asistente técnico de computadoras. Un usuario describe un problema. Responde breve y útil en español. Si no tienes info suficiente, di "No tengo suficiente información."

Usuario: ${query}
Asistente:`;
}

function promptC(query: string, json: string): string {
  return `Eres un asistente técnico. El sistema Buffy diagnosticó el sistema. Estos son los resultados:
${json}
Basándote SOLO en estos resultados, responde al usuario en español. Si Buffy no encontró nada, di "No se detectaron problemas." Si no tiene info para este caso, di "No tengo un procedimiento verificado para esto." NO inventes lo que no esté en Buffy.

Usuario: ${query}
Asistente:`;
}

// ─── Runner ────────────────────────────────────────────────

async function main() {
  const results: any[] = [];
  const outPath = new URL('./abc-experiment-gemma-results.json', import.meta.url);

  console.log('🧛 A/B/C Experiment — Gemma 2B (fast mock)\n');

  for (const c of CASES) {
    console.log(`${c.id}: "${c.query}"`);

    // Buffy
    const buffy = await diagnose(mockAdapter, c.query);
    const buffySummary = {
      checks: buffy.selection.checks,
      ambiguous: buffy.selection.ambiguous,
      observations: buffy.observations.map(o => ({ id: o.id, severity: o.severity, message: o.message })),
      actions: buffy.actions.map(a => ({ id: a.id, recommended: a.recommended, confidence: a.confidence })),
    };
    console.log(`  Buffy: ${buffy.actions.length} actions`);

    // Mode A
    let modeA = '';
    try {
      modeA = await callGemma(promptA(c.query));
      console.log(`  A: ${modeA.substring(0, 100)}...`);
    } catch (e: any) {
      modeA = `ERROR: ${e.message}`;
      console.log(`  A: ${modeA}`);
    }

    // Mode C
    let modeC = '';
    try {
      modeC = await callGemma(promptC(c.query, JSON.stringify(buffy, null, 2)));
      console.log(`  C: ${modeC.substring(0, 100)}...`);
    } catch (e: any) {
      modeC = `ERROR: ${e.message}`;
      console.log(`  C: ${modeC}`);
    }

    results.push({ id: c.id, query: c.query, buffy: buffySummary, modeA, modeC });

    // Save incrementally
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log('');
  }

  console.log('✅ Done. Results saved to experiments/abc-experiment-gemma-results.json');
}

main().catch(console.error);
