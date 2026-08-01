// tests/e2e/gameplay.spec.js — the flagship: a full 6-player game mirroring the
// live event. Six real browser contexts join one game, everyone scans a real
// hand and turns it in, the manager drives two rounds, and every phone lands on
// Game Over with the correct winner — all state asserted synced across phones.
import { test, expect } from '@playwright/test';
import { PERSONAS } from '../fixtures/personas.js';
import {
  newPhone, newScanPhone, gotoHome, createGame, joinGame, startRound, scanTurnIn,
  pickNextDouble, winRound, callGame, expectLeader,
} from '../support/game.js';

test('six-player flagship: full game to a correct winner', async ({ browser }) => {
  test.setTimeout(360_000);

  const phones = [];
  for (const p of PERSONAS) phones.push({ ...p, ...(await newScanPhone(browser)) });
  const [rosa, ...rest] = phones;

  // Rosa opens the table; the other five join by code.
  const code = await createGame(rosa.page, rosa.name);
  for (const ph of rest) await joinGame(ph.page, code, ph.name);

  // 6-way roster sync: every phone shows every player.
  for (const ph of phones)
    for (const other of phones)
      await expect(ph.page.getByText(other.name, { exact: true }).first()).toBeVisible();

  // Round 1 opens on double-twelve; every phone is pulled in.
  await startRound(rosa.page);
  for (const ph of phones) await expect(ph.page.getByText('DOUBLE TWELVE')).toBeVisible();

  // Everyone scans a real hand and turns it in; capture each round total.
  const totals = {};
  for (const ph of phones) totals[ph.name] = await scanTurnIn(ph.page, ph.photo);
  const winner = Object.entries(totals).sort((a, b) => a[1] - b[1])[0][0];

  // The manager's standings show the correct leader (lowest total).
  await expectLeader(rosa.page, winner);

  // Round 2: manager picks the next double; everyone pulled in; all go out (0).
  await pickNextDouble(rosa.page);
  for (const ph of phones) await expect(ph.page.getByText('DOUBLE ELEVEN')).toBeVisible();
  for (const ph of phones) await winRound(ph.page);

  // Manager calls it; every phone lands on Game Over with the same winner.
  await callGame(rosa.page);
  for (const ph of phones) {
    await expect(ph.page.getByText('GAME OVER')).toBeVisible();
    await expect(ph.page.getByText(new RegExp(`${winner.toUpperCase()} TAKES IT`))).toBeVisible();
  }

  for (const ph of phones) await ph.context.close();
});

test('a duplicate name is rejected, not seated', async ({ browser }) => {
  const a = await newPhone(browser);
  const code = await createGame(a.page, 'Rosa');

  const b = await newPhone(browser);
  await b.page.getByRole('button', { name: 'Join a game' }).click();
  await b.page.locator('input[maxlength="5"]').fill(code);
  await b.page.getByPlaceholder('Dee').fill('Rosa');
  await b.page.getByRole('button', { name: 'Join as Rosa' }).click();

  await expect(b.page.getByText(/already has that name/i)).toBeVisible();
  expect(await b.page.evaluate(() => localStorage.getItem('tb.active'))).toBeNull();

  await a.context.close();
  await b.context.close();
});

