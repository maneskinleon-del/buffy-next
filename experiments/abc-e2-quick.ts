import { diagnose } from '../src/tool.js';
import type { PlatformAdapter, SystemInfo, PlatformName } from '../src/core/types.js';
import * as fs from 'node:fs';

const MOCK: SystemInfo = {
  os: { name: 'Linux', version: '6.1', arch: 'x64' },
  cpu: { model: 'AMD Ryzen 5 3400G', cores: 4, usage: 35 },
  memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
  gpu: { name: 'AMD Radeon Vega', driver: 'amdgpu', isGeneric: false },
  storage: [{ mount: '/', totalGB: 500, freeGB: 230, usedPercent: 54 }],
  temperature: { cpuCelsius: 42 },
  processes: [{ pid: 1234, name: 'firefox', cpuPercent: 65, memoryMB: 1800 }],
};

const adapter: PlatformAdapter = {
  name: 'linux' as PlatformName,
  detect: async () => ({ name: 'linux' as PlatformName, os: 'Linux', version: '6.1', arch: 'x64' }),
  systemInfo: async () => MOCK,
  capabilities: async () => [],
  execute: async () => ({ success: false, message: 'Mock' }),
};

async function callGemma(prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gemma:2b', prompt, stream: false, options: { temperature: 0.3, num_predict: 200 } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response.trim();
}

const CASES = [
  { id: 'W1', q: 'Mi Teams se cierra solo cuando estoy en una reunión.' },
  { id: 'L2', q: 'El wifi dice conectado pero no cargo ninguna página.' },
  { id: 'A3', q: 'No puedo actualizar apps porque dice almacenamiento lleno.' },
  { id: 'X3', q: 'No puedo conectarme a la wifi en ningún dispositivo.' },
  { id: 'X5', q: 'El mouse se mueve solo y además la pantalla parpadea.' },
];

async function main() {
  const results: any[] = [];
  for (const c of CASES) {
    process.stdout.write(`${c.id}: `);
    const b = await diagnose(adapter, c.q);
    const a = await callGemma(`Eres un asistente técnico. Responde breve en español. Si no tienes info, di "No tengo suficiente información."\n\nUsuario: ${c.q}\nAsistente:`);
    const cResponse = await callGemma(`Eres un asistente técnico. Buffy diagnosticó:\n${JSON.stringify(b, null, 2)}\n\nBasándote SOLO en Buffy, responde en español. Si observability.status es 'no_evidence' o 'unsupported', dilo.\n\nUsuario: ${c.q}\nAsistente:`);
    results.push({ id: c.id, query: c.q, buffy: { checks: b.selection.checks, obs: b.observations.length, actions: b.actions.length, obs_status: b.observability.status }, modeA: a, modeC: cResponse });
    console.log(`B:${b.actions.length} A:${a.length}c C:${cResponse.length}c`);
  }
  fs.writeFileSync(new URL('./abc-e2-quick-results.json', import.meta.url), JSON.stringify(results, null, 2));
  console.log('Done');
}

main().catch(console.error);
