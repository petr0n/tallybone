// tests/e2e/outline-alignment.spec.js — the tile outlines on the Review screen
// must land on the tiles.
//
// They didn't: the photo strip is a fixed 210px tall and the canvas is drawn
// with `object-fit: cover`, but the outlines were positioned as percentages of
// the STRIP — as if the photo filled it exactly. Any aspect mismatch slid and
// squashed every box; a portrait capture in the landscape strip compressed them
// into thin vertical bars sitting well away from the tiles.
//
// The fix gives the canvas and the outlines one shared coordinate space
// (.rev__stage, sized to the covering rect). This asserts that geometry
// directly, at several viewport shapes, rather than trusting it by eye.
import { test, expect } from '@playwright/test';
import { addCameraMock, setCameraPhoto } from '../support/camera.js';
import { PERSONAS } from '../fixtures/personas.js';

async function reviewWithOutlines(browser, viewport, portrait) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await addCameraMock(context, { portrait });
  const page = await context.newPage();
  await page.goto('/');
  await setCameraPhoto(page, PERSONAS[0].photo);
  await page.getByText('Just count my tiles').click();
  await page.locator('.cap__shutter').click();
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('.rev__box').first()).toBeVisible();
  return { context, page };
}

const geom = (page) => page.evaluate(() => {
  const wrap = document.querySelector('.rev__photo');
  const stage = document.querySelector('.rev__stage');
  const canvas = document.querySelector('.rev__photo canvas');
  const w = wrap.getBoundingClientRect(), s = stage.getBoundingClientRect();
  // `.rev__photo` has a border, and an absolutely-positioned child's 100% is its
  // PADDING box — so compare against clientWidth/Height, not the border box.
  const cs = getComputedStyle(wrap);
  const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
  return {
    wrap: { w: wrap.clientWidth, h: wrap.clientHeight },
    stage: { w: s.width, h: s.height, x: s.x - (w.x + bl), y: s.y - (w.y + bt) },
    photo: { w: canvas.width, h: canvas.height },
    boxes: [...document.querySelectorAll('.rev__box')].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.x - s.x, y: r.y - s.y, w: r.width, h: r.height };
    }),
  };
});

// The SOURCE aspect is the variable that matters, not the viewport: the app is
// a fixed-width column, so the photo strip is ~384x204 on every screen. A
// landscape capture (1.78) sits within a few percent of that and hides the bug;
// a portrait capture (0.56) is where it showed up in the field.
for (const [name, portrait] of [
  ['landscape capture', false],
  ['portrait capture', true],
]) {
  test(`outlines align with the photo — ${name}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await reviewWithOutlines(browser, { width: 390, height: 844 }, portrait);
    const g = await geom(page);

    // 1. The stage really is the covering rect: it fills the strip in both
    //    directions and keeps the photo's aspect ratio.
    expect(g.stage.w).toBeGreaterThanOrEqual(g.wrap.w - 1);
    expect(g.stage.h).toBeGreaterThanOrEqual(g.wrap.h - 1);
    const arStage = g.stage.w / g.stage.h, arPhoto = g.photo.w / g.photo.h;
    expect(Math.abs(arStage - arPhoto)).toBeLessThan(0.02);

    // 2. It is the SMALLEST such rect — i.e. cover, not an arbitrary overflow.
    //    One dimension must sit flush against the strip.
    const flush = Math.abs(g.stage.w - g.wrap.w) < 1.5 || Math.abs(g.stage.h - g.wrap.h) < 1.5;
    expect(flush, 'stage is the minimal covering rect').toBe(true);

    // 3. Structural: the outlines share the photo's coordinate space.
    expect(g.boxes.length).toBeGreaterThan(0);
    expect(await page.locator('.rev__stage .rev__box').count(),
      'outlines must live inside the stage, not the strip').toBe(g.boxes.length);


    // 4. The one that actually matters: is each outline ON a tile? Bounds and
    //    aspect checks are too weak — with the boxes in the wrong coordinate
    //    space the numbers still land in range. Dominoes are white on a darker
    //    table, so sample the photo under each outline and require it to be
    //    clearly brighter than the frame as a whole. A misplaced box lands on
    //    background and fails.
    const light = await page.evaluate(() => {
      const stage = document.querySelector('.rev__stage').getBoundingClientRect();
      const canvas = document.querySelector('.rev__photo canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const lum = (d) => {
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        return sum / (d.length / 4);
      };
      const whole = lum(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      return [...document.querySelectorAll('.rev__box')].map((b) => {
        const r = b.getBoundingClientRect();
        // stage rect -> source pixels (the stage IS the photo, scaled)
        const sx = ((r.x - stage.x) / stage.width) * canvas.width;
        const sy = ((r.y - stage.y) / stage.height) * canvas.height;
        const sw = Math.max(1, (r.width / stage.width) * canvas.width);
        const sh = Math.max(1, (r.height / stage.height) * canvas.height);
        const cx = Math.max(0, Math.min(canvas.width - 1, Math.round(sx)));
        const cy = Math.max(0, Math.min(canvas.height - 1, Math.round(sy)));
        const cw = Math.max(1, Math.min(canvas.width - cx, Math.round(sw)));
        const ch = Math.max(1, Math.min(canvas.height - cy, Math.round(sh)));
        return { box: lum(ctx.getImageData(cx, cy, cw, ch).data), whole };
      });
    });

    // Threshold calibrated by measuring both states rather than guessed:
    //   correct code  -> every box >= 1.128x the frame mean
    //   bug restored  -> boxes at 0.733, 0.870, 1.089 (landing on background)
    // 1.05 sits below the good floor with room for fixture noise while still
    // catching the misplaced ones. Note the LANDSCAPE case cannot detect this
    // class of bug at all (its ratios are identical either way, because a
    // landscape capture nearly matches the strip's aspect) — which is precisely
    // why the bug survived to production. The portrait case is the real guard.
    for (const { box, whole } of light) {
      expect(box, `outline covers tile-white (${box.toFixed(0)} vs frame ${whole.toFixed(0)})`)
        .toBeGreaterThan(whole * 1.05);
    }

    await context.close();
  });
}
