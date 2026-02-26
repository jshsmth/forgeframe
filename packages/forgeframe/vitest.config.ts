import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
) as { version: string };

export default defineConfig({
  define: {
    __FORGEFRAME_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
});
