import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Versión visible en Ajustes: la de package.json + fecha de compilación + commit
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

const builtAt = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    {
      // /version.json: la app lo consulta para avisar cuando hay una versión nueva
      name: 'montra-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version, commit, builtAt }),
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_DATE__: JSON.stringify(builtAt),
  },
  build: { chunkSizeWarningLimit: 1200 },
});
