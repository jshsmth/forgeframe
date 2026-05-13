import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
) as { version: string };

export default defineConfig({
  define: {
    __FORGEFRAME_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'forgeframe',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
