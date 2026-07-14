import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import mkcert from 'vite-plugin-mkcert';
import { TEST_SCENARIO_IDS } from './consumer/test-lab/scenario-ids';

const forgeframePackageJson = JSON.parse(
  readFileSync(resolve(__dirname, '../forgeframe/package.json'), 'utf8')
) as { version: string };

const shouldOpenBrowser = process.env.FORGEFRAME_PLAYGROUND_OPEN === '0' ? false : true;
const consumerOutDir = resolve(__dirname, 'dist/consumer');

function staticTestRoutes(): Plugin {
  return {
    name: 'forgeframe-static-test-routes',
    apply: 'build',
    closeBundle() {
      const source = resolve(consumerOutDir, 'index.html');
      const routeDirectories = [
        resolve(consumerOutDir, 'tests'),
        ...TEST_SCENARIO_IDS.map((scenarioId) =>
          resolve(consumerOutDir, 'tests', scenarioId)
        ),
      ];

      for (const routeDirectory of routeDirectories) {
        mkdirSync(routeDirectory, { recursive: true });
        copyFileSync(source, resolve(routeDirectory, 'index.html'));
      }
    },
  };
}

export default defineConfig(({ command }) => {
  const shouldUseMkcert = command === 'serve' && process.env.FORGEFRAME_SKIP_MKCERT !== '1';

  return {
    plugins: [
      ...(shouldUseMkcert ? [mkcert()] : []),
      staticTestRoutes(),
    ],
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
      outDir: consumerOutDir,
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
