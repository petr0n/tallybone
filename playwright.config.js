import { defineConfig } from '@playwright/test';

// Local-only e2e. Playwright starts its own dev server on a dedicated port
// (5199) so it never collides with a hand-run `pnpm dev` on 5173. Serial +
// single worker: tests share one dev server + real Durable Object, and each
// test drives several browser contexts, so parallelism would fight itself.
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', trace: 'on-first-retry' },
  projects: [
    { name: 'e2e', testMatch: /tests\/e2e\/.*\.spec\.js/ },
    { name: 'accuracy', testMatch: /tests\/accuracy\/.*\.spec\.js/ },
  ],
  webServer: {
    command: 'pnpm exec vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
