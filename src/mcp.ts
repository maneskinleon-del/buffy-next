// Buffy Next — MCP Server (stdio transport)
// Pattern: initialize.instructions + single read-only tool (buffy_context)
// Inspired by CodeGraph local mechanism (2026-09-14)

import { createInterface } from 'node:readline';
import { createAdapter } from './adapters/index.js';
import { runDoctor } from './core/doctor.js';
import { buildContext } from './core/context.js';
import { BUFFY_VERSION } from './core/version.js';

// ─── Instructions (injected during initialize) ───────────────

const INSTRUCTIONS = `Buffy is split into two independent projects. Buffy Context is long-term
memory/knowledge and is not exposed here. This server is Buffy Next: an
environment specialist that observes the live system, diagnoses problems,
and executes only pre-authorized actions elsewhere.

Call \`buffy_context\` before assuming the current state of the environment:
platform, hardware, available tools, privileges, running processes. Every
field carries freshness — observed | inferred | stale | unknown — do not
treat stale or unknown fields as current fact.

Never for: codebase exploration, general reasoning, or persistent project
memory.

\`buffy_context\` is read-only and non-destructive. It never executes an
action and querying it never authorizes one. If the task requires changing
system state, that goes through a separate, explicitly confirmed mechanism
— not this tool.

Call \`buffy_context\` first, before assuming or guessing the current state
of the system.`;

// ─── Tool schema ─────────────────────────────────────────────

const BUFFY_CONTEXT_TOOL = {
  name: 'buffy_context',
  description:
    'Returns the current system state: platform, hardware (CPU/RAM/GPU/storage/temperature), ' +
    'available tools, privileges, running processes. Every field carries freshness metadata ' +
    '(observedAt, ageMs, freshness). Call this BEFORE assuming the current state of the environment.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
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
        instructions: INSTRUCTIONS,
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: [BUFFY_CONTEXT_TOOL] },
    };
  }

  if (method === 'tools/call') {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const toolName = params.name as string;

    if (toolName !== 'buffy_context') {
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

async function handleToolCall(): Promise<Record<string, unknown>> {
  try {
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
      const result = await handleToolCall();
      const resp = { jsonrpc: '2.0', id: req.id, result };
      process.stdout.write(JSON.stringify(resp) + '\n');
      return;
    }

    // Handle everything else synchronously
    const resp = handleRequest(req);
    if (resp) {
      process.stdout.write(JSON.stringify(resp) + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
