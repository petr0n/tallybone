// app/src/game-state.js — client-side view helpers over the LIVE server snapshot
// broadcast by the GameRoom Durable Object (see server/src/game-room.js). The
// screens still consume a `game` object with per-player flags + seat tokens;
// viewGame() adapts a raw snapshot into that shape, and the helpers derive
// standings from it. No fake players/scores here anymore — the DO is the truth.

// Code alphabet excludes the read-aloud lookalikes O/0/I/1 (the #1 join failure).
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SEAT_TOKENS = ['#5BB5D9', '#E5DCC2', '#F23535', '#D9D8D0', '#9FD6EC', '#E0A02C'];
export const MAX_SEATS = 6;

export function mintCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function initials(name) {
  return (name || '').slice(0, 2).toUpperCase();
}

// Round 1 opens on double-twelve. After that the manager CHOOSES the next
// round's double (whatever double is in a player's hand). This is the suggested
// default in the picker: one below the current (and back up to 1 after blank).
export function suggestedNextDouble(game) {
  return game.currentDouble > 0 ? game.currentDouble - 1 : 1;
}

// Adapt a raw DO snapshot { code, phase, roundNum, currentDouble, managerId,
// players:[{id,name,connected,removed}], scores:{[id]:{total,last,turnedIn}} }
// into the screen-facing shape (per-player manager/you flags; id-keyed scores).
export function viewGame(snap, myId) {
  if (!snap) return null;
  return {
    code: snap.code,
    phase: snap.phase,
    roundNum: snap.roundNum,
    currentDouble: snap.currentDouble,
    managerId: snap.managerId,
    players: (snap.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      manager: p.id === snap.managerId,
      you: p.id === myId,
      connected: !!p.connected,
      removed: !!p.removed,
    })),
    scores: snap.scores || {},
  };
}

export function seated(game) {
  return game.players.filter((p) => !p.removed);
}

// Attach seat token + display scores to each seated player. `total` is null when
// the player has not turned in THIS round (drives the "still counting" UI);
// `final` is the true running total used at game over.
export function scoredPlayers(game) {
  return seated(game).map((p, i) => {
    const sc = game.scores[p.id] || {};
    const running = sc.total ?? 0;
    return {
      ...p,
      token: SEAT_TOKENS[i % SEAT_TOKENS.length],
      total: sc.turnedIn ? running : null,
      last: sc.last ?? 0,
      final: running,
    };
  });
}

// Standings ascending by total; players who haven't turned in sort last.
export function ranked(game) {
  return [...scoredPlayers(game)].sort(
    (a, b) => (a.total === null) - (b.total === null) || (a.total - b.total));
}

export function finalRanked(game) {
  return [...scoredPlayers(game)].sort((a, b) => a.final - b.final);
}
