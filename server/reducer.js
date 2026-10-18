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
//     scores: { [id]: { total, last, turnedIn } },     // total = running (LOW wins)
//     history: [{ round, double, scores: { [id]: number|null } }] }  // closed rounds
// `history` gets one entry per CLOSED round. null = did not turn in, which is not
// the same as a 0 (went out). A player who joined later has no key for earlier
// rounds. Snapshots persisted before it existed have no field: read `history || []`.

export function emptyGame(code) {
  return { code, phase: 'lobby', roundNum: 1, currentDouble: 12, managerId: null, players: [], scores: {}, history: [] };
}

const MANAGER_INTENTS = new Set(['startRound', 'pickDouble', 'setDouble', 'undoRound', 'removePlayer', 'reopenRound', 'callGame', 'runItBack', 'setScore']);
const clampDouble = (d) => Math.max(0, Math.min(12, d | 0));
const activePlayers = (g) => g.players.filter((p) => !p.removed);
const allIn = (g) => activePlayers(g).every((x) => g.scores[x.id] && g.scores[x.id].turnedIn);

// Take a player out of the game — the manager removing them, or them leaving.
// Their scores and history stay. If they ran the table, it passes to the first
// player still seated; if the round was only waiting on them, it closes now.
function removeSeat(g, id) {
  const p = g.players.find((x) => x.id === id);
  if (!p) return false;
  p.removed = true;
  if (g.managerId === id) g.managerId = (activePlayers(g)[0] || {}).id || null;
  if (g.phase === 'round' && activePlayers(g).length && allIn(g)) g.phase = 'standings';
  return true;
}

// Reset per-round score fields for every player. resetTotals wipes the running
// total (new game); otherwise totals accumulate across rounds. Removed players
// are included so one who rejoins later is not carrying a stale turn-in; one who
// rejoins within the same round keeps theirs, since it is still this round's.
function startScores(g, resetTotals) {
  for (const p of g.players) {
    const prev = g.scores[p.id] || { total: 0 };
    g.scores[p.id] = { total: resetTotals ? 0 : prev.total, last: 0, turnedIn: false };
  }
}

// Record the round that is closing, before startScores() wipes `last`. Called
// where a round ends — pickDouble (next round) and callGame — and NOT on entering
// standings, so reopenRound has nothing to undo.
function closeRound(g) {
  const scores = {};
  for (const p of activePlayers(g)) {
    const s = g.scores[p.id];
    if (s) scores[p.id] = s.turnedIn ? s.last : null;
  }
  g.history = [...(g.history || []), { round: g.roundNum, double: g.currentDouble, scores }];
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
      // The manager picks the opening double like any other round's; 12 when
      // none is sent (the usual opener, and what older clients assume).
      g.phase = 'round'; g.roundNum = 1; g.currentDouble = intent.d == null ? 12 : clampDouble(intent.d);
      startScores(g, true);
      return { game: g };
    }
    // From standings, or straight from a live round: Standings tells the manager
    // "you can start anyway" while players are still counting. Anyone who never
    // turned in is recorded as null for the closed round.
    //
    // `round` names the round being closed, which makes a repeat harmless: a
    // second tap (or a phone that never left the picker) carries a round that
    // has already moved on and is rejected — a live table once advanced four
    // phantom rounds from one picker. A mid-round start requires it; from
    // standings it stays optional, which is all an older client could do.
    case 'pickDouble': {
      if (g.phase !== 'standings' && g.phase !== 'round') return { game, error: 'bad_phase' };
      if (intent.round != null ? intent.round !== g.roundNum : g.phase === 'round') return { game, error: 'stale_round' };
      closeRound(g);
      g.currentDouble = clampDouble(intent.d);
      g.roundNum += 1; g.phase = 'round';
      startScores(g, false);
      return { game: g };
    }
    // Undo the last round start: back to the previous round, on its double.
    // Turn-ins made in the dropped round carry back into it — after a mistaken
    // start, players turning in are scoring the round they are actually
    // playing (a live table had three of four real scores land in a phantom
    // round). A player with a turn-in in both keeps the newer one; totals count
    // each player's round once.
    case 'undoRound': {
      if (g.phase !== 'round' && g.phase !== 'standings') return { game, error: 'bad_phase' };
      const prev = (g.history || [])[(g.history || []).length - 1];
      if (!prev) return { game, error: 'nothing_to_undo' };
      g.history = g.history.slice(0, -1);
      for (const [id, s] of Object.entries(g.scores)) {
        const v = prev.scores[id];
        if (s.turnedIn) g.scores[id] = { total: s.total - (v ?? 0), last: s.last, turnedIn: true };
        else g.scores[id] = { total: s.total, last: v ?? 0, turnedIn: v != null };
      }
      g.roundNum = prev.round; g.currentDouble = prev.double;
      g.phase = activePlayers(g).length && allIn(g) ? 'standings' : 'round';
      return { game: g };
    }
    // Correct the double the CURRENT round opened on (a mis-tap, or a game that
    // started before round 1 could be picked). Scores are untouched; the round's
    // history entry, written when it closes, records the corrected double.
    case 'setDouble': {
      if (g.phase !== 'round' && g.phase !== 'standings') return { game, error: 'bad_phase' };
      g.currentDouble = clampDouble(intent.d);
      return { game: g };
    }
    // The manager turns a score in ON BEHALF of a player. A phone that cannot
    // scan — or cannot even load the scanner, which happened at a real table —
    // otherwise stalls the whole round: nobody else can enter that number and
    // the round never closes. Same arithmetic as turnIn, including the correct-
    // don't-double-count rule, so fixing a wrong entry is the same action.
    case 'setScore': {
      if (g.phase !== 'round' && g.phase !== 'standings') return { game, error: 'bad_phase' };
      const p = g.players.find((x) => x.id === intent.id && !x.removed);
      const s = p && g.scores[intent.id];
      if (!p || !s) return { game, error: 'no_player' };
      const pts = Math.max(0, intent.total | 0);
      s.total = s.total - s.last + pts;
      s.last = pts;
      s.turnedIn = true;
      if (allIn(g)) g.phase = 'standings';
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
      if (allIn(g)) g.phase = 'standings';
      return { game: g };
    }
    case 'removePlayer': {
      if (!removeSeat(g, intent.id)) return { game, error: 'no_such_player' };
      return { game: g };
    }
    // A player giving up their own seat mid-game. Anyone may, for themselves only.
    case 'leave': {
      if (!removeSeat(g, actorId)) return { game, error: 'not_joined' };
      return { game: g };
    }
    case 'reopenRound': {
      if (g.phase !== 'standings') return { game, error: 'bad_phase' };
      g.phase = 'round';
      return { game: g };
    }
    case 'callGame': {
      if (g.phase !== 'round' && g.phase !== 'standings') return { game, error: 'bad_phase' };
      closeRound(g);
      g.phase = 'over';
      return { game: g };
    }
    case 'runItBack': {
      if (g.phase !== 'over') return { game, error: 'bad_phase' };
      g.phase = 'lobby'; g.roundNum = 1; g.currentDouble = 12; g.history = [];
      startScores(g, true);
      return { game: g };
    }
    default:
      return { game, error: 'unknown_intent' };
  }
}
