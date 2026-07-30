// tests/e2e/leave-and-return.spec.js — the "I clicked away and lost my game"
// report. Tapping the back chevron mid-round used to call leaveToHome(), which
// deleted localStorage['tb.active'] — the pointer boot uses to reconnect. The
// seat and its token were both still intact server-side and in storage; the app
// had simply forgotten WHICH game to return to, so it dropped the player on Home
// with no way back except the Join screen (which then rejected their own name).
import { test, expect } from '@playwright/test';
import { newPhone, createGame, joinGame, startRound, winRound } from '../support/game.js';

// The header back chevron on the live game screens.
const backChevron = (page) => page.locator('.tb-hicon--chev').first();

test('backing out mid-round and returning keeps the seat', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible();

  // Dee turns in, so there is a score that must survive.
  await winRound(dee.page);
  await expect(dee.page.getByText('STANDINGS')).toBeVisible();

  // Dee taps back until she lands on Home — "clicking away from the game".
  for (let i = 0; i < 4; i++) {
    if (await dee.page.getByRole('button', { name: 'Start a game' }).isVisible().catch(() => false)) break;
    await backChevron(dee.page).click();
    await dee.page.waitForTimeout(250);
  }
  await expect(dee.page.getByRole('button', { name: 'Start a game' })).toBeVisible();

  // The reconnect pointer must survive backing out — this is the actual bug.
  const activeAfterBack = await dee.page.evaluate(() => localStorage.getItem('tb.active'));
  expect(activeAfterBack, 'tb.active must still point at the game after backing out').toBe(code);

  // Coming back to the app returns her to the game, not to Home. She lands on
  // the ROUND screen, not Standings: Standings is a client-side view, so the
  // server's phase is still 'round' and phase-driven routing is what restores
  // her — which is exactly the behaviour we want to pin.
  await dee.page.reload();
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible({ timeout: 25000 });

  // Same seat, not a second one: Rosa's view still shows exactly one Dee.
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);

  await rosa.context.close();
  await dee.context.close();
});

test('rejoining by name after losing the pointer reclaims the same seat', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);
  await winRound(dee.page);                       // Dee is on the board

  // Simulate the worst case: the phone loses BOTH the pointer and the identity
  // token (cleared storage / a different phone). The only way back is the Join
  // screen with the same name — which must reclaim, not reject.
  await dee.page.evaluate(() => localStorage.clear());
  await dee.page.reload();
  await expect(dee.page.getByRole('button', { name: 'Start a game' })).toBeVisible();

  await joinGame(dee.page, code, 'Dee');          // must NOT error with name_taken

  // Back in the game, and Rosa's roster still shows a single Dee (no duplicate).
  await expect(dee.page.getByText(/STANDINGS|DOUBLE TWELVE/)).toBeVisible({ timeout: 25000 });
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);

  await rosa.context.close();
  await dee.context.close();
});
