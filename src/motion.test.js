// app/src/motion.test.js — the identity bookkeeping behind entrances.
// Plain `node src/motion.test.js` (same style as src/render.test.js). Only the
// pure part is covered here; the animation itself needs a browser and is
// exercised by tests/e2e/motion.spec.js.
import assert from 'node:assert';
import { isNew, resetGroup } from './motion.js';

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
