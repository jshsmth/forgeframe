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
      name: 'ForgeFrame',
      formats: ['es', 'umd'],
      fileName: 'forgeframe',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
        exports: 'named',
      },
    },
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2022',
  },
  resolve: {
    conditions: ['source'],
  },
});
