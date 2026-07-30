// tests/rejoin.mjs — regression test for the "locked out of my own game" bug.
//
// Scenario a real player hit: they tapped the back chevron mid-round, which
// cleared the app's reconnect pointer. Coming back, they used the Join screen
// with the same name — and the server rejected them with `name_taken`, because
// `join` always mints a brand-new playerId, so the reducer saw their own still
// seated name under a different id. There was no way back into their own seat.
//
// The Join screen's own footer promises "Been here before? Same code puts you
// back in your seat", so this is the server contradicting the shipped UI.
//
// Needs a dev server: `pnpm dev`, then
//   SMOKE_BASE=ws://localhost:5199 node tests/rejoin.mjs
import { makeClient, isYou, stateWhere } from './support/ws-client.js';

const BASE = process.env.SMOKE_BASE || 'ws://localhost:5173';
const CODE = 'RJ' + Math.floor(Math.random() * 900 + 100);

let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const seat = (g, name) => g.players.find((p) => p.name === name && !p.removed);

// --- set up a game in progress: Rosa (manager) + Dee, both turned in ---
const rosa = makeClient(BASE, CODE);
await rosa.open();
rosa.send({ t: 'join', name: 'Rosa' });
const rosaYou = await rosa.waitFor(isYou, 'rosa you');

const dee = makeClient(BASE, CODE);
await dee.open();
dee.send({ t: 'join', name: 'Dee' });
const deeYou = await dee.waitFor(isYou, 'dee you');
await rosa.waitFor(stateWhere((g) => g.players.length === 2), 'both seated');

rosa.send({ t: 'startRound' });
await dee.waitFor(stateWhere((g) => g.phase === 'round'), 'round started');
dee.send({ t: 'turnIn', total: 17 });
const scored = await dee.waitFor(
  stateWhere((g) => g.scores[deeYou.playerId] && g.scores[deeYou.playerId].turnedIn), 'dee scored');
check(scored.game.scores[deeYou.playerId].total === 17, 'Dee has a score of 17 before dropping');

// --- Dee's phone loses the game: socket gone, reconnect pointer cleared ---
// (Exactly what leaveToHome() did: disconnect + forget which game we were in.
// The identity token in localStorage is NOT what is lost here — the app simply
// no longer knows to reconnect, so the player reaches for the Join screen.)
dee.close();
await new Promise((r) => setTimeout(r, 500));

// --- Dee comes back through the Join screen with the same name ---
const dee2 = makeClient(BASE, CODE);
await dee2.open();
dee2.send({ t: 'join', name: 'Dee' });

const reply = await Promise.race([
  dee2.waitFor(isYou, 'dee2 you', 4000).then((m) => ({ ok: m })),
  dee2.waitFor((m) => m.t === 'error', 'dee2 error', 4000).then((m) => ({ err: m })),
]);

check(!reply.err, `rejoining with the same name is not rejected${reply.err ? ` (got error "${reply.err.code}")` : ''}`);

if (reply.ok) {
  const g = (await dee2.waitFor(stateWhere(() => true), 'state after rejoin')).game;
  check(reply.ok.playerId === deeYou.playerId, `rejoin reclaims the SAME seat id (${reply.ok.playerId} vs original ${deeYou.playerId})`);
  check(g.players.filter((p) => p.name === 'Dee' && !p.removed).length === 1, 'exactly one Dee seated — no duplicate seat');
  check(g.scores[reply.ok.playerId] && g.scores[reply.ok.playerId].total === 17, 'the reclaimed seat still has the score of 17');
  check(g.phase === 'round', 'rejoined straight back into the live round');
}

// --- a socket that already holds the seat may re-join under the same name ---
// This is what the app does when a player steps away and taps "Join as <name>":
// `hello` reclaims the seat by token (marking it connected), then `join` follows.
// The seat must not count as occupied by its own owner.
const dee3 = makeClient(BASE, CODE);
await dee3.open();
// The token must be real: `hello` only claims a seat by token, and claiming it
// is precisely what creates the self-collision this guards against.
dee3.send({ t: 'hello', playerId: deeYou.playerId, token: deeYou.token });
const claimed = await dee3.waitFor((m) => m.t === 'you', 'dee3 hello');
check(claimed.playerId === deeYou.playerId, 'hello reclaimed the seat by token before re-joining');
dee3.send({ t: 'join', name: 'Dee' });
// NB: waitFor() scans the whole inbox, so racing it against `isYou` would match
// the `you` already received from `hello` above and pass no matter what. Wait
// for an ERROR specifically — nothing else has errored on this socket — and
// treat silence as acceptance.
const selfErr = await dee3.waitFor((m) => m.t === 'error', 'dee3 error', 2500).catch(() => null);
check(!selfErr, `a socket re-joining its own seat is not refused${selfErr ? ` (got "${selfErr.code}")` : ''}`);
const after = await dee3.waitFor(stateWhere((g) => g.players.filter((p) => p.name === 'Dee' && !p.removed).length >= 1), 'state after self-rejoin');
check(after.game.players.filter((p) => p.name === 'Dee' && !p.removed).length === 1,
  're-joining your own seat does not create a second row');
dee3.close();
await new Promise((r) => setTimeout(r, 300));

// --- a genuinely different person must still be blocked from an ACTIVE seat ---
const imposter = makeClient(BASE, CODE);
await imposter.open();
imposter.send({ t: 'join', name: 'Rosa' });   // Rosa is still connected
const impReply = await Promise.race([
  imposter.waitFor(isYou, 'imp you', 4000).then((m) => ({ ok: m })),
  imposter.waitFor((m) => m.t === 'error', 'imp error', 4000).then((m) => ({ err: m })),
]);
check(
  impReply.err && impReply.err.code === 'name_taken',
  `a name still CONNECTED is protected: name_taken${impReply.ok ? ` (got seat ${impReply.ok.playerId} instead!)` : ''}`,
);

rosa.close(); dee2.close(); imposter.close();
console.log(failures === 0 ? '\nREJOIN PASS' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
