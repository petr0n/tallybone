import { defineConfig } from 'vitest/config';

// Dedicated Vitest config so tests do NOT load vite.config.js (its cloudflare()
// plugin expects a real dev/build and throws under the test runner). The pure
// server reducer needs no plugins or DOM — just plain Node.
//
// `include` is listed file-by-file outside server/, NOT globbed as src/**: the
// other src tests (render, camera, game-state, scan, qr) are plain
// `node file.js` scripts with no vitest suite, so a wildcard would collect them
// and fail. domino.test.js builds real elements, so it opts into happy-dom with
// an `@vitest-environment` docblock.
export default defineConfig({
  test: {
    include: ['server/**/*.test.js', 'src/components/domino.test.js'],
    environment: 'node',
  },
});
