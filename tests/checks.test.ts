import { describe, it, expect } from 'vitest';
import { selectChecks } from '../src/core/check-selector.js';

describe('Check Selector', () => {
  it('should return all checks when no pattern matches', () => {
    const checks = selectChecks('xyzzy');
    expect(checks).toContain('os');
    expect(checks).toContain('cpu');
    expect(checks).toContain('gpu');
    expect(checks.length).toBeGreaterThan(5);
  });

  it('should match performance keywords to cpu/ram/gpu/temperature/processes', () => {
    const checks = selectChecks('mi sistema está lento');
    expect(checks).toContain('cpu');
    expect(checks).toContain('ram');
    expect(checks).toContain('gpu');
    expect(checks).toContain('temperature');
    expect(checks).toContain('processes');
  });

  it('should match GPU keywords', () => {
    const checks = selectChecks('la pantalla tiene problemas de driver');
    expect(checks).toContain('gpu');
  });

  it('should match storage keywords', () => {
    const checks = selectChecks('el disco está lleno');
    expect(checks).toContain('storage');
  });

  it('should match temperature keywords', () => {
    const checks = selectChecks('la temperatura está alta');
    expect(checks).toContain('temperature');
    expect(checks).toContain('cpu');
  });

  it('should match RAM keywords', () => {
    const checks = selectChecks('necesito más memoria');
    expect(checks).toContain('ram');
  });

  it('should match network keywords', () => {
    const checks = selectChecks('no funciona el wifi');
    expect(checks).toContain('network');
  });

  it('should match process keywords', () => {
    const checks = selectChecks('una app está consumiendo mucho');
    expect(checks).toContain('processes');
  });

  it('should deduplicate checks across multiple patterns', () => {
    const checks = selectChecks('gpu lento y la temperatura sube');
    const unique = new Set(checks);
    expect(checks.length).toBe(unique.size);
  });

  it('should handle empty query by returning all checks', () => {
    const checks = selectChecks('');
    expect(checks.length).toBeGreaterThan(5);
  });
});
