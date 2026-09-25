import { describe, it, expect } from 'vitest';
import { stripFlags } from './cli-args.js';

// ─── stripFlags (H4 regression) ────────────────────────────

describe('stripFlags — H4: --json leak into diagnose query', () => {

  it('H4 regression: exact CLI argv for `diagnose "el sistema va lento" --json`', () => {
    // process.argv.slice(2) for: buffy diagnose "el sistema va lento" --json
    const argv = ['diagnose', 'el sistema va lento', '--json'];
    expect(stripFlags(argv)).toEqual(['diagnose', 'el sistema va lento']);
  });

  it('H4 regression: query field must not contain the flag', () => {
    const argv = ['diagnose', 'temperatura', '--json'];
    const query = stripFlags(argv).slice(1).join(' ');
    expect(query).toBe('temperatura');
    expect(query).not.toContain('--json');
  });

  it('removes multiple flags, keeps order of positional tokens', () => {
    expect(stripFlags(['diagnose', '--json', 'q con espacios', '--pilot']))
      .toEqual(['diagnose', 'q con espacios']);
  });

  it('no flags → unchanged', () => {
    expect(stripFlags(['diagnose', 'el sistema va lento']))
      .toEqual(['diagnose', 'el sistema va lento']);
  });

  it('only flags → empty', () => {
    expect(stripFlags(['--json', '--pilot'])).toEqual([]);
  });

  it('does not treat hyphenated words as flags (single dash, no --)', () => {
    expect(stripFlags(['diagnose', 'error -kernel panics']))
      .toEqual(['diagnose', 'error -kernel panics']);
  });
});
