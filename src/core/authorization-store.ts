// Buffy Next — Authorization Store (v2.2)
// Single-use authorization tokens for CONFIRM actions.
// States: issued → claimed → consumed (or expired)
//
// Design notes:
// - In-memory only (Buffy CLI is single-process, single-session)
// - No currentTokenId as instance state — tokenId is always a local variable
// - No claimLatest() — every claim targets a specific tokenId
// - Claim is atomic within the Node.js event loop (single-threaded)
// - Tokens expire after 5 minutes (CONFIRM actions require immediate user consent)
// - Cross-process protection is NOT needed for CLI usage

import { randomBytes } from 'node:crypto';
import type {
  AuthorizationToken,
  AuthorizationTokenState,
  CanonicalRequest,
  Identity,
} from './types.js';

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory authorization store.
 * Each token is single-use: issued → claimed → consumed (or expired).
 */
export class AuthorizationStore {
  /** tokenId → token */
  private tokens = new Map<string, AuthorizationToken>();

  /**
   * Issue a new authorization token for a CONFIRM action.
   * Called by ActionGate after user approves.
   *
   * @param identity - Who is requesting
   * @param request - The canonical request being authorized
   * @returns The issued token (must be claimed before execution)
   */
  issue(identity: Identity, request: CanonicalRequest): AuthorizationToken {
    const now = new Date();
    const token: AuthorizationToken = {
      tokenId: `tok-${randomBytes(8).toString('hex')}`,
      identity,
      actionId: request.actionId,
      canonicalTarget: request.target,
      platform: request.platform,
      state: 'issued',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
    };

    this.tokens.set(token.tokenId, token);
    return token;
  }

  /**
   * Claim a token for execution.
   * Atomic within the event loop — exactly one claim wins.
   *
   * @param tokenId - The token to claim
   * @param request - The canonical request (must match the token's binding)
   * @returns The claimed token, or null if claim failed
   */
  claim(tokenId: string, request: CanonicalRequest): AuthorizationToken | null {
    const token = this.tokens.get(tokenId);
    if (!token) return null;

    // Check expiry
    if (new Date() > token.expiresAt) {
      token.state = 'expired';
      return null;
    }

    // Check state — only 'issued' can be claimed
    if (token.state !== 'issued') {
      return null;
    }

    // Check binding — token must match the request
    if (token.actionId !== request.actionId) return null;
    if (token.canonicalTarget !== request.target) return null;
    if (token.platform !== request.platform) return null;

    // Claim — atomic within event loop
    token.state = 'claimed';
    return token;
  }

  /**
   * Consume a claimed token after successful execution.
   * Prevents reuse.
   *
   * @param tokenId - The token to consume
   * @returns true if consumed, false if not found or not in claimed state
   */
  consume(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;
    if (token.state !== 'claimed') return false;

    token.state = 'consumed';
    return true;
  }

  /**
   * Check if a token exists and is in a specific state.
   * Does not modify the token.
   */
  getToken(tokenId: string): AuthorizationToken | undefined {
    return this.tokens.get(tokenId);
  }

  /**
   * Expire all tokens older than TTL.
   * Called periodically or before issuing new tokens.
   */
  expireStale(): void {
    const now = new Date();
    for (const token of this.tokens.values()) {
      if (token.state === 'issued' && now > token.expiresAt) {
        token.state = 'expired';
      }
    }
  }

  /**
   * Remove consumed and expired tokens to free memory.
   */
  cleanup(): void {
    for (const [id, token] of this.tokens) {
      if (token.state === 'consumed' || token.state === 'expired') {
        this.tokens.delete(id);
      }
    }
  }
}
