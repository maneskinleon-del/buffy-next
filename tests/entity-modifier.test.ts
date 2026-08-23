import { describe, it, expect } from 'vitest';
import { bindEntityModifier } from '../src/core/entity-modifier.js';

describe('Entity/Modifier Binding', () => {

  // ─── Entity-modifier pairs ────────────────────────────────

  it('should bind "lento" to wifi → storage/processes checks', () => {
    const result = bindEntityModifier('wifi es lento');
    expect(result.checks).toContain('storage');
    expect(result.checks).toContain('processes');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "lento" to internet → storage/processes checks', () => {
    const result = bindEntityModifier('internet va lento');
    expect(result.checks).toContain('storage');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "lento" to mouse → gpu checks', () => {
    const result = bindEntityModifier('el mouse está lento');
    expect(result.checks).toContain('gpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "lento" to pantalla → gpu checks', () => {
    const result = bindEntityModifier('la pantalla va lenta');
    expect(result.checks).toContain('gpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "caliente" to ventilador → temperature checks', () => {
    const result = bindEntityModifier('el ventilador está caliente');
    expect(result.checks).toContain('temperature');
    expect(result.checks).toContain('cpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "lento" to chrome → process checks', () => {
    const result = bindEntityModifier('chrome va lento');
    expect(result.checks).toContain('processes');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should bind "lento" to roblox → performance checks', () => {
    const result = bindEntityModifier('roblox va lento');
    expect(result.checks).toContain('cpu');
    expect(result.checks).toContain('gpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  // ─── No entity found ─────────────────────────────────────

  it('should not bind when no entity is near the modifier', () => {
    const result = bindEntityModifier('está lento');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  it('should not bind for isolated modifier', () => {
    const result = bindEntityModifier('lento');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  // ─── No modifier ─────────────────────────────────────────

  it('should return empty for fragment with no modifiers', () => {
    const result = bindEntityModifier('el disco está lleno');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  it('should return empty for fragment with only entities', () => {
    const result = bindEntityModifier('wifi internet');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  // ─── Multiple modifiers ───────────────────────────────────

  it('should handle multiple modifiers in one fragment', () => {
    const result = bindEntityModifier('el mouse está lento y caliente');
    // "lento" → mouse → gpu, "caliente" → mouse (still closest) → gpu
    expect(result.checks).toContain('gpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  // ─── Window size ──────────────────────────────────────────

  it('should find entity within window of 4 tokens', () => {
    // "wifi" is 3 tokens away from "lento"
    const result = bindEntityModifier('el wifi de casa está lento');
    expect(result.checks).toContain('storage');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should not find entity beyond window of 4 tokens', () => {
    // "wifi" is 5 tokens away from "lento"
    const result = bindEntityModifier('el wifi de mi casa está muy lento');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  // ─── Edge cases ───────────────────────────────────────────

  it('should handle empty fragment', () => {
    const result = bindEntityModifier('');
    expect(result.checks).toEqual([]);
    expect(result.hasEntityBoundModifier).toBe(false);
  });

  it('should handle case insensitivity', () => {
    const result = bindEntityModifier('WiFi es LENTO');
    expect(result.checks).toContain('storage');
    expect(result.hasEntityBoundModifier).toBe(true);
  });

  it('should handle punctuation', () => {
    const result = bindEntityModifier('el mouse está lento.');
    expect(result.checks).toContain('gpu');
    expect(result.hasEntityBoundModifier).toBe(true);
  });
});
