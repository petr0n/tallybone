// app/src/scoring.test.js — the double-blank house rule.
// Plain `node src/scoring.test.js` (same style as src/render.test.js).
import assert from 'node:assert';
import { handTotal, tilePoints, countsAsDoubleBlank, DOUBLE_BLANK_POINTS } from './scoring.js';

const scanned = (a, b) => ({ a, b, scanned: true });
const added = (a, b) => ({ a, b });               // fresh from "add a tile"
const edited = (a, b) => ({ a, b, touched: true });

{
  assert.strictEqual(DOUBLE_BLANK_POINTS, 40);
  assert.strictEqual(tilePoints(scanned(0, 0)), 40, 'a scanned blank is 40, not 0');
  console.log('double blank the camera saw scores 40: PASS');
}

{
  // The placeholder case. Every added tile starts 0/0; charging 40 before the
  // player has set it would look like a bug.
  assert.strictEqual(tilePoints(added(0, 0)), 0, 'an untouched new tile is a placeholder');
  assert.strictEqual(countsAsDoubleBlank(added(0, 0)), false);
  console.log('a freshly added blank does not score until claimed: PASS');
}

{
  assert.strictEqual(tilePoints(edited(0, 0)), 40, 'touching the steppers claims it');
  console.log('a hand-entered blank scores once touched: PASS');
}

{
  // Ordinary tiles are untouched by any of this, however they arrived.
  for (const t of [scanned(6, 4), added(6, 4), edited(6, 4)]) {
    assert.strictEqual(tilePoints(t), 10, 'pips still just add up');
  }
  assert.strictEqual(tilePoints(scanned(0, 5)), 5, 'a single blank half is not the double blank');
  assert.strictEqual(tilePoints(scanned(12, 12)), 24);
  console.log('non-blank tiles are unaffected: PASS');
}

{
  const hand = [scanned(6, 4), scanned(0, 0), scanned(12, 3)];
  assert.strictEqual(handTotal(hand), 10 + 40 + 15, 'blank replaces its 0, rest sum normally');
  console.log('hand total folds the 40 in with the pips: PASS');
}

{
  assert.strictEqual(handTotal([]), 0, 'going out turns in nothing');
  assert.strictEqual(handTotal(null), 0, 'no tiles at all');
  assert.strictEqual(handTotal([added(0, 0)]), 0, 'a lone placeholder is still 0');
  console.log('empty and placeholder-only hands are 0: PASS');
}

{
  // Only one 0/0 exists in a double-12 set, but nothing should break if a
  // misread produced two — each is worth its own 40 rather than silently
  // collapsing to one.
  assert.strictEqual(handTotal([scanned(0, 0), scanned(0, 0)]), 80);
  console.log('two blanks score twice (misread safety): PASS');
}

{
  // Values arriving as strings from stepper text must not concatenate.
  assert.strictEqual(tilePoints({ a: '6', b: '4', scanned: true }), 10);
  assert.strictEqual(tilePoints({ a: '0', b: '0', scanned: true }), 40);
  console.log('string inputs are coerced, not concatenated: PASS');
}
