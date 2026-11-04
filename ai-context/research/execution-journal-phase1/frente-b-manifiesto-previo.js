import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const TMPDIR = process.env.TMPDIR || tmpdir();
const COMMS = join(TMPDIR, 'comms-b2-' + createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8));
mkdirSync(COMMS, { recursive: true });
const PUBLISH_DIR = join(COMMS, 'inflight');
mkdirSync(PUBLISH_DIR, { recursive: true });

function fp(a, t, p) {
  return createHash('sha256').update(JSON.stringify({ actionId: a, target: t, platform: p }, null, 0)).digest('hex');
}

const OPERATION = { actionId: 'install-tool', target: 'node', platform: 'linux' };
const FP = fp(OPERATION.actionId, OPERATION.target, OPERATION.platform);

function leerReclamacionPublicada(fp, publishDir) {
  const path = join(publishDir, fp + '.json');
  if (!existsSync(path)) return 'NO_EXISTS';
  return readFileSync(path, 'utf-8');
}

function validarJSON(content) {
  try {
    JSON.parse(content.trim());
    return 'VALID';
  } catch (e) {
    return 'INVALID: ' + e.message;
  }
}

function identificarOperacionDesdeSegundoProceso(fp, publishDir) {
  const claim = leerReclamacionPublicada(fp, publishDir);
  if (claim === 'NO_EXISTS') return { existe: false, identificable: false, razon: 'no_existe' };
  const jsonValid = validarJSON(claim);
  if (jsonValid !== 'VALID') return { existe: true, identificable: false, razon: 'json_invalido', jsonValid };
  const parsed = JSON.parse(claim.trim());
  const identificable = parsed.fingerprint === FP && parsed.actionId === 'install-tool' && parsed.target === 'node' && parsed.platform === 'linux';
  return { existe: true, identificable, razon: identificable ? 'identificable' : 'metadatos_incompletos', contenido: claim.trim() };
}

