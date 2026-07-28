// tests/stress/robustness.mjs — friends-scale backend stress against a running
// dev server. Bots speak the WS protocol directly (no browser), so many run
// cheaply. Run: start the dev server, then
//   SMOKE_BASE=ws://localhost:5199 pnpm test:stress
// Tunables: STRESS_GAMES (default 25), SOAK_SEC (default 8).
import { makeClient, isYou, stateWhere } from '../support/ws-client.js';

const BASE = process.env.SMOKE_BASE || 'ws://localhost:5199';
const GAMES = Number(process.env.STRESS_GAMES || 25);
const SOAK_SEC = Number(process.env.SOAK_SEC || 8);
const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const inRound = stateWhere((g) => g.phase === 'round');
const inStandings = stateWhere((g) => g.phase === 'standings');
const errors = [];
const latencies = [];
const fail = (m) => errors.push(m);

async function join(code, name) {
  const c = makeClient(BASE, code);
  await c.open();
  c.send({ t: 'hello' });
  c.send({ t: 'join', name });
  const you = await c.waitFor(isYou, `join ${name}`, 10000);
  return { c, you, name };
}

// Many concurrent games each play a full round; every client must converge on
// the same final standings with correct per-player totals.
async function concurrentGames(n) {
  const one = async (gi) => {
    const code = `cg${gi}x${uid()}`;
    const cl = [];
    for (const nm of ['Mgr', 'P1', 'P2', 'P3', 'P4']) cl.push(await join(code, nm));
    cl[0].c.send({ t: 'startRound' });
    await Promise.all(cl.map((x) => x.c.waitFor(inRound, 'round', 15000)));
    cl.forEach((x, i) => { x.t0 = performance.now(); x.pts = (i + 1) * 3; x.c.send({ t: 'turnIn', total: x.pts }); });
    const finals = await Promise.all(cl.map((x) =>
      x.c.waitFor(inStandings, 'standings', 15000).then((s) => { latencies.push(performance.now() - x.t0); return s; })));
    for (const f of finals) {
      if (f.game.players.length !== 5) fail(`${code}: roster=${f.game.players.length}`);
      for (const x of cl) if (f.game.scores[x.you.playerId]?.total !== x.pts) fail(`${code}: total mismatch ${x.name}`);
    }
    cl.forEach((x) => x.c.close());
  };
  await Promise.all(Array.from({ length: n }, (_, i) => one(i).catch((e) => fail(`game ${i}: ${e.message}`))));
}

// All non-managers drop and reconnect repeatedly mid-round; seats must persist.
async function reconnectStorm() {
  const code = `rs${uid()}`;
  const mgr = await join(code, 'Mgr');
  let players = await Promise.all([1, 2, 3, 4].map((i) => join(code, `P${i}`)));
  mgr.c.send({ t: 'startRound' });
  await mgr.c.waitFor(inRound, 'storm round', 15000);
  for (let cycle = 0; cycle < 15; cycle++) {
    players.forEach((p) => p.c.close());
    players = await Promise.all(players.map(async (p) => {
      const c = makeClient(BASE, code);
      await c.open();
      c.send({ t: 'hello', token: p.you.token });
      await c.waitFor((m) => m.t === 'you' && m.playerId === p.you.playerId, 'reclaim', 15000);
      return { c, you: p.you, name: p.name };
    }));
  }
  [mgr, ...players].forEach((p, i) => p.c.send({ t: 'turnIn', total: (i + 1) * 2 }));
  const s = await mgr.c.waitFor(inStandings, 'storm standings', 15000);
  if (s.game.players.length !== 5) fail(`reconnect storm: roster=${s.game.players.length}`);
  [mgr, ...players].forEach((p) => p.c.close());
}

// A player fires turnIn many times fast; it must count exactly once.
async function idempotentTurnIn() {
  const code = `idem${uid()}`;
  const solo = await join(code, 'Solo');
  solo.c.send({ t: 'startRound' });
  await solo.c.waitFor(inRound, 'idem round', 10000);
  for (let i = 0; i < 20; i++) solo.c.send({ t: 'turnIn', total: 7 });
  const s = await solo.c.waitFor(inStandings, 'idem standings', 10000);
  const total = s.game.scores[solo.you.playerId].total;
  if (total !== 7) fail(`idempotency: total=${total} (expected 7)`);
  solo.c.close();
}

// Play rounds continuously for a while — no crash, no error growth. Keyed on
// roundNum so each wait is for genuinely NEW state, not a stale inbox match.
async function soak(seconds) {
  const code = `soak${uid()}`;
  const a = await join(code, 'A');
  const b = await join(code, 'B');
  const end = Date.now() + seconds * 1000;
  let round = 0;
  while (Date.now() < end) {
    round++;
    a.c.send(round === 1 ? { t: 'startRound' } : { t: 'pickDouble', d: 11 });
    await a.c.waitFor(stateWhere((g) => g.phase === 'round' && g.roundNum === round), 'soak round', 10000);
    a.c.send({ t: 'turnIn', total: 3 });
    b.c.send({ t: 'turnIn', total: 4 });
    await a.c.waitFor(stateWhere((g) => g.phase === 'standings' && g.roundNum === round), 'soak standings', 10000);
  }
  a.c.close(); b.c.close();
  return round;
}

async function main() {
  const t0 = performance.now();
  console.log(`stress @ ${BASE} — ${GAMES} concurrent games + reconnect storm + idempotency + ${SOAK_SEC}s soak`);
  await concurrentGames(GAMES);
  await reconnectStorm();
  await idempotentTurnIn();
  const rounds = await soak(SOAK_SEC);
  latencies.sort((a, b) => a - b);
  const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(0) : 'n/a');
  console.log('\n=== stress summary ===');
  console.log(`games ${GAMES} · players ~${GAMES * 5 + 5 + 1 + 2} · soak rounds ${rounds} · ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`turn-in -> broadcast latency: p50 ${pct(0.5)}ms  p95 ${pct(0.95)}ms  (n=${latencies.length})`);
  console.log(`errors: ${errors.length}`);
  if (errors.length) { errors.slice(0, 12).forEach((e) => console.log('  -', e)); process.exit(1); }
  console.log('STRESS PASS');
  process.exit(0);
}
main().catch((e) => { console.error('STRESS CRASH:', e); process.exit(1); });
