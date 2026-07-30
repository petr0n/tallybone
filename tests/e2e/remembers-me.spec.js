// tests/e2e/remembers-me.spec.js — "save the user, and a matching name should be
// enough to re-seat them."
//
// The app stored only a per-game token (tb.id.<code>) and a pointer (tb.active).
// It never stored WHO the player is. So the moment the token went stale — iOS
// evicting storage, a fresh install, private mode, a new phone — the player was
// dumped on the Join screen and made to retype their name from memory, even
// though the server can now re-seat them by name.
//
// These tests pin the durable user record: leave, come back, get your seat with
// nothing typed.
import { test, expect } from '@playwright/test';
import { newPhone, createGame, joinGame, startRound, winRound } from '../support/game.js';

const NAME_KEY = 'tb.name';

test('a stale token still re-seats the player automatically, nothing typed', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);
  await winRound(dee.page);                      // Dee is on the board

  // The app must have remembered who she is, not just which game.
  const savedName = await dee.page.evaluate((k) => localStorage.getItem(k), NAME_KEY);
  expect(savedName, 'the player name must be persisted as user data').toBe('Dee');

  // Her seat token goes stale (storage eviction / reinstall), but she is still
  // the same user on the same device: the pointer + user record survive.
  await dee.page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith('tb.id.')).forEach((k) => localStorage.removeItem(k));
  });
  await dee.page.reload();

  // No Join screen, no typing: the saved name reclaims the seat by itself.
  await expect(dee.page.getByText('DOUBLE TWELVE')).toBeVisible({ timeout: 25000 });
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);   // same seat, not a second one

  await rosa.context.close();
  await dee.context.close();
});

test('the Join screen prefills the remembered name', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');

  // Dee finishes with this game entirely and lands back on Home.
  await dee.page.evaluate(() => localStorage.removeItem('tb.active'));
  await dee.page.reload();
  await expect(dee.page.getByRole('button', { name: 'Start a game' })).toBeVisible();

  // Reaching for Join, her name is already there — she only enters the code.
  await dee.page.getByRole('button', { name: 'Join a game' }).click();
  await expect(dee.page.getByPlaceholder('Dee')).toHaveValue('Dee');

  await rosa.context.close();
  await dee.context.close();
});
