// tests/support/game.js — helpers that drive the real Tallybone UI across
// multiple browser contexts (one per "phone"). Selectors track the shipped
// screens; the game code is read from localStorage['tb.active'] (set by main.js
// once a seat is confirmed) rather than scraped from the code-box divs.
import { expect } from '@playwright/test';
import { addCameraMock, setCameraPhoto } from './camera.js';

// A fresh phone = an isolated browser context (own storage) + page on Home.
export async function newPhone(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await gotoHome(page);
  return { context, page };
}

export async function gotoHome(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
}

// The seat is confirmed once main.js writes tb.active (a valid code) — a more
// reliable signal than any painted header, which can flash a beat earlier.
const seated = (page) =>
  page.waitForFunction(() => /^[A-Z0-9]{5}$/.test(localStorage.getItem('tb.active') || ''), null, { timeout: 25000 });

// Create a game as manager; returns the 5-char join code.
export async function createGame(page, name) {
  await page.getByRole('button', { name: 'Start a game' }).click();
  await page.getByPlaceholder('Rosa').fill(name);
  await page.getByRole('button', { name: 'Open the table' }).click();
  await seated(page);
  const code = await page.evaluate(() => localStorage.getItem('tb.active'));
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  return code;
}

// Join an existing game by code. Fills the (visually hidden) code input.
export async function joinGame(page, code, name) {
  await page.getByRole('button', { name: 'Join a game' }).click();
  await page.locator('input[maxlength="5"]').fill(code);
  await page.getByPlaceholder('Dee').fill(name);
  await page.getByRole('button', { name: `Join as ${name}` }).click();
  await seated(page);
}

export async function startRound(page) {
  await page.getByRole('button', { name: /Start round/ }).click();
}

// "I won this round" turns in 0 and moves the player to Standings.
export async function winRound(page) {
  await page.getByRole('button', { name: 'I won this round' }).click();
  await expect(page.getByText('STANDINGS')).toBeVisible();
}

// Manager: open the gear -> Manager controls -> Call the game.
export async function callGame(page) {
  await page.getByText('⚙', { exact: true }).click();
  await expect(page.getByText('MANAGER CONTROLS')).toBeVisible();
  await page.getByRole('button', { name: /Call it/ }).click();
}

// A phone with the camera mocked, sitting on Home.
export async function newScanPhone(browser) {
  const context = await browser.newContext();
  await addCameraMock(context);
  const page = await context.newPage();
  await gotoHome(page);
  return { context, page };
}

// A scanner misread can produce two tiles with the same face (twins), which the
// Review screen blocks. Nudge one tile until the block clears — the exact total
// doesn't matter (gameplay asserts invariants), only that a real hand submits.
async function clearTwins(page) {
  for (let i = 0; i < 8; i++) {
    const label = await page.locator('.rev__footer .tb-btn').first().innerText();
    if (!/twins/i.test(label)) return;
    await page.locator('.rev__card .plus').last().click();
  }
}

// In-game: scan a photo through the real scanner, then turn the reading in.
// Returns the round total that landed (read off the Review screen).
export async function scanTurnIn(page, photoPath) {
  await setCameraPhoto(page, photoPath);
  await page.getByRole('button', { name: 'Scan my tiles' }).click();
  await page.locator('.cap__shutter').click();
  await expect(page.locator('.rev__total')).toBeVisible({ timeout: 90000 });
  await clearTwins(page);
  const total = Number(await page.locator('.rev__total').innerText());
  await page.locator('.rev__footer .tb-btn--primary').click();          // Review: Submit N points
  await page.getByRole('button', { name: /Turn in \d+ points/ }).click(); // Submit: Turn in N points
  await expect(page.getByText('STANDINGS')).toBeVisible();
  return total;
}

// Manager on Standings: start the next round, accepting the suggested double.
export async function pickNextDouble(page) {
  await page.getByRole('button', { name: /Start round \d+$/ }).click(); // Standings -> picker
  await page.getByRole('button', { name: /Start round \d+ on/ }).click(); // picker -> confirm
}

// Assert the leader row (marked "LOWEST — LEADING") belongs to `name`.
// Match /LEADING/, not /LOWEST/ — the header ("LOWEST TOTAL WINS") also matches.
export async function expectLeader(page, name) {
  await expect(page.getByText(/LEADING/).locator('xpath=..')).toContainText(name);
}
