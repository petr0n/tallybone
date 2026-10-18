// server/repair.js — ONE-TIME repair for table 98QQH (2026-10-17). Remove once
// it has run in production (see game-room.js).
//
// Before the round tag on pickDouble, a manager's taps queued while offline all
// replayed on reconnect, each starting a round. That left rounds nobody scored
// in. Dropping them and renumbering what follows restores the real rounds. Totals
// are untouched: a round where every turn-in is null added nothing to anyone.
export function dropEmptyRounds(game) {
  const history = game.history || [];
  const empty = (h) => Object.values(h.scores).every((v) => v == null);
  const dropped = history.filter(empty).length;
  if (!dropped) return game;
  return {
    ...game,
    roundNum: game.roundNum - dropped,
    history: history.filter((h) => !empty(h)).map((h, i) => ({ ...h, round: i + 1 })),
  };
}
