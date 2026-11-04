import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-d-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });
const STATE_FILE = join(COMMS, 'state.json');
const STATE_TMP = join(COMMS, 'state.json.tmp');

function writeAll(fd, buf) {
  let off = 0;
  const { writeSync } = require('node:fs');
  while (off < buf.length) off += writeSync(fd, buf, off);
}

function runNodeSync(body) {
  const r = spawnSync('node', ['-e', body], { stdio: 'pipe' });
  return r.stdout?.toString() ?? '';
}

// Inicializar estado
const initialState = JSON.stringify({ counter: 0, updatedBy: [] }, null, 2);
writeFileSync(STATE_FILE, initialState);
console.log('Estado inicial:', initialState);
console.log('');

// Worker que hace read-modify-write concurrente
function workerBody(strategy, workerId, iterations) {
  return `
import { readFileSync, writeFileSync, openSync, writeSync, closeSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const statePath = ${JSON.stringify(STATE_FILE)};
const tmpPath = ${JSON.stringify(STATE_TMP)};
const id = ${JSON.stringify(workerId)};
const iters = ${iterations};

function readState() {
  return JSON.parse(readFileSync(statePath, 'utf-8'));
}

function writeStateDirect(data) {
  writeFileSync(statePath, JSON.stringify(data, null, 2));
}

function writeStateAtomic(data) {
  const tmp = join(${JSON.stringify(COMMS)}, 'state.json.tmp.' + id);
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, statePath);
}

const write = ${strategy === 'direct' ? 'writeStateDirect' : 'writeStateAtomic'};

for (let i = 0; i < iters; i++) {
  const state = readState();
  state.counter += 1;
  state.updatedBy.push(id + '-' + i);
  write(state);
}

console.log('WORKER_' + id + '_DONE');
`;
}

const ITERATIONS = 50;

console.log('=== FRONTE D: ESCRITURA DIRECTA ===');
rmSync(STATE_FILE, { force: true });
writeFileSync(STATE_FILE, JSON.stringify({ counter: 0, updatedBy: [] }, null, 2));

const w1d = spawn('node', ['-e', workerBody('direct', 'A', ITERATIONS)], { stdio: 'pipe' });
const w2d = spawn('node', ['-e', workerBody('direct', 'B', ITERATIONS)], { stdio: 'pipe' });

await new Promise((resolve) => {
  let done = 0;
  const onExit = () => {
    done++;
    if (done >= 2) resolve();
  };
  w1d.on('exit', onExit);
  w2d.on('exit', onExit);
  w1d.on('error', onExit);
  w2d.on('error', onExit);
});

const afterDirect = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
console.log('Después de write directo:');
console.log('  counter:', afterDirect.counter);
console.log('  esperado:', ITERATIONS * 2);
console.log('  actualizaciones perdidas:', ITERATIONS * 2 - afterDirect.counter);
console.log('  updatedBy count:', afterDirect.updatedBy.length);
console.log('  esperado updatedBy:', ITERATIONS * 2);
console.log('');

console.log('=== FRONTE D: ESCRITURA ATÓMICA (TEMPORAL + RENAME) ===');
rmSync(STATE_FILE, { force: true });
writeFileSync(STATE_FILE, JSON.stringify({ counter: 0, updatedBy: [] }, null, 2));

const w1a = spawn('node', ['-e', workerBody('atomic', 'A', ITERATIONS)], { stdio: 'pipe' });
const w2a = spawn('node', ['-e', workerBody('atomic', 'B', ITERATIONS)], { stdio: 'pipe' });

await new Promise((resolve) => {
  let done = 0;
  const onExit = () => {
    done++;
    if (done >= 2) resolve();
  };
  w1a.on('exit', onExit);
  w2a.on('exit', onExit);
  w1a.on('error', onExit);
  w2a.on('error', onExit);
});

const afterAtomic = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
console.log('Después de write atómico:');
console.log('  counter:', afterAtomic.counter);
console.log('  esperado:', ITERATIONS * 2);
console.log('  actualizaciones perdidas:', ITERATIONS * 2 - afterAtomic.counter);
console.log('  updatedBy count:', afterAtomic.updatedBy.length);
console.log('  esperado updatedBy:', ITERATIONS * 2);
console.log('');

console.log('=== RESUMEN FRONTE D ===');
console.log('Write directo bajo concurrencia:');
console.log('  counter final:', afterDirect.counter, '/ esperado:', ITERATIONS * 2);
console.log('  Pérdidas:', afterDirect.counter < ITERATIONS * 2 ? 'SÍ' : 'NO');
console.log('Write atómico bajo concurrencia:');
console.log('  counter final:', afterAtomic.counter, '/ esperado:', ITERATIONS * 2);
console.log('  Pérdidas:', afterAtomic.counter < ITERATIONS * 2 ? 'SÍ' : 'NO');
console.log('');
console.log(' CONCLUSIÓN:');
console.log('  La atomicidad (temporal + rename) evita truncamiento, pero NO');
console.log('  garantiza exclusión mutua. Updates perdidos aún pueden ocurrir.');
console.log('  Para evitar actualizaciones perdidas se necesita un mecanismo');
console.log('  adicional de serialización (ej. lock de archivo).');
console.log('');
console.log('Directorio temporal:', COMMS);
