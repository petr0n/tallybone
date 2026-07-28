// server/smoke.mjs — two-client integration smoke against a running `wrangler dev`.
// Usage: `npx wrangler dev` in one shell, then `node smoke.mjs` in another.
// Exercises: create+join (manager), second join (player), a full round with
// turn-ins syncing to both clients, and a reconnect that reclaims the seat.
import WebSocket from 'ws';

const BASE = process.env.SMOKE_BASE || 'ws://127.0.0.1:8787';
const CODE = 'SMOKE' + Math.floor(Math.random() * 900 + 100);
const assert = (cond, msg) => { if (!cond) { console.error('SMOKE FAIL:', msg); process.exit(1); } };

function client() {
  const ws = new WebSocket(`${BASE}/api/game/${CODE}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) { clearTimeout(waiters[i].timer); waiters[i].resolve(msg); waiters.splice(i, 1); }
    }
  });
  return {
    ws,
    open: () => new Promise((r, j) => { ws.on('open', r); ws.on('error', j); }),
    send: (m) => ws.send(JSON.stringify(m)),
    waitFor: (pred, label) => new Promise((resolve, reject) => {
      const found = inbox.find(pred);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error('timeout: ' + (label || 'msg'))), 5000);
      waiters.push({ pred, resolve, timer });
    }),
  };
}

const isYou = (m) => m.t === 'you' && m.playerId;
const stateWhere = (fn) => (m) => m.t === 'state' && fn(m.game);

const A = client();
await A.open();
A.send({ t: 'hello' });
A.send({ t: 'join', name: 'Rosa' });
const youA = await A.waitFor(isYou, 'A you');
assert(youA.role === 'manager', 'first joiner is manager');

const B = client();
await B.open();
B.send({ t: 'hello' });
B.send({ t: 'join', name: 'Dee' });
const youB = await B.waitFor(isYou, 'B you');
assert(youB.role === 'player', 'second joiner is player');

A.send({ t: 'startRound' });
await A.waitFor(stateWhere((g) => g.phase === 'round'), 'round started');

A.send({ t: 'turnIn', total: 5 });
B.send({ t: 'turnIn', total: 8 });
const sA = await A.waitFor(stateWhere((g) => g.phase === 'standings'), 'A standings');
const sB = await B.waitFor(stateWhere((g) => g.phase === 'standings'), 'B standings');
assert(sA.game.scores[youA.playerId].total === 5, 'A total synced to 5');
assert(sB.game.scores[youB.playerId].total === 8, 'B total synced to 8');
assert(sA.game.players.length === 2, 'roster has both players');

// B drops and reconnects with its saved token -> reclaims the same seat.
B.ws.close();
const B2 = client();
await B2.open();
B2.send({ t: 'hello', token: youB.token });
const youB2 = await B2.waitFor((m) => m.t === 'you' && m.playerId === youB.playerId, 'B reclaim');
assert(youB2.playerId === youB.playerId, 'reconnect reclaims same seat');
const st = await B2.waitFor((m) => m.t === 'state', 'B2 state');
assert(st.game.scores[youB.playerId].total === 8, 'reconnect sees running total');

console.log('SMOKE PASS —', CODE, '| manager', youA.playerId, '| player', youB.playerId);
process.exit(0);
