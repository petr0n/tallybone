// tests/e2e/ios-fallback.spec.js — the iOS-safe capture path. On iOS every
// browser is WebKit; the live camera (getUserMedia) is unreliable outside
// Safari. This simulates iOS-Chrome (iOS UA + getUserMedia rejects) and proves
// the app falls back to native photo capture -> real scan -> Review, rather than
// dead-ending. NOTE: this validates the *fallback logic* in Chromium; the actual
// iOS camera behavior still needs a real-device check (see tests/README.md).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { blockCamera } from '../support/camera.js';
import { gotoHome } from '../support/game.js';

const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const PHOTO = path.resolve('tests/fixtures/labeled/photos/1000012917.jpg');

test('iOS non-Safari: blocked live camera falls back to native photo -> scan', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ userAgent: IOS_CHROME_UA });
  await blockCamera(ctx);
  const page = await ctx.newPage();

  await gotoHome(page);
  await page.getByText('Just count my tiles').click();

  // Live camera is blocked -> the photo-capture fallback, with a Safari nudge.
  await expect(page.getByText('TAKE A PHOTO OF YOUR TILES', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/open Tallybone in/i)).toBeVisible();

  // Provide a photo through the native file input; the real scanner runs on it.
  await page.locator('input[type=file]').setInputFiles(PHOTO);
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 90000 });
  expect(Number(await page.locator('.rev__total').innerText())).toBeGreaterThan(0);

  await ctx.close();
});

// A phone that cannot load the scanner must still be able to play.
//
// The boot screen was a dead end: no timeout, no retry, and no route to manual
// entry — which is only reachable from the other fallback screens, all of which
// sit BEHIND scanner init. A player at a real table was stranded on WARMING UP
// mid-game with nothing to tap (2026-07-31).
test('a scanner that never loads still lets you enter tiles by hand', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // The models are what a bad signal or a low-memory phone fails to get.
  await page.route('**/models/*.onnx', (route) => route.abort());
  await page.goto('/');
  await page.getByText('Just count my tiles').click();

  await expect(page.getByText("SCANNER WON'T LOAD")).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Enter tiles by hand' }).click();

  // Manual entry is the review screen seeded with a blank tile.
  await expect(page.locator('.rev__total')).toBeVisible();
  await page.locator('.rev__card .plus').first().click();
  await expect(page.locator('.rev__footer .tb-btn--primary')).toBeVisible();

  await ctx.close();
});

// The reported failure was a HANG, not an error: init never settled, so the
// screen never changed. That is a different code path from the abort above and
// the one that actually stranded someone, so it gets its own test.
test('a scanner that hangs forever times out into the escape hatch', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route('**/models/*.onnx', () => { /* never settle: the request hangs */ });
  await page.goto('/');
  await page.getByText('Just count my tiles').click();
  await expect(page.getByText('WARMING UP')).toBeVisible();

  await expect(page.getByText("SCANNER WON'T LOAD"), 'must not hang forever').toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/still loading after/)).toBeVisible();
  await page.getByRole('button', { name: 'Enter tiles by hand' }).click();
  await expect(page.locator('.rev__total')).toBeVisible();

  await ctx.close();
});