test('non-managers get no manager controls', async ({ browser }) => {
  const a = await newPhone(browser);
  const code = await createGame(a.page, 'Rosa');
  const b = await newPhone(browser);
  await joinGame(b.page, code, 'Dee');

  await expect(a.page.getByRole('button', { name: /Start round/ })).toBeVisible();
  await expect(b.page.getByRole('button', { name: /Start round/ })).toHaveCount(0);
  await expect(b.page.getByText(/Waiting for the manager/)).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('joining an unused code opens a fresh lobby (accepted casual behavior)', async ({ browser }) => {
  // A fresh random code each run — the DO persists games, so a fixed code would
  // collide on the second run (and that persistence is itself correct behavior).
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');

  const a = await newPhone(browser);
  await a.page.getByRole('button', { name: 'Join a game' }).click();
  await a.page.locator('input[maxlength="5"]').fill(code);
  await a.page.getByPlaceholder('Dee').fill('Solo');
  await a.page.getByRole('button', { name: 'Join as Solo' }).click();

  await a.page.waitForFunction((c) => localStorage.getItem('tb.active') === c, code);
  await expect(a.page.getByText('THE TABLE', { exact: true })).toBeVisible();

  await a.context.close();
});

// The Create screen shows the join code and a scannable QR before the creator
// has taken a seat — they still have to type a name and tap "Open the table".
// A guest who scans during that window used to become manager, because the
// server gave the game to the first join it saw. Reported from a real table.
//
// This has to run through the DO, not the reducer: the fix depends on the
// `creator` flag surviving net.js -> the socket -> game-room.js's rebuilt
// intent, and the reducer's own test cannot see any of those seams.
test('the creator runs the table even if a guest joins first', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);

  // Rosa mints a code and is still on Create, seat not taken.
  await rosa.page.getByRole('button', { name: 'Start a game' }).click();
  await expect(rosa.page.getByText('YOUR TABLE IS OPEN')).toBeVisible();
  // The code is drawn as one tile per character with no class of its own; the
  // QR's accessible label is the one place it appears as a whole string.
  const label = await rosa.page.locator('svg[aria-label^="Scan to join game"]').getAttribute('aria-label');
  const code = (label.match(/[A-Z0-9]{5}/) || [])[0];
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // Dee scans the QR and gets all the way in first.
  await joinGame(dee.page, code, 'Dee');

  // Rosa now opens the table.
  await rosa.page.getByPlaceholder('Rosa').fill('Rosa');
  await rosa.page.getByRole('button', { name: 'Open the table' }).click();
  await expect(rosa.page.getByText(/LOBBY|WAITING|PLAYERS/i).first()).toBeVisible();

  // Manager controls are the observable proof of who owns the game.
  await expect(rosa.page.getByRole('button', { name: /Start round/ }),
    'the creator runs the table').toBeVisible();
  await expect(dee.page.getByRole('button', { name: /Start round/ }),
    'the guest who arrived first does not').toHaveCount(0);

  await rosa.context.close();
  await dee.context.close();
});

// "Round N detail · See what everyone turned in" used to open the player's OWN
// turn-in screen — seeded with their last scan, or with six hardcoded fake tiles
// if they had not scanned — carrying a live Turn in button that would overwrite
// their real score. It showed nobody else's number. Reported at a real table as
// "I can't see the scores between rounds" (2026-07-31).
test('round detail shows what everyone turned in, and cannot resubmit', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  await rosa.page.getByRole('button', { name: 'I won this round' }).click();
  await expect(rosa.page.getByText('STANDINGS')).toBeVisible();

  await rosa.page.getByText('See what everyone turned in').click();
  await expect(rosa.page.getByText(/ROUND 1 DETAIL/)).toBeVisible();

  // Both players are listed: the one who went out, and the one still counting.
  await expect(rosa.page.getByText('Rosa (you)')).toBeVisible();
  await expect(rosa.page.getByText('WENT OUT').first()).toBeVisible();
  await expect(rosa.page.getByText('Dee')).toBeVisible();
  await expect(rosa.page.getByText('STILL COUNTING…')).toBeVisible();

  // The screen must not be able to change anyone's score.
  await expect(rosa.page.getByRole('button', { name: /Turn in/ })).toHaveCount(0);
  await expect(rosa.page.getByText('bones scanned and confirmed')).toHaveCount(0);

  await rosa.context.close();
  await dee.context.close();
});

// A player whose phone cannot turn in — an iPhone whose scanner would not load —
// stalls the whole round: the round only closes when everyone is in, and nobody
// else could enter that number. "Fix score" in Manager controls was rendered
// with no click handler at all. Reported as a game killer (2026-07-31).
test('the manager can enter a score for a player who cannot', async ({ browser }) => {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);

  // Rosa is in; Dee's phone is useless, so Rosa enters 23 for her.
  await rosa.page.getByRole('button', { name: 'I won this round' }).click();
  await expect(rosa.page.getByText('STANDINGS')).toBeVisible();
  await rosa.page.getByText('⚙', { exact: true }).click();
  await expect(rosa.page.getByText('MANAGER CONTROLS')).toBeVisible();
  await rosa.page.getByText('Enter score').click();

  await expect(rosa.page.getByText('ENTER A SCORE')).toBeVisible();
  await rosa.page.locator('input[type=number]').fill('23');
  await rosa.page.getByRole('button', { name: 'Save this score' }).click();

  // The manager's own list reflects it immediately.
  await expect(rosa.page.getByText('MANAGER CONTROLS')).toBeVisible();
  await expect(rosa.page.getByText(/TOTAL 23/)).toBeVisible();

  // And it is real server state, not local: Dee's phone shows it too. (Standings
  // is deliberately not an auto-nav phase, so she opens it herself.)
  await dee.page.getByText('Scores', { exact: true }).click();
  await expect(dee.page.getByText('STANDINGS')).toBeVisible({ timeout: 30000 });
  await expect(dee.page.getByText('23').first()).toBeVisible();

  await rosa.context.close();
  await dee.context.close();
});