async function runExperiment() {
  const POINTS = ['after_create_tmp', 'after_write_tmp', 'after_fsync_tmp', 'after_rename', 'after_fsync_dir'];
  let completados = 0;

  for (const point of POINTS) {
    console.log('=== Punto de interrupción: ' + point + ' ===');
    console.log('PID coordinador:', process.pid);

    try { rmSync(join(PUBLISH_DIR, FP + '.json'), { force: true }); } catch {}
    try { rmSync(join(COMMS, '.tmp-' + FP + '-*'), { force: true, recursive: true }); } catch {}

    const workerScriptPath = join(COMMS, 'worker-' + point + '.js');
    const workerScript = `
import { openSync, writeSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join } from 'node:path';
const fp = ${JSON.stringify(FP)};
const publishDir = ${JSON.stringify(PUBLISH_DIR)};
const comsys = ${JSON.stringify(COMMS)};
const pid = process.pid;
const tmpFile = join(comsys, '.tmp-' + fp + '-' + pid);
const operation = { fingerprint: fp, actionId: 'install-tool', target: 'node', platform: 'linux', pid: pid, hostname: process.env.HOSTNAME ?? 'localhost', startedAt: new Date().toISOString() };
const content = JSON.stringify(operation, null, 2) + '\\n';
function waitForKill() {
  return new Promise((resolve) => {
    process.on('SIGTERM', () => resolve());
    setInterval(() => {}, 500);
  });
}
try {
  if (${JSON.stringify(point)} === 'after_create_tmp') {
    const fd = openSync(tmpFile, 'wx');
    closeSync(fd);
    console.log(JSON.stringify({ alcanzado: ${JSON.stringify(point)}, pid, tmpFile, exists: true }));
    await waitForKill();
    process.exit(0);
  }
  if (${JSON.stringify(point)} === 'after_write_tmp') {
    const fd = openSync(tmpFile, 'wx');
    writeSync(fd, content);
    closeSync(fd);
    console.log(JSON.stringify({ alcanzado: ${JSON.stringify(point)}, pid, tmpFile, exists: true, size: Buffer.byteLength(content) }));
    await waitForKill();
    process.exit(0);
  }
  if (${JSON.stringify(point)} === 'after_fsync_tmp') {
    const fd = openSync(tmpFile, 'wx');
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    console.log(JSON.stringify({ alcanzado: ${JSON.stringify(point)}, pid, tmpFile, exists: true, size: Buffer.byteLength(content) }));
    await waitForKill();
    process.exit(0);
  }
  if (${JSON.stringify(point)} === 'after_rename') {
    const fd = openSync(tmpFile, 'wx');
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmpFile, join(publishDir, fp + '.json'));
    console.log(JSON.stringify({ alcanzado: ${JSON.stringify(point)}, pid, tmpFile, claimPath: join(publishDir, fp + '.json'), exists: true, size: Buffer.byteLength(content) }));
    await waitForKill();
    process.exit(0);
  }
  if (${JSON.stringify(point)} === 'after_fsync_dir') {
    const fd = openSync(tmpFile, 'wx');
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmpFile, join(publishDir, fp + '.json'));
    try { fsyncSync(openSync(publishDir, 'r')); } catch {}
    console.log(JSON.stringify({ alcanzado: ${JSON.stringify(point)}, pid, tmpFile, claimPath: join(publishDir, fp + '.json'), exists: true, size: Buffer.byteLength(content) }));
    await waitForKill();
    process.exit(0);
  }
  console.log(JSON.stringify({ error: 'punto_desconocido' }));
  process.exit(1);
} catch (e) {
  console.log(JSON.stringify({ error: e.message, alcanzado: ${JSON.stringify(point)}, pid }));
  process.exit(1);
}
`;
    writeFileSync(workerScriptPath, workerScript);

    const worker = spawn('node', [workerScriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let workerOutput = '';
    worker.stdout.on('data', (d) => { workerOutput += d.toString(); });

    // Wait for output
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (workerOutput.includes('{')) {
          clearInterval(check);
          resolve();
        }
      }, 10);
      setTimeout(() => { clearInterval(check); resolve(); }, 2000);
    });

    const evento = JSON.parse(workerOutput.trim() || '{}');
    console.log('Evento alcanzado por worker:', JSON.stringify(evento));

    const tmpFileEsperado = join(COMMS, '.tmp-' + FP + '-' + (evento.pid || process.pid));
    const tmpExiste = existsSync(tmpFileEsperado);
    const tmpSize = tmpExiste ? readFileSync(tmpFileEsperado).length : null;
    console.log('Temporal existe?', tmpExiste, '| tamaño:', tmpSize);

    const claimPublicada = leerReclamacionPublicada(FP, PUBLISH_DIR);
    console.log('Reclamación publicada existe?', claimPublicada !== 'NO_EXISTS');
    if (claimPublicada !== 'NO_EXISTS') {
      console.log('Contenido:', claimPublicada.trim().slice(0, 200));
      console.log('JSON válido?', validarJSON(claimPublicada));
      const ident = identificarOperacionDesdeSegundoProceso(FP, PUBLISH_DIR);
      console.log('Identificable:', ident.identificable);
    } else {
      console.log('No existe reclamación publicada (esperado antes del rename)');
    }

    if (evento.alcanzado === point && worker.pid) {
      console.log('Enviando SIGTERM a', worker.pid);
      try { worker.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        worker.on('exit', resolve);
        setTimeout(resolve, 1000);
      });
      console.log('Worker terminado');
      completados++;
    }

    console.log('---');
    console.log('');
  }

  console.log('=== RESUMEN FRENTE B ===');
  console.log('Puntos completados:', completados + '/' + POINTS.length);
  console.log('Estrategia: temporal + write + fsync + rename + fsync dir');
  console.log('Directorio:', COMMS);
}

runExperiment().catch(e => { console.error('ERR:', e.message); process.exit(1); });
