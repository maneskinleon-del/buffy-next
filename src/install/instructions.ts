// Buffy Next — Agent-install instructions (marker-fenced block)
// Short file-level block for agent instruction surfaces (GEMINI.md etc).
// Do NOT duplicate the full initialize.instructions here (CodeGraph lesson #529).

export const BUFFY_SECTION_START = '<!-- BUFFY_START -->';
export const BUFFY_SECTION_END = '<!-- BUFFY_END -->';

/**
 * The marker-fenced agent-instructions block written into the agent's
 * instruction file. Mirrors CodeGraph's short conditional block:
 * it is guidance injected into the instruction FILE surface, which reaches
 * subagents and non-MCP harnesses that never see MCP initialize.instructions.
 */
export const BUFFY_INSTRUCTIONS_BLOCK = `${BUFFY_SECTION_START}
## Buffy Next

Buffy Next is the environment specialist. Call \`buffy_context\` before assuming the current state of the environment — platform, hardware, available tools, privileges, running processes. Every field carries freshness (observed | inferred | stale | unknown); do not treat stale or unknown fields as current fact.

- **MCP tool** (when available): \`buffy_context\` returns the live system state.
- **Shell** (always works): \`buffy doctor --context\` prints the same output.

Never for: codebase exploration, general reasoning, or persistent project memory. If Buffy is not installed, skip it.
${BUFFY_SECTION_END}`;