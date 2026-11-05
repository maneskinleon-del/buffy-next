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

// ═════════════════════ Fase 2 — idempotencia (at-most-once) ═════════════════════
// Diseño: ai-context/reports/execution-journal-phase1/design-v3.md
// Garantía: para una key dada el executor se invoca como máximo una vez, salvo
// resolución humana (efecto_ausente_confirmado). La key protege la invocación
// del executor, no el efecto físico. Estados derivados NUNCA se escriben.

// ─── Fault injection (§9) ──────────────────────────────────────────────

export const FAULT_POINTS = ['after_started', 'after_claim', 'after_execute', 'before_terminal_append'] as const;

/**
 * §9: BUFFY_FAULT_POINT solo actúa si la variable está definida; hace
 * process.exit(137) en el proceso que atraviesa el punto (hijo spawnSync),
 * nunca dentro del runner de tests.
 */
export function hitFaultPoint(point: string): void {
  if (process.env.BUFFY_FAULT_POINT === point) {
    process.exit(137);
  }
}

// ─── Clave (§3) ────────────────────────────────────────────────────────

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]+$/;

/**
 * §3 + §10-T3: 1–256 caracteres ASCII imprimibles Y sin separadores de ruta.
 * La key nunca es nombre de archivo, pero las claves peligrosas ('../x', 'a/b',
 * con '\') se rechazan al validar (invalid_key), sin tocar disco.
 */
export function validateIdempotencyKey(key: unknown): boolean {
  return (
    typeof key === 'string' &&
    key.length >= 1 &&
    key.length <= 256 &&
    IDEMPOTENCY_KEY_PATTERN.test(key) &&
    !key.includes('/') &&
    !key.includes('\\')
  );
}

