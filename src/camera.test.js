// app/src/camera.test.js
import assert from 'node:assert';
import { computeGuideCrop } from './camera.js';

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
