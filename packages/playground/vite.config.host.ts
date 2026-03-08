import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import mkcert from 'vite-plugin-mkcert';

const forgeframePackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../forgeframe/package.json'), 'utf8')
) as { version: string };
const forgeframeSrcRoot = resolve(__dirname, '../forgeframe/src');

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [mkcert()] : [],
  root: resolve(__dirname, 'host'),
  define: {
    __FORGEFRAME_VERSION__: JSON.stringify(forgeframePackageJson.version),
  },
  resolve: {
    alias: {
      forgeframe: resolve(forgeframeSrcRoot, 'index.ts'),
      '@': forgeframeSrcRoot,
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: resolve(__dirname, 'dist/host'),
    emptyOutDir: true,
  },
}));
