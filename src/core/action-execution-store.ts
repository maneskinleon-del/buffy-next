// Buffy Next — Action Execution Store (v2.2)
// Tracks the lifecycle of each action execution.
// States: started → completed (or failed, or unknown on crash)
//
// Design notes:
// - In-memory only (single-process CLI)
// - If process crashes between STARTED and result → state is UNKNOWN
// - Never assume COMPLETED without explicit signal
// - Each execution is independently tracked by executionId

import { randomBytes } from 'node:crypto';
import type { ExecutionRecord, ExecutionState, ActionResult } from './types.js';

/**
 * In-memory execution store.
 * Tracks all executions for the current session.
 */
export class ActionExecutionStore {
  /** executionId → record */
  private records = new Map<string, ExecutionRecord>();

  /**
   * Mark an execution as STARTED.
   * Called by ActionGate before invoking the executor.
   *
   * @param tokenId - The authorization token used for this execution
   * @param actionId - The action being executed
   * @returns The execution record (with executionId)
   */
  start(tokenId: string, actionId: string): ExecutionRecord {
    const record: ExecutionRecord = {
      executionId: `exec-${randomBytes(8).toString('hex')}`,
      tokenId,
      actionId,
      state: 'started',
      startedAt: new Date(),
    };

    this.records.set(record.executionId, record);
    return record;
  }

  /**
   * Mark an execution as COMPLETED.
   *
   * @param executionId - The execution to complete
   * @param result - The result of the execution
   */
  complete(executionId: string, result: ActionResult): void {
    const record = this.records.get(executionId);
    if (!record) return;
    if (record.state !== 'started') return;

    record.state = 'completed';
    record.completedAt = new Date();
    record.result = result;
  }

  /**
   * Mark an execution as FAILED.
   *
   * @param executionId - The execution that failed
   * @param result - The error result
   */
  fail(executionId: string, result: ActionResult): void {
    const record = this.records.get(executionId);
    if (!record) return;
    if (record.state !== 'started') return;

    record.state = 'failed';
    record.completedAt = new Date();
    record.result = result;
  }

  /**
   * Mark a started execution as UNKNOWN.
   * Called during crash recovery or when result is indeterminate.
   *
   * @param executionId - The execution with unknown outcome
   */
  markUnknown(executionId: string): void {
    const record = this.records.get(executionId);
    if (!record) return;
    if (record.state !== 'started') return;

    record.state = 'unknown';
    record.completedAt = new Date();
  }

  /**
   * Get an execution record by ID.
   */
  getRecord(executionId: string): ExecutionRecord | undefined {
    return this.records.get(executionId);
  }

  /**
   * Find all executions in a given state.
   */
  findByState(state: ExecutionState): ExecutionRecord[] {
    return Array.from(this.records.values()).filter(r => r.state === state);
  }

  /**
   * Recover: mark all STARTED records as UNKNOWN.
   * Called at startup if a previous crash is suspected.
   */
  recoverUnknowns(): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.state === 'started') {
        record.state = 'unknown';
        record.completedAt = new Date();
        count++;
      }
    }
    return count;
  }

  /**
   * Get all records (for testing/audit).
   */
  allRecords(): ExecutionRecord[] {
    return Array.from(this.records.values());
  }
}
