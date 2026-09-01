#!/usr/bin/env node

/**
 * Buffy Next — MCP Server Adapter
 *
 * Exposes Buffy Next system diagnostics and actions via the Model Context Protocol (MCP).
 * This is a thin adapter: it consumes the public CLI only, never imports internals.
 *
 * Architecture:
 *   MCP (stdio) → this adapter → `buffy` CLI → Buffy Next core
 *
 * Tools:
 *   - buffy_context      → system observation data (CPU, RAM, GPU, storage, etc.)
 *   - buffy_capabilities  → installed tools and their versions
 *   - buffy_action        → execute a system action (diagnostic, read-only)
 *
 * Security:
 *   - Uses execFile (not exec) — arguments are never shell-interpolated
 *   - Explicit timeouts prevent indefinite blocking
 *   - No hardcoded paths — CLI is resolved via PATH or BUFFY_CLI env var
 *
 * Known debt:
 *   - buffy_capabilities exposes installed tools, not the action catalog.
 *     The action catalog lives in src/actions/registry.ts but is not exposed
 *     via `buffy actions --json`. Resolving this requires CLI changes (see FASE 5).
 *
 * License: MIT
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Resolve the buffy CLI binary. Prefers BUFFY_CLI env, then PATH, then dist/cli.js relative to this file. */
function resolveBuffyCli() {
  if (process.env.BUFFY_CLI) return process.env.BUFFY_CLI;

  // Relative to this file: integrations/mcp/buffy-mcp-server.js → ../../dist/cli.js
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fallback = join(__dirname, "..", "..", "dist", "cli.js");
  return fallback;
}

const BUFFY_CLI = resolveBuffyCli();

/** Default timeout for CLI invocations (ms) */
const TIMEOUT_MS = {
  context: 15_000,
  capabilities: 10_000,
  action: 30_000,
};

// ---------------------------------------------------------------------------
// CLI execution helper
// ---------------------------------------------------------------------------

/**
 * Run a buffy CLI command and return { stdout, stderr }.
 * Uses execFile for security (no shell interpolation).
 */
async function runBuffy(args, timeoutMs = 30_000) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [BUFFY_CLI, ...args], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1 MB
      encoding: "utf-8",
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), error: null };
  } catch (err) {
    return {
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? "",
      error: err.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "buffy-next",
  version: "0.2.2",
});

// ---- Tool: buffy_context ----

server.tool(
  "buffy_context",
  "Get current system context from Buffy Next. Returns structured system observation data (CPU, RAM, GPU, storage, temperature, processes, network, OS) with freshness metadata. Use this when you need to understand the current state of the Linux system.",
  { query: z.string().describe("Optional descriptive query about what system information you need.") },
  async ({ query }) => {
    const { stdout, stderr, error } = await runBuffy(
      ["doctor", "--context"],
      TIMEOUT_MS.context,
    );

    if (error && !stdout) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error, stderr }) }],
        isError: true,
      };
    }

    // stdout should be JSON from `buffy doctor --context`
    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      data = { raw: stdout, parseError: "Response was not valid JSON" };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---- Tool: buffy_capabilities ----

server.tool(
  "buffy_capabilities",
  "List all available Buffy actions and their security levels. Use this to discover what actions are available before calling buffy_action.",
  {},
  async () => {
    const { stdout, stderr, error } = await runBuffy(
      ["capabilities", "--json"],
      TIMEOUT_MS.capabilities,
    );

    if (error && !stdout) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error, stderr }) }],
        isError: true,
      };
    }

    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      data = { raw: stdout, parseError: "Response was not valid JSON" };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---- Tool: buffy_action ----

const ACTION_ID_EXAMPLES = [
  "check-gpu-driver",
  "check-network",
  "check-system-temp",
  "check-disk-space",
  "list-processes",
  "install-tool",
  "change-power-plan",
  "check-shizuku",
  "check-driver-status",
].join(", ");

server.tool(
  "buffy_action",
  `Execute a Buffy action through the ActionGate. Actions are system operations (diagnostics, checks, reversible changes). The ActionGate enforces security policies (AUTO_SAFE, CONFIRM, FORBIDDEN). Use buffy_capabilities first to discover available actions.\n\nValid action IDs: ${ACTION_ID_EXAMPLES}`,
  {
    actionId: z
      .string()
      .describe(
        `The action ID to execute. Examples: ${ACTION_ID_EXAMPLES}`,
      ),
    args: z
      .string()
      .optional()
      .describe("Optional arguments for the action (e.g., tool name for 'install-tool')."),
  },
  async ({ actionId, args }) => {
    const cliArgs = ["act", actionId];
    if (args) cliArgs.push(args);

    const { stdout, stderr, error } = await runBuffy(cliArgs, TIMEOUT_MS.action);

    if (error && !stdout) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error, stderr, actionId }) }],
        isError: true,
      };
    }

    // Try to parse as JSON, fall back to text
    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      data = { message: stdout, actionId };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running — stderr is used for logging (not stdout, which is MCP transport)
  process.stderr.write(`[buffy-mcp] server started (cli: ${BUFFY_CLI})\n`);
}

main().catch((err) => {
  process.stderr.write(`[buffy-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
