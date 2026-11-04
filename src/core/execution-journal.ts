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

export interface ClaimIdentity {
  executionId?: string;
  requestId?: string;
  pid?: number;
  hostname?: string;
}

/**
 * A claim from another host cannot be liveness-checked from here: a local PID
 * with the same number says nothing about it, so it is never treated as alive.
 */
function isClaimOwnerAlive(claim: InflightClaim): boolean {
  if (claim.hostname && claim.hostname !== hostname()) return false;
  return isProcessAlive(claim.pid);
}

function identityMatches(claim: InflightClaim, expected: ClaimIdentity): boolean {
  if (expected.executionId !== undefined && expected.executionId !== claim.executionId) return false;
  if (expected.requestId !== undefined && expected.requestId !== claim.requestId) return false;
  if (expected.pid !== undefined && expected.pid !== claim.pid) return false;
  if (expected.hostname !== undefined && expected.hostname !== claim.hostname) return false;
  return true;
}

/**
 * Whether `expected` names the claim: a claim carrying executionId/requestId is
 * named by at least one of them; an anonymous claim (no identifiers) needs no
 * naming.
 */
function namesClaim(claim: InflightClaim, expected: ClaimIdentity): boolean {
  if (claim.executionId !== undefined || claim.requestId !== undefined) {
    return (
      (claim.executionId !== undefined && expected.executionId !== undefined) ||
      (claim.requestId !== undefined && expected.requestId !== undefined)
    );
  }
  return true;
}

/**
 * Releases a claim. Identity is mandatory: the caller must name the claim it
 * releases (by executionId or requestId when the claim carries them) and the
 * stored claim is re-read so it must still carry that identity. An operation
 * never deletes a claim other than its own, unnamed or not (same guard
 * `reconcileClaim` applies before releasing).
 */
export function releaseInflight(fingerprint: string, expected: ClaimIdentity = {}): boolean {
  ensureDirs();
  const claimPath = join(getInflightDir(), `${fingerprint}.json`);
  try {
    if (!existsSync(claimPath)) return false;
    const current = readInflight(fingerprint);
    if (!current || !namesClaim(current, expected) || !identityMatches(current, expected)) {
      return false;
    }
    unlinkSync(claimPath);
    return true;
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

export function reconcileClaim(fingerprint: string, expected?: ClaimIdentity): { reconciled: boolean; hadEntry: boolean } {
  const journal = readJournal();
  const claim = readInflight(fingerprint);
  if (!claim) {
    return { reconciled: false, hadEntry: false };
  }
  // Only use identity from the claim we read (source of truth)
  const claimExecId = claim.executionId;
  const claimReqId = claim.requestId;
  
  // If expected provided, it must match claim identity
  if (expected) {
    if (expected.executionId !== undefined && expected.executionId !== claimExecId) {
      return { reconciled: false, hadEntry: false };
    }
    if (expected.requestId !== undefined && expected.requestId !== claimReqId) {
      return { reconciled: false, hadEntry: false };
    }
  }
  
  const execId = claimExecId;
  const reqId = claimReqId;
  
  if (!execId && !reqId) {
    if (isClaimOwnerAlive(claim)) {
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
    // Re-read claim to avoid releasing a different claim if replaced
    const claimAgain = readInflight(fingerprint);
    if (!claimAgain) {
      return { reconciled: false, hadEntry: true };
    }
    if (claimAgain.executionId !== claimExecId || claimAgain.requestId !== claimReqId || claimAgain.pid !== claim.pid) {
      return { reconciled: false, hadEntry: true };
    }
    const released = releaseInflight(fingerprint, {
      executionId: claimExecId,
      requestId: claimReqId,
      pid: claim.pid,
      hostname: claim.hostname,
    });
    if (!released) {
      return { reconciled: false, hadEntry: true };
    }
    return { reconciled: true, hadEntry: true };
  }
  
  if (isClaimOwnerAlive(claim)) {
    return { reconciled: false, hadEntry: false };
  }
  return { reconciled: false, hadEntry: false };
}

export function resolveClaim(
  fingerprint: string,
  resolution: JournalResolution,
  opts: { expected: ClaimIdentity; resolutionReason: string; resolvedBy?: string },
): boolean {
  const claim = readInflight(fingerprint);
  if (!claim) return false;

  // Identity validation: the resolver must name the record it inspected. The
  // usable identifier comes from the claim itself, so a claim carrying
  // executionId/requestId cannot be resolved without naming that value.
  const expected = opts.expected || {};
  const hasVerifiableIdentity =
    (claim.executionId !== undefined && expected.executionId !== undefined) ||
    (claim.requestId !== undefined && expected.requestId !== undefined) ||
    (claim.executionId === undefined && claim.requestId === undefined && expected.pid !== undefined);
  if (!hasVerifiableIdentity || !identityMatches(claim, expected)) {
    return false;
  }

  // Never release a claim whose owner is known to be alive
  if (isClaimOwnerAlive(claim)) {
    return false;
  }

  // A decision without a stated reason is not auditable
  const reason = (opts.resolutionReason || '').trim();
  if (!reason) {
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
    resolutionReason: reason,
  };
  
  const written = appendToJournal(entry);
  if (!written) {
    return false;
  }
  
  // Re-read before deleting: release exactly the claim that was journaled
  const claimAgain = readInflight(fingerprint);
  if (!claimAgain || claimAgain.startedAt !== claim.startedAt || !identityMatches(claimAgain, expected)) {
    return false;
  }

  // Only release after journal is written
  return releaseInflight(fingerprint, expected);
}
