import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BUFFY_VERSION } from '../src/core/version.js';
import { getHealthStatus } from '../src/core/telemetry.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(here, '..', 'package.json'), 'utf-8'),
) as { version: string };

describe('version identity (single source of truth)', () => {
  it('BUFFY_VERSION comes from package.json', () => {
    expect(BUFFY_VERSION).toBe(pkg.version);
  });

  it('buffy health reports the same version as package.json', () => {
    const health = getHealthStatus('windows', 'windows');
    expect(health.version).toBe(pkg.version);
  });

  it('all public interfaces agree on the version', () => {
    const health = getHealthStatus('windows', 'windows');
    expect(health.version).toBe(BUFFY_VERSION);
  });
});
