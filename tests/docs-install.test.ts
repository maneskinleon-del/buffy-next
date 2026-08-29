import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(resolve(here, '..', 'README.md'), 'utf-8');

describe('installation documentation', () => {
  it('does not instruct installing the unrelated npm "buffy" package', () => {
    expect(readme).not.toContain('npm install -g buffy');
  });

  it('documents install from the cloned repository', () => {
    expect(readme).toContain('git clone');
    expect(readme).toContain('npm install');
    expect(readme).toContain('npm run build');
    expect(readme).toContain('npm install -g .');
    expect(readme).toContain('buffy setup');
  });

  it('warns that the public npm "buffy" package is not Buffy Next', () => {
    expect(readme.toLowerCase()).toContain('no es');
  });
});
