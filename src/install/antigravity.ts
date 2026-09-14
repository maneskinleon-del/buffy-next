// Buffy Next — Antigravity (AGY) install/injection layer
// Mechanism faithfully mirrors CodeGraph v1.5.0 `codegraph install`:
//   1. MCP registration → ~/.gemini/config/mcp_config.json (AGY format: no `type`)
//   2. Instructions block (marker-fenced) → ~/.gemini/GEMINI.md (upsert)

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { BUFFY_INSTRUCTIONS_BLOCK, BUFFY_SECTION_END, BUFFY_SECTION_START } from './instructions.js';

export interface AntigravityInstallOptions {
  /** Default: ~/.gemini — override to a temp dir for tests. */
  geminiHome?: string;
}

export interface InstallReport {
  mcpConfigPath: string;
  mcpEntry: 'created' | 'updated';
  instructionsPath: string;
  instructionsEntry: 'created' | 'updated';
}

function mcpConfigPath(geminiHome: string): string {
  // Unified (post-migration) vs legacy (pre-migration), matching CodeGraph:
  // the `.migrated` marker signals the unified path; otherwise fall back to
  // unified if it already exists, else the legacy Antigravity path.
  const unified = join(geminiHome, 'config', 'mcp_config.json');
  const marker = join(geminiHome, 'config', '.migrated');
  if (existsSync(marker)) return unified;
  if (existsSync(unified)) return unified;
  return join(geminiHome, 'antigravity', 'mcp_config.json');
}

/** Bare `buffy` on Linux (GUI apps inherit user PATH); absolute on macOS. */
function resolveBuffyCommand(): string {
  if (process.platform !== 'darwin') return 'buffy';
  try {
    const resolved = execSync('command -v buffy || which buffy', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/bash',
      windowsHide: true,
    }).trim();
    if (resolved) return resolved;
  } catch {
    // fall through to bare name
  }
  return 'buffy';
}

function upsertSection(content: string, block: string): string {
  if (content.includes(BUFFY_SECTION_START)) {
    const start = content.indexOf(BUFFY_SECTION_START);
    const endIdx = content.indexOf(BUFFY_SECTION_END);
    const end = endIdx === -1 ? start + block.length : endIdx + BUFFY_SECTION_END.length;
    return content.slice(0, start) + block + content.slice(end);
  }
  const prefix = content.endsWith('\n') || content === '' ? '' : '\n';
  return content + prefix + block + '\n';
}

export function installAntigravity(options: AntigravityInstallOptions = {}): InstallReport {
  const geminiHome = options.geminiHome ?? join(homedir(), '.gemini');

  // 1) MCP registration (AGY format: command + args, no `type` field)
  const mcpPath = mcpConfigPath(geminiHome);
  mkdirSync(dirname(mcpPath), { recursive: true });
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(mcpPath)) {
    try {
      const parsed = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') config = parsed;
    } catch {
      config = {};
    }
  }
  config.mcpServers = config.mcpServers ?? {};
  const hadMcpEntry = config.mcpServers.buffy !== undefined;
  config.mcpServers.buffy = { command: resolveBuffyCommand(), args: ['serve', '--mcp'] };
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  // 2) Instructions block (marker-fenced upsert into GEMINI.md)
  const instructionsPath = join(geminiHome, 'GEMINI.md');
  let content = '';
  if (existsSync(instructionsPath)) content = readFileSync(instructionsPath, 'utf-8');
  const hadBlock = content.includes(BUFFY_SECTION_START);
  writeFileSync(instructionsPath, upsertSection(content, BUFFY_INSTRUCTIONS_BLOCK));

  return {
    mcpConfigPath: mcpPath,
    mcpEntry: hadMcpEntry ? 'updated' : 'created',
    instructionsPath,
    instructionsEntry: hadBlock ? 'updated' : 'created',
  };
}