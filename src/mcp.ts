// Buffy Next — MCP Server (stdio transport)
// Pattern: initialize.instructions + read-only tools (buffy_context, buffy_verify, buffy_continuity)
// Inspired by CodeGraph local mechanism (2026-09-14)

import { createInterface } from 'node:readline';
import { createAdapter } from './adapters/index.js';
import { runDoctor } from './core/doctor.js';
import { buildContext } from './core/context.js';
import { BUFFY_VERSION } from './core/version.js';
import { execCtxCaptured } from './shared/ctx.js';

// ─── Instructions (injected during initialize) ───────────────
// Exported as BUFFY_MCP_INSTRUCTIONS so the installer can prewrite the
// AGY surface cache (`~/.gemini/antigravity-cli/mcp/buffy/instructions.md`)
// with the same content, eliminating the connection-timing race.

export const BUFFY_MCP_INSTRUCTIONS = `Buffy is split into two independent projects. Buffy Context is long-term
memory/knowledge and is not exposed here. This server is Buffy Next: an
environment specialist that observes the live system, diagnoses problems,
and executes only pre-authorized actions elsewhere.

Call \`buffy_context\` before assuming the current state of the environment:
platform, hardware, available tools, privileges, running processes. Every
field carries freshness — observed | inferred | stale | unknown — do not
treat stale or unknown fields as current fact.

There are THREE read-only MCP tools:

  buffy_context  — LIVE environment state: platform, hardware (CPU/RAM/GPU/
    storage/temperature), available tools, privileges, running processes.
    Every field carries freshness (observed | inferred | stale | unknown).
    NOT for codebase exploration, general reasoning, or persistent memory.

  buffy_verify   — FACTUAL integrity of persistent project memory: compares
    ai-context/INFO-core.md against the live system and returns structured
    JSON with verified/stale/unknown/expired counts and trust_score.
    NOT for observing live environment state — use buffy_context for that.

  buffy_continuity — SESSION handoff: reads ai-context/CONTINUE.md from the
    Context repo and returns the raw file content as JSON (no parsing,
    no section extraction). NOT for live system state — use buffy_context.
    NOT for fact-checking — use buffy_verify.

All tools are read-only and non-destructive. buffy_context is for current
runtime state; buffy_verify is for knowledge correctness; buffy_continuity
is for session handoff. Choose the right tool for the question.

Never for: codebase exploration, general reasoning, or persistent project
memory.

\`buffy_context\` is read-only and non-destructive. It never executes an
action and querying it never authorizes one. If the task requires changing
system state, that goes through a separate, explicitly confirmed mechanism
— not this tool.

Call \`buffy_context\` first, before assuming or guessing the current state
of the system.`;

// ─── Tool schema ─────────────────────────────────────────────
// Exported as BUFFY_CONTEXT_TOOL so the installer can prewrite the AGY
// surface cache (`~/.gemini/antigravity-cli/mcp/buffy/buffy_context.json`).

export const BUFFY_CONTEXT_TOOL = {
  name: 'buffy_context',
  description:
    'Returns the current system state: platform, hardware (CPU/RAM/GPU/storage/temperature), ' +
    'available tools, privileges, running processes. Every field carries freshness metadata ' +
    '(observedAt, ageMs, freshness). Call this BEFORE assuming the current state of the environment.',
  inputSchema: {
    // properties-first so AGY's cached `parameters` matches the prewritten surface.
    properties: {},
    type: 'object' as const,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const BUFFY_VERIFY_TOOL = {
  name: 'buffy_verify',
  description:
    'Factual integrity check of persistent project memory (INFO-core vs live system). ' +
    'Returns JSON with verified/stale/unknown/expired counts and trust_score. Read-only.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export const BUFFY_CONTINUITY_TOOL = {
  name: 'buffy_continuity',
  description:
    'Session handoff: reads ai-context/CONTINUE.md from the Context repo and ' +
    'returns the raw file content as JSON (no parsing, no section ' +
    'extraction). Read-only. NOT for live environment state — use buffy_context for that.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

// ─── MCP JSON-RPC handler ────────────────────────────────────

function handleRequest(req: Record<string, unknown>): Record<string, unknown> | null {
  const method = req.method as string;
  const id = req.id;

  // Notifications (no id) — no response needed
  if (method === 'notifications/initialized') return null;

  // Requests (have id) — must respond
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'buffy-next', version: BUFFY_VERSION },
        instructions: BUFFY_MCP_INSTRUCTIONS,
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: [BUFFY_CONTEXT_TOOL, BUFFY_VERIFY_TOOL, BUFFY_CONTINUITY_TOOL] },
    };
  }

  if (method === 'tools/call') {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const toolName = params.name as string;

    if (toolName !== 'buffy_context' && toolName !== 'buffy_verify' && toolName !== 'buffy_continuity') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        },
      };
    }

    // Return a placeholder — the actual call is async and handled separately
    return null; // handled by async wrapper below
  }

  // Unknown method
  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

