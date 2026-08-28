import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  classifyEpistemicState,
  calculateAgeMs,
  getFreshnessPolicy,
  FRESHNESS_POLICY,
} from '../src/core/freshness.js';
import type { ObservationCategory } from '../src/core/types.js';

describe('FRESHNESS_POLICY', () => {
  it('should have entries for all observation categories', () => {
    const categories: ObservationCategory[] = [
      'cpu', 'memory', 'gpu', 'temperature', 'processes', 'storage', 'network',
    ];

    for (const cat of categories) {
      expect(FRESHNESS_POLICY[cat]).toBeDefined();
      expect(FRESHNESS_POLICY[cat].maxAgeMs).toBeGreaterThan(0);
      expect(FRESHNESS_POLICY[cat].volatility).toBeDefined();
      expect(FRESHNESS_POLICY[cat].reasoning).toBeTruthy();
    }
  });

  it('should have reasonable maxAge values', () => {
    expect(FRESHNESS_POLICY.memory.maxAgeMs).toBe(30_000);
    expect(FRESHNESS_POLICY.temperature.maxAgeMs).toBe(30_000);
    expect(FRESHNESS_POLICY.processes.maxAgeMs).toBe(30_000);
    expect(FRESHNESS_POLICY.cpu.maxAgeMs).toBe(60_000);
    expect(FRESHNESS_POLICY.network.maxAgeMs).toBe(60_000);
    expect(FRESHNESS_POLICY.storage.maxAgeMs).toBe(3_600_000);
    expect(FRESHNESS_POLICY.gpu.maxAgeMs).toBe(300_000);
  });

  it('should have volatility ratings that match category behavior', () => {
    expect(FRESHNESS_POLICY.memory.volatility).toBe('high');
    expect(FRESHNESS_POLICY.temperature.volatility).toBe('high');
    expect(FRESHNESS_POLICY.storage.volatility).toBe('very-low');
    expect(FRESHNESS_POLICY.gpu.volatility).toBe('low');
  });
});

describe('classifyEpistemicState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "observed" for fresh data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const observedAt = new Date('2026-08-28T11:59:30.000Z').toISOString();
    const result = classifyEpistemicState(observedAt, 'cpu');
    expect(result).toBe('observed');
  });

  it('should return "stale" for old data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const observedAt = new Date('2026-08-28T11:58:00.000Z').toISOString();
    const result = classifyEpistemicState(observedAt, 'cpu');
    expect(result).toBe('stale');
  });

  it('should return "observed" for data just within threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const observedAt = new Date('2026-08-28T11:59:59.000Z').toISOString();
    const result = classifyEpistemicState(observedAt, 'memory');
    expect(result).toBe('observed');
  });

  it('should return "stale" for data just beyond threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const observedAt = new Date('2026-08-28T11:59:29.000Z').toISOString();
    const result = classifyEpistemicState(observedAt, 'memory');
    expect(result).toBe('stale');
  });

  it('should handle storage with 1hr threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const fresh = new Date('2026-08-28T11:01:00.000Z').toISOString();
    expect(classifyEpistemicState(fresh, 'storage')).toBe('observed');

    const stale = new Date('2026-08-28T10:59:00.000Z').toISOString();
    expect(classifyEpistemicState(stale, 'storage')).toBe('stale');
  });
});

describe('calculateAgeMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 0 for current time', () => {
    vi.useFakeTimers();
    const now = new Date();
    vi.setSystemTime(now);

    const age = calculateAgeMs(now.toISOString());
    expect(age).toBe(0);
  });

  it('should return positive age for past time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const past = new Date('2026-08-28T11:59:00.000Z').toISOString();
    const age = calculateAgeMs(past);
    expect(age).toBe(60_000);
  });

  it('should return negative age for future time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const future = new Date('2026-08-28T12:01:00.000Z').toISOString();
    const age = calculateAgeMs(future);
    expect(age).toBe(-60_000);
  });
});

describe('getFreshnessPolicy', () => {
  it('should return the correct policy for each category', () => {
    const cpuPolicy = getFreshnessPolicy('cpu');
    expect(cpuPolicy.maxAgeMs).toBe(60_000);
    expect(cpuPolicy.volatility).toBe('medium');

    const memPolicy = getFreshnessPolicy('memory');
    expect(memPolicy.maxAgeMs).toBe(30_000);
    expect(memPolicy.volatility).toBe('high');
  });
});
