import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-debug-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });

const workerScriptPath = join(COMMS, 'worker.js');
const workerScript = `
import { openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
const comsys = '${COMMS}';
const tmpFile = join(comsys, 'tmp-test');
function waitForKill() {
  return new Promise((resolve) => {
    process.on('SIGTERM', () => resolve());
    setInterval(() => {}, 1000);
  });
}
const fd = openSync(tmpFile, 'wx');
closeSync(fd);
console.log(JSON.stringify({ok: true, pid: process.pid}));
await waitForKill();
process.exit(0);
`;
writeFileSync(workerScriptPath, workerScript);

const worker = spawn('node', [workerScriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
let workerOutput = '';
worker.stdout.on('data', (d) => { 
  workerOutput += d.toString(); 
  console.log('GOT DATA:', d.toString());
});

setTimeout(() => {
  console.log('SENDING TERM, output so far:', workerOutput);
  worker.kill('SIGTERM');
  setTimeout(() => {
    console.log('DONE');
    process.exit(0);
  }, 1000);
}, 1000);
