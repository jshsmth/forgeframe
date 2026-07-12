import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import mkcert from 'vite-plugin-mkcert';

const forgeframePackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../forgeframe/package.json'), 'utf8')
) as { version: string };

const shouldOpenBrowser = process.env.FORGEFRAME_PLAYGROUND_OPEN === '0' ? false : true;

export default defineConfig(({ command }) => {
  const shouldUseMkcert = command === 'serve' && process.env.FORGEFRAME_SKIP_MKCERT !== '1';

  return {
    plugins: shouldUseMkcert ? [mkcert()] : [],
    root: resolve(__dirname, 'consumer'),
    define: {
      __FORGEFRAME_VERSION__: JSON.stringify(forgeframePackageJson.version),
    },
    resolve: {
      alias: {
        forgeframe: resolve(__dirname, '../forgeframe/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      open: shouldOpenBrowser,
    },
    build: {
      outDir: resolve(__dirname, 'dist/consumer'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'consumer/index.html'),
          redirect: resolve(__dirname, 'consumer/redirect.html'),
        },
      },
    },
  };
});
