import { defineConfig } from 'vitest/config';

// Dedicated Vitest config so tests do NOT load vite.config.js (its cloudflare()
// plugin expects a real dev/build and throws under the test runner). The pure
// server reducer needs no plugins or DOM — just plain Node.
export default defineConfig({
  test: {
    include: ['server/**/*.test.js'],
    environment: 'node',
  },
});
