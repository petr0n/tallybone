// app/src/camera.test.js
import assert from 'node:assert';
import { computeGuideCrop, computeReticleCrop, RETICLE } from './camera.js';

function approxEqual(a, b, tol = 0.01) {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} ~= ${b}`);
}

// Native aspect exactly matches the 3:4 box -- no object-fit: cover
// cropping happens, the inset applies directly to the full native frame.
{
  const c = computeGuideCrop(480, 640, 3 / 4, 0.06);
  approxEqual(c.x, 480 * 0.06);
  approxEqual(c.y, 640 * 0.06);
  approxEqual(c.width, 480 * 0.88);
  approxEqual(c.height, 640 * 0.88);
  console.log('computeGuideCrop (matching aspect): PASS');
}

// Native wider than the box (16:9 into a 3:4 box) -- cover crops
// left/right symmetrically before the guide inset applies.
{
  const c = computeGuideCrop(1920, 1080, 3 / 4, 0.06);
  const visW = 1080 * (3 / 4); // 810
  approxEqual(c.x, (1920 - visW) / 2 + visW * 0.06);
  approxEqual(c.y, 1080 * 0.06);
  approxEqual(c.width, visW * 0.88);
  approxEqual(c.height, 1080 * 0.88);
  console.log('computeGuideCrop (wider than box): PASS');
}

// Native narrower/taller than the box -- cover crops top/bottom instead.
{
  const c = computeGuideCrop(1000, 2000, 3 / 4, 0.06);
  const visH = 1000 / (3 / 4); // 1333.33
  approxEqual(c.x, 1000 * 0.06);
  approxEqual(c.y, (2000 - visH) / 2 + visH * 0.06);
  approxEqual(c.width, 1000 * 0.88);
  approxEqual(c.height, visH * 0.88);
  console.log('computeGuideCrop (narrower than box): PASS');
}

// --- the reticle crop -------------------------------------------------------
// The blue brackets now BOUND the scan, so this rectangle and the CSS that
// draws them must describe the same square. If they drift, the box on screen
// lies about what gets read.

// Native aspect matches the viewport exactly: no cover cropping, so the
// reticle's viewport fractions map straight onto the frame.
{
  const c = computeReticleCrop(390, 844, 390, 844);
  approxEqual(c.x, 390 * RETICLE.insetFrac);
  approxEqual(c.y, 844 * RETICLE.topFrac);
  approxEqual(c.width, 390 * (1 - RETICLE.insetFrac * 2));
  approxEqual(c.height, c.width, 0.02);   // the reticle is square
  console.log('computeReticleCrop (matching aspect): PASS');
}

// A landscape frame in a tall viewport — cover shows only a centre slice, and
// the crop must come out of THAT slice, not the whole frame. This is the case
// that made full-frame capture scan tiles the player could not see.
{
  const c = computeReticleCrop(2200, 1650, 390, 844);
  const scale = Math.max(390 / 2200, 844 / 1650);  // 0.5115 — height drives it
  const visW = 390 / scale;
  approxEqual(c.x, (2200 - visW) / 2 + (390 * RETICLE.insetFrac) / scale);
  approxEqual(c.y, (1650 - 844 / scale) / 2 + (844 * RETICLE.topFrac) / scale);
  approxEqual(c.width, (390 * (1 - RETICLE.insetFrac * 2)) / scale);
  console.log('computeReticleCrop (landscape frame, tall viewport): PASS');
}

// The square can run past the bottom of a short viewport; the crop must stay
// inside the frame rather than asking drawImage for pixels that do not exist.
{
  const c = computeReticleCrop(480, 640, 400, 300);
  assert.ok(c.x >= 0 && c.y >= 0, 'origin inside the frame');
  assert.ok(c.x + c.width <= 480.01, 'right edge inside the frame');
  assert.ok(c.y + c.height <= 640.01, 'bottom edge inside the frame');
  console.log('computeReticleCrop (clamped to the frame): PASS');
}

// Degenerate input (no stream yet) must not produce a NaN crop.
{
  const c = computeReticleCrop(0, 0, 390, 844);
  assert.ok(Number.isFinite(c.width) && Number.isFinite(c.height), 'no NaN crop');
  console.log('computeReticleCrop (no video yet): PASS');
}
