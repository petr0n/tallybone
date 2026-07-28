// tests/e2e/reconnect.spec.js — the flaky-network cases. A dropped phone must
// walk back into its seat with its score intact, and someone can join a game
// already in progress. These are the failures most likely at a real table.
import { test, expect } from '@playwright/test';
import { PERSONAS } from '../fixtures/personas.js';
import { newPhone, newScanPhone, createGame, joinGame, startRound, scanTurnIn, expectLeader } from '../support/game.js';

const seatedWait = (page) =>
  page.waitForFunction(() => /^[A-Z0-9]{5}$/.test(localStorage.getItem('tb.active') || ''));

test('reconnect mid-round reclaims the seat and preserves the turn-in', async ({ browser }) => {
  test.setTimeout(180_000);
  const rosa = await newScanPhone(browser);
  const dee = await newScanPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible();

  const deeTotal = await scanTurnIn(dee.page, PERSONAS[1].photo);

  // Dee's phone drops and comes back.
  await dee.page.reload();
  await seatedWait(dee.page);
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible(); // reclaimed, back in the round

  // Rosa turns in; the leader is correct only if Dee's total survived the reload.
  const rosaTotal = await scanTurnIn(rosa.page, PERSONAS[0].photo);
  await expectLeader(rosa.page, deeTotal <= rosaTotal ? 'Dee' : 'Rosa');

  await rosa.context.close();
  await dee.context.close();
});

test('a late walk-in is seated mid-round', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  const bea = await newPhone(browser);
  await joinGame(bea.page, code, 'Bea');                          // joins after the round started
  await expect(bea.page.getByText('DOUBLE TWELVE')).toBeVisible(); // dropped into the live round
  await expect(rosa.page.getByText('Bea').first()).toBeVisible();  // roster updates for everyone

  await rosa.context.close();
  await dee.context.close();
  await bea.context.close();
});
