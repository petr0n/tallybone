// tests/e2e/double-blank.spec.js — the house rule, through the real UI.
//
// The 0/0 is the one tile whose pip count lies: held at the end of a round it
// costs 40, not nothing. The Review screen has to say so on the tile itself,
// because "0 / 0" sitting next to "40 pts" reads as a bug otherwise.
//
// Also pins the placeholder case: every tile added by hand starts at 0/0, so
// counting any blank would charge 40 for a tile the player has not filled in.
import { test, expect } from '@playwright/test';
import { newPhone } from '../support/game.js';

// Manual entry seeds Review with one blank tile and no camera, which is exactly
// the placeholder-vs-claim boundary this rule turns on.
async function manualReview(page) {
  await page.getByText('Just count my tiles').click();
  // No camera in headless Chromium, so the capture screen falls back and offers
  // hand entry — which seeds Review with a single untouched 0/0.
  await page.getByRole('button', { name: 'Enter tiles by hand' }).click({ timeout: 60000 });
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 60000 });
}

test('a blank you have not set yet does not score 40', async ({ browser }) => {
  const { context, page } = await newPhone(browser);
  await manualReview(page);

  // Seeded 0/0, untouched: a placeholder, worth nothing.
  await expect(page.locator('.rev__total')).toHaveText('0');
  await expect(page.locator('.rev__blank')).toHaveCount(0);

  await context.close();
});

test('claiming the double blank scores 40 and says why', async ({ browser }) => {
  const { context, page } = await newPhone(browser);
  await manualReview(page);

  // Touch the steppers and come back to 0/0 — now it is a claim, not a default.
  await page.locator('.rev__card .plus').first().click();
  await page.locator('.rev__card .minus').first().click();

  await expect(page.locator('.rev__blank')).toHaveText('DOUBLE BLANK');
  await expect(page.locator('.rev__pts').first()).toHaveText('40 pts');
  await expect(page.locator('.rev__total')).toHaveText('40');
  // The total names the 40, so it is never an unexplained jump.
  await expect(page.locator('.rev__totallabel')).toContainText('DOUBLE BLANK');
  // And it carries through to the submit action.
  await expect(page.getByRole('button', { name: /Submit 40 points/ })).toBeVisible();

  await context.close();
});

test('an ordinary tile is unaffected', async ({ browser }) => {
  const { context, page } = await newPhone(browser);
  await manualReview(page);

  for (let i = 0; i < 6; i++) await page.locator('.rev__card .plus').first().click();
  await expect(page.locator('.rev__blank')).toHaveCount(0);
  await expect(page.locator('.rev__total')).toHaveText('6');

  await context.close();
});