export async function handleToolCall(toolName: string): Promise<Record<string, unknown>> {
  try {
    if (toolName === 'buffy_verify') {
      const result = await execCtxCaptured('verify', ['--json']);

      if (result.timedOut) {
        return {
          content: [
            {
              type: 'text',
              text: `buffy_verify: timed out after 30s. stdout parcial: ${result.stdout}\nstderr: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      if (!result.stdout) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.stderr || `buffy_verify falló con código ${result.code}`}`,
            },
          ],
          isError: true,
        };
      }

      // buffy-verify.sh --json produces JSON on stdout (even on non-zero exit
      // for error items). Return the raw JSON — the MCP client parses it.
      return {
        content: [{ type: 'text', text: result.stdout }],
      };
    }

    if (toolName === 'buffy_continuity') {
      const result = await execCtxCaptured('continuity', ['--json']);

      if (result.timedOut) {
        return {
          content: [
            {
              type: 'text',
              text: `buffy_continuity: timed out after 30s. stdout parcial: ${result.stdout}\\nstderr: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      if (!result.stdout) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${result.stderr || `buffy_continuity falló con código ${result.code}`}`,
            },
          ],
          isError: true,
        };
      }

      // buffy-continuity.sh --json produces JSON on stdout.
      // Return the raw JSON — the MCP client parses it.
      return {
        content: [{ type: 'text', text: result.stdout }],
      };
    }

    // Default: buffy_context (live environment state)
    const adapter = await createAdapter();
    const report = await runDoctor(adapter);
    const context = buildContext(report);
    const text = JSON.stringify(context, null, 2);
    return {
      content: [{ type: 'text', text }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

// ─── Stdio transport (NDJSON) ────────────────────────────────

export function startMcpServer(): void {
  const rl = createInterface({ input: process.stdin });

  // Track in-flight async handlers so the close listener waits for
  // pending tools/call responses before exiting. Without this, piping
  // multiple NDJSON lines via stdin (e.g. printf '...' | buffy serve --mcp)
  // kills the process mid-handler — the last response is lost because
  // rl.on('close') fires the instant stdin EOFs, before the awaited
  // handleToolCall resolves.
  let pending = 0;
  let stdinClosed = false;

  function maybeExit(): void {
    if (stdinClosed && pending === 0) {
      process.exit(0);
    }
  }

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: Record<string, unknown>;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return; // invalid JSON — ignore
    }

    const method = req.method as string;

    // Handle tools/call asynchronously
    if (method === 'tools/call') {
      pending++;
      try {
        const params = (req.params ?? {}) as Record<string, unknown>;
        const toolName = params.name as string;
        const result = await handleToolCall(toolName);
        const resp = { jsonrpc: '2.0', id: req.id, result };
        process.stdout.write(JSON.stringify(resp) + '\n');
      } finally {
        pending--;
        maybeExit();
      }
      return;
    }

    // Handle everything else synchronously
    const resp = handleRequest(req);
    if (resp) {
      process.stdout.write(JSON.stringify(resp) + '\n');
    }
  });

  rl.on('close', () => {
    stdinClosed = true;
    maybeExit();
  });
}
