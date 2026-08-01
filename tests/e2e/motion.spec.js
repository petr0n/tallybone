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

// --- the Home entrance ------------------------------------------------------
// A ~950ms sequence is worth it once, on the first Home of a session. Asserted
// through the classes rather than by catching keyframes mid-flight, which would
// be a race. What must never happen is Home left un-usable: the rows start
// hidden while the 1.2MB poster decodes, so every failure path has to end with
// them visible.

test('the Home entrance plays on the first Home and not on the way back', async ({ browser }) => {
  const { context, page } = await phone(browser, 'no-preference');

  await expect(page.locator('.home-enter'), 'the first Home of a session animates').toHaveCount(1);
  await expect(page.locator('.home-enter--armed'), 'armed must be handed off, not left on').toHaveCount(0);

  // Home reaches the rules through its text link, not the header help icon.
  await page.getByText('How to play').click();
  await expect(page.getByText('HOW TO PLAY')).toBeVisible();
  await page.locator('.tb-hicon--chev').first().click();
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();

  await expect(page.locator('.home-enter'), 'backing out of Rules must not replay it').toHaveCount(0);

  await context.close();
});

test('reduced motion: Home appears settled and stays usable', async ({ browser }) => {
  const { context, page } = await phone(browser, 'reduce');

  await expect(page.locator('.home-enter, .home-enter--armed')).toHaveCount(0);
  const start = page.getByRole('button', { name: 'Start a game' });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByText('YOUR TABLE IS OPEN'), 'the button still works').toBeVisible();

  await context.close();
});

test('a poster that never loads still leaves Home usable', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The entrance waits on the hero decoding. If it never can, the screen must
  // settle rather than strand the buttons at opacity 0 behind a bounce that
  // will never play.
  // Only the picture fails. In dev, Vite serves the asset *import* from the same
  // path as a JS module, and killing that would blank the whole app — proving
  // nothing about the entrance.
  await page.route('**/home-hero*', (route) =>
    route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await page.goto('/');

  const start = page.getByRole('button', { name: 'Start a game' });
  await expect(start).toBeVisible();
  await expect(page.locator('.home-enter--armed'), 'never left armed').toHaveCount(0);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.home-enter__row, .home-enter__logo')]
      .filter((el) => getComputedStyle(el).opacity === '0').length);
  expect(hidden, 'nothing may be stranded invisible').toBe(0);
  await start.click();
  await expect(page.getByText('YOUR TABLE IS OPEN')).toBeVisible();

  await context.close();
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

// --- the round win ----------------------------------------------------------
// The player who goes out sees a celebration on THEIR screen and nobody else
// does. Asserted through the DOM rather than by catching keyframes mid-flight,
// which would be a race.

test('going out celebrates on your screen only', async ({ browser }) => {
  const rosa = await phone(browser, 'no-preference');
  const dee = await phone(browser, 'no-preference');
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  // Rosa goes out; Dee turns in points.
  await rosa.page.getByRole('button', { name: 'I won this round' }).click();
  await expect(rosa.page.getByText('STANDINGS')).toBeVisible();

  await expect(rosa.page.locator('.tb-win'), 'the player who went out').toHaveCount(1);
  await expect(rosa.page.getByText('YOU WENT OUT')).toBeVisible();
  await expect(dee.page.locator('.tb-win'), 'everybody else').toHaveCount(0);

  // It must not eat taps: the manager's control sits under the overlay.
  await expect(rosa.page.getByRole('button', { name: /Start round/ })).toBeVisible();
  await rosa.page.getByRole('button', { name: /Start round/ }).click();

  await rosa.context.close();
  await dee.context.close();
});

test('reduced motion: going out is not celebrated with confetti', async ({ browser }) => {
  const rosa = await phone(browser, 'reduce');
  const dee = await phone(browser, 'no-preference');
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  await rosa.page.getByRole('button', { name: 'I won this round' }).click();
  await expect(rosa.page.getByText('STANDINGS')).toBeVisible();
  await expect(rosa.page.locator('.tb-win__bit'), 'no particles at all').toHaveCount(0);

  await rosa.context.close();
  await dee.context.close();
});
