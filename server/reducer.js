// server/src/reducer.js — pure game logic for the Tallybone multiplayer backend.
// No Cloudflare imports, no I/O, no randomness: the Durable Object mints ids and
// tokens and passes them in, so every rule here is deterministic and unit-testable.
//
// applyIntent(game, intent, actorId) -> { game, error }
//   On error, the ORIGINAL game is returned unchanged and `error` is a string code.
//   On success, a new (cloned + mutated) game is returned and `error` is undefined.
// Game shape:
//   { code, phase, roundNum, currentDouble, managerId,
//     players: [{ id, name, connected, removed }],
//     scores: { [id]: { total, last, turnedIn } } }   // total = running (LOW wins)

export function emptyGame(code) {
  return { code, phase: 'lobby', roundNum: 1, currentDouble: 12, managerId: null, players: [], scores: {} };
}

const MANAGER_INTENTS = new Set(['startRound', 'pickDouble', 'removePlayer', 'reopenRound', 'callGame', 'runItBack']);
const clampDouble = (d) => Math.max(0, Math.min(12, d | 0));
const activePlayers = (g) => g.players.filter((p) => !p.removed);

// Reset per-round score fields for every seated player. resetTotals wipes the
// running total (new game); otherwise totals accumulate across rounds.
function startScores(g, resetTotals) {
  for (const p of g.players) {
    if (p.removed) continue;
    const prev = g.scores[p.id] || { total: 0 };
    g.scores[p.id] = { total: resetTotals ? 0 : prev.total, last: 0, turnedIn: false };
  }
}

export function applyIntent(game, intent, actorId) {
  const t = intent && intent.t;
  if (MANAGER_INTENTS.has(t) && actorId !== game.managerId) return { game, error: 'not_manager' };
  const g = structuredClone(game);

  switch (t) {
    case 'join': {
      const name = (intent.name || '').trim();
      if (!name) return { game, error: 'name_required' };
      if (g.phase === 'over') return { game, error: 'bad_phase' };
      const taken = g.players.some(
        (x) => !x.removed && x.id !== intent.id && x.name.trim().toLowerCase() === name.toLowerCase());
      if (taken) return { game, error: 'name_taken' };
      let p = g.players.find((x) => x.id === intent.id);
      if (p) { p.name = name; p.removed = false; }
      else {
        p = { id: intent.id, name, connected: true, removed: false };
        g.players.push(p);
        g.scores[p.id] = { total: 0, last: 0, turnedIn: false };
      }
      // Who runs the table. First-join-wins is the fallback, but it gave the
      // game away in practice: the Create screen shows the code and a scannable
      // QR BEFORE the creator has taken their seat (they still have to type a
      // name and tap "Open the table"), so a guest scanning that QR arrives
      // first. The creator's own join therefore carries `creator` and claims it.
      // Lobby only — nobody takes the table out from under a game in progress.
      if (intent.creator && g.phase === 'lobby') g.managerId = p.id;
      else if (!g.managerId) g.managerId = p.id;
      return { game: g };
    }
    case 'startRound': {
      if (g.phase !== 'lobby') return { game, error: 'bad_phase' };
      g.phase = 'round'; g.roundNum = 1; g.currentDouble = 12;
      startScores(g, true);
      return { game: g };
    }
    case 'pickDouble': {
      if (g.phase !== 'standings') return { game, error: 'bad_phase' };
      g.currentDouble = clampDouble(intent.d);
      g.roundNum += 1; g.phase = 'round';
      startScores(g, false);
      return { game: g };
    }
    case 'turnIn': {
      if (g.phase !== 'round') return { game, error: 'bad_phase' };
      const p = g.players.find((x) => x.id === actorId && !x.removed);
      const s = g.scores[actorId];
      if (!p || !s) return { game, error: 'not_joined' };
      const pts = Math.max(0, intent.total | 0);
      s.total = s.total - s.last + pts; // idempotent: re-turnIn corrects, never double-counts
      s.last = pts;
      s.turnedIn = true;
      if (activePlayers(g).every((x) => g.scores[x.id] && g.scores[x.id].turnedIn)) g.phase = 'standings';
      return { game: g };
    }
    case 'removePlayer': {
      const p = g.players.find((x) => x.id === intent.id);
      if (!p) return { game, error: 'no_such_player' };
      p.removed = true;
      return { game: g };
    }
    case 'reopenRound': {
      if (g.phase !== 'standings') return { game, error: 'bad_phase' };
      g.phase = 'round';
      return { game: g };
    }
    case 'callGame': {
      if (g.phase !== 'round' && g.phase !== 'standings') return { game, error: 'bad_phase' };
      g.phase = 'over';
      return { game: g };
    }
    case 'runItBack': {
      if (g.phase !== 'over') return { game, error: 'bad_phase' };
      g.phase = 'lobby'; g.roundNum = 1; g.currentDouble = 12;
      startScores(g, true);
      return { game: g };
    }
    default:
      return { game, error: 'unknown_intent' };
  }
}
