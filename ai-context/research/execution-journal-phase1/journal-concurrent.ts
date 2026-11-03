#!/usr/bin/env node
// Execution Journal Fase 1 — experimento Frente C (variante A): lock explícito con espera.
// Escribe líneas JSON sobre el mismo archivo con creep de lock basado en wx.
// Este script se puede invocar como worker de carrera:
//   node journal-concurrent.ts           → escritura normal (sin lock, para comparar)
//   node journal-concurrent.ts --lock    → escritura bajo lock explícito
//   node journal-concurrent.ts --carrera <pid> → carrera con lock explícito

import { mkdirSync, rmSync, openSync, closeSync, readFileSync, existsSync, writeSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';

const RUN_DIR = join(process.cwd(), 'ai-context', 'research', 'execution-journal-phase1', 'scratch-run');
mkdirSync(RUN_DIR, { recursive: true });

const JOURNAL = join(RUN_DIR, 'journal-concurrent.jsonl');
const LOCK = join(RUN_DIR, 'journal.lock');

const modeRaw = process.argv[2];

// limpiar histórico
try { rmSync(JOURNAL, { force: true }); } catch {}
try { rmSync(LOCK, { force: true }); } catch {}

const appendLine = (line: string): void => {
  const fd = openSync(JOURNAL, 'a');
  const buf = Buffer.from(line, 'utf-8');
  let off = 0;
  while (off < buf.length) {
    off += writeSync(fd, buf, off);
  }
  fsyncSync(fd);
  closeSync(fd);
};

const writeRecord = (rec: any): void => {
  appendLine(JSON.stringify(rec) + '\n');
};

function acquireLock(): number {
  const fd = openSync(LOCK, 'wx');
  const meta = JSON.stringify({ pid: process.pid, t: new Date().toISOString() }) + '\n';
  let off = 0;
  while (off < meta.length) {
    off += writeSync(fd, meta, off);
  }
  fsyncSync(fd);
  return fd;
}

function releaseLock(fd: number): void {
  closeSync(fd);
  rmSync(LOCK);
}

const pid = process.pid;
const now = new Date().toISOString();
const first = Math.floor(Math.random() * 1e6);

// Modo normal sin lock (para ver la corrupción observable)
if (modeRaw !== '--lock' && modeRaw !== '--carrera') {
  writeRecord({ line: 1, pid, first, t: now });
  writeRecord({ line: 2, pid, first, t: new Date().toISOString() });
  console.log('Sin lock — dos líneas sin serialización:');
  console.log(readFileSync(JOURNAL, 'utf-8'));
  return;
}

// Modo lock simple (secuencial, sin carrera)
if (modeRaw === '--lock') {
  const lockFd = acquireLock();
  writeRecord({ line: 'LOCK', pid, t: now });
  releaseLock(lockFd);
  console.log('Bajo lock — una línea serializada:');
  console.log(readFileSync(JOURNAL, 'utf-8'));
  return;
}

// Carrera con lock explícito
if (modeRaw === '--carrera') {
  const otherPid = Number(process.argv[3]);
  // esperar brevemente para solaparse con el otro proceso
  await new Promise(r => setTimeout(r, 40));
  try {
    const lockFd = acquireLock();
    writeRecord({ line: 'CARRERA', pid, otherPid, t: new Date().toISOString() });
    releaseLock(lockFd);
    console.log(`PID ${pid}: escribió bajo lock`);
  } catch (err: any) {
    console.log(`PID ${pid}: no obtuvo lock (${err.message})`);
  }
  return;
}

console.log('Modo no reconocido:', modeRaw);
