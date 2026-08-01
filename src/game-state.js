// app/src/game-state.js — client-side view helpers over the LIVE server snapshot
// broadcast by the GameRoom Durable Object (see server/src/game-room.js). The
// screens still consume a `game` object with per-player flags + seat tokens;
// viewGame() adapts a raw snapshot into that shape, and the helpers derive
// standings from it. No fake players/scores here anymore — the DO is the truth.
import { JOIN_URL_BASE } from './config.js';

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

// ---------- join links ----------
// One definition of the deep-link format, shared by everything that touches it:
// the QR on Create/Lobby, the copy-to-clipboard action, and main.js's boot-time
// parser. A query param (not a path) means the static host needs no SPA-rewrite
// rule for join links to resolve.
export const JOIN_PARAM = 'j';

export function joinUrl(code) {
  return `${JOIN_URL_BASE}/?${JOIN_PARAM}=${encodeURIComponent(code)}`;
}

// Pull a join code out of a URL's query string. Returns '' when absent, and
// normalizes the same way the Join screen's input does (upper-case, alphanumeric
// only, 5 chars) so a hand-typed or mangled link still lands somewhere sane.
export function joinCodeFromUrl(search) {
  const raw = new URLSearchParams(search || '').get(JOIN_PARAM) || '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
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

/**
 * Did THIS player just win the round — i.e. go out?
 *
 * Takes a row from `scoredPlayers()`. `total` is null until they turn in, and
 * `last` is what they turned in this round (reset to 0 when the round opened),
 * so both are needed: a player who has not turned in also shows last === 0.
 *
 * Going out is the only way to finish on zero. Any hand still holding a tile is
 * worth at least 1, and the one tile that looks like nothing — the double blank
 * — scores 40 (see scoring.js). So a turned-in 0 is the round win, and the
 * server needs to record nothing extra for the app to know it.
 */
export function wonThisRound(p) {
  return Boolean(p && p.you && p.total !== null && p.last === 0);
}
