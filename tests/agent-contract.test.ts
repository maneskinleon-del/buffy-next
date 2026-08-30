import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Semantic validation of the agent discovery contract (compact version).
// Checks for required semantic markers — NOT full text — so wording can
// evolve without breaking the suite. The size budget keeps the contract
// injectable into agents with small context windows.
const here = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(here, '..', 'docs', 'BUFFY-AGENT-CONTRACT-COMPACT.md');
const compact = readFileSync(contractPath, 'utf-8');
const lower = compact.toLowerCase();

describe('Buffy agent discovery contract (compact)', () => {
  it('declares identity and role', () => {
    expect(lower).toContain('environment specialist');
    expect(lower).toContain('ai agents');
  });

  it('names the three canonical interfaces', () => {
    expect(lower).toContain('context');
    expect(lower).toContain('capabilities');
    expect(lower).toContain('action');
  });

  it('maps interfaces to real public entry points', () => {
    expect(lower).toContain('buffy doctor --context');
    expect(lower).toContain('buffy.context/v1');
    expect(lower).toContain('buffy capabilities --json');
    expect(lower).toContain('buffy act');
  });

  it('states the safety boundary', () => {
    expect(lower).toContain('actiongate');
    expect(lower).toContain('auto_safe');
  });

  it('declares non-goals', () => {
    expect(lower).toContain('never for');
    expect(lower).toContain('arbitrary shell');
    expect(lower).toContain('memory');
  });

  it('is self-explanatory (does not reference other docs as required reading)', () => {
    expect(compact).not.toMatch(/\bsee docs\//i);
    expect(compact).not.toMatch(/\bver\b.*\.md/i);
  });

  it('stays within the injectable size budget (< 2048 bytes)', () => {
    expect(Buffer.byteLength(compact, 'utf-8')).toBeLessThan(2048);
  });
});
