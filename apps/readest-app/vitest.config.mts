import os from 'node:os';
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

const GiB = 1024 ** 3;

// Pick a worker count that adapts to the machine instead of always taking
// ~half the CPUs (vitest's default). Explicit CLI flags like --maxWorkers
// still win over this value — it only sets the default.
// Override with VITEST_MAX_WORKERS=<n> to force a specific count.
function resolveMaxWorkers(): number {
  const forced = Number.parseInt(process.env.VITEST_MAX_WORKERS ?? '', 10);
  if (Number.isInteger(forced) && forced >= 1) {
    return forced;
  }
  const cpus =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
  const total = Math.max(1, cpus);
  // Baseline mirrors vitest's own heuristic: ~half the CPUs.
  const base = Math.max(1, Math.floor(total / 2));
  // Leave headroom for whatever else is running right now.
  const [load1] = os.loadavg();
  const headroom = Math.max(1, total - Math.ceil(load1));
  let workers = Math.min(base, headroom);
  // jsdom workers are memory-hungry; back off when RAM is tight.
  if (os.freemem() < 2 * GiB) {
    workers = Math.max(1, Math.ceil(workers / 2));
  }
  return workers;
}

const maxWorkers = resolveMaxWorkers();
console.log(
  `[vitest] maxWorkers=${maxWorkers} ` +
    `(cpus=${os.availableParallelism?.() ?? os.cpus().length}, ` +
    `load1=${os.loadavg()[0].toFixed(2)}, ` +
    `freemem=${(os.freemem() / GiB).toFixed(1)}GiB)`,
);

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // The @pdfjs alias from tsconfig only resolves within the app's own
      // source files.  foliate-js/pdf.js lives outside that scope, so Vite
      // needs an explicit alias to find the vendored pdfjs build.
      '@pdfjs': path.resolve(__dirname, 'public/vendor/pdfjs'),
      // `js-mdict` is consumed via tsconfig paths from `packages/js-mdict/src/`.
      // Its sources `import 'fflate'` directly — without an alias, vite's
      // import-analysis walks up from the redirected file location and fails
      // to find fflate (it's installed only in this app's node_modules).
      // Pin all `fflate` resolutions to the app's copy to keep js-mdict
      // self-contained at the source-tree level.
      fflate: path.resolve(__dirname, 'node_modules/fflate'),
    },
  },
  test: {
    environment: 'jsdom',
    // Adaptive default, see resolveMaxWorkers() above.
    // Explicit --maxWorkers CLI flags (e.g. test:pr:web:unit) still override this.
    maxWorkers,
    silent: 'passed-only',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      // Playwright web e2e specs — run via `pnpm test:e2e:web`, not vitest.
      '**/e2e/**',
      '**/*.browser.test.ts',
      '**/*.browser.test.tsx',
      '**/*.tauri.test.ts',
      // Android device e2e — run via `pnpm test:android`, not the unit lane.
      '**/*.android.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/test/**',
      ],
    },
  },
});
