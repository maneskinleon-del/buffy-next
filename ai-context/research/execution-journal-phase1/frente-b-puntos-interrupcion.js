import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, writeSync, readFileSync, rmSync, existsSync, closeSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const TMPDIR = process.env.TMPDIR || '/tmp';
const COMMS = join(TMPDIR, 'comms-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });
const CLAIMDIR = join(COMMS, 'inflight');
mkdirSync(CLAIMDIR, { recursive: true });

const OPERATION = {
  actionId: 'install-tool',
  target: 'node',
  platform: 'linux',
};

function computeFingerprint(actionId, target, platform) {
  return createHash('sha256')
    .update(JSON.stringify({ actionId, target, platform }, null, 0))
    .digest('hex');
}

const FP = computeFingerprint(OPERATION.actionId, OPERATION.target, OPERATION.platform);
const REPORT_PATH = join(COMMS, 'frente-b-puntos-interrupcion.jsonl');

function appendLine(obj) {
  const fd = openSync(REPORT_PATH, 'a');
  let written = 0;
  const data = Buffer.from(JSON.stringify(obj) + '\n', 'utf-8');
  while (written < data.length) written += writeSync(fd, data, written);
  fsyncSync(fd);
  closeSync(fd);
}

function writeAll(fd, buf) {
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off);
}

const POINTS = [
  'after_create',
  'after_partial',
  'after_metadata',
  'after_fsync_file',
  'after_fsync_dir',
];

for (const point of POINTS) {
  console.log(`=== Punto de interrupción: ${point} ===`);

  rmSync(join(CLAIMDIR, `${FP}.json`), { force: true });

  const childBody = `
import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';

const fp = ${JSON.stringify(FP)};
const claimDir = ${JSON.stringify(CLAIMDIR)};
const claimFile = join(claimDir, fp + '.json');

const fd = openSync(claimFile, 'wx');
function writeAll(fd, buf) {
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off);
}
try {
  if (${JSON.stringify(point)} === 'after_partial') {
    const partial = JSON.stringify({ fingerprint: fp, actionId: 'install-tool' }) + "\\n";
    writeAll(fd, Buffer.from(partial, 'utf-8'));
  } else if (${JSON.stringify(point)} === 'after_metadata' || ${JSON.stringify(point)} === 'after_fsync_file' || ${JSON.stringify(point)} === 'after_fsync_dir') {
    const metadata = JSON.stringify({
      fingerprint: fp,
      actionId: 'install-tool',
      target: 'node',
      platform: 'linux'
    }) + "\\n";
    writeAll(fd, Buffer.from(metadata, 'utf-8'));
    if (${JSON.stringify(point)} !== 'after_metadata') {
      fsyncSync(fd);
    }
    if (${JSON.stringify(point)} === 'after_fsync_dir') {
      try {
        fsyncSync(openSync(claimDir, 'r'));
      } catch {}
    }
  }
} finally {
  closeSync(fd);
}
`;

  const child = spawn('node', ['-e', childBody], {
    stdio: 'ignore',
  });

  const killTimer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch {}
  }, 50 + Math.random() * 100);

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve(null);
    }, 250);
    child.on('exit', () => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolve(null);
    });
    child.on('error', () => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolve(null);
    });
  });

  try { clearTimeout(killTimer); } catch {}

  const recovery = spawnSync('node', ['-e', `
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const claimFile = join(${JSON.stringify(CLAIMDIR)}, ${JSON.stringify(FP)} + '.json');
if (!existsSync(claimFile)) {
  console.log(JSON.stringify({ recoverable: false, reason: 'no_existe' }));
  process.exit(0);
}
let content;
try {
  content = readFileSync(claimFile, 'utf-8');
  console.log(JSON.stringify({ recoverable: true, contentLength: content.length, content }));
} catch (e) {
  console.log(JSON.stringify({ recoverable: false, reason: e.message }));
}
`]);

  const out = recovery.stdout?.toString().trim();
  const rec = out ? JSON.parse(out) : null;

  console.log('  Archivo existe?', existsSync(join(CLAIMDIR, `${FP}.json`)));
  if (rec) {
    console.log('  Recuperable?', rec.recoverable);
    console.log('  Longitud?', rec.contentLength);
    if (rec.content) console.log('  Contenido:', rec.content.slice(0, 300));
    if (rec.reason) console.log('  Razón:', rec.reason);
  } else {
    console.log('  Sin respuesta');
  }

  appendLine({
    point,
    fileExists: existsSync(join(CLAIMDIR, `${FP}.json`)),
    recoverable: rec?.recoverable,
    contentLength: rec?.contentLength ?? null,
    content: rec?.content ?? null,
    reason: rec?.reason ?? null,
  });

  console.log('');
}

console.log('=== RESUMEN EVIDENCIA FRENTE B ===');
import { createReadStream } from 'node:fs';
const rs = createReadStream(REPORT_PATH, { encoding: 'utf-8' });
let buf = '';
for await (const chunk of rs) {
  buf += chunk;
  const lines = buf.split('\n').filter((l) => l.length > 0);
  buf = lines.pop() ?? '';
  for (const line of lines) {
    console.log(JSON.parse(line));
  }
}
if (buf.length > 0) console.log(JSON.parse(buf));
console.log('');
console.log('Directorio temporal:', COMMS);
console.log('Reporte:', REPORT_PATH);
