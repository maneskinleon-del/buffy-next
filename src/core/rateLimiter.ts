// Buffy Next — Rate Limiter
// Retry configuration with exponential backoff for system commands.
//
// System commands (execSync, rish, ADB, etc.) can fail transiently due to:
// - Temporary file locks
// - Network timeouts
// - Process contention
// - Device state transitions (e.g., Shizuku reconnection)
//
// This module provides a configuration factory, not a retry executor.
// The actual retry logic lives in the caller (pipeline, adapters, etc.).

// ─── Default Configuration ─────────────────────────────────

const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  /** 3 retries — enough for transient failures without excessive delay */
  maxRetries: 3,
  /** 1000 ms base backoff — allows transient issues to resolve */
  backoffMs: 1000,
};

// ─── Interface ─────────────────────────────────────────────

export interface RateLimiterConfig {
  maxRetries: number;
  backoffMs: number;
}

// ─── Factory ───────────────────────────────────────────────

/**
 * Create a rate limiter configuration with sensible defaults.
 *
 * @param overrides - Optional partial overrides for the default config.
 * @returns RateLimiterConfig with defaults merged with any provided overrides.
 */
export function createRateLimiter(overrides?: Partial<RateLimiterConfig>): RateLimiterConfig {
  return { ...DEFAULT_RATE_LIMITER_CONFIG, ...overrides };
}