/** Identificador interno (§3): nunca es nombre de archivo. */
export function keyHashOf(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

// ─── Liveness (§7: una sola regla, cuatro condiciones) ─────────────────

function readBootId(): string | null {
  if (process.platform !== 'linux') return null;
  try {
    return readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim();
  } catch {
    return null;
  }
}

/** Campo 22 de /proc/<pid>/stat (starttime), cortando tras el último ')'. */
function readStarttime(pid: number): number | null {
  if (process.platform !== 'linux' || !pid || pid <= 0) return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const after = stat.slice(stat.lastIndexOf(')') + 2);
    const fields = after.split(/\s+/);
    const value = Number(fields[19]); // token 19 tras ')' → campo 22
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export interface LivenessFields {
  pid: number;
  hostname: string;
  bootId: string | null;
  starttime: number | null;
}

export function currentLivenessFields(): LivenessFields {
  return { pid: process.pid, hostname: hostname(), bootId: readBootId(), starttime: readStarttime(process.pid) };
}

export interface OwnerLiveness {
  alive: boolean;
  diagnostics: string[];
}

/**
 * §7: el dueño de un `started` está vivo si y solo si coinciden las cuatro
 * condiciones (hostname, bootId, kill(pid,0), starttime). Cualquier discrepancia
 * → dueño muerto. Sin /proc: solo hostname + kill, protección reducida anotada.
 */
export function startedOwnerAlive(entry: { pid?: number; hostname?: string; bootId?: string | null; starttime?: number | null }): OwnerLiveness {
  const diagnostics: string[] = [];
  // a: hostname; otro host nunca es verificable localmente → muerto (fail-closed)
  if (entry.hostname && entry.hostname !== hostname()) {
    return { alive: false, diagnostics: ['hostname_distinto'] };
  }
  const boot = readBootId();
  if (boot === null) {
    diagnostics.push('sin_proc_liveness_reducido_hostname_kill');
  } else if (entry.bootId && entry.bootId !== boot) {
    return { alive: false, diagnostics: ['boot_id_distinto'] };
  }
  // c: kill(pid, 0) no falla
  if (!entry.pid || entry.pid <= 0) {
    diagnostics.push('pid_invalido');
    return { alive: false, diagnostics };
  }
  try {
    process.kill(entry.pid, 0);
  } catch (e: any) {
    if (e.code === 'EPERM') {
      diagnostics.push('pid_vivo_eperm');
    } else {
      diagnostics.push('pid_muerto');
      return { alive: false, diagnostics };
    }
  }
  // d: starttime actual == guardado (mitiga reutilización de PID)
  if (boot !== null) {
    const current = readStarttime(entry.pid);
    if (current !== null && entry.starttime !== undefined && entry.starttime !== null && entry.starttime !== current) {
      return { alive: false, diagnostics: ['starttime_distinto_reutilizacion_pid'] };
    }
  } else if (entry.starttime !== undefined && entry.starttime !== null) {
    diagnostics.push('starttime_no_verificable_sin_proc');
  }
  return { alive: true, diagnostics };
}

// ─── Entradas con key (§4) ─────────────────────────────────────────────

export type Phase2EntryType = 'started' | 'completed' | 'failed' | 'aborted' | 'resolution';

export interface Phase2Entry {
  type: Phase2EntryType;
  idempotencyKey: string;
  keyHash: string;
  fingerprint: string;
  actionId: string;
  target: string;
  platform: string;
  executionId: string;
  requestId?: string;
  ts: string;
  pid?: number;
  hostname?: string;
  bootId?: string | null;
  starttime?: number | null;
  result?: { success: boolean; message: string } | null;
  resolution?: JournalResolution;
  reason?: string;
  evidence?: string;
  resolvedBy?: string;
}

const PHASE2_TYPES = new Set<string>(['started', 'completed', 'failed', 'aborted', 'resolution']);

/**
 * Append con fsync SIN lock (§3): solo llamarla cuando el caller ya sostiene
 * journal.lock (beginKey/resolveKey) — volver a adquirir el lock en profundidad
 * sería un deadlock de 5s. appendEntryUnderLock envuelve esta función con lock
 * propio para los puntos que NO lo sostienen (finishKey).
 */
function writeEntryLine(raw: object): boolean {
  try {
    const fd = openSync(getJournalPath(), 'a');
    try {
      writeAll(fd, Buffer.from(JSON.stringify(raw) + '\n', 'utf-8'));
      fsyncFile(fd);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

/** Append genérico bajo journal.lock con fsync (§3: sin locks por key). */
function appendEntryUnderLock(raw: object): boolean {
  ensureDirs();
  const lock = acquireJournalLock();
  if (!lock.acquired) {
    return false;
  }
  try {
    return writeEntryLine(raw);
  } finally {
    releaseJournalLock(lock);
  }
}

interface KeyScan {
  entries: JournalEntry[];
  corruptAffecting: boolean;
  /** true si el archivo del journal existe pero no se pudo LEER (p.ej. EISDIR/IO): falla de E/S, no de contenido. */
  ioError?: boolean;
  diagnostics: string[];
}

function corruptAffectsKey(segment: string, keyHash: string | null, key: string | null): boolean {
  if (!keyHash) return false;
  if (segment.includes(`"keyHash":"${keyHash}"`)) return true;
  if (key && segment.includes(key)) return true;
  return false;
}

/**
 * Lectura cruda sin lock (§3): la última línea sin '\n' o con JSON inválido se
 * ignora (truncamiento); una línea corrupta intermedia que afecta a la key
 * consultada enciende corruptAffecting → fail-closed en derivedKeyState.
 */
function scanJournalRawFor(keyHash: string | null, key: string | null): KeyScan {
  const diagnostics: string[] = [];
  let content = '';
  try {
    if (existsSync(getJournalPath())) {
      content = readFileSync(getJournalPath(), 'utf-8');
    }
  } catch (e: any) {
    diagnostics.push(`lectura_journal_fallida:${e.code ?? e.message}`);
    // I/O ilegible ≠ línea corrupta: beginKey debe fallar el append started (§10-T10)
    return { entries: [], corruptAffecting: false, ioError: true, diagnostics };
  }
  const endsWithNewline = content.endsWith('\n');
  const segments = content.split('\n').filter((s) => s.trim().length > 0);
  const lastIdx = segments.length - 1;
  const entries: JournalEntry[] = [];
  let corruptAffecting = false;
  segments.forEach((segment, i) => {
    let parsed: JournalEntry;
    try {
      parsed = JSON.parse(segment);
    } catch {
      const isTruncatedLast = !endsWithNewline && i === lastIdx;
      if (isTruncatedLast) {
        diagnostics.push('linea_truncada_al_final_ignorada');
        return;
      }
      if (corruptAffectsKey(segment, keyHash, key)) {
        corruptAffecting = true;
        diagnostics.push('linea_corrupta_afecta_key_consultada');
      }
      return;
    }
    entries.push(parsed);
  });
  return { entries, corruptAffecting, diagnostics };
}

// ─── Estados derivados (§4/§5: nunca se escriben) ──────────────────────

export type KeyState = 'proceed' | 'cached' | 'in_progress' | 'needs_resolution' | 'key_conflict';

export interface CachedPayload {
  resolved?: boolean;
  result?: { success: boolean; message: string } | null;
}

export interface KeyStateInfo {
  state: KeyState;
  cached?: CachedPayload;
  lastEntry?: Phase2Entry;
  startedExecutionId?: string;
  fingerprint?: string;
  ioError?: boolean;
  diagnostics: string[];
}

/**
 * Deriva el estado de una key desde el journal (§5). requestFingerprint presente
 * → key_conflict si algún registro de la key usa otra fingerprint (§5: se evalúa
 * primero, también tras una reapertura).
 */
export function deriveKeyState(key: string, requestFingerprint?: string): KeyStateInfo {
  const kh = keyHashOf(key);
  const scan = scanJournalRawFor(kh, key);
  if (scan.ioError) {
    // fail-closed: journal ilegible; el estado real es desconocido
    return { state: 'needs_resolution', ioError: true, diagnostics: scan.diagnostics };
  }
  if (scan.corruptAffecting) {
    // fail-closed (§3): línea corrupta intermedia que afecta a la key consultada
    return { state: 'needs_resolution', diagnostics: [...scan.diagnostics, 'fail_closed_linea_corrupta_key'] };
  }
  const keyEntries = scan.entries.filter((e) => PHASE2_TYPES.has(String((e as any).type)) && (e as any).keyHash === kh) as unknown as Phase2Entry[];
  if (keyEntries.length === 0) {
    return { state: 'proceed', diagnostics: scan.diagnostics };
  }
  if (requestFingerprint && keyEntries.some((e) => e.fingerprint !== requestFingerprint)) {
    const last = keyEntries[keyEntries.length - 1];
    return { state: 'key_conflict', lastEntry: last, fingerprint: last.fingerprint, diagnostics: scan.diagnostics };
  }
  const last = keyEntries[keyEntries.length - 1];
  const startedEntry = [...keyEntries].reverse().find((e) => e.type === 'started');
  const base = { lastEntry: last, startedExecutionId: startedEntry?.executionId, fingerprint: last.fingerprint, diagnostics: scan.diagnostics };
  switch (last.type) {
    case 'started': {
      const liveness = startedOwnerAlive(last);
      if (liveness.alive) {
        return { ...base, state: 'in_progress' };
      }
      return { ...base, state: 'needs_resolution', diagnostics: [...scan.diagnostics, ...liveness.diagnostics] };
    }
    case 'completed':
      return { ...base, state: 'cached', cached: { result: last.result ?? null } };
    case 'failed':
      return { ...base, state: 'needs_resolution' };
    case 'aborted':
      return { ...base, state: 'proceed' };
    case 'resolution':
      if (last.resolution === 'efecto_confirmado') {
        return { ...base, state: 'cached', cached: { resolved: true, result: null } };
      }
      if (last.resolution === 'efecto_ausente_confirmado') {
        return { ...base, state: 'proceed' };
      }
      return { ...base, state: 'needs_resolution' }; // abandonada_sin_determinar: bloqueada para siempre
  }
}

// ─── beginKey (§5: atómico bajo journal.lock) ───────────────────────────

export interface BeginKeyContext {
  fingerprint: string;
  actionId: string;
  target: string;
  platform: string;
  requestId?: string;
  /** Si el llamador ya emitió un executionId, se usa; si no, beginKey genera uno. */
  executionId?: string;
}

export type BeginKeyOutcome =
  | { state: 'proceed'; executionId: string; fingerprint: string; diagnostics: string[] }
  | { state: 'cached'; fingerprint: string; cached: CachedPayload; message: string; diagnostics: string[] }
  | { state: 'in_progress'; fingerprint: string; executionId?: string; message: string; diagnostics: string[] }
  | { state: 'needs_resolution' | 'key_conflict'; fingerprint: string; message: string; diagnostics: string[] }
  | { state: 'invalid_key' };

/**
 * §5: rele el journal dentro del lock, toma la última entrada de la key y decide.
 * Solo proceed escribe un `started` (con fsync). Lanza si el lock no está
 * disponible o el append falla: el llamador recibe el error y la key queda
 * sin entradas (§4: no hay nada que abortar).
 */
export function beginKey(key: string, ctx: BeginKeyContext): BeginKeyOutcome {
  if (!validateIdempotencyKey(key)) {
    return { state: 'invalid_key' };
  }
  const lock = acquireJournalLock();
  if (!lock.acquired) {
    throw new Error('journal_lock_no_disponible');
  }
  let outcome: BeginKeyOutcome;
  try {
    // Relectura dentro del lock (§5)
    const info = deriveKeyState(key, ctx.fingerprint);
    if (info.ioError) {
      // §10-T10: fallo del append started → error al llamador, sin entradas; reintento = proceed
      throw new Error(`fallo_append_started: journal ilegible (${info.diagnostics.join('; ') || 'EIO'})`);
    }
    switch (info.state) {
      case 'cached':
        outcome = { state: 'cached', fingerprint: ctx.fingerprint, cached: info.cached ?? { result: null }, message: 'cached', diagnostics: info.diagnostics };
        break;
      case 'in_progress':
        outcome = { state: 'in_progress', fingerprint: ctx.fingerprint, executionId: info.startedExecutionId, message: 'in_progress (dueño vivo)', diagnostics: info.diagnostics };
        break;
      case 'needs_resolution':
        outcome = { state: 'needs_resolution', fingerprint: ctx.fingerprint, message: 'needs_resolution', diagnostics: info.diagnostics };
        break;
      case 'key_conflict':
        outcome = { state: 'key_conflict', fingerprint: ctx.fingerprint, message: 'key_conflict: la key ya está registrada con otra fingerprint', diagnostics: info.diagnostics };
        break;
      case 'proceed': {
        const fields = currentLivenessFields();
        const executionId = ctx.executionId ?? `exec-${randomBytes(8).toString('hex')}`;
        const entry: Phase2Entry = {
          type: 'started',
          idempotencyKey: key,
          keyHash: keyHashOf(key),
          fingerprint: ctx.fingerprint,
          actionId: ctx.actionId,
          target: ctx.target,
          platform: ctx.platform,
          executionId,
          requestId: ctx.requestId,
          ts: new Date().toISOString(),
          pid: fields.pid,
          hostname: fields.hostname,
          bootId: fields.bootId,
          starttime: fields.starttime,
        };
        if (!writeEntryLine(entry)) {
          throw new Error('fallo_append_started');
        }
        outcome = { state: 'proceed', executionId, fingerprint: ctx.fingerprint, diagnostics: info.diagnostics };
        break;
      }
    }
  } finally {
    releaseJournalLock(lock);
  }
  // Fuera del lock: un crash aquí deja solo el started persistido y sin claim (§9)
  hitFaultPoint('after_started');
  return outcome;
}

// ─── finishKey (§6: append terminal completed/failed/aborted) ──────────

export interface FinishKeyContext {
  fingerprint: string;
  actionId: string;
  target: string;
  platform: string;
  executionId: string;
  requestId?: string;
}

/**
 * §6.4: Excepción → `failed`; retorno → `completed` con result. `aborted` solo
 * existe después de un started persistido (p.ej. claim_exists, §4). Devuelve
 * false si el append falla: el llamador NO libera el claim en ese caso (§6.5).
 */
export function finishKey(
  key: string,
  ctx: FinishKeyContext,
  status: 'completed' | 'failed' | 'aborted',
  opts: { result?: { success: boolean; message: string } | null; reason?: string } = {},
): boolean {
  if (!validateIdempotencyKey(key)) {
    return false;
  }
  const entry: Phase2Entry = {
    type: status,
    idempotencyKey: key,
    keyHash: keyHashOf(key),
    fingerprint: ctx.fingerprint,
    actionId: ctx.actionId,
    target: ctx.target,
    platform: ctx.platform,
    executionId: ctx.executionId,
    requestId: ctx.requestId,
    ts: new Date().toISOString(),
    result: opts.result ?? null,
    ...(status === 'aborted' ? { reason: opts.reason ?? 'claim_exists' } : {}),
  };
  return appendEntryUnderLock(entry);
}

// ─── lookupKey (lectura fuera del gate) ────────────────────────────────

/** Estado derivado sin escribir nada. Key inválida → fail-closed. */
export function lookupKey(key: string, requestFingerprint?: string): KeyStateInfo {
  if (!validateIdempotencyKey(key)) {
    return { state: 'needs_resolution', diagnostics: ['invalid_key'] };
  }
  return deriveKeyState(key, requestFingerprint);
}

// ─── resolveKey (§8: corre bajo journal.lock y relee el estado) ────────

export interface ResolveKeyOptions {
  reason?: string;
  evidence?: string;
  resolvedBy?: string;
}

export type ResolveKeyOutcome =
  | { ok: true; resolution: JournalResolution; claimReleased: boolean }
  | {
      ok: false;
      error: 'invalid_key' | 'invalid_resolution' | 'missing_reason' | 'missing_evidence' | 'owner_alive' | 'not_resolvable' | 'write_failed';
      message: string;
    };

export const JOURNAL_RESOLUTIONS: JournalResolution[] = ['efecto_confirmado', 'efecto_ausente_confirmado', 'abandonada_sin_determinar'];

/**
 * §8: solo actúa si el estado derivado es needs_resolution. Escribe la entrada
 * `resolution` (append-only) y después intenta liberar el claim solo si su
 * executionId coincide con el de `started`. abandonada_sin_determinar conserva
 * el claim (§8.6). Si la escritura funciona pero liberar falla, la key ya no es
 * needs_resolution y el claim huérfano se limpia con `journal resolve` por claim
 * de Fase 1 (§8.7).
 */
export function resolveKey(key: string, resolution: string, opts: ResolveKeyOptions): ResolveKeyOutcome {
  if (!validateIdempotencyKey(key)) {
    return { ok: false, error: 'invalid_key', message: 'invalid_key: 1–256 caracteres ASCII imprimibles' };
  }
  if (!JOURNAL_RESOLUTIONS.includes(resolution as JournalResolution)) {
    return { ok: false, error: 'invalid_resolution', message: `Resolución inválida: ${resolution}. Valores admitidos: ${JOURNAL_RESOLUTIONS.join(' | ')}` };
  }
  const res = resolution as JournalResolution;
  const reason = (opts.reason ?? '').trim();
  const evidence = (opts.evidence ?? '').trim();
  if (reason.length === 0) {
    return { ok: false, error: 'missing_reason', message: 'missing_reason: la resolución exige motivo auditable' };
  }
  if (res === 'efecto_ausente_confirmado' && evidence.length === 0) {
    return { ok: false, error: 'missing_evidence', message: 'missing_evidence: efecto_ausente_confirmado exige evidence' };
  }

  const lock = acquireJournalLock();
  if (!lock.acquired) {
    throw new Error('journal_lock_no_disponible');
  }
  try {
    // Relectura bajo lock (§8)
    const info = deriveKeyState(key);
    if (info.state === 'in_progress') {
      return { ok: false, error: 'owner_alive', message: 'owner_alive: el dueño del started sigue vivo' };
    }
    if (info.state === 'proceed' || info.state === 'cached' || info.state === 'key_conflict') {
      return { ok: false, error: 'not_resolvable', message: `not_resolvable: la key está en estado ${info.state}` };
    }
    if (info.state !== 'needs_resolution') {
      return { ok: false, error: 'not_resolvable', message: `not_resolvable: la key está en estado ${info.state}` };
    }

    const last = info.lastEntry;
    const entry: Phase2Entry = {
      type: 'resolution',
      idempotencyKey: key,
      keyHash: keyHashOf(key),
      fingerprint: last?.fingerprint ?? '',
      actionId: last?.actionId ?? '',
      target: last?.target ?? '',
      platform: last?.platform ?? '',
      executionId: info.startedExecutionId ?? '',
      ts: new Date().toISOString(),
      resolution: res,
      reason,
      ...(evidence ? { evidence } : {}),
      resolvedBy: opts.resolvedBy ?? 'human',
    };
    if (!writeEntryLine(entry)) {
      return { ok: false, error: 'write_failed', message: 'write_failed: no se pudo escribir la resolución en el journal' };
    }

    // Claim: colocar después de la resolución escrita (§8.3/§8.7)
    let claimReleased = false;
    const claimPath = join(getInflightDir(), `${entry.fingerprint}.json`);
    if (res === 'abandonada_sin_determinar') {
      claimReleased = false; // el claim se conserva (§8.6)
    } else if (!existsSync(claimPath)) {
      claimReleased = true; // nada que liberar
    } else {
      claimReleased = releaseInflight(entry.fingerprint, info.startedExecutionId ? { executionId: info.startedExecutionId } : {});
    }

    return { ok: true, resolution: res, claimReleased };
  } finally {
    releaseJournalLock(lock);
  }
}
