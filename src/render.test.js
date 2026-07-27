// app/src/render.test.js
import assert from 'node:assert';
import { formatTileLabel } from './render.js';

{
  const label = formatTileLabel({ first: 7, second: 3, confidence: 0.91 });
  assert.strictEqual(label, '7 / 3 (91% confident)');
  console.log('formatTileLabel: PASS');
}
{
  // confidence rounds to nearest whole percent
  const label = formatTileLabel({ first: 0, second: 0, confidence: 0.4948 });
  assert.strictEqual(label, '0 / 0 (49% confident)');
  console.log('formatTileLabel (rounding): PASS');
}
