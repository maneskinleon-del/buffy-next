import { describe, it, expect } from 'vitest';
import { splitFragments, isMultiFragment } from '../src/core/fragment-splitter.js';

describe('Fragment Splitter', () => {

  // ─── Basic splitting ──────────────────────────────────────

  it('should return single fragment for simple query', () => {
    expect(splitFragments('mi PC está lento')).toEqual(['mi pc está lento']);
  });

  it('should split on "y"', () => {
    expect(splitFragments('wifi es lento y la temperatura sube')).toEqual([
      'wifi es lento',
      'la temperatura sube',
    ]);
  });

  it('should split on "pero"', () => {
    expect(splitFragments('el disco está lleno pero funciona')).toEqual([
      'el disco está lleno',
      'funciona',
    ]);
  });

  it('should split on "cuando"', () => {
    expect(splitFragments('se calienta cuando abro Chrome')).toEqual([
      'se calienta',
      'abro chrome',
    ]);
  });

  it('should split on "además"', () => {
    expect(splitFragments('tengo poca RAM además el disco está lleno')).toEqual([
      'tengo poca ram',
      'el disco está lleno',
    ]);
  });

  it('should split on "también"', () => {
    expect(splitFragments('va lento también se calienta')).toEqual([
      'va lento',
      'se calienta',
    ]);
  });

  // ─── Multiple conjunctions ────────────────────────────────

  it('should split on multiple "y" conjunctions', () => {
    expect(splitFragments('tengo poca RAM, el disco lleno y va lento')).toEqual([
      'tengo poca ram, el disco lleno',
      'va lento',
    ]);
  });

  it('should handle mixed conjunctions', () => {
    expect(splitFragments('wifi lento pero funciona y se calienta')).toEqual([
      'wifi lento',
      'funciona',
      'se calienta',
    ]);
  });

  // ─── Edge cases ───────────────────────────────────────────

  it('should return empty array for empty query', () => {
    expect(splitFragments('')).toEqual([]);
  });

  it('should return empty array for whitespace only', () => {
    expect(splitFragments('   ')).toEqual([]);
  });

  it('should trim fragments', () => {
    expect(splitFragments('  hola   y   mundo  ')).toEqual(['hola', 'mundo']);
  });

  it('should lowercase fragments', () => {
    expect(splitFragments('WiFi es LENTO y la Temperatura SUBE')).toEqual([
      'wifi es lento',
      'la temperatura sube',
    ]);
  });

  it('should not split on partial words containing conjunctions', () => {
    // "y" inside "system" should not split
    expect(splitFragments('my system is slow')).toEqual(['my system is slow']);
  });

  it('should handle "y" at the start (not a conjunction)', () => {
    // "y" as first word is unusual but shouldn't cause issues
    const result = splitFragments('y ahora qué');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // ─── isMultiFragment ──────────────────────────────────────

  it('isMultiFragment: false for single fragment', () => {
    expect(isMultiFragment(['mi pc está lento'])).toBe(false);
  });

  it('isMultiFragment: true for two fragments', () => {
    expect(isMultiFragment(['wifi lento', 'temperatura sube'])).toBe(true);
  });

  it('isMultiFragment: true for three fragments', () => {
    expect(isMultiFragment(['a', 'b', 'c'])).toBe(true);
  });

  it('isMultiFragment: false for empty array', () => {
    expect(isMultiFragment([])).toBe(false);
  });
});
