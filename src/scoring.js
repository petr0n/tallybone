// app/src/scoring.js — what a hand is worth at the end of a round.
//
// Pure: no DOM, no network. The reducer records whatever total a player turns
// in; deciding what their leftover tiles are WORTH happens here, next to the
// scan that produced them.

// House rule: the double blank is the one tile whose pip count lies. Get caught
// holding the 0/0 when a round ends and it is 40 against you, not nothing.
export const DOUBLE_BLANK_POINTS = 40;

export const isDoubleBlank = (t) => Number(t.a) === 0 && Number(t.b) === 0;

// A blank only scores once it is a real claim, not a placeholder. Every tile
// added by hand starts life at 0/0 — the manual-entry seed and the "add a tile"
// button both do — so counting any 0/0 would slap 40 on a tile the player has
// not filled in yet. `scanned` means the camera actually read a blank; `touched`
// means the player moved its steppers. Either is a claim; neither is not.
export const countsAsDoubleBlank = (t) =>
  isDoubleBlank(t) && Boolean(t.scanned || t.touched);

export const tilePoints = (t) =>
  (countsAsDoubleBlank(t) ? DOUBLE_BLANK_POINTS : Number(t.a) + Number(t.b));

export const handTotal = (tiles) =>
  (tiles || []).reduce((n, t) => n + tilePoints(t), 0);
