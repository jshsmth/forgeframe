import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import mkcert from 'vite-plugin-mkcert';

const forgeframePackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../forgeframe/package.json'), 'utf8')
) as { version: string };

export default defineConfig(({ command }) => {
  const shouldUseMkcert = command === 'serve' && process.env.FORGEFRAME_SKIP_MKCERT !== '1';

  return {
    plugins: [
      ...(shouldUseMkcert ? [mkcert()] : []),
      {
        name: 'forgeframe-playground-post-fallback',
        configureServer(server) {
          server.middlewares.use((request, _response, next) => {
            if (request.method === 'POST') {
              request.method = 'GET';
            }
            next();
          });
        },
      },
    ],
    root: resolve(__dirname, 'host'),
    define: {
      __FORGEFRAME_VERSION__: JSON.stringify(forgeframePackageJson.version),
    },
    resolve: {
      alias: {
        forgeframe: resolve(__dirname, '../forgeframe/src/index.ts'),
      },
    },
    server: {
      port: 5174,
    },
    build: {
      outDir: resolve(__dirname, 'dist/host'),
      emptyOutDir: true,
    },
  };
});
