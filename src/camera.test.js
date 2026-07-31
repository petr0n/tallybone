// app/src/camera.test.js
import assert from 'node:assert';
import { computeGuideCrop, computeScanCrop, computeDisplayRect, SCAN_INSET_FRAC } from './camera.js';

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


// --- the scan area ----------------------------------------------------------
// The dashed box now BOUNDS the scan, so the rect drawn on screen and the rect
// handed to the scanner must describe the same pixels. The viewfinder runs
// `contain` by default, which is where the first attempt went wrong: it assumed
// `cover` and put the box partly on the letterbox bars.

// contain: the whole frame is on screen, so the scan area is just the frame
// minus its margin — no viewport arithmetic can creep in.
{
  const c = computeScanCrop(3840, 2160, 390, 844, 'contain');
  approxEqual(c.x, 3840 * SCAN_INSET_FRAC);
  approxEqual(c.y, 2160 * SCAN_INSET_FRAC);
  approxEqual(c.width, 3840 * (1 - SCAN_INSET_FRAC * 2));
  approxEqual(c.height, 2160 * (1 - SCAN_INSET_FRAC * 2));
  console.log('computeScanCrop (contain: the frame, inset): PASS');
}

// The viewport must not change the answer under contain — the whole frame is
// visible whatever shape the screen is.
{
  const phone = computeScanCrop(3840, 2160, 390, 844, 'contain');
  const pad = computeScanCrop(3840, 2160, 820, 1180, 'contain');
  approxEqual(phone.x, pad.x); approxEqual(phone.width, pad.width);
  console.log('computeScanCrop (contain: viewport-independent): PASS');
}

// cover: only a centred slice is on screen, and scanning what the player cannot
// see is the bug being removed — so the crop stays inside that slice.
{
  const c = computeScanCrop(3840, 2160, 390, 844, 'cover');
  const visW = 2160 * (390 / 844);
  approxEqual(c.x, (3840 - visW) / 2 + visW * SCAN_INSET_FRAC);
  approxEqual(c.width, visW * (1 - SCAN_INSET_FRAC * 2));
  assert.ok(c.x + c.width <= 3840.01, 'stays inside the frame');
  console.log('computeScanCrop (cover: the visible slice, inset): PASS');
}

// The displayed rect is what the brackets are drawn onto: letterboxed under
// contain, overflowing under cover.
{
  const d = computeDisplayRect(3840, 2160, 390, 844, 'contain');
  approxEqual(d.width, 390);                 // width-limited
  approxEqual(d.height, 390 * (2160 / 3840));
  approxEqual(d.y, (844 - d.height) / 2);    // centred, bars above and below
  assert.ok(d.y > 0, 'contain letterboxes a 16:9 frame in a tall screen');

  const c = computeDisplayRect(3840, 2160, 390, 844, 'cover');
  approxEqual(c.height, 844);
  assert.ok(c.x < 0, 'cover overflows the sides');
  console.log('computeDisplayRect (contain letterboxes, cover overflows): PASS');
}

// No stream yet must not produce NaN geometry.
{
  const c = computeScanCrop(0, 0, 390, 844, 'contain');
  const d = computeDisplayRect(0, 0, 390, 844, 'contain');
  assert.ok(Number.isFinite(c.width) && Number.isFinite(d.width), 'no NaN geometry');
  console.log('scan geometry (no video yet): PASS');
}
