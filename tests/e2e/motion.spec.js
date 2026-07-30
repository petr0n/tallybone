// tests/e2e/motion.spec.js — motion must respect the reduced-motion setting.
//
// The once-per-identity bookkeeping (a re-render must not replay entrances) is
// covered deterministically in src/motion.test.js; catching a 220ms transition
// mid-flight from here would be a race. What IS worth pinning in a browser is
// the accessibility promise, because it fails silently: someone who has asked
// their device for less motion should not get sliding rows.
import { test, expect } from '@playwright/test';
import { createGame, joinGame, startRound } from '../support/game.js';

async function phone(browser, reducedMotion) {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
  return { context, page };
}

test('reduced motion: nothing slides, and the game still works', async ({ browser }) => {
  const rosa = await phone(browser, 'reduce');
  const dee = await phone(browser, 'reduce');
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');

  // Roster rows are the entrance most likely to have been left un-gated.
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);
  const moved = await rosa.page.evaluate(() =>
    [...document.querySelectorAll('[data-pid], .rev__box')]
      .filter((el) => el.style.transform || el.style.opacity).length);
  expect(moved, 'no element should be mid-transform under reduced motion').toBe(0);

  // The infinite CSS loops must be off too — they were previously uncovered.
  const looping = await rosa.page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).animationName !== 'none'
        && /tb-(bob|pulse)/.test(el.getAttribute('style') || '')).length);
  expect(looping, 'tb-bob / tb-pulse must not run under reduced motion').toBe(0);

  // And the round still starts — the bridge must degrade, not break navigation.
  await startRound(rosa.page);
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible({ timeout: 25000 });

  await rosa.context.close();
  await dee.context.close();
});

test('full motion: the game plays through unchanged', async ({ browser }) => {
  const rosa = await phone(browser, 'no-preference');
  const dee = await phone(browser, 'no-preference');
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  // The server-driven jump is the one that now animates; it must still land.
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible({ timeout: 25000 });
  // Entrances must clean up after themselves rather than stranding a row at
  // opacity 0 — the failure mode that would make players invisible.
  await rosa.page.waitForTimeout(700);
  const stranded = await rosa.page.evaluate(() =>
    [...document.querySelectorAll('[data-pid]')]
      .filter((el) => el.style.opacity === '0').length);
  expect(stranded, 'no row left stuck invisible').toBe(0);

  await rosa.context.close();
  await dee.context.close();
});
