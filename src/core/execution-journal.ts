// Buffy Next — Execution Journal (Fase 1)
// Durable, concurrently-safe execution journaling for ActionGate.
// Extends existing architecture without replacing it.
//
// Design principles:
// - Atomic publish of inflight claims (temp + fsync + rename + fsync dir)
// - Append-only journal.jsonl with serialized writes via exclusive lock
// - Conservative recovery - never auto-release unknown claims
// - ActionGate remains the only authorized executor
// - No idempotency guarantees across sequential re-invocations (Fase 2)

import { randomBytes, createHash } from 'node:crypto';
import {
  openSync,
  writeSync,
  readSync,
  closeSync,
  fsyncSync,
  renameSync,
  linkSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';

export function getBuffyDir(): string {
  if (process.env.BUFFY_DIR) return process.env.BUFFY_DIR;
  return join(homedir(), '.buffy');
}
export function getInflightDir(): string { return join(getBuffyDir(), 'inflight'); }
export function getJournalPath(): string { return join(getBuffyDir(), 'journal.jsonl'); }
export function getJournalLockPath(): string { return join(getBuffyDir(), 'journal.lock'); }
export function getStateLockPath(): string { return join(getBuffyDir(), 'state.lock'); }
// Keep for backward compatibility but make them dynamic
export const BUFFY_DIR = join(homedir(), '.buffy'); // fallback only
export const INFLIGHT_DIR = join(BUFFY_DIR, 'inflight');
export const JOURNAL_PATH = join(BUFFY_DIR, 'journal.jsonl');
export const JOURNAL_LOCK_PATH = join(BUFFY_DIR, 'journal.lock');
export const STATE_LOCK_PATH = join(BUFFY_DIR, 'state.lock');

export type JournalResolution = 'efecto_confirmado' | 'efecto_ausente_confirmado' | 'abandonada_sin_determinar';

export interface InflightClaim {
  fingerprint: string;
  actionId: string;
  target: string;
  platform: string;
  requestId?: string;
  executionId?: string;
  pid: number;
  hostname: string;
  startedAt: string;
  [key: string]: unknown;
}

export interface JournalEntry {
  type: 'execution' | 'resolution';
  fingerprint: string;
  actionId: string;
  target: string;
  platform: string;
  requestId?: string;
  executionId?: string;
  timestamp: string;
  pid?: number;
  hostname?: string;
  status?: 'success' | 'failed' | 'unknown';
  message?: string;
  evidenceLevel?: string;
  resolution?: JournalResolution;
  resolvedBy?: string;
  resolutionReason?: string;
  [key: string]: unknown;
}

function ensureDirs(): void {
  mkdirSync(getBuffyDir(), { recursive: true });
  mkdirSync(getInflightDir(), { recursive: true });
}

function computeFingerprint(actionId: string, target: string, platform: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ actionId, target, platform }, null, 0))
    .digest('hex');
}

export function getFingerprint(actionId: string, target: string, platform: string): string {
  return computeFingerprint(actionId, target, platform);
}

function writeAll(fd: number, buf: Buffer): void {
  let off = 0;
  while (off < buf.length) {
    off += writeSync(fd, buf, off);
  }
}

function fsyncFile(fd: number): void {
  try {
    fsyncSync(fd);
  } catch {
    // Best effort; platform dependent
  }
}

function fsyncDir(dir: string): void {
  try {
    const dfd = openSync(dir, 'r');
    try {
      fsyncSync(dfd);
    } finally {
      closeSync(dfd);
    }
  } catch {
    // Best effort; not supported on all platforms
  }
}

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    if (e.code === 'ESRCH') return false;
    if (e.code === 'EPERM') return true; // process exists but no permission
    return false;
  }
}

function tryAcquireLock(lockPath: string): number | null {
  try {
    const fd = openSync(lockPath, 'wx');
    // Write lock info
    const lockInfo = JSON.stringify({ pid: process.pid, hostname: hostname(), acquiredAt: new Date().toISOString() }) + '\n';
    writeAll(fd, Buffer.from(lockInfo, 'utf-8'));
    fsyncFile(fd);
    return fd;
  } catch (e: any) {
    if (e.code === 'EEXIST') return null;
    throw e;
  }
}

