// Buffy Next — State Store
// Persists scan results and preferences at ~/.buffy/state.json

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { BuffyState, ExecutionEvidenceRecord } from '../core/types.js';
import { acquireStateLock, releaseStateLock } from '../core/execution-journal.js';

function getBuffyDir(): string {
  if (process.env.BUFFY_DIR) return process.env.BUFFY_DIR;
  return join(homedir(), '.buffy');
}
function getStateFile(): string {
  return join(getBuffyDir(), 'state.json');
}

const DEFAULT_STATE: BuffyState = {
  actionHistory: [],
  preferences: {
    language: 'es',
  },
};

// ─── ExecutionEvidence ledger ──────────────────────────────
// Separate rotation from actionHistory: rotating a record out of this ledger
// is exactly what produces UNKNOWN_NO_EVIDENCE for later queries.

export const EVIDENCE_CAP = 200;

/** Appends an evidence record, rotating the ledger down to EVIDENCE_CAP. */
export function recordEvidence(state: BuffyState, record: ExecutionEvidenceRecord): BuffyState {
  const evidence = [...(state.evidence ?? []), record].slice(-EVIDENCE_CAP);
  return { ...state, evidence };
}

export function loadState(): BuffyState {
  try {
    const stateFile = getStateFile();
    if (existsSync(stateFile)) {
      const raw = readFileSync(stateFile, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...parsed };
      } catch (e) {
        // Corrupted file - preserve it for diagnosis, don't overwrite silently
        try {
          const backupPath = stateFile + '.corrupt.' + Date.now();
          writeFileSync(backupPath, raw);
        } catch {}
        // Do not return silently merged defaults that would allow overwriting
        throw new Error('state.json corrupto - no se puede leer');
      }
    }
  } catch (e: any) {
    if (e.message?.includes('corrupto')) throw e;
    throw new Error('state.json ilegible - no se puede leer');
  }
  return { ...DEFAULT_STATE };
}

export function saveState(state: BuffyState): void {
  const buffyDir = getBuffyDir();
  const stateFile = getStateFile();
  mkdirSync(buffyDir, { recursive: true });
  const lock = acquireStateLock();
  if (!lock.acquired) {
    throw new Error('No se pudo adquirir lock para escribir state.json');
  }
  try {
    const tmpPath = stateFile + '.tmp.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2);
    const content = JSON.stringify(state, null, 2);
    writeFileSync(tmpPath, content, 'utf-8');
    // Atomic rename only - no fallback to direct write
    try {
      renameSync(tmpPath, stateFile);
    } catch (e) {
      try { unlinkSync(tmpPath); } catch {}
      throw e;
    }
  } finally {
    releaseStateLock(lock);
  }
}

export function updateState(patch: Partial<BuffyState>): BuffyState {
  const lock = acquireStateLock();
  if (!lock.acquired) {
    throw new Error('No se pudo adquirir lock para actualizar state.json');
  }
  try {
    const buffyDir = getBuffyDir();
    const stateFile = getStateFile();
    let current: BuffyState;
    try {
      current = loadState();
    } catch (e: any) {
      // No sobrescribir archivo corrupto/ilegible
      if (e.message?.includes('corrupto') || e.message?.includes('ilegible')) {
        throw e;
      }
      throw e;
    }
    const updated = { ...current, ...patch };
    mkdirSync(buffyDir, { recursive: true });
    const tmpPath = stateFile + '.tmp.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(36).slice(2);
    const content = JSON.stringify(updated, null, 2);
    try {
      writeFileSync(tmpPath, content, 'utf-8');
    } catch (e) {
      try { unlinkSync(tmpPath); } catch {}
      throw e;
    }
    try {
      renameSync(tmpPath, stateFile);
    } catch (e) {
      try { unlinkSync(tmpPath); } catch {}
      throw e;
    }
    return updated;
  } finally {
    releaseStateLock(lock);
  }
}

export function ensureBuffyDir(): void {
  mkdirSync(getBuffyDir(), { recursive: true });
}
