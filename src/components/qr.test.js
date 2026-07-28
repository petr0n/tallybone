// app/src/components/qr.test.js — geometry checks on the on-device QR.
// Plain `node src/components/qr.test.js` (same style as src/render.test.js);
// qrPath is pure, so no DOM is needed.
//
// These assert the things that decide whether a code SCANS: the module matrix
// round-trips out of the emitted path, the 4-module quiet zone is really there,
// and the three finder patterns land in the corners. Encoding correctness
// itself is upstream's (vendored qrcode-generator@2.0.4, MIT); a decode
// round-trip through a real reader was run separately to confirm the payload
// comes back intact.
import assert from 'node:assert';
import { qrPath } from './qr.js';

const QUIET = 4;

// Rebuild the module grid from the emitted path — i.e. read back what a
// browser would actually paint, not the encoder's internals.
function gridFromPath(d, span) {
  const g = Array.from({ length: span }, () => new Array(span).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    g[Number(m[2])][Number(m[1])] = true;
  }
  return g;
}

const URL = 'https://tallybone.com/?j=KX7Q2';

{
  const { d, count, span } = qrPath(URL);
  assert.strictEqual(span, count + QUIET * 2, 'span includes both quiet zones');
  // 30 chars at EC level M fits version 3 (29x29); versions are 4n+17.
  assert.strictEqual((count - 17) % 4, 0, 'module count is a legal QR version');
  assert.ok(count >= 21 && count <= 177, `plausible module count, got ${count}`);
  console.log(`qrPath: version ${(count - 17) / 4}, ${count}x${count} modules: PASS`);
}

{
  const { d, count, span } = qrPath(URL);
  const g = gridFromPath(d, span);

  // Quiet zone: every module in the 4-wide border must be light.
  for (let y = 0; y < span; y++) {
    for (let x = 0; x < span; x++) {
      const inside = x >= QUIET && x < QUIET + count && y >= QUIET && y < QUIET + count;
      if (!inside) assert.strictEqual(g[y][x], false, `quiet zone painted at ${x},${y}`);
    }
  }
  console.log('qrPath: 4-module quiet zone is clear: PASS');

  // Finder patterns: 7x7 dark ring + 3x3 dark core at three corners.
  const finderAt = (ox, oy) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const ring = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        assert.strictEqual(
          g[oy + y][ox + x], ring || core,
          `finder mismatch at ${ox + x},${oy + y}`,
        );
      }
    }
  };
  const far = QUIET + count - 7;
  finderAt(QUIET, QUIET);        // top-left
  finderAt(far, QUIET);          // top-right
  finderAt(QUIET, far);          // bottom-left
  console.log('qrPath: three finder patterns correct: PASS');
}

{
  // Different payloads must produce different codes (the old qrMock was a
  // decorative hash — this guards against silently regressing to that).
  const a = qrPath('https://tallybone.com/?j=AAAAA').d;
  const b = qrPath('https://tallybone.com/?j=BBBBB').d;
  assert.notStrictEqual(a, b, 'distinct codes encode distinctly');
  console.log('qrPath: payload actually affects the code: PASS');
}

{
  // A long LAN dev origin must still encode (bumps to a higher version).
  const { count } = qrPath('https://192.168.1.204:5173/?j=KX7Q2');
  assert.ok(count >= 21, 'LAN dev URL encodes');
  console.log(`qrPath: LAN dev URL encodes at ${count}x${count}: PASS`);
}
