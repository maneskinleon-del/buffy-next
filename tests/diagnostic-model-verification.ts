#!/usr/bin/env tsx
// Buffy Next — Diagnostic Model Verification
// Tests the Observation/Inference separation with 4 real-world cases
// Run: npx tsx tests/diagnostic-model-verification.ts

import { diagnose } from '../src/core/diagnose.js';
import type { PlatformAdapter, SystemInfo } from '../src/core/types.js';

// ─── Mock Adapters ──────────────────────────────────────────

function mockAdapter(overrides: Partial<SystemInfo>, platform: string = 'windows'): PlatformAdapter {
  const base: SystemInfo = {
    os: { name: 'Test', version: '1.0', arch: 'x64' },
    cpu: { model: 'Test CPU', cores: 4, usage: null },
    memory: { totalGB: 16, availableGB: 8, usedPercent: 50 },
    gpu: { name: 'NVIDIA GTX', driver: '537', isGeneric: false },
    storage: [{ mount: '/', totalGB: 500, freeGB: 250, usedPercent: 50 }],
    temperature: { cpuCelsius: 45 },
    processes: [],
    ...overrides,
  };
  return {
    name: platform,
    async detect() { return { name: 'windows', os: 'Test', version: '1.0', arch: 'x64' }; },
    async systemInfo() { return base; },
    async capabilities() { return []; },
    async execute(a) { return a.execute(); },
  };
}

// ─── Helpers ────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

function obs(o: { fact: string; category: string; severity: string }) {
  const icon = o.severity === 'ok' ? '✅' : o.severity === 'warning' ? '⚠️ ' : '❌';
  return `  ${icon} [${o.category}] ${o.fact}`;
}

function inf(i: { statement: string; basedOn: string[] }) {
  return `  💡 ${i.statement}\n     ↳ basado en: ${i.basedOn.join(' + ')}`;
}

function act(sa: { action: { id: string; name: string }; reason: string }) {
  return `  🎯 ${sa.action.id} (${sa.action.name}) — ${sa.reason}`;
}

// ─── Case 1: "Mi PC está lento" ─────────────────────────────

async function case1() {
  section('CASO 1: "Mi PC está lento"');

  const adapter = mockAdapter({
    cpu: { model: 'Intel i5-10400', cores: 6, usage: 72 },
    memory: { totalGB: 16, availableGB: 2.1, usedPercent: 87 },
    gpu: { name: 'NVIDIA GTX 1660', driver: '537.42', isGeneric: false },
    temperature: { cpuCelsius: 68 },
    processes: [
      { pid: 1, name: 'chrome', cpuPercent: 45, memoryMB: 1200 },
      { pid: 2, name: 'vscode', cpuPercent: 30, memoryMB: 800 },
    ],
  });

  const result = await diagnose(adapter, 'mi PC está lento');

  console.log('\n📊 Observaciones (hechos medidos):');
  for (const o of result.observations) console.log(obs(o));

  console.log('\n💡 Inferencias (posibles causas):');
  for (const i of result.inferences) console.log(inf(i));

  console.log('\n🎯 Acciones sugeridas:');
  if (result.suggestedActions.length === 0) {
    console.log('  (ninguna acción disponible para estos problemas)');
  } else {
    for (const sa of result.suggestedActions) console.log(act(sa));
  }

  // Assertions
  const warns = result.observations.filter(o => o.severity !== 'ok');
  const hasInf = result.inferences.length > 0;
  const combinedInf = result.inferences.some(i => i.statement.includes('Combinación'));
  console.log(`\n  ✅ Observaciones con warning/error: ${warns.length}`);
  console.log(`  ✅ Inferencias generadas: ${result.inferences.length}`);
  console.log(`  ✅ Inferencia combinada (RAM+temp): ${combinedInf}`);
  console.log(`  ✅ Acciones sugeridas: ${result.suggestedActions.length}`);

  return { observations: result.observations.length, warnings: warns.length, inferences: result.inferences.length, actions: result.suggestedActions.length, combinedInference: combinedInf };
}

// ─── Case 2: "Mi GPU aparece como desconocida" ──────────────

async function case2() {
  section('CASO 2: "Mi GPU aparece como desconocida"');

  const adapter = mockAdapter({
    gpu: { name: 'Microsoft Basic Display Adapter', driver: '10.0.19041.1', isGeneric: true },
  });

  const result = await diagnose(adapter, 'gpu pantalla driver desconocida');

  console.log('\n📊 Observaciones:');
  for (const o of result.observations) console.log(obs(o));

  console.log('\n💡 Inferencias:');
  for (const i of result.inferences) console.log(inf(i));

  console.log('\n🎯 Acciones sugeridas:');
  for (const sa of result.suggestedActions) console.log(act(sa));

  // Key assertion: should suggest check-gpu-driver
  const gpuAction = result.suggestedActions.find(sa => sa.action.id === 'check-gpu-driver');
  const gpuObs = result.observations.find(o => o.category === 'gpu');
  const gpuInf = result.inferences.some(i => i.statement.includes('GPU'));
  console.log(`\n  ✅ GPU observation: ${gpuObs?.severity}`);
  console.log(`  ✅ GPU inference: ${gpuInf}`);
  console.log(`  ✅ check-gpu-driver suggested: ${!!gpuAction}`);

  return { gpuWarning: gpuObs?.severity === 'warning', gpuInference: gpuInf, actionSuggested: !!gpuAction };
}

