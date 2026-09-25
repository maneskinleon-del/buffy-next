// Buffy Next — CLI Argument Helpers
// Pure functions for CLI argument processing. No I/O, no side effects.
//
// Extracted for H4 fix (2026-09-25): `--json` and other flags were leaking
// into the diagnose `query` field because cmdDiagnose received
// `args.slice(1).join(' ')` without removing recognized flags. The CLI has
// no flags that take a value, so every token starting with `--` is a flag.

/**
 * Remove flag tokens (tokens starting with `--`) from an argument list,
 * preserving the order of the remaining tokens.
 *
 * Used to build user-facing text (e.g. the diagnose query) from raw argv:
 * flags are consumed by the CLI itself and must not contaminate the payload
 * (H4: `diagnose "q" --json` produced `"query": "q --json"`).
 *
 * @param args Raw argument tokens (e.g. process.argv.slice(2))
 * @returns Non-flag tokens in original order
 */
export function stripFlags(args: string[]): string[] {
  return args.filter(arg => !arg.startsWith('--'));
}
