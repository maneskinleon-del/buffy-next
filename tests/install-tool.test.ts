import { describe, it, expect } from 'vitest';
import { installTool } from '../src/actions/catalog/install-tool.js';

describe('install-tool — metadata only (v2.3)', () => {

  it('should have correct action structure', () => {
    expect(installTool.id).toBe('install-tool');
    expect(installTool.level).toBe('confirm');
    expect(installTool.reversible).toBe(false);
    expect(installTool.platforms).toContain('windows');
    expect(installTool.platforms).toContain('android-termux');
    expect(installTool.platforms).toContain('linux');
  });

  it('should not have execute method (metadata only)', () => {
    expect((installTool as any).execute).toBeUndefined();
  });

  it('should not have dryRun method (metadata only)', () => {
    expect((installTool as any).dryRun).toBeUndefined();
  });

  it('platforms array should include all three platforms', () => {
    expect(installTool.platforms).toEqual(
      expect.arrayContaining(['windows', 'android-termux', 'linux']),
    );
  });

  it('executor is no longer exported from catalog module', async () => {
    const catalog = await import('../src/actions/catalog/install-tool.js');
    expect((catalog as any).installToolExecutor).toBeUndefined();
  });
});
