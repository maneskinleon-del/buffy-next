#!/usr/bin/env node
// diagnose-gpu-windows.js — Aísla el punto exacto de fallo en GPU detection
// Ejecutar en Windows: node scripts/diagnose-gpu-windows.js

const { execSync, execFileSync } = require('child_process');

const WMI_COMMAND = 'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM | ConvertTo-Json -Compress -Depth 1';

console.log('=== Windows GPU Detection Diagnostic ===\n');

// ── Step 1: Direct PowerShell ───────────────────────────────

console.log('--- Step 1: Direct PowerShell (manual) ---');
try {
  const direct = execSync(
    `powershell -NoProfile -NonInteractive -Command "${WMI_COMMAND}"`,
    { encoding: 'utf-8', timeout: 15000 }
  ).trim();
  console.log('stdout length:', direct.length);
  console.log('stdout preview:', direct.substring(0, 200));
  console.log('First 5 bytes (hex):', Buffer.from(direct.substring(0, 5)).toString('hex'));
  console.log('Contains BOM:', direct.charCodeAt(0) === 0xFEFF);
  console.log('✅ Step 1: PowerShell executed OK\n');
} catch (e) {
  console.log('❌ Step 1 FAILED:', e.message?.substring(0, 200));
  console.log('stderr:', e.stderr?.substring(0, 200));
  console.log('status:', e.status);
  console.log('');
}

// ── Step 2: execSync with current ps() pattern ─────────────

console.log('--- Step 2: execSync (current ps() pattern) ---');
try {
  const raw = execSync(
    `powershell -NoProfile -NonInteractive -Command "${WMI_COMMAND}"`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  console.log('raw length:', raw.length);
  console.log('raw preview:', raw.substring(0, 200));

  // Try JSON.parse
  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed : [parsed];
    const gpu = normalized[0];
    console.log('JSON.parse: ✅ SUCCESS');
    console.log('GPU name:', gpu?.Name ?? 'MISSING');
    console.log('GPU driver:', gpu?.DriverVersion ?? 'MISSING');
    console.log('GPU RAM:', gpu?.AdapterRAM ?? 'MISSING');
  } catch (parseErr) {
    console.log('JSON.parse: ❌ FAILED:', parseErr.message?.substring(0, 200));
    console.log('Raw bytes (first 100):', Buffer.from(raw.substring(0, 100)).toString('hex'));
  }
  console.log('✅ Step 2: execSync completed\n');
} catch (e) {
  console.log('❌ Step 2 FAILED:', e.message?.substring(0, 200));
  console.log('stderr:', e.stderr?.substring(0, 200));
  console.log('status:', e.status);
  console.log('');
}

// ── Step 3: execFileSync (no shell interpretation) ──────────

console.log('--- Step 3: execFileSync (no shell) ---');
try {
  const raw = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', WMI_COMMAND],
    { encoding: 'utf-8', timeout: 15000 }
  ).trim();
  console.log('raw length:', raw.length);
  console.log('raw preview:', raw.substring(0, 200));

  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed : [parsed];
    const gpu = normalized[0];
    console.log('JSON.parse: ✅ SUCCESS');
    console.log('GPU name:', gpu?.Name ?? 'MISSING');
    console.log('GPU driver:', gpu?.DriverVersion ?? 'MISSING');
  } catch (parseErr) {
    console.log('JSON.parse: ❌ FAILED:', parseErr.message?.substring(0, 200));
    console.log('Raw bytes (first 100):', Buffer.from(raw.substring(0, 100)).toString('hex'));
  }
  console.log('✅ Step 3: execFileSync completed\n');
} catch (e) {
  console.log('❌ Step 3 FAILED:', e.message?.substring(0, 200));
  console.log('stderr:', e.stderr?.substring(0, 200));
  console.log('status:', e.status);
  console.log('');
}

// ── Step 4: Buffy doctor --context (real adapter) ───────────

console.log('--- Step 4: Buffy doctor --context (real adapter) ---');
try {
  const output = execSync(
    'npx tsx src/cli.ts doctor --context',
    { encoding: 'utf-8', timeout: 30000, cwd: __dirname + '/..' }
  ).trim();

  // Find GPU in JSON
  const gpuMatch = output.match(/"gpu":\s*"([^"]*)"/);
  const driverMatch = output.match(/"gpu_driver":\s*"([^"]*)"/);
  const genericMatch = output.match(/"gpu_is_generic":\s*(true|false|null)/);

  console.log('GPU from BuffyContext:', gpuMatch?.1 ?? 'NOT FOUND');
  console.log('Driver from BuffyContext:', driverMatch?.1 ?? 'NOT FOUND');
  console.log('isGeneric from BuffyContext:', genericMatch?.1 ?? 'NOT FOUND');
  console.log('✅ Step 4: Buffy doctor completed\n');
} catch (e) {
  console.log('❌ Step 4 FAILED:', e.message?.substring(0, 200));
  console.log('');
}

// ── Summary ─────────────────────────────────────────────────

console.log('=== Summary ===');
console.log('If Step 1-3 succeed but Step 4 fails → issue is in adapter code');
console.log('If Step 1 fails → PowerShell issue');
console.log('If Step 2 fails but Step 1 succeeds → execSync shell escaping');
console.log('If Step 2 JSON.parse fails → encoding/BOM issue');
console.log('If Step 3 fails but Step 1 succeeds → execSync vs execFileSync');
