// tests/e2e/happy.spec.js — the harness smoke: two real browser contexts
// (two phones) create/join one game against the real Durable Object, play a
// round, and both land synced on Standings then Game Over. No scanner here
// (that's scan.spec.js) — this proves multi-context + live sync end to end.
import { test, expect } from '@playwright/test';
import { gotoHome, createGame, joinGame, startRound, winRound, callGame } from '../support/game.js';

test('two phones: create, join, round, turn-in sync, game over', async ({ browser }) => {
  const mgrCtx = await browser.newContext();
  const p2Ctx = await browser.newContext();
  const rosa = await mgrCtx.newPage();
  const dee = await p2Ctx.newPage();

  await gotoHome(rosa);
  const code = await createGame(rosa, 'Rosa');

  await gotoHome(dee);
  await joinGame(dee, code, 'Dee');

  // Both phones see both players in the lobby (live roster sync).
  await expect(rosa.getByText('Dee')).toBeVisible();
  await expect(dee.getByText('Rosa')).toBeVisible();

  // Manager starts the round; the player is pulled into it by phase.
  await startRound(rosa);
  await expect(rosa.getByText('DOUBLE TWELVE')).toBeVisible();
  await expect(dee.getByText('DOUBLE TWELVE')).toBeVisible();

  // Both turn in (win = 0), both land on Standings, each sees itself as "(you)".
  await winRound(rosa);
  await winRound(dee);
  await expect(rosa.getByText('Rosa (you)')).toBeVisible();
  await expect(dee.getByText('Dee (you)')).toBeVisible();

  // Manager calls the game; every phone is pulled to Game Over.
  await callGame(rosa);
  await expect(rosa.getByText('GAME OVER')).toBeVisible();
  await expect(dee.getByText('GAME OVER')).toBeVisible();

  await mgrCtx.close();
  await p2Ctx.close();
});
