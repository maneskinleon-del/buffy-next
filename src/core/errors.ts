// Buffy Next — Error Taxonomy
// Explicit error categories for operational hardening.

import type { ErrorCategory } from './telemetry.js';

// ─── Error Classes ─────────────────────────────────────────

/**
 * Base error class for Buffy errors.
 */
export class BuffyError extends Error {
  readonly category: ErrorCategory;
  readonly timestamp: string;
  readonly platform: string;
  readonly query: string;

  constructor(
    category: ErrorCategory,
    message: string,
    options?: {
      platform?: string;
      query?: string;
      cause?: Error;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'BuffyError';
    this.category = category;
    this.timestamp = new Date().toISOString();
    this.platform = options?.platform ?? 'unknown';
    this.query = options?.query ?? '';
  }
}

/**
 * Observation error — failed to read system data.
 */
export class ObservationError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('OBSERVATION_ERROR', message, options);
    this.name = 'ObservationError';
  }
}

/**
 * Freshness error — failed to classify or calculate freshness.
 */
export class FreshnessError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('FRESHNESS_ERROR', message, options);
    this.name = 'FreshnessError';
  }
}

/**
 * Refresh error — failed to refresh stale data.
 */
export class RefreshError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('REFRESH_ERROR', message, options);
    this.name = 'RefreshError';
  }
}

/**
 * Selection error — failed to select relevant checks.
 */
export class SelectionError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('SELECTION_ERROR', message, options);
    this.name = 'SelectionError';
  }
}

/**
 * Context error — failed to build context.
 */
export class ContextError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('CONTEXT_ERROR', message, options);
    this.name = 'ContextError';
  }
}

/**
 * Model error — model returned invalid or unexpected response.
 */
export class ModelError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('MODEL_ERROR', message, options);
    this.name = 'ModelError';
  }
}

/**
 * Platform error — platform-specific failure.
 */
export class PlatformError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('PLATFORM_ERROR', message, options);
    this.name = 'PlatformError';
  }
}

/**
 * Execution error — action execution failed.
 */
export class ExecutionError extends BuffyError {
  constructor(message: string, options?: { platform?: string; query?: string; cause?: Error }) {
    super('EXECUTION_ERROR', message, options);
    this.name = 'ExecutionError';
  }
}

// ─── Error Factory ─────────────────────────────────────────

/**
 * Create an error from a category.
 */
export function createError(
  category: ErrorCategory,
  message: string,
  options?: { platform?: string; query?: string; cause?: Error },
): BuffyError {
  switch (category) {
    case 'OBSERVATION_ERROR':
      return new ObservationError(message, options);
    case 'FRESHNESS_ERROR':
      return new FreshnessError(message, options);
    case 'REFRESH_ERROR':
      return new RefreshError(message, options);
    case 'SELECTION_ERROR':
      return new SelectionError(message, options);
    case 'CONTEXT_ERROR':
      return new ContextError(message, options);
    case 'MODEL_ERROR':
      return new ModelError(message, options);
    case 'PLATFORM_ERROR':
      return new PlatformError(message, options);
    case 'EXECUTION_ERROR':
      return new ExecutionError(message, options);
    default:
      return new BuffyError(category, message, options);
  }
}

// ─── Error Classification ──────────────────────────────────

/**
 * Classify an unknown error into a category.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof BuffyError) {
    return error.category;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('observation') || message.includes('system info')) {
      return 'OBSERVATION_ERROR';
    }
    if (message.includes('freshness') || message.includes('stale')) {
      return 'FRESHNESS_ERROR';
    }
    if (message.includes('refresh')) {
      return 'REFRESH_ERROR';
    }
    if (message.includes('selection') || message.includes('check')) {
      return 'SELECTION_ERROR';
    }
    if (message.includes('context') || message.includes('build')) {
      return 'CONTEXT_ERROR';
    }
    if (message.includes('model') || message.includes('response')) {
      return 'MODEL_ERROR';
    }
    if (message.includes('platform') || message.includes('adapter')) {
      return 'PLATFORM_ERROR';
    }
    if (message.includes('execution') || message.includes('action')) {
      return 'EXECUTION_ERROR';
    }
  }

  return 'EXECUTION_ERROR'; // Default category
}
