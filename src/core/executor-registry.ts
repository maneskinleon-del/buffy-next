// Buffy Next — Executor Registry Interface (v2.3)
// This module exports ONLY the interface shape.
// No class. No factory function. No executor implementations.
// The actual registry is built inside pipeline.ts and is not publicly accessible.
//
// Security property:
//   The only way to reach a physical executor is:
//     pipeline.ts (builds registry internally)
//       → ActionGate.execute()
//         → registry.get(actionId)
//           → executor(request, adapter)
//             → physical effect
//
//   There is NO public API to:
//     - construct an ExecutorRegistry
//     - call registry.get() from outside the pipeline
//     - obtain an executor function from public exports

import type { ActionExecutor } from './types.js';

/**
 * Shape that the executor registry must satisfy.
 * Used by ActionGate for type-safe executor lookup.
 *
 * This is an interface — not a class. External code cannot instantiate it.
 * The actual implementation is private to pipeline.ts.
 */
export interface ExecutorRegistry {
  get(actionId: string): ActionExecutor | undefined;
  has(actionId: string): boolean;
}
