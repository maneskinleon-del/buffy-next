// Buffy Next — State Store
// Persists scan results and preferences at ~/.buffy/state.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { BuffyState } from '../core/types.js';

const BUFFY_DIR = join(homedir(), '.buffy');
const STATE_FILE = join(BUFFY_DIR, 'state.json');

const DEFAULT_STATE: BuffyState = {
  actionHistory: [],
  preferences: {
    language: 'es',
  },
};

export function loadState(): BuffyState {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = readFileSync(STATE_FILE, 'utf-8');
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    }
  } catch {
    // Corrupted file, use default
  }
  return { ...DEFAULT_STATE };
}

export function saveState(state: BuffyState): void {
  mkdirSync(BUFFY_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export function updateState(patch: Partial<BuffyState>): BuffyState {
  const current = loadState();
  const updated = { ...current, ...patch };
  saveState(updated);
  return updated;
}

export function ensureBuffyDir(): void {
  mkdirSync(BUFFY_DIR, { recursive: true });
}
