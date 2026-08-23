// Buffy Next — Target Normalizer (v2.2)
// Converts raw parameters into an immutable CanonicalRequest.
// After creation, rawParams must never be read again.

import { randomBytes } from 'node:crypto';
import type { CanonicalRequest, PlatformName } from './types.js';

/**
 * Sanitize a tool/package name.
 * Only allows: letters, numbers, hyphens, dots, underscores, slashes (scoped packages).
 * Rejects anything that could be used for command injection.
 */
export function sanitizeTarget(raw: string): string {
  const sanitized = raw.replace(/[^a-zA-Z0-9._\-/]/g, '');
  if (!sanitized || sanitized.length === 0 || sanitized.length > 100) {
    throw new Error(`Target inválido: "${raw}"`);
  }
  return sanitized;
}

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

/**
 * Normalize raw parameters into an immutable CanonicalRequest.
 *
 * @param actionId - The action to execute
 * @param rawParams - Raw parameters from the caller (e.g., tool name)
 * @param platform - Current platform
 * @returns An immutable CanonicalRequest
 */
export function normalizeTarget(
  actionId: string,
  rawParams: string | undefined,
  platform: PlatformName,
): CanonicalRequest {
  const target = rawParams ? sanitizeTarget(rawParams) : '';

  return Object.freeze({
    requestId: generateRequestId(),
    actionId,
    target,
    platform,
  });
}
