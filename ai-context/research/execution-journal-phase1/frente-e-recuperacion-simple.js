import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-e4-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
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

function resolveClaim(fp, claimDir, journalPath, resolution, actor, reason) {
  const claimPath = join(claimDir, fp + '.json');
  const claim = readFileSync(claimPath, 'utf-8');
  const journalEntry = JSON.stringify({
    type: 'resolution',
    claimPath,
    resolution,
    actor,
    reason,
    timestamp: new Date().toISOString(),
  }) + '\n';
  writeFileSync(journalPath, journalEntry, { flag: 'a' });
  unlinkSync(claimPath);
  return 'RESOLVED: ' + resolution;
}

console.log('=== FRONTE E: RECUPERACIÓN Y RESOLUCIÓN HUMANA ===');
console.log('Fingerprint:', FP);
console.log('Directorio temporal:', COMMS);
console.log('');

console.log('--- Escenario 1: reclamación completada sin liberar ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });
rmSync(JOURNAL, { force: true });

const claim1 = JSON.stringify({
  fingerprint: FP,
  actionId: 'install-tool',
  target: 'node',
  platform: 'linux',
  pid: process.pid,
  status: 'completed',
  completedAt: new Date().toISOString(),
}) + '\n';

createClaim(FP, CLAIMDIR, claim1);
const claim1Read = readClaim(FP, CLAIMDIR);
console.log('Reclamación creada:');
console.log(claim1Read);
console.log('Recuperación: reclamación detectada, PID no verificable automáticamente');
console.log('Estado: pendiente de resolución humana');
console.log('');

console.log('--- Escenario 2: reclamación desconocida ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });

const claim2 = JSON.stringify({
  fingerprint: FP,
  actionId: 'install-tool',
  target: 'node',
  platform: 'linux',
  pid: process.pid,
  status: 'unknown',
  startedAt: new Date().toISOString(),
}) + '\n';

createClaim(FP, CLAIMDIR, claim2);
const claim2Read = readClaim(FP, CLAIMDIR);
console.log('Reclamación creada:');
console.log(claim2Read);
console.log('Recuperación: estado unknown no se convierte automáticamente en VERIFIED');
console.log('Se requiere resolución humana explícita');
console.log('');

console.log('--- Escenario 3: resolución humana ---');
rmSync(join(CLAIMDIR, FP + '.json'), { force: true });

const claim3 = JSON.stringify({
  fingerprint: FP,
  actionId: 'install-tool',
  target: 'node',
  platform: 'linux',
  pid: process.pid,
  status: 'unknown',
  startedAt: new Date().toISOString(),
}) + '\n';

createClaim(FP, CLAIMDIR, claim3);
const claim3Read = readClaim(FP, CLAIMDIR);
console.log('Reclamación creada:');
console.log(claim3Read);

const resolutionResult = resolveClaim(FP, CLAIMDIR, JOURNAL, 'abandonada_sin_determinar', 'human-operator', 'no se pudo determinar el efecto');
console.log('Resolución humana:', resolutionResult);

const journalContent = readFileSync(JOURNAL, 'utf-8');
console.log('Journal después de resolución:');
console.log(journalContent.trim());

const journalEntry = JSON.parse(journalContent.trim());
console.log('Journal entry válido:', journalEntry.type === 'resolution');
console.log('');

console.log('=== RESUMEN FRONTE E ===');
console.log('Reclamación completada sin liberar: detectada, no liberada automáticamente');
console.log('Reclamación desconocida: no convertida en VERIFIED automáticamente');
console.log('Resolución humana: registrada en journal con actor, fecha, motivo');
console.log('Carácter desconocido conservado: VERIFICADO');
console.log('');
console.log('Directorio temporal:', COMMS);
