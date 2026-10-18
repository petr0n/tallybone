import { describe, it, expect } from 'vitest';
import { dropEmptyRounds } from './repair.js';

// Table 98QQH as read from production at the time of the repair.
const live = {
  code: '98QQH', phase: 'standings', roundNum: 9, currentDouble: 7, managerId: 'sp',
  players: [], scores: {
    sp: { total: 340, last: 56, turnedIn: true }, sd: { total: 109, last: 53, turnedIn: true },
    go: { total: 193, last: 0, turnedIn: true }, mc: { total: 166, last: 27, turnedIn: true },
  },
  history: [
    { round: 1, double: 12, scores: { sp: 101, sd: 30, go: 0, mc: 93 } },
    { round: 2, double: 12, scores: { sp: 61, sd: 15, go: 26, mc: 9 } },
    { round: 3, double: 10, scores: { sp: null, sd: null, go: 82, mc: null } },
    { round: 4, double: 10, scores: { sp: null, sd: null, go: null, mc: null } },
    { round: 5, double: 10, scores: { sp: null, sd: null, go: null, mc: null } },
    { round: 6, double: 10, scores: { sp: null, sd: null, go: null, mc: null } },
    { round: 7, double: 9, scores: { sp: 84, sd: 0, go: 56, mc: 37 } },
    { round: 8, double: 7, scores: { sp: 38, sd: 11, go: 29, mc: 0 } },
  ],
};

describe('dropEmptyRounds (98QQH repair)', () => {
  it('drops the phantom rounds, renumbers, keeps every total', () => {
    const g = dropEmptyRounds(live);
    expect(g.roundNum).toBe(6);
    expect(g.history.map((h) => [h.round, h.double])).toEqual([[1, 12], [2, 12], [3, 10], [4, 9], [5, 7]]);
    expect(g.history[3].scores).toEqual({ sp: 84, sd: 0, go: 56, mc: 37 });
    expect(g.scores).toEqual(live.scores);
    for (const id of ['sp', 'sd', 'go', 'mc']) {           // totals = sum of rounds + this one
      const sum = g.history.reduce((t, h) => t + (h.scores[id] ?? 0), 0) + g.scores[id].last;
      expect(sum).toBe(g.scores[id].total);
    }
  });
  it('is a no-op on a game with no empty rounds', () => {
    const once = dropEmptyRounds(live);
    expect(dropEmptyRounds(once)).toBe(once);
  });
});
