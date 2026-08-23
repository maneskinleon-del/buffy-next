import { describe, it, expect } from 'vitest';
import { buildExecutionPlan } from '../src/core/executor.js';
import type { ActionDefinition, Capability } from '../src/core/types.js';

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows', 'android-termux'],
  prerequisites: [],
};

const confirmAction: ActionDefinition = {
  id: 'test-confirm',
  name: 'Test Confirm',
  description: 'Test',
  level: 'confirm',
  reversible: true,
  platforms: ['windows'],
  prerequisites: [],
};

const forbiddenAction: ActionDefinition = {
  id: 'test-forbidden',
  name: 'Test Forbidden',
  description: 'Test',
  level: 'forbidden',
  reversible: false,
  platforms: ['windows'],
  prerequisites: [],
};

const actionWithPrereqs: ActionDefinition = {
  id: 'test-prereq',
  name: 'Test Prereq',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows'],
  prerequisites: ['Node.js', 'winget'],
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

    it('should default capabilities to empty array', async () => {
      const plan = await buildExecutionPlan(autoSafeAction, 'windows');
      expect(plan.prerequisitesValid).toBe(true);
    });
  });
});
