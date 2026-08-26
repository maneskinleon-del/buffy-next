/**
 * A/B/C Evaluation E2 — 20 blind cases
 * Modes A (Gemma solo), B (Buffy solo), C (Gemma + Buffy)
 *
 * Buffy FROZEN at 95f51cb. Do NOT modify.
 *
 * Run: npx tsx experiments/abc-e2-run.ts
 */

import { diagnose } from '../src/tool.js';
import type { BuffyToolResponse } from '../src/tool.js';
import type { PlatformAdapter, SystemInfo, PlatformName } from '../src/core/types.js';
import * as fs from 'node:fs';

// ─── Mock Adapter ──────────────────────────────────────────

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

// ─── Cases (FROZEN) ────────────────────────────────────────

const CASES = [
  // Windows
  { id: 'W1', query: 'Mi Teams se cierra solo cuando estoy en una reunión.', platform: 'windows' },
  { id: 'W2', query: 'Windows me pide contraseña cada vez que prendo la PC, antes no lo hacía.', platform: 'windows' },
  { id: 'W3', query: 'No puedo imprimir desde Word pero sí desde PDF.', platform: 'windows' },
  { id: 'W4', query: 'El explorador dice que el disco C está en rojo pero no tengo nada instalado.', platform: 'windows' },
  { id: 'W5', query: 'El Bluetooth se conecta pero no suena nada por los audífonos.', platform: 'windows' },
  // Linux
  { id: 'L1', query: 'Después de actualizar no me deja entrar a mi usuario.', platform: 'linux' },
  { id: 'L2', query: 'El wifi dice conectado pero no cargo ninguna página.', platform: 'linux' },
  { id: 'L3', query: 'Quiero instalar Docker pero me dice que no tengo permisos.', platform: 'linux' },
  { id: 'L4', query: 'Mi laptop se apaga cuando la desconecto de la luz, la batería debería funcionar.', platform: 'linux' },
  { id: 'L5', query: 'La pantalla parpadea cada vez que abro una app gráfica.', platform: 'linux' },
  // Android
  { id: 'A1', query: 'Mi teléfono se queda en negro cuando llamo.', platform: 'android' },
  { id: 'A2', query: 'Las notificaciones llegan pero no suenan.', platform: 'android' },
  { id: 'A3', query: 'No puedo actualizar apps porque dice almacenamiento lleno.', platform: 'android' },
  { id: 'A4', query: 'La batería dice 100% pero se apaga a los 20%.', platform: 'android' },
  { id: 'A5', query: 'El GPS me dice que estoy en otra ciudad.', platform: 'android' },
  // Cross-platform
  { id: 'X1', query: 'Mi PC hace un ruido raro cuando la prendo.', platform: 'cross' },
  { id: 'X2', query: 'Las apps se abren solas y se cierran.', platform: 'cross' },
  { id: 'X3', query: 'No puedo conectarme a la wifi en ningún dispositivo.', platform: 'cross' },
  { id: 'X4', query: 'Mi pantalla se ve amarilla de la nada.', platform: 'cross' },
  { id: 'X5', query: 'El mouse se mueve solo y además la pantalla parpadea.', platform: 'cross' },
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
  return `Eres un asistente técnico de computadoras. Un usuario describe un problema. Responde breve y útil en español. Si no tienes info suficiente, di "No tengo suficiente información." Si no sabes la causa, no la inventes.

Usuario: ${query}
Asistente:`;
}

function promptC(query: string, json: string): string {
  return `Eres un asistente técnico. El sistema Buffy diagnosticó el sistema. Estos son los resultados:

${json}

Instrucciones:
- Basándote SOLO en los resultados de Buffy, responde al usuario en español.
- Si observability.status es 'no_evidence': di "No tengo suficiente información para diagnosticar esto."
- Si observability.status es 'unsupported': di qué no puede observar y por qué.
- Si observability.status es 'partial': di qué pudo observar y qué no.
- Si observability.status es 'observed': usa las observaciones y acciones.
- NO inventes diagnósticos o acciones que no estén en los resultados de Buffy.
- Si el usuario contradice una observación, señala la discrepancia.

Usuario: ${query}
Asistente:`;
}

// ─── Runner ────────────────────────────────────────────────

interface CaseResult {
  id: string;
  query: string;
  platform: string;
  buffyChecks: string[];
  buffyObsCount: number;
  buffyActionsCount: number;
  observability: { status: string; reason: string };
  modeA: string;
  modeC: string;
  error: string | null;
}

async function main() {
  const results: CaseResult[] = [];
  const outPath = new URL('./abc-e2-results.json', import.meta.url);

  console.log('🧛 A/B/C Evaluation E2 — 20 blind cases');
  console.log(`  Buffy: FROZEN at 95f51cb`);
  console.log(`  Gemma: gemma:2b via Ollama\n`);

  for (const c of CASES) {
    process.stdout.write(`${c.id}: "${c.query.substring(0, 50)}..." `);

    let modeA = '', modeC = '', error: string | null = null;
    let buffyChecks: string[] = [], buffyObsCount = 0, buffyActionsCount = 0;
    let observability = { status: '', reason: '' };

    try {
      // Buffy
      const buffy = await diagnose(mockAdapter, c.query);
      buffyChecks = buffy.selection.checks;
      buffyObsCount = buffy.observations.length;
      buffyActionsCount = buffy.actions.length;
      observability = buffy.observability;

      // Mode A
      modeA = await callGemma(promptA(c.query));

      // Mode C
      modeC = await callGemma(promptC(c.query, JSON.stringify(buffy, null, 2)));

      console.log(`B:${buffyActionsCount} A:${modeA.length}c C:${modeC.length}c`);
    } catch (e: any) {
      error = e.message;
      console.log(`ERROR: ${error}`);
    }

    results.push({
      id: c.id, query: c.query, platform: c.platform,
      buffyChecks, buffyObsCount, buffyActionsCount,
      observability, modeA, modeC, error,
    });

    // Save incrementally
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════════════');

  const withObs = results.filter(r => r.observability.status === 'observed').length;
  const noEvidence = results.filter(r => r.observability.status === 'no_evidence').length;
  const unsupported = results.filter(r => r.observability.status === 'unsupported').length;
  const partial = results.filter(r => r.observability.status === 'partial').length;

  console.log(`  Total: ${results.length}`);
  console.log(`  Observability:`);
  console.log(`    observed:    ${withObs}`);
  console.log(`    no_evidence: ${noEvidence}`);
  console.log(`    unsupported: ${unsupported}`);
  console.log(`    partial:     ${partial}`);
  console.log(`  Errors: ${results.filter(r => r.error).length}`);
  console.log(`\n  Results saved to: experiments/abc-e2-results.json`);
}

main().catch(console.error);
