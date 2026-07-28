// tests/support/game.js — helpers that drive the real Tallybone UI across
// multiple browser contexts (one per "phone"). Selectors track the shipped
// screens; the game code is read from localStorage['tb.active'] (set by main.js
// once a seat is confirmed) rather than scraped from the code-box divs.
import { expect } from '@playwright/test';

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
