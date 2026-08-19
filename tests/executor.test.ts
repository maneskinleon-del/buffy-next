import { describe, it, expect } from 'vitest';
import { buildExecutionPlan, executeAction } from '../src/core/executor.js';
import type { ActionDefinition, Capability } from '../src/core/types.js';

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'ok' }; },
};

const confirmAction: ActionDefinition = {
  id: 'test-confirm',
  name: 'Test Confirm',
  description: 'Test',
  level: 'confirm',
  reversible: true,
  platforms: ['windows'],
  prerequisites: [],
  async execute() { return { success: true, message: 'ok' }; },
};

const forbiddenAction: ActionDefinition = {
  id: 'test-forbidden',
  name: 'Test Forbidden',
  description: 'Test',
  level: 'forbidden',
  reversible: false,
  platforms: ['windows'],
  prerequisites: [],
  async execute() { return { success: true, message: 'ok' }; },
};

const actionWithPrereqs: ActionDefinition = {
  id: 'test-prereq',
  name: 'Test Prereq',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows'],
  prerequisites: ['Node.js', 'winget'],
  async execute() { return { success: true, message: 'ok' }; },
};

const actionWithDryRun: ActionDefinition = {
  id: 'test-dryrun',
  name: 'Test DryRun',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'ok' }; },
  async dryRun() { return 'powercfg /setactive test'; },
};

const actionWithVerify: ActionDefinition = {
  id: 'test-verify',
  name: 'Test Verify',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'executed' }; },
  async verify() { return true; },
};

const actionVerifyFails: ActionDefinition = {
  id: 'test-verify-fail',
  name: 'Test Verify Fail',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
  async execute() { return { success: true, message: 'executed' }; },
  async verify() { return false; },
};

const installedCaps: Capability[] = [
  { name: 'Node.js', status: 'installed', version: '26.0.0' },
  { name: 'winget', status: 'installed', version: '1.0' },
];

const emptyCaps: Capability[] = [];

describe('Executor', () => {

  describe('buildExecutionPlan', () => {

    it('should validate platform correctly', async () => {
      const plan = await buildExecutionPlan(autoSafeAction, 'windows', emptyCaps);
      expect(plan.platformValid).toBe(true);
      expect(plan.levelValid).toBe(true);
      expect(plan.prerequisitesValid).toBe(true);
    });

    it('should reject wrong platform', async () => {
      const plan = await buildExecutionPlan(confirmAction, 'android-termux', emptyCaps);
      expect(plan.platformValid).toBe(false);
    });

    it('should reject forbidden actions', async () => {
      const plan = await buildExecutionPlan(forbiddenAction, 'windows', emptyCaps);
      expect(plan.levelValid).toBe(false);
    });

    it('should require auth for confirm actions', async () => {
      const plan = await buildExecutionPlan(confirmAction, 'windows', emptyCaps);
      expect(plan.requiresAuth).toBe(true);
    });

    it('should not require auth for auto_safe actions', async () => {
      const plan = await buildExecutionPlan(autoSafeAction, 'windows', emptyCaps);
      expect(plan.requiresAuth).toBe(false);
    });

    it('should validate prerequisites with capabilities', async () => {
      const plan = await buildExecutionPlan(actionWithPrereqs, 'windows', installedCaps);
      expect(plan.prerequisitesValid).toBe(true);
      expect(plan.missingPrerequisites).toEqual([]);
    });

    it('should detect missing prerequisites', async () => {
      const plan = await buildExecutionPlan(actionWithPrereqs, 'windows', emptyCaps);
      expect(plan.prerequisitesValid).toBe(false);
      expect(plan.missingPrerequisites).toContain('Node.js');
      expect(plan.missingPrerequisites).toContain('winget');
    });

    it('should do case-insensitive prerequisite matching', async () => {
      const caps: Capability[] = [
        { name: 'node.js', status: 'installed' },
        { name: 'Winget', status: 'installed' },
      ];
      const plan = await buildExecutionPlan(actionWithPrereqs, 'windows', caps);
      expect(plan.prerequisitesValid).toBe(true);
    });

    it('should run dryRun when provided', async () => {
      const plan = await buildExecutionPlan(actionWithDryRun, 'windows', emptyCaps);
      expect(plan.dryRunResult).toBe('powercfg /setactive test');
    });

    it('should default capabilities to empty array', async () => {
      const plan = await buildExecutionPlan(autoSafeAction, 'windows');
      expect(plan.prerequisitesValid).toBe(true);
    });
  });

  describe('executeAction', () => {

    it('should execute successfully', async () => {
      const result = await executeAction(autoSafeAction);
      expect(result.success).toBe(true);
      expect(result.message).toBe('ok');
    });

    it('should run verify after execute', async () => {
      const result = await executeAction(actionWithVerify);
      expect(result.success).toBe(true);
      expect(result.message).toBe('executed');
    });

    it('should fail when verify returns false', async () => {
      const result = await executeAction(actionVerifyFails);
      expect(result.success).toBe(false);
      expect(result.message).toContain('verificación falló');
    });

    it('should handle execute errors gracefully', async () => {
      const failingAction: ActionDefinition = {
        ...autoSafeAction,
        id: 'test-fail',
        async execute() { throw new Error('boom'); },
      };
      const result = await executeAction(failingAction);
      expect(result.success).toBe(false);
      expect(result.message).toContain('boom');
    });
  });
});
