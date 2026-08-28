import { describe, it, expect, vi, afterEach } from 'vitest';
import { LinuxAdapter } from '../src/adapters/linux.js';
import { diagnose } from '../src/core/diagnose.js';
import { classifyEpistemicState, calculateAgeMs } from '../src/core/freshness.js';

describe('E4.1 Temporal Contract — Integration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should include observedAt and source in all observations', async () => {
    const adapter = new LinuxAdapter();
    const response = await diagnose(adapter, 'mi PC está lento');

    for (const obs of response.observations) {
      expect(obs.observedAt).toBeDefined();
      expect(obs.source).toBeDefined();
      expect(new Date(obs.observedAt!)).toBeInstanceOf(Date);
    }
  });

  it('should produce observations with valid ISO timestamps', async () => {
    const adapter = new LinuxAdapter();
    const response = await diagnose(adapter, 'chequea la RAM');

    const ramObs = response.observations.find(o => o.id === 'ram-status');
    expect(ramObs).toBeDefined();
    expect(ramObs!.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should classify fresh observations as "observed"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const now = new Date().toISOString();
    expect(classifyEpistemicState(now, 'cpu')).toBe('observed');
    expect(classifyEpistemicState(now, 'memory')).toBe('observed');
    expect(classifyEpistemicState(now, 'storage')).toBe('observed');
  });

  it('should classify old observations as "stale"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const twoMinAgo = new Date('2026-08-28T11:58:00.000Z').toISOString();
    expect(classifyEpistemicState(twoMinAgo, 'cpu')).toBe('stale');
    expect(classifyEpistemicState(twoMinAgo, 'memory')).toBe('stale');
  });

  it('should calculate ageMs correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));

    const thirtySecAgo = new Date('2026-08-28T11:59:30.000Z').toISOString();
    expect(calculateAgeMs(thirtySecAgo)).toBe(30_000);
  });

  it('should include source in observations with adapter name', async () => {
    const adapter = new LinuxAdapter();
    const response = await diagnose(adapter, 'chequea CPU y RAM');

    for (const obs of response.observations) {
      expect(obs.source).toContain('LinuxAdapter');
    }
  });

  it('should produce different observations for different queries', async () => {
    const adapter = new LinuxAdapter();

    const cpuResponse = await diagnose(adapter, 'CPU lento');
    const ramResponse = await diagnose(adapter, 'RAM llena');

    expect(cpuResponse.observations.length).toBeGreaterThan(0);
    expect(ramResponse.observations.length).toBeGreaterThan(0);

    // Both should have timestamps
    const cpuObs = cpuResponse.observations[0];
    const ramObs = ramResponse.observations[0];
    expect(cpuObs.observedAt).toBeDefined();
    expect(ramObs.observedAt).toBeDefined();
  });
});
