import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AndroidTermuxAdapter } from '../src/adapters/android.js';

// Mock child_process.execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: systemInfo calls that aren't privilege-related
  mockExecSync.mockImplementation((() => '') as unknown as typeof execSync);
});

describe('detectPrivileges', () => {
  it('should detect shell as available when id succeeds', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('id 2>/dev/null') && !cmd.includes('command')) return 'uid=1000(termux) gid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shell).toBe(true);
  });

  it('should detect shell as unavailable when id fails', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      // 'id' returns empty (command not found), other commands also empty
      if (cmd.includes('id 2>/dev/null')) return '';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shell).toBe(false);
  });

  it('should detect shizuku as available when rish returns uid=', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '/data/data/com.termux/files/home/bin/rish';
      if (cmd.includes('rish -c')) return 'uid=2000(shell) gid=2000(shell)';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shizuku).toBe(true);
  });

  it('should detect shizuku as unavailable when rish is not in PATH', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shizuku).toBe(false);
  });

  it('should detect shizuku as unavailable when rish exists but service does not respond', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '/data/data/com.termux/files/home/bin/rish';
      if (cmd.includes('rish -c')) return 'ERROR: Shizuku not running';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shizuku).toBe(false);
  });

  it('should detect root as unavailable when su is not present', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '';
      if (cmd.includes('command -v su')) return '';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.root).toBe(false);
  });

  it('should detect root as available when su -c id returns uid=0', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '';
      if (cmd.includes('command -v su')) return '/system/bin/su';
      if (cmd.includes('su -c')) return 'uid=0(root) gid=0(root)';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.root).toBe(true);
  });

  it('should detect adb as unavailable when no device connected', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '';
      if (cmd.includes('command -v su')) return '';
      if (cmd.includes('command -v adb')) return '/data/data/com.termux/files/usr/bin/adb';
      if (cmd.includes('adb devices')) return 'List of devices attached\n\n';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.adb).toBe(false);
  });

  it('should detect adb as available when device is connected', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '';
      if (cmd.includes('command -v su')) return '';
      if (cmd.includes('command -v adb')) return '/data/data/com.termux/files/usr/bin/adb';
      if (cmd.includes('adb devices')) return 'List of devices attached\nemulator-5554\tdevice\n';
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.adb).toBe(true);
  });

  it('should default all to false on complete failure', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      // Every command returns empty (simulates total failure)
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shell).toBe(false);
    expect(priv.shizuku).toBe(false);
    expect(priv.root).toBe(false);
    expect(priv.adb).toBe(false);
  });

  it('should detect rish present but service timeout as unavailable', async () => {
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes('command -v rish')) return '/data/data/com.termux/files/home/bin/rish';
      if (cmd.includes('rish -c')) {
        const err = new Error('spawnSync rish ETIMEDOUT') as NodeJS.ErrnoException;
        err.code = 'ETIMEDOUT';
        throw err;
      }
      if (cmd.includes('id 2>/dev/null')) return 'uid=1000(termux)';
      return '';
    }) as unknown as typeof execSync);

    const adapter = new AndroidTermuxAdapter();
    const priv = await adapter.detectPrivileges();
    expect(priv.shizuku).toBe(false);
  });
});
