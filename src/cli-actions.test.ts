// Buffy Next — CLI actions command tests
// Tests that `buffy actions --json` returns the real ActionDefinition catalog.

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
// Resolve relative to repo root (where package.json lives)
const CLI = resolve(process.cwd(), 'dist', 'cli.js');

async function runBuffy(args: string[]): Promise<{ stdout: string; exitCode: number; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      timeout: 15_000,
      encoding: 'utf-8',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout?.trim() ?? '', stderr: err.stderr?.trim() ?? err.message, exitCode: err.code ?? 1 };
  }
}

describe('buffy actions --json', () => {
  it('returns a non-empty JSON array', async () => {
    const { stdout, exitCode } = await runBuffy(['actions', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('each action has required ActionDefinition fields', async () => {
    const { stdout } = await runBuffy(['actions', '--json']);
    const data = JSON.parse(stdout);
    for (const action of data) {
      expect(action).toHaveProperty('id');
      expect(action).toHaveProperty('name');
      expect(action).toHaveProperty('description');
      expect(action).toHaveProperty('level');
      expect(action).toHaveProperty('platforms');
      expect(typeof action.id).toBe('string');
      expect(typeof action.name).toBe('string');
      expect(typeof action.description).toBe('string');
      expect(['auto_safe', 'confirm', 'forbidden']).toContain(action.level);
      expect(Array.isArray(action.platforms)).toBe(true);
    }
  });

  it('contains known actions', async () => {
    const { stdout } = await runBuffy(['actions', '--json']);
    const data = JSON.parse(stdout);
    const ids = data.map((a: any) => a.id);
    expect(ids).toContain('check-network');
    expect(ids).toContain('check-gpu-driver');
    expect(ids).toContain('list-processes');
    expect(ids).toContain('check-disk-space');
    expect(ids).toContain('check-system-temp');
  });

  it('contains exactly 9 actions (current registry)', async () => {
    const { stdout } = await runBuffy(['actions', '--json']);
    const data = JSON.parse(stdout);
    expect(data.length).toBe(9);
  });
});

describe('buffy capabilities --json (legacy)', () => {
  it('returns a non-empty array of system tools', async () => {
    const { stdout, exitCode } = await runBuffy(['capabilities', '--json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('each entry has name/status/version', async () => {
    const { stdout } = await runBuffy(['capabilities', '--json']);
    const data = JSON.parse(stdout);
    for (const tool of data) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('status');
      expect(tool).toHaveProperty('version');
    }
  });
});

describe('buffy act (action execution)', () => {
  it('returns error for invalid action', async () => {
    const { exitCode } = await runBuffy(['act', 'nonexistent-action']);
    expect(exitCode).not.toBe(0);
  });

  it('executes check-network successfully', async () => {
    const { stdout, exitCode } = await runBuffy(['act', 'check-network']);
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toMatch(/red|network|ping|ok/);
  });
});
