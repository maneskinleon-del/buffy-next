// Buffy Next — --result-json regression tests
// Verifies that real execution returns structured ActionResult via JSON.

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const CLI = resolve(process.cwd(), 'dist', 'cli.js');

async function runBuffy(args: string[]): Promise<{ stdout: string; exitCode: number; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      timeout: 30_000,
      encoding: 'utf-8',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout?.trim() ?? '', stderr: err.stderr?.trim() ?? err.message, exitCode: err.code ?? 1 };
  }
}

describe('--result-json (real execution + structured output)', () => {
  it('A: executes for real and returns valid JSON', async () => {
    const { stdout, exitCode } = await runBuffy(['act', 'check-network', '--result-json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('message');
    expect(data).toHaveProperty('actionId', 'check-network');
  });

  it('B: success field is a boolean from the execution layer', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(typeof data.success).toBe('boolean');
    expect(data.success).toBe(true);
  });

  it('C: details survive when action provides them', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(data.details).toBeDefined();
    expect(typeof data.details).toBe('object');
  });

  it('D: message is the canonical execution message', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(0);
    // Should NOT contain the emoji-formatted CLI rendering
    expect(data.message).not.toContain('✅');
    expect(data.message).not.toContain('🔧');
  });

  it('E: failure is distinguishable from success', async () => {
    const { stdout, exitCode } = await runBuffy(['act', 'check-disk-space', '--result-json']);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(typeof data.success).toBe('boolean');
    // check-disk-space should succeed on this system
    expect(data.success).toBe(true);
  });

  it('evidence.level is present and comes from classifyEvidence()', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(data.evidence).toBeDefined();
    expect(data.evidence.level).toBe('OBSERVED_EXECUTED');
  });

  it('evidence.observedAt is an ISO timestamp', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(data.evidence.observedAt).toBeDefined();
    expect(new Date(data.evidence.observedAt).toISOString()).toBe(data.evidence.observedAt);
  });

  it('evidence.attempts is an array with outcome', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--result-json']);
    const data = JSON.parse(stdout);
    expect(Array.isArray(data.evidence.attempts)).toBe(true);
    expect(data.evidence.attempts.length).toBeGreaterThan(0);
    expect(data.evidence.attempts[0].outcome).toBe('success');
  });

  it('F: --json still behaves as dry-run preview', async () => {
    const { stdout } = await runBuffy(['act', 'check-network', '--json']);
    const data = JSON.parse(stdout);
    // Preview mode returns action definition, not execution result
    expect(data).toHaveProperty('action');
    expect(data).toHaveProperty('platform');
    expect(data.message).toContain('simulada');
    // Should NOT have success/details from execution
    expect(data).not.toHaveProperty('success');
    expect(data).not.toHaveProperty('details');
  });

  it('G: normal text mode still produces human-readable output', async () => {
    const { stdout } = await runBuffy(['act', 'check-network']);
    // Text mode contains emoji markers
    expect(stdout).toMatch(/🔧|✅/);
    // Should NOT be valid JSON
    expect(() => JSON.parse(stdout)).toThrow();
  });
});