function releaseLock(lockPath: string, fd: number | null): void {
  if (fd !== null) {
    try {
      closeSync(fd);
    } catch {}
  }
  try {
    unlinkSync(lockPath);
  } catch {}
}

export function acquireJournalLock(timeoutMs = 5000): { fd: number | null; acquired: boolean } {
  ensureDirs();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fd = tryAcquireLock(getJournalLockPath());
    if (fd !== null) return { fd, acquired: true };
    // Check if lock is abandoned
    try {
      if (existsSync(getJournalLockPath())) {
        const content = readFileSync(getJournalLockPath(), 'utf-8');
        try {
          const info = JSON.parse(content.trim());
          if (info.pid && !isProcessAlive(info.pid)) {
            // Abandoned lock - but we must be conservative and not auto-delete
          }
        } catch {}
      }
    } catch {}
    const end = Date.now() + 10;
    while (Date.now() < end) {}
  }
  return { fd: null, acquired: false };
}

export function acquireStateLock(timeoutMs = 5000): { fd: number | null; acquired: boolean } {
  ensureDirs();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fd = tryAcquireLock(getStateLockPath());
    if (fd !== null) return { fd, acquired: true };
    const end = Date.now() + 10;
    while (Date.now() < end) {}
  }
  return { fd: null, acquired: false };
}

export function releaseJournalLock(lock: { fd: number | null; acquired: boolean }): void {
  if (lock.acquired) {
    releaseLock(getJournalLockPath(), lock.fd);
  }
}

export function releaseStateLock(lock: { fd: number | null; acquired: boolean }): void {
  if (lock.acquired) {
    releaseLock(getStateLockPath(), lock.fd);
  }
}

export function claimInflight(actionId: string, target: string, platform: string, opts: { requestId?: string; executionId?: string } = {}): 
  { claimed: boolean; fingerprint: string; claimPath: string; reason?: string } {
  ensureDirs();
  const fingerprint = getFingerprint(actionId, target, platform);
  const inflightDir = getInflightDir();
  const claimPath = join(inflightDir, `${fingerprint}.json`);
  
  const claim: InflightClaim = {
    fingerprint,
    actionId,
    target,
    platform,
    requestId: opts.requestId,
    executionId: opts.executionId,
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
  };
  
  const tmpPath = join(inflightDir, `.tmp-${fingerprint}-${process.pid}-${randomBytes(4).toString('hex')}`);
  
  try {
    // Create temporary file exclusively
    const fd = openSync(tmpPath, 'wx');
    try {
      const content = JSON.stringify(claim, null, 2) + '\n';
      const buf = Buffer.from(content, 'utf-8');
      writeAll(fd, buf);
      fsyncFile(fd);
    } finally {
      closeSync(fd);
    }
    
    // Publish via linkSync (doesn't replace existing)
    try {
      linkSync(tmpPath, claimPath);
    } catch (e: any) {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
      if (e.code === 'EEXIST') {
        return { claimed: false, fingerprint, claimPath, reason: 'claim_exists' };
      }
      throw e;
    }
    
    // Remove temporary
    try { unlinkSync(tmpPath); } catch {}
    fsyncDir(inflightDir);
    return { claimed: true, fingerprint, claimPath };
  } catch (e: any) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}
    if (e.code === 'EEXIST') {
      return { claimed: false, fingerprint, claimPath, reason: 'claim_exists' };
    }
    return { claimed: false, fingerprint, claimPath, reason: e.message };
  }
}

