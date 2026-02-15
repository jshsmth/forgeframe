import { defineConfig } from 'vite';
import { resolve } from 'path';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig(({ command }) => ({
  plugins: command === 'serve' ? [mkcert()] : [],
  root: resolve(__dirname, 'consumer'),
  resolve: {
    alias: {
      forgeframe: resolve(__dirname, '../forgeframe/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, 'dist/consumer'),
    emptyOutDir: true,
  },
}));
