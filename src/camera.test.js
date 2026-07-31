// app/src/camera.test.js
import assert from 'node:assert';
import { computeGuideCrop, computeScanCrop, computeScanBox, computeDisplayRect, SCAN_BOX } from './camera.js';

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


// --- the scan box -----------------------------------------------------------
// The blue brackets mark a box of about half the screen, and the scanner reads
// exactly what is inside it. Two rules it must never break: the box stays
// INSIDE the displayed image (the viewfinder is `contain`, so a frame narrower
// than the screen is letterboxed and a screen-anchored box would sit on the
// bars), and the crop is that same box in native pixels.

// A portrait stream filling a portrait screen: the box is a square 84% of the
// image's width, sitting proud of the edges — not the whole frame.
{
  const b = computeScanBox(2160, 3840, 390, 844, 'contain');
  approxEqual(b.width, 390 * SCAN_BOX.widthFrac, 0.5);
  approxEqual(b.height, b.width, 0.5);
  assert.ok(b.width * b.height < 390 * 844 * 0.6, 'covers about half the screen, not all of it');
  console.log('computeScanBox (portrait stream): PASS');
}

// A 16:9 frame in a tall screen letterboxes hard. The box must shrink to fit
// the image rather than spill onto the black bars.
{
  const d = computeDisplayRect(3840, 2160, 390, 844, 'contain');
  const b = computeScanBox(3840, 2160, 390, 844, 'contain');
  assert.ok(b.y >= d.y - 0.01, 'top edge on the image');
  assert.ok(b.y + b.height <= d.y + d.height + 0.01, 'bottom edge on the image');
  assert.ok(b.x >= d.x - 0.01 && b.x + b.width <= d.x + d.width + 0.01, 'sides on the image');
  console.log('computeScanBox (letterboxed frame stays on the image): PASS');
}

// The crop is the box, in native pixels — a real subset of the frame, not the
// frame with a trim. Round-trip it back through the display scale to check.
{
  const d = computeDisplayRect(2160, 3840, 390, 844, 'contain');
  const b = computeScanBox(2160, 3840, 390, 844, 'contain');
  const c = computeScanCrop(2160, 3840, 390, 844, 'contain');
  approxEqual(c.x, (b.x - d.x) / d.scale, 0.5);
  approxEqual(c.y, (b.y - d.y) / d.scale, 0.5);
  approxEqual(c.width, b.width / d.scale, 0.5);
  assert.ok(c.width * c.height < 2160 * 3840 * 0.5, 'a genuine crop, not the whole frame');
  console.log('computeScanCrop (is the box, in native pixels): PASS');
}

// The crop can never ask drawImage for pixels outside the frame.
{
  for (const [vw, vh, w, h] of [[3840, 2160, 390, 844], [2160, 3840, 390, 844], [1280, 720, 820, 1180]]) {
    const c = computeScanCrop(vw, vh, w, h, 'contain');
    assert.ok(c.x >= -0.01 && c.y >= -0.01, 'origin inside the frame');
    assert.ok(c.x + c.width <= vw + 0.01 && c.y + c.height <= vh + 0.01, 'extent inside the frame');
  }
  console.log('computeScanCrop (always inside the frame): PASS');
}

// No stream yet must not produce NaN geometry.
{
  const c = computeScanCrop(0, 0, 390, 844, 'contain');
  const b = computeScanBox(0, 0, 390, 844, 'contain');
  assert.ok(Number.isFinite(c.width) && Number.isFinite(b.width), 'no NaN geometry');
  console.log('scan geometry (no video yet): PASS');
}
