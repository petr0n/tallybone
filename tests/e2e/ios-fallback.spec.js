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
