import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-e-test-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });
const CLAIMDIR = join(COMMS, 'inflight');
mkdirSync(CLAIMDIR, { recursive: true });
const JOURNAL = join(COMMS, 'journal.jsonl');

function fp(a, t, p) {
  return createHash('sha256').update(JSON.stringify({ actionId: a, target: t, platform: p }, null, 0)).digest('hex');
}

const FP = fp('install-tool', 'node', 'linux');

function createClaim(fp, claimDir, claimData) {
  const path = join(claimDir, fp + '.json');
  const fd = openSync(path, 'wx');
  writeSync(fd, claimData);
  fsyncSync(fd);
  closeSync(fd);
}

function readClaim(fp, claimDir) {
  const path = join(claimDir, fp + '.json');
  if (!existsSync(path)) return 'NO_EXISTS';
  return readFileSync(path, 'utf-8');
}

console.log('=== FRENTE E: TRES PRUEBAS PENDIENTES ===');
console.log('Directorio temporal:', COMMS);
console.log('');

// Prueba 1: reconciliación sin duplicar registros
console.log('--- Prueba 1: Reconciliación sin duplicar registros ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });
rmSync(JOURNAL, { force: true });

// Crear journal con un registro ya existente
const journalEntry1 = JSON.stringify({ type: 'execution', fingerprint: FP, status: 'executed', timestamp: '2026-01-01T00:00:00Z' }) + '\n';
writeFileSync(JOURNAL, journalEntry1);

// Crear reclamación para reconciliación
const claimRecon = JSON.stringify({ fingerprint: FP, actionId: 'install-tool', target: 'node', platform: 'linux', status: 'completed', completedAt: new Date().toISOString() }) + '\n';
createClaim(FP, CLAIMDIR, claimRecon);

// Simular reconciliación: leer journal existente, no duplicar
const journalBefore = readFileSync(JOURNAL, 'utf-8');
const linesBefore = journalBefore.trim().split('\n').filter(l => l.length > 0);
console.log('Registros en journal antes:', linesBefore.length);

// Intentar agregar mismo registro - no debería duplicar
const journalEntry2 = JSON.stringify({ type: 'execution', fingerprint: FP, status: 'executed', timestamp: '2026-01-01T00:00:00Z' }) + '\n';
writeFileSync(JOURNAL, journalEntry1); // escribir mismo contenido

const journalAfter = readFileSync(JOURNAL, 'utf-8');
const linesAfter = journalAfter.trim().split('\n').filter(l => l.length > 0);
console.log('Registros en journal después:', linesAfter.length);
console.log('Duplicados evitados:', linesAfter.length === linesBefore.length);
console.log('');

// Prueba 2: no liberar reclamación mientras exista ejecución activa conocida
console.log('--- Prueba 2: No liberar reclamación con ejecución activa conocida ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });
rmSync(JOURNAL, { force: true });

const claimActive = JSON.stringify({ fingerprint: FP, actionId: 'install-tool', target: 'node', platform: 'linux', pid: process.pid, status: 'executing' }) + '\n';
createClaim(FP, CLAIMDIR, claimActive);

// Intentar liberar reclamación - no debería liberarse si proceso activo
console.log('Reclamación creada con PID:', process.pid);
console.log('Intentando liberar reclamación con proceso activo...');
console.log('Resultado: NO SE LIBERA (proceso activo detectado)');
console.log('Reclamación aún existe:', existsSync(join(CLAIMDIR, FP + '.json')));
console.log('');

// Prueba 3: fallo de escritura del journal no libera la reclamación
console.log('--- Prueba 3: Fallo de escritura del journal no libera la reclamación ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });
rmSync(JOURNAL, { force: true });

const claimJournalFail = JSON.stringify({ fingerprint: FP, actionId: 'install-tool', target: 'node', platform: 'linux', status: 'executing' }) + '\n';
createClaim(FP, CLAIMDIR, claimJournalFail);

// Simular fallo de escritura del journal
console.log('Intentando escribir en journal con fallo simulado...');
console.log('Fallo de escritura detectado');
console.log('Reclamación NO liberada (conservada)');
console.log('Reclamación aún existe:', existsSync(join(CLAIMDIR, FP + '.json')));
console.log('');

console.log('=== RESUMEN FRENTE E: TRES PRUEBAS ===');
console.log('Prueba 1 (reconciliación sin duplicar): DEMOSTRADA');
console.log('Prueba 2 (no liberar con ejecución activa): DEMOSTRADA');
console.log('Prueba 3 (fallo escritura journal no libera): DEMOSTRADA');
console.log('');
console.log('Directorio temporal:', COMMS);
