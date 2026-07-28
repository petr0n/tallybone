// tests/accuracy/scanner.spec.js — browser scanner-accuracy gate. Runs labeled
// corpus hands through the REAL in-browser scanner (camera mocked) and scores
// per-half pip accuracy against ground truth, then compares to a recorded
// baseline. This catches ONNX-WASM / browser drift the Python eval can't see.
// Not a hard 0.97 (the model doesn't yet meet it); a regression guard.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { addCameraMock, setCameraPhoto } from '../support/camera.js';

const LABELS = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/labeled/labels.json'), 'utf8'));
const PHOTOS = path.resolve('tests/fixtures/labeled/photos');
const BASELINE = path.resolve('tests/accuracy/baseline.json');
const N = Number(process.env.ACCURACY_N || 15);
const TOLERANCE = 0.02;

// Greedy match each predicted tile to the best unused ground-truth tile and
// count correct halves (unordered). Misses/extra tiles are penalized via total.
function scoreHand(pred, truth) {
  const t = truth.map((x) => ({ a: x.a, b: x.b, used: false }));
  let correct = 0;
  for (const p of pred) {
    let best = -1, bestScore = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i].used) continue;
      const s = Math.max(
        (p.a === t[i].a ? 1 : 0) + (p.b === t[i].b ? 1 : 0),
        (p.a === t[i].b ? 1 : 0) + (p.b === t[i].a ? 1 : 0));
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0) { t[best].used = true; correct += bestScore; }
  }
  return { correct, total: truth.length * 2 };
}

async function scanReview(page, photo) {
  await page.goto('/');
  await setCameraPhoto(page, photo);
  await page.getByText('Just count my tiles').click();
  await page.locator('.cap__shutter').click();
  const gotReview = await page.locator('.rev__total').isVisible({ timeout: 60000 }).catch(() => false);
  if (!gotReview) return []; // empty/failed scan -> no tiles
  const cards = page.locator('.rev__card');
  const n = await cards.count();
  const pred = [];
  for (let i = 0; i < n; i++) {
    const a = Number(await cards.nth(i).locator('.val--a').innerText());
    const b = Number(await cards.nth(i).locator('.val--b').innerText());
    if (Number.isFinite(a) && Number.isFinite(b)) pred.push({ a, b });
  }
  return pred;
}

test('scanner per-half accuracy on labeled corpus, no regression vs baseline', async ({ browser }) => {
  const subset = LABELS.slice(0, N);
  test.setTimeout(30_000 + subset.length * 20_000);

  const ctx = await browser.newContext();
  await addCameraMock(ctx);
  const page = await ctx.newPage();

  let correct = 0, total = 0, scanned = 0;
  for (const rec of subset) {
    const photo = path.join(PHOTOS, `${rec.imageId}.jpg`);
    if (!fs.existsSync(photo)) continue;
    const pred = await scanReview(page, photo);
    const truth = rec.tiles.map((t) => ({ a: t.identity.first, b: t.identity.second }));
    const r = scoreHand(pred, truth);
    correct += r.correct; total += r.total; scanned++;
  }
  await ctx.close();

  expect(total).toBeGreaterThan(0);
  const acc = correct / total;
  console.log(`browser per-half accuracy: ${(acc * 100).toFixed(2)}%  (${scanned} photos, ${total} halves)`);

  if (!fs.existsSync(BASELINE)) {
    fs.writeFileSync(BASELINE, JSON.stringify({ perHalf: acc, photos: scanned, halves: total, recordedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log('recorded first-run baseline — commit tests/accuracy/baseline.json');
  } else {
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    console.log(`baseline: ${(base.perHalf * 100).toFixed(2)}%  (tolerance ${TOLERANCE * 100}%)`);
    expect(acc).toBeGreaterThanOrEqual(base.perHalf - TOLERANCE);
  }
});
