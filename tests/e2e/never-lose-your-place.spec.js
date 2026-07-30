// tests/e2e/never-lose-your-place.spec.js — the ways a player actually leaves a
// game at a real table, and proof each one gets their seat back.
//
// Written instead of a beforeunload "are you sure you want to leave?" dialog.
// That dialog cannot help here: iOS Safari never fires beforeunload, and MDN's
// own example of when it does NOT fire is exactly this app's scenario — visit the
// page, switch apps, later close the browser from the app manager. So rather
// than warn people out of leaving, these pin that leaving is always survivable.
//
// Note the app has no visibilitychange/pagehide handler, and does not need one:
// what actually happens when a phone locks or the player switches apps is that
// the SOCKET dies. Recovery is net.js's reconnect + `hello`, then the remembered
// name as a fallback. These tests exercise that real mechanism.
import { test, expect } from '@playwright/test';
import { newPhone, createGame, joinGame, startRound } from '../support/game.js';

const inRound = (page) => expect(page.getByText('DOUBLE TWELVE')).toBeVisible({ timeout: 30000 });
const seatOf = (page, code) =>
  page.evaluate((c) => (JSON.parse(localStorage.getItem(`tb.id.${c}`) || '{}')).playerId || null, code);

// Two phones in a live round, Dee's seat id captured.
async function tableInRound(browser) {
  const rosa = await newPhone(browser);
  const dee = await newPhone(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  await startRound(rosa.page);
  await inRound(dee.page);
  return { rosa, dee, code, seat: await seatOf(dee.page, code) };
}

// A phone whose WebSocket we can kill from the test. context.setOffline() alone
// is not enough: it blocks new requests but leaves an ESTABLISHED socket open, so
// nothing drops and the DO never broadcasts a disconnect. Killing the socket is
// what a locked phone or a suspended tab actually does.
async function phoneWithKillableSocket(browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.__sockets = [];
    const Wrapped = function (...args) {
      const s = new Native(...args);
      window.__sockets.push(s);
      return s;
    };
    Wrapped.prototype = Native.prototype;
    // net.js reads WebSocket.OPEN / .CONNECTING, so the statics must survive.
    Object.assign(Wrapped, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = Wrapped;
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
  return { context, page };
}

test('phone locked / switched apps: the socket dies and silently recovers, no reload', async ({ browser }) => {
  // Staged in the LOBBY, because `AWAY` (derived live from open sockets) is the
  // only place the app surfaces connection state — game-setup.js:315. That gives
  // us a real signal that the drop happened rather than assuming it did. Presence
  // during a round is deferred in the design spec §8, so there is nothing to read
  // mid-round.
  const rosa = await newPhone(browser);
  const dee = await phoneWithKillableSocket(browser);
  const code = await createGame(rosa.page, 'Rosa');
  await joinGame(dee.page, code, 'Dee');
  const seat = await seatOf(dee.page, code);
  await expect(rosa.page.getByText('READY')).toBeVisible();

  // Go offline AND kill the live socket: offline alone leaves it open, and
  // killing alone would let net.js reconnect within ~500ms, too fast to observe.
  // Together they hold the player disconnected the way a locked phone does.
  await dee.context.setOffline(true);
  await dee.page.evaluate(() => window.__sockets.at(-1).close());
  await expect(rosa.page.getByText('AWAY')).toBeVisible({ timeout: 20000 });

  // Player comes back to the app. No reload, no tap — net.js reconnects itself.
  await dee.context.setOffline(false);
  await expect(rosa.page.getByText('AWAY')).toBeHidden({ timeout: 30000 });
  expect(await seatOf(dee.page, code), 'same seat, not a new one').toBe(seat);
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);

  // Proof the socket is genuinely live again, not just that the page looks
  // unchanged: Rosa starts the round and Dee's phone follows on its own, which
  // only a working connection can do.
  await startRound(rosa.page);
  await inRound(dee.page);

  await rosa.context.close();
  await dee.context.close();
});

test('tab closed and reopened: a fresh page reclaims the seat', async ({ browser }) => {
  const { rosa, dee, code, seat } = await tableInRound(browser);

  // Close the tab outright and open a new one in the same browser (storage kept).
  await dee.page.close();
  const reopened = await dee.context.newPage();
  await reopened.goto('/');

  await inRound(reopened);
  expect(await seatOf(reopened, code), 'the reopened tab holds the same seat').toBe(seat);
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);

  await rosa.context.close();
  await dee.context.close();
});

test('a different phone gets the seat back from just the code and a name', async ({ browser }) => {
  const { rosa, dee, code, seat } = await tableInRound(browser);

  // Dee's phone is gone for good — a genuinely different device, no storage at
  // all. The code plus her name is all she has, and it must be enough.
  await dee.context.close();
  const newDevice = await newPhone(browser);
  expect(await newDevice.page.evaluate(() => localStorage.length), 'new device starts empty').toBe(0);

  await joinGame(newDevice.page, code, 'Dee');

  await inRound(newDevice.page);
  expect(await seatOf(newDevice.page, code), 'reclaimed the ORIGINAL seat id').toBe(seat);
  await expect(rosa.page.getByText('Dee')).toHaveCount(1);   // not a second Dee

  await rosa.context.close();
  await newDevice.context.close();
});
