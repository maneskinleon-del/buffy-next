// Buffy Next — Identity Provider (v2.2)
// Provides the identity for the current session.
// Used by ActionGate to bind authorization tokens.

import type { Identity } from './types.js';

/**
 * Session-level identity.
 * Constructed once per process. Immutable after creation.
 */
export class IdentityProvider {
  private readonly _session: string;
  private readonly _caller: string;

  constructor(session?: string, caller?: string) {
    this._session = session ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._caller = caller ?? 'cli';
  }

  /** Get the current identity */
  getIdentity(): Identity {
    return {
      session: this._session,
      caller: this._caller,
    };
  }
}
