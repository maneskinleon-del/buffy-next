// Buffy Next — Version identity
// Single source of truth for the product version.
// Reads package.json so every public interface (health, --context, etc.)
// reports the same version. Works both under `tsx` (src/) and the
// esbuild bundle (dist/cli.js -> installed package root).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));

  // Candidate locations: bundled (dist/cli.js) and dev (src/core).
  const candidates = [
    resolve(here, '..', 'package.json'),
    resolve(here, '..', '..', 'package.json'),
  ];

  for (const pkgPath of candidates) {
    try {
      const raw = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as { version?: string };
      if (typeof pkg.version === 'string' && pkg.version.length > 0) {
        return pkg.version;
      }
    } catch {
      // try next candidate
    }
  }

  return '0.0.0';
}

export const BUFFY_VERSION = readPackageVersion();
