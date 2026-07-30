// app/src/motion.test.js — the identity bookkeeping behind entrances.
// Plain `node src/motion.test.js` (same style as src/render.test.js). Only the
// pure part is covered here; the animation itself needs a browser and is
// exercised by tests/e2e/motion.spec.js.
import assert from 'node:assert';
import { isNew, resetGroup, shouldPlayHomeEntrance } from './motion.js';

{
  // The whole point: a live screen re-renders in full on every snapshot, so an
  // identity must animate once and then stay quiet however many times it is
  // re-rendered.
  assert.strictEqual(isNew('lobby', 'p_1'), true, 'first sighting animates');
  assert.strictEqual(isNew('lobby', 'p_1'), false, 're-render must not replay');
  assert.strictEqual(isNew('lobby', 'p_1'), false);
  console.log('an identity animates once, never again: PASS');
}

{
  assert.strictEqual(isNew('lobby', 'p_2'), true, 'a genuinely new player animates');
  assert.strictEqual(isNew('lobby', 'p_1'), false, 'and does not wake the others');
  console.log('a newcomer animates without disturbing existing rows: PASS');
}

{
  // Groups are independent so unrelated screens cannot suppress each other.
  assert.strictEqual(isNew('standings', 'p_1'), true, 'same id, different group');
  console.log('groups are isolated: PASS');
}

{
  resetGroup('lobby');
  assert.strictEqual(isNew('lobby', 'p_1'), true, 'a reset context animates afresh');
  assert.strictEqual(isNew('standings', 'p_1'), false, 'reset is scoped to its group');
  console.log('resetGroup re-arms one group only: PASS');
}

// --- the Home entrance gate -------------------------------------------------
// Home is NOT only the launch screen: main.js re-mounts it on leaving a game
// and on every back out of Rules, Create, Join or a scan. A ~950ms entrance
// belongs to the first Home of a session and to no other.

{
  resetGroup('home');
  assert.strictEqual(shouldPlayHomeEntrance(), true, 'the first Home of a session animates');
  assert.strictEqual(shouldPlayHomeEntrance(), false, 'backing out to Home must not replay it');
  assert.strictEqual(shouldPlayHomeEntrance(), false);
  console.log('the Home entrance plays once per session: PASS');
}

{
  // reducedMotion() reads matchMedia, so stub the real global rather than open a
  // seam in the code — this exercises the same path a phone would take.
  resetGroup('home');
  const realMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    assert.strictEqual(shouldPlayHomeEntrance(), false, 'reduced motion: no entrance, first Home included');
  } finally {
    if (realMatchMedia) globalThis.matchMedia = realMatchMedia; else delete globalThis.matchMedia;
  }
  // The refusal must come BEFORE the identity is spent, or turning the setting
  // off mid-session would leave Home silently un-animated forever.
  assert.strictEqual(shouldPlayHomeEntrance(), true, 'a refused entrance does not burn the identity');
  console.log('reduced motion refuses the entrance without spending it: PASS');
}
