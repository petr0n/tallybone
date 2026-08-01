import { describe, it, expect } from 'vitest';
import { emptyGame, applyIntent } from './reducer.js';

const join = (g, id, name) => applyIntent(g, { t: 'join', id, name }, id).game;
const open = (g, id, name) => applyIntent(g, { t: 'join', id, name, creator: true }, id).game;

describe('reducer', () => {
  // The Create screen shows the join code and a scannable QR BEFORE the creator
  // has taken their own seat — they still have to type a name and tap "Open the
  // table". A guest scanning that QR therefore lands first, and first-join-wins
  // handed them the game. Reported from a real table.
  it('the creator gets the game even when a guest joins first', () => {
    let g = emptyGame('KX7Q2');
    g = join(g, 'guest', 'Dee');          // scanned the QR while Rosa was typing
    expect(g.managerId).toBe('guest');
    g = open(g, 'rosa', 'Rosa');          // Rosa taps "Open the table"
    expect(g.managerId).toBe('rosa');
    expect(g.players.map((p) => p.name)).toEqual(['Dee', 'Rosa']);
    expect(g.scores.guest).toEqual({ total: 0, last: 0, turnedIn: false });
  });

  it('a creator claim cannot take the game once it has started', () => {
    let g = emptyGame('KX7Q2');
    g = join(g, 'a', 'Rosa');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = open(g, 'late', 'Someone');       // forged or stale claim, mid-game
    expect(g.managerId).toBe('a');
  });

  it('a plain join never takes the game from the creator', () => {
    let g = emptyGame('KX7Q2');
    g = open(g, 'rosa', 'Rosa');
    g = join(g, 'b', 'Dee');
    expect(g.managerId).toBe('rosa');
  });
  it('first joiner becomes manager, second is a player', () => {
    let g = emptyGame('KX7Q2');
    g = join(g, 'a', 'Rosa');
    expect(g.managerId).toBe('a');
    expect(g.players).toHaveLength(1);
    g = join(g, 'b', 'Dee');
    expect(g.managerId).toBe('a');
    expect(g.players.map((p) => p.name)).toEqual(['Rosa', 'Dee']);
    expect(g.scores.b).toEqual({ total: 0, last: 0, turnedIn: false });
  });

  it('rejects a blank name', () => {
    const g = emptyGame('C');
    expect(applyIntent(g, { t: 'join', id: 'a', name: '  ' }, 'a').error).toBe('name_required');
  });

  it('rejects a duplicate active name (case-insensitive)', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa');
    expect(applyIntent(g, { t: 'join', id: 'b', name: 'rosa' }, 'b').error).toBe('name_taken');
    // a removed player's name frees up again
    g = applyIntent(g, { t: 'removePlayer', id: 'a' }, 'a').game;
    expect(applyIntent(g, { t: 'join', id: 'b', name: 'Rosa' }, 'b').error).toBeUndefined();
  });

  it('startRound is manager-only and opens on double-12', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa'); g = join(g, 'b', 'Dee');
    expect(applyIntent(g, { t: 'startRound' }, 'b').error).toBe('not_manager');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    expect(g.phase).toBe('round');
    expect(g.currentDouble).toBe(12);
    expect(g.scores.a.turnedIn).toBe(false);
  });

  it('turnIn records last + running total and rejects in lobby', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa'); g = join(g, 'b', 'Dee');
    expect(applyIntent(g, { t: 'turnIn', total: 10 }, 'a').error).toBe('bad_phase');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 10 }, 'a').game;
    expect(g.scores.a).toMatchObject({ last: 10, total: 10, turnedIn: true });
    expect(g.phase).toBe('round'); // b hasn't turned in yet
    g = applyIntent(g, { t: 'turnIn', total: 22 }, 'b').game;
    expect(g.phase).toBe('standings'); // all active players in
  });

  it('re-turnIn corrects rather than double-counting (round still open)', () => {
    // Two players so the round does not auto-advance after a's first turn-in.
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa'); g = join(g, 'b', 'Dee');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 10 }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 4 }, 'a').game;
    expect(g.phase).toBe('round');
    expect(g.scores.a).toMatchObject({ last: 4, total: 4 });
  });

  it('turnIn by a non-player is rejected', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    expect(applyIntent(g, { t: 'turnIn', total: 5 }, 'ghost').error).toBe('not_joined');
  });

  it('pickDouble increments round, keeps totals, resets turnedIn', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 10 }, 'a').game; // solo -> standings
    expect(g.phase).toBe('standings');
    g = applyIntent(g, { t: 'pickDouble', d: 9 }, 'a').game;
    expect(g).toMatchObject({ phase: 'round', roundNum: 2, currentDouble: 9 });
    expect(g.scores.a).toMatchObject({ total: 10, last: 0, turnedIn: false });
  });

  it('pickDouble clamps to 0..12', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 0 }, 'a').game;
    g = applyIntent(g, { t: 'pickDouble', d: 99 }, 'a').game;
    expect(g.currentDouble).toBe(12);
  });

  it('removePlayer marks removed (manager-only)', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa'); g = join(g, 'b', 'Dee');
    expect(applyIntent(g, { t: 'removePlayer', id: 'b' }, 'b').error).toBe('not_manager');
    g = applyIntent(g, { t: 'removePlayer', id: 'b' }, 'a').game;
    expect(g.players.find((p) => p.id === 'b').removed).toBe(true);
  });

  it('reopenRound returns standings -> round (manager-only)', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 3 }, 'a').game; // -> standings
    expect(applyIntent(g, { t: 'reopenRound' }, 'zzz').error).toBe('not_manager');
    g = applyIntent(g, { t: 'reopenRound' }, 'a').game;
    expect(g.phase).toBe('round');
  });

  it('callGame -> over, runItBack resets and keeps roster', () => {
    let g = emptyGame('C'); g = join(g, 'a', 'Rosa'); g = join(g, 'b', 'Dee');
    g = applyIntent(g, { t: 'startRound' }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 5 }, 'a').game;
    g = applyIntent(g, { t: 'turnIn', total: 8 }, 'b').game; // -> standings
    g = applyIntent(g, { t: 'callGame' }, 'a').game;
    expect(g.phase).toBe('over');
    g = applyIntent(g, { t: 'runItBack' }, 'a').game;
    expect(g).toMatchObject({ phase: 'lobby', roundNum: 1, currentDouble: 12 });
    expect(g.players).toHaveLength(2);
    expect(g.scores.a).toEqual({ total: 0, last: 0, turnedIn: false });
  });

  it('does not mutate the input game', () => {
    const g0 = emptyGame('C');
    const g1 = join(g0, 'a', 'Rosa');
    expect(g0.players).toHaveLength(0);
    expect(g1.players).toHaveLength(1);
  });
});
