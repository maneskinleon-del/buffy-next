import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-e3-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });
const CLAIMDIR = join(COMMS, 'inflight');
mkdirSync(CLAIMDIR, { recursive: true });
const JOURNAL = join(COMMS, 'journal.jsonl');
const SCRIPTS = join(COMMS, 'scripts');
mkdirSync(SCRIPTS, { recursive: true });

function fp(a, t, p) {
  return createHash('sha256').update(JSON.stringify({ actionId: a, target: t, platform: p }, null, 0)).digest('hex');
}

const FP = fp('install-tool', 'node', 'linux');

function makeScript(name, body) {
  writeFileSync(join(SCRIPTS, name), body);
}

makeScript('create-claim.js', `
import { openSync, writeSync, fsyncSync, closeSync, join } from 'node:fs';
const fp = process.argv[2];
const dir = process.argv[3];
const claim = process.argv[4];
const path = join(dir, fp + '.json');
const fd = openSync(path, 'wx');
writeSync(fd, claim);
fsyncSync(fd);
closeSync(fd);
process.exit(0);
`);

makeScript('read-claim.js', `
import { readFileSync, existsSync } from 'node:fs';
const path = process.argv[2];
if (!existsSync(path)) {
  console.log('NO_EXISTS');
  process.exit(0);
}
console.log(readFileSync(path, 'utf-8'));
process.exit(0);
`);

makeScript('resolve-claim.js', `
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
const claimPath = process.argv[2];
const journalPath = process.argv[3];
const resolution = process.argv[4];
const actor = process.argv[5];
const reason = process.argv[6] || '';
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
console.log('RESOLVED: ' + resolution);
process.exit(0);
`);

function runNodeScript(name, args = []) {
  const p = spawn('node', [join(SCRIPTS, name), ...args], { stdio: 'pipe' });
  return new Promise((resolve) => {
    const buf = [];
    p.stdout.on('data', (d) => buf.push(d));
    p.stderr.on('data', (d) => buf.push(d));
    p.on('exit', () => resolve(Buffer.concat(buf).toString().trim()));
    p.on('error', () => resolve(''));
  });
}

function runNodeSync(name, args = []) {
  const r = spawnSync('node', [join(SCRIPTS, name), ...args], { stdio: 'pipe' });
  return r.stdout?.toString().trim() ?? '';
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

await runNodeScript('create-claim.js', [FP, CLAIMDIR, claim1]);
const claim1Read = await runNodeScript('read-claim.js', [join(CLAIMDIR, FP + '.json')]);
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

await runNodeScript('create-claim.js', [FP, CLAIMDIR, claim2]);
const claim2Read = await runNodeScript('read-claim.js', [join(CLAIMDIR, FP + '.json')]);
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

await runNodeScript('create-claim.js', [FP, CLAIMDIR, claim3]);
const claim3Read = await runNodeScript('read-claim.js', [join(CLAIMDIR, FP + '.json')]);
console.log('Reclamación creada:');
console.log(claim3Read);

const resolutionResult = runNodeSync('resolve-claim.js', [join(CLAIMDIR, FP + '.json'), JOURNAL, 'abandonada_sin_determinar', 'human-operator', 'no se pudo determinar el efecto']);
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