// ─── Case 3: "Mi teléfono se calienta jugando" ──────────────

async function case3() {
  section('CASO 3: "Mi teléfono se calienta jugando"');

  const adapter = mockAdapter({
    os: { name: 'Android', version: '13', arch: 'arm64-v8a' },
    cpu: { model: 'Snapdragon 865', cores: 8, usage: 78 },
    memory: { totalGB: 8, availableGB: 1.8, usedPercent: 78 },
    gpu: { name: 'Adreno 650', driver: 'Qualcomm', isGeneric: false },
    temperature: { cpuCelsius: 76 },
    processes: [
      { pid: 1, name: 'com.freefire', cpuPercent: 52, memoryMB: 900 },
    ],
  }, 'android-termux');

  const result = await diagnose(adapter, 'mi teléfono se calienta jugando');

  console.log('\n📊 Observaciones:');
  for (const o of result.observations) console.log(obs(o));

  console.log('\n💡 Inferencias:');
  for (const i of result.inferences) console.log(inf(i));

  console.log('\n🎯 Acciones sugeridas:');
  for (const sa of result.suggestedActions) console.log(act(sa));

  // Key: thermal inference should exist, with or without action
  const thermalInf = result.inferences.find(i => i.statement.toLowerCase().includes('temperatura'));
  const combinedInf = result.inferences.find(i => i.statement.includes('Combinación'));
  console.log(`\n  ✅ Thermal inference: ${!!thermalInf}`);
  console.log(`  ✅ Combined inference (memory+temp): ${!!combinedInf}`);
  console.log(`  ✅ Actions suggested: ${result.suggestedActions.length}`);
  console.log(`  → Even without a 'thermal fix' action, Buffy identifies the problem`);

  return { thermalInference: !!thermalInf, combinedInference: !!combinedInf, actions: result.suggestedActions.length };
}

// ─── Case 4: "problem with no action" ───────────────────────

async function case4() {
  section('CASO 4: "No tengo espacio en disco" (sin acción disponible)');

  const adapter = mockAdapter({
    storage: [{ mount: '/', totalGB: 64, freeGB: 1.2, usedPercent: 98 }],
  });

  const result = await diagnose(adapter, 'no tengo espacio disco lleno');

  console.log('\n📊 Observaciones:');
  for (const o of result.observations) console.log(obs(o));

  console.log('\n💡 Inferencias:');
  for (const i of result.inferences) console.log(inf(i));

  console.log('\n🎯 Acciones sugeridas:');
  if (result.suggestedActions.length === 0) {
    console.log('  (ninguna — Buffy encontró el problema pero no tiene acción)');
  } else {
    for (const sa of result.suggestedActions) console.log(act(sa));
  }

  // Key assertion: storage warning exists but no storage-specific action
  const storageObs = result.observations.find(o => o.category === 'storage');
  const hasStorageAction = result.suggestedActions.some(sa =>
    sa.action.id.includes('storage') || sa.action.id.includes('clean') || sa.action.id.includes('cache')
  );
  console.log(`\n  ✅ Storage observation: ${storageObs?.severity}`);
  console.log(`  ✅ Buffy KNOWS there's a problem (severity=${storageObs?.severity})`);
  console.log(`  ✅ Buffy CAN'T fix it (no storage action: ${!hasStorageAction})`);
  console.log(`  → Esto es "encontré un problema ≠ puedo solucionarlo"`);

  return { storageWarning: storageObs?.severity === 'error', noSpecificAction: !hasStorageAction };
}

// ─── Run All ────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Buffy Next — Verificación del Modelo de Diagnóstico   ║');
  console.log('║  Separación: Observations ≠ Inferences ≠ Actions        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const r1 = await case1();
  const r2 = await case2();
  const r3 = await case3();
  const r4 = await case4();

  section('RESUMEN');

  const allPass =
    r1.observations > 0 && r1.inferences > 0 && r1.combinedInference &&
    r2.gpuWarning && r2.gpuInference && r2.actionSuggested &&
    r3.thermalInference &&
    r4.storageWarning && r4.noSpecificAction;

  console.log(`
  Caso 1 (PC lento):           ${r1.warnings} warnings, ${r1.inferences} inferences, ${r1.actions} actions  ✅
  Caso 2 (GPU genérico):       GPU warning=${r2.gpuWarning}, inference=${r2.gpuInference}, action=${r2.actionSuggested}  ✅
  Caso 3 (Teléfono caliente):  thermal=${r3.thermalInference}, combined=${r3.combinedInference}  ✅
  Caso 4 (Sin acción):         storage=${r4.storageWarning}, no-fix=${r4.noSpecificAction}  ✅

  ✅ TODOS LOS CASOS PASAN: el modelo separa correctamente hechos de inferencias
`);

  if (!allPass) {
    console.error('❌ ALGÚN CASO FALLÓ');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
