/**
 * Unit test for version constant consistency.
 *
 * Covers that exported `VERSION` remains synchronized with `packages/forgeframe/package.json`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VERSION } from '#internal/constants';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(currentDir, '../../package.json'), 'utf8')
) as { version: string };

describe('VERSION', () => {
  it('should match package.json version', () => {
    expect(VERSION).toBe(packageJson.version);
  });
});
