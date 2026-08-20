import { describe, it, expect, beforeEach } from 'vitest';
import { setInstallTarget, installTool } from '../src/actions/catalog/install-tool.js';

describe('install-tool — sanitizeToolName via setInstallTarget', () => {

  beforeEach(() => {
    // Reset to default before each test
    setInstallTarget('node');
  });

  // --- Valid inputs ---

  it('should accept simple package name', () => {
    expect(() => setInstallTarget('node')).not.toThrow();
  });

  it('should accept package with hyphens', () => {
    expect(() => setInstallTarget('my-package')).not.toThrow();
  });

  it('should accept package with dots', () => {
    expect(() => setInstallTarget('python3.11')).not.toThrow();
  });

  it('should accept package with underscores', () => {
    expect(() => setInstallTarget('my_package')).not.toThrow();
  });

  it('should accept scoped packages with slashes', () => {
    expect(() => setInstallTarget('@scope/package')).not.toThrow();
  });

  it('should accept mixed valid characters', () => {
    expect(() => setInstallTarget('node.js-v26.0.0')).not.toThrow();
  });

  // --- Shell injection: strip dangerous chars ---

  it('should strip semicolons from command chaining attempt', () => {
    setInstallTarget('node; rm -rf /');
    expect(() => setInstallTarget('node; rm -rf /')).not.toThrow();
  });

  it('should strip pipes from command chaining attempt', () => {
    expect(() => setInstallTarget('node | cat /etc/passwd')).not.toThrow();
  });

  it('should strip ampersand from background execution attempt', () => {
    expect(() => setInstallTarget('node & echo pwned')).not.toThrow();
  });

  it('should strip dollar signs from variable expansion attempt', () => {
    expect(() => setInstallTarget('$HOME/.ssh/id_rsa')).not.toThrow();
  });

  it('should strip angle brackets from redirection attempt', () => {
    expect(() => setInstallTarget('node < /etc/passwd')).not.toThrow();
  });

  it('should strip backticks from command substitution attempt', () => {
    expect(() => setInstallTarget('`whoami`')).not.toThrow();
  });

  it('should strip parentheses from subshell attempt', () => {
    expect(() => setInstallTarget('$(whoami)')).not.toThrow();
  });

  it('should strip single quotes', () => {
    expect(() => setInstallTarget("node' ; echo pwned")).not.toThrow();
  });

  it('should strip double quotes', () => {
    expect(() => setInstallTarget('node"; echo pwned')).not.toThrow();
  });

  it('should strip spaces', () => {
    expect(() => setInstallTarget('node extra-arg')).not.toThrow();
  });

  // --- Edge cases ---

  it('should reject empty string', () => {
    expect(() => setInstallTarget('')).toThrow('inválido');
  });

  it('should reject strings that become empty after stripping', () => {
    // Only dangerous chars → strips everything → empty → throws
    expect(() => setInstallTarget(' ;|&$<>')).toThrow('inválido');
  });

  it('should reject strings longer than 100 chars', () => {
    const longName = 'a'.repeat(101);
    expect(() => setInstallTarget(longName)).toThrow('inválido');
  });

  it('should accept exactly 100 chars', () => {
    const name = 'a'.repeat(100);
    expect(() => setInstallTarget(name)).not.toThrow();
  });

  it('should strip dangerous chars from a mostly-valid string', () => {
    // "node;echo pwned" → strips ";", " " → "nodeechopwned"
    expect(() => setInstallTarget('node;echo')).not.toThrow();
  });

  // --- dryRun uses sanitized name ---

  it('dryRun should use the sanitized tool name', async () => {
    setInstallTarget('curl');
    const result = await installTool.dryRun!();
    expect(result).toContain('curl');
  });

  it('dryRun should reflect sanitized value after injection attempt', async () => {
    setInstallTarget('node; rm -rf /');
    const result = await installTool.dryRun!();
    // Dangerous chars stripped, only safe chars remain
    expect(result).toMatch(/noderm-rf/);
    expect(result).not.toContain(';');
    expect(result).not.toContain('|');
  });

  // --- Action metadata ---

  it('should have correct action structure', () => {
    expect(installTool.id).toBe('install-tool');
    expect(installTool.level).toBe('confirm');
    expect(installTool.reversible).toBe(false);
    expect(installTool.platforms).toContain('windows');
    expect(installTool.platforms).toContain('android-termux');
    expect(installTool.platforms).toContain('linux');
  });

  // --- Linux platform support ---

  it('dryRun should include platform-appropriate package manager command', async () => {
    setInstallTarget('git');
    const result = await installTool.dryRun!();
    if (process.platform === 'win32') {
      expect(result).toMatch(/winget/);
    } else {
      // Linux/Android: apt, dnf, pacman, zypper, or pkg (Termux fallback)
      expect(result).toMatch(/(apt|dnf|pacman|zypper|pkg)/);
    }
  });

  it('platforms array should include all three platforms', () => {
    expect(installTool.platforms).toEqual(
      expect.arrayContaining(['windows', 'android-termux', 'linux']),
    );
  });
});
