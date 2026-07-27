import assert from 'node:assert';
import { formatEta } from './scan.js';

// Estimate uses the M2-measured numbers: ~180ms detection pass +
// ~100ms/tile pip counting (rounded, conservative -- real measured range
// was 90-115ms/tile). Message should read naturally for 0 tiles (before
// detection completes, tile count unknown) vs a known count.
{
  assert.strictEqual(formatEta(0), 'Detecting tiles...');
  console.log('formatEta(0): PASS');
}
{
  assert.strictEqual(formatEta(1), 'Reading 1 tile (~0.3s)...');
  console.log('formatEta(1): PASS');
}
{
  assert.strictEqual(formatEta(15), 'Reading 15 tiles (~1.7s)...');
  console.log('formatEta(15): PASS');
}
