// tests/e2e/scan.spec.js — proves the REAL scanner runs in-browser: feed a
// labeled corpus photo through the solo "just count my tiles" flow and confirm
// it reaches the Review screen with tiles + a positive total. (Exact accuracy
// is asserted separately in the accuracy tier; here we just prove the pipeline.)
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { addCameraMock, setCameraPhoto } from '../support/camera.js';
import { gotoHome } from '../support/game.js';

const PHOTO = path.resolve('tests/fixtures/labeled/photos/1000012917.jpg');

test('solo: real scanner reads a photo into the Review screen', async ({ browser }) => {
  const ctx = await browser.newContext();
  await addCameraMock(ctx);
  const page = await ctx.newPage();

  await gotoHome(page);
  await setCameraPhoto(page, PHOTO);
  await page.getByText('Just count my tiles').click();

  await expect(page.locator('.cap__shutter')).toBeVisible({ timeout: 30000 });
  await page.locator('.cap__shutter').click();

  // The scanner runs several seconds (WASM, per-tile pip counting).
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 90000 });
  const total = Number(await page.locator('.rev__total').innerText());
  const cards = await page.locator('.rev__card').count();

  expect(cards).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(0);

  await ctx.close();
});
