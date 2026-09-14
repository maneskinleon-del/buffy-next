import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAntigravity } from '../src/install/antigravity.js';
import { BUFFY_SECTION_END, BUFFY_SECTION_START } from '../src/install/instructions.js';

describe('installAntigravity', () => {

  it('creates mcp_config.json with the buffy entry (AGY format, no type field)', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    const rep = installAntigravity({ geminiHome });

    expect(existsSync(rep.mcpConfigPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(rep.mcpConfigPath, 'utf-8'));
    expect(cfg.mcpServers.buffy).toEqual({ command: 'buffy', args: ['serve', '--mcp'] });
    expect(cfg.mcpServers.buffy.type).toBeUndefined();
    expect(rep.mcpEntry).toBe('created');
    expect(rep.mcpConfigPath).toContain('antigravity/mcp_config.json');
  });

  it('preserves existing MCP entries (merge, not overwrite)', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    mkdirSync(join(geminiHome, 'config'), { recursive: true });
    writeFileSync(
      join(geminiHome, 'config', 'mcp_config.json'),
      JSON.stringify({ mcpServers: { codegraph: { command: 'codegraph', args: ['serve', '--mcp'] } } }, null, 2) + '\n',
    );

    const rep = installAntigravity({ geminiHome });

    const cfg = JSON.parse(readFileSync(rep.mcpConfigPath, 'utf-8'));
    expect(cfg.mcpServers.codegraph).toEqual({ command: 'codegraph', args: ['serve', '--mcp'] });
    expect(cfg.mcpServers.buffy).toEqual({ command: 'buffy', args: ['serve', '--mcp'] });
  });

  it('prefers the unified config path when the .migrated marker exists', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    mkdirSync(join(geminiHome, 'config'), { recursive: true });
    writeFileSync(join(geminiHome, 'config', '.migrated'), '');

    const rep = installAntigravity({ geminiHome });

    expect(rep.mcpConfigPath).toContain('config/mcp_config.json');
    expect(rep.mcpConfigPath).not.toContain('antigravity');
  });

  it('writes a short marker-fenced instructions block into GEMINI.md', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    writeFileSync(join(geminiHome, 'GEMINI.md'), '# Existing instructions\n');

    const rep = installAntigravity({ geminiHome });

    const md = readFileSync(rep.instructionsPath, 'utf-8');
    expect(md).toContain('# Existing instructions');
    expect(md).toContain(BUFFY_SECTION_START);
    expect(md).toContain(BUFFY_SECTION_END);
    expect(md).toContain('Buffy Next is the environment specialist');
    expect(md).toContain('buffy_context');
    expect(md).toContain('buffy doctor --context');
    expect(rep.instructionsEntry).toBe('created');
  });

  it('is idempotent: re-running replaces the block instead of duplicating it', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    installAntigravity({ geminiHome });
    const second = installAntigravity({ geminiHome });

    const md = readFileSync(second.instructionsPath, 'utf-8');
    expect(md.split(BUFFY_SECTION_START).length - 1).toBe(1);
    expect(md.split(BUFFY_SECTION_END).length - 1).toBe(1);
    expect(second.instructionsEntry).toBe('updated');

    const cfg = JSON.parse(readFileSync(second.mcpConfigPath, 'utf-8'));
    expect(cfg.mcpServers.buffy).toEqual({ command: 'buffy', args: ['serve', '--mcp'] });
  });

  it('does not duplicate the full initialize.instructions in the block', () => {
    const geminiHome = mkdtempSync(join(tmpdir(), 'buffy-install-'));
    const rep = installAntigravity({ geminiHome });
    const md = readFileSync(rep.instructionsPath, 'utf-8');
    // The initialize-escaped reference lines must not appear verbatim in the file block.
    expect(md).not.toContain('Buffy is split into two independent projects');
    expect(md).not.toContain('querying it never authorizes one');
  });
});