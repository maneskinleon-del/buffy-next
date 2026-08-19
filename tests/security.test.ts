import { describe, it, expect } from 'vitest';
import { classifyAction, requiresAuth, isForbidden, validateAction } from '../src/core/security.js';
import type { ActionDefinition } from '../src/core/types.js';

const autoSafeAction: ActionDefinition = {
  id: 'test-auto',
  name: 'Test Auto Safe',
  description: 'Test',
  level: 'auto_safe',
  reversible: false,
  platforms: ['windows'],
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

describe('Security', () => {
  it('should classify action levels correctly', () => {
    expect(classifyAction(autoSafeAction)).toBe('auto_safe');
    expect(classifyAction(confirmAction)).toBe('confirm');
    expect(classifyAction(forbiddenAction)).toBe('forbidden');
  });

  it('should require auth only for confirm actions', () => {
    expect(requiresAuth(autoSafeAction)).toBe(false);
    expect(requiresAuth(confirmAction)).toBe(true);
    expect(requiresAuth(forbiddenAction)).toBe(false);
  });

  it('should identify forbidden actions', () => {
    expect(isForbidden(autoSafeAction)).toBe(false);
    expect(isForbidden(confirmAction)).toBe(false);
    expect(isForbidden(forbiddenAction)).toBe(true);
  });

  it('should validate platform compatibility', () => {
    expect(validateAction(autoSafeAction, 'windows').valid).toBe(true);
    expect(validateAction(autoSafeAction, 'android-termux').valid).toBe(false);
  });

  it('should reject forbidden actions', () => {
    expect(validateAction(forbiddenAction, 'windows').valid).toBe(false);
  });
});