export function releaseInflight(fingerprint: string): boolean {
  ensureDirs();
  const claimPath = join(getInflightDir(), `${fingerprint}.json`);
  try {
    if (existsSync(claimPath)) {
      unlinkSync(claimPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function readInflight(fingerprint: string): InflightClaim | null {
  ensureDirs();
  const claimPath = join(getInflightDir(), `${fingerprint}.json`);
  try {
    if (!existsSync(claimPath)) return null;
    const content = readFileSync(claimPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function listInflight(): InflightClaim[] {
  ensureDirs();
  try {
    const inflightDir = getInflightDir();
    const files = readdirSync(inflightDir);
    const claims: InflightClaim[] = [];
    for (const f of files) {
      if (f.endsWith('.json') && !f.startsWith('.tmp-')) {
        try {
          const content = readFileSync(join(inflightDir, f), 'utf-8');
          const claim = JSON.parse(content);
          claims.push(claim);
        } catch {}
      }
    }
    return claims;
  } catch {
    return [];
  }
}

export function appendToJournal(entry: JournalEntry): boolean {
  ensureDirs();
  const lock = acquireJournalLock();
  if (!lock.acquired) {
    return false;
  }
  try {
    const line = JSON.stringify(entry) + '\n';
    const fd = openSync(getJournalPath(), 'a');
    try {
      const buf = Buffer.from(line, 'utf-8');
      writeAll(fd, buf);
      fsyncFile(fd);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  } finally {
    releaseJournalLock(lock);
  }
}

export function readJournal(): JournalEntry[] {
  ensureDirs();
  try {
    if (!existsSync(getJournalPath())) return [];
    const content = readFileSync(getJournalPath(), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const entries: JournalEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip invalid lines (partial writes)
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function reconcileClaim(fingerprint: string, expected?: { executionId?: string; requestId?: string }): { reconciled: boolean; hadEntry: boolean } {
  const journal = readJournal();
  const claim = readInflight(fingerprint);
  if (!claim) {
    return { reconciled: false, hadEntry: false };
  }
  // Require correlation - do not release based solely on old entries with same fingerprint
  const execId = expected?.executionId || claim?.executionId;
  const reqId = expected?.requestId || claim?.requestId;
  
  if (!execId && !reqId) {
    if (isProcessAlive(claim.pid)) {
      return { reconciled: false, hadEntry: false };
    }
    return { reconciled: false, hadEntry: false };
  }
  
  // Look for match - if both exist, both must match in same record
  let hasExactMatch = false;
  if (execId && reqId) {
    hasExactMatch = journal.some(e => 
      e.type === 'execution' && 
      e.executionId === execId && 
      e.requestId === reqId
    );
  } else if (execId) {
    hasExactMatch = journal.some(e => 
      e.type === 'execution' && 
      e.executionId === execId
    );
  } else if (reqId) {
    hasExactMatch = journal.some(e => 
      e.type === 'execution' && 
      e.requestId === reqId
    );
  }
  
  if (hasExactMatch) {
    const released = releaseInflight(fingerprint);
    if (!released) {
      return { reconciled: false, hadEntry: true };
    }
    return { reconciled: true, hadEntry: true };
  }
  
  if (isProcessAlive(claim.pid)) {
    return { reconciled: false, hadEntry: false };
  }
  return { reconciled: false, hadEntry: false };
}

export function resolveClaim(fingerprint: string, resolution: JournalResolution, opts: { resolvedBy?: string; resolutionReason?: string } = {}): boolean {
  const claim = readInflight(fingerprint);
  if (!claim) return false;
  
  // Check if process is still alive
  if (isProcessAlive(claim.pid)) {
    // Do not allow release if process is known active
    return false;
  }
  
  // Record resolution in journal first
  const entry: JournalEntry = {
    type: 'resolution',
    fingerprint,
    actionId: claim.actionId,
    target: claim.target,
    platform: claim.platform,
    requestId: claim.requestId,
    executionId: claim.executionId,
    timestamp: new Date().toISOString(),
    resolution,
    resolvedBy: opts.resolvedBy || 'human',
    resolutionReason: opts.resolutionReason || '',
  };
  
  const written = appendToJournal(entry);
  if (!written) {
    return false;
  }
  
  // Only release after journal is written
  return releaseInflight(fingerprint);
}
