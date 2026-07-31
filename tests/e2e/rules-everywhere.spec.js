// tests/e2e/rules-everywhere.spec.js — the rules must be reachable from wherever
// you are, not just from Home before the game starts. Mid-game is exactly when
// someone asks "wait, what does the double blank score?".
import { test, expect } from '@playwright/test';
import { newPhone, createGame, joinGame, startRound, winRound } from '../support/game.js';

const HELP = '.tb-hicon--q';

// Open the rules from the current screen, confirm they opened, and go back.
async function rulesFromHere(page, where) {
  await expect(page.locator(HELP).first(), `${where} must offer the rules`).toBeVisible();
  await page.locator(HELP).first().click();
  await expect(page.getByText('HOW TO PLAY'), `rules should open from ${where}`).toBeVisible();
  // The house rule players actually argue about must be in there.
  await expect(page.getByText(/double blank/i).first()).toBeVisible();
  await page.locator('.tb-hicon--chev').first().click();
  await expect(page.getByText('HOW TO PLAY')).toBeHidden();
}

test('the rules are reachable from every screen of a game', async ({ browser }) => {
  test.setTimeout(180_000);
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);

  // Create
  await rosa.page.getByRole('button', { name: 'Start a game' }).click();
  await expect(rosa.page.getByText('YOUR TABLE IS OPEN')).toBeVisible();
  await rulesFromHere(rosa.page, 'Create');

  // Join
  await dee.page.getByRole('button', { name: 'Join a game' }).click();
  await expect(dee.page.getByText('JOIN A TABLE')).toBeVisible();
  await rulesFromHere(dee.page, 'Join');
  // rulesFromHere leaves her on Join; joinGame() starts from Home.
  await dee.page.locator('.tb-hicon--chev').first().click();
  await expect(dee.page.getByRole('button', { name: 'Start a game' })).toBeVisible();

  // Lobby
  await rosa.page.getByPlaceholder('Rosa').fill('Rosa');
  await rosa.page.getByRole('button', { name: 'Open the table' }).click();
  await expect(rosa.page.getByText('THE TABLE', { exact: true })).toBeVisible({ timeout: 25000 });
  const code = await rosa.page.evaluate(() => localStorage.getItem('tb.active'));
  await rulesFromHere(rosa.page, 'Lobby');

  await joinGame(dee.page, code, 'Dee');

  // Round
  await startRound(rosa.page);
  await expect(rosa.page.getByText('DOUBLE TWELVE')).toBeVisible();
  await rulesFromHere(rosa.page, 'Round');

  // Standings
  await winRound(dee.page);
  await winRound(rosa.page);
  await expect(rosa.page.getByText('STANDINGS')).toBeVisible();
  await rulesFromHere(rosa.page, 'Standings');

  await rosa.context.close();
  await dee.context.close();
});

test('the rules are reachable from the scanner screens', async ({ browser }) => {
  const { context, page } = await newPhone(browser);

  // Capture (no camera in headless, so it falls through to hand entry)
  await page.getByText('Just count my tiles').click();
  await page.getByRole('button', { name: 'Enter tiles by hand' }).click({ timeout: 60000 });

  // Review
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 60000 });
  await rulesFromHere(page, 'Review');

  await context.close();
});

test('the rules cover the table rules players actually ask about', async ({ browser }) => {
  const { context, page } = await newPhone(browser);
  await page.getByText('How to play').click();
  await expect(page.getByText('HOW TO PLAY')).toBeVisible();

  // Draw counts by table size
  await expect(page.getByText('HOW MANY YOU DRAW')).toBeVisible();
  await expect(page.getByText('15', { exact: true })).toBeVisible();
  await expect(page.getByText(/2.4 PLAYERS/)).toBeVisible();
  await expect(page.getByText('12', { exact: true })).toBeVisible();
  await expect(page.getByText(/5.6 PLAYERS/)).toBeVisible();

  // Turn order and the boneyard
  await expect(page.getByText(/clockwise/i)).toBeVisible();
  await expect(page.getByText(/boneyard/i).first()).toBeVisible();

  // Doubles: extra turn, closing it, the penalty, and not going out on one
  await expect(page.getByText('PLAYING A DOUBLE')).toBeVisible();
  await expect(page.getByText(/close/i).first()).toBeVisible();
  await expect(page.getByText(/skip your next turn/i)).toBeVisible();
  await expect(page.getByText(/can.t go out on a double/i)).toBeVisible();
  // With several doubles open at once, the table needs to know which one is
  // owed first — otherwise players argue about it mid-round.
  await expect(page.getByText(/order they were laid/i)).toBeVisible();

  // Turn order, and that the app RECORDS the table's double rather than
  // deciding it — these two cards used to read as if they contradicted.
  await expect(page.getByText(/highest double/i).first()).toBeVisible();
  await expect(page.getByText(/manager taps it into the app/i)).toBeVisible();

  // Markers: the stuck-turn penalty and what it exposes
  await expect(page.getByText(/WHEN YOU CAN.T PLAY/)).toBeVisible();
  await expect(page.getByText(/marker/i).first()).toBeVisible();
  await expect(page.getByText(/anyone/i).first()).toBeVisible();
  await expect(page.getByText(/your own train/i)).toBeVisible();

  // And the scoring exception that started all this
  await expect(page.getByText(/double blank/i).first()).toBeVisible();

  await context.close();
});
