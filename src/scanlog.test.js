// app/src/scanlog.test.js — the field-telemetry payload. Plain `node
// src/scanlog.test.js`. Only the pure builder is covered; the POST itself needs
// a browser and is exercised by hand with ?tail=1 against `wrangler tail`.
import assert from 'node:assert';
import { scanEvent } from './scanlog.js';

{
  // A scan reports the geometry that decides everything (what the camera gave,
  // what the box cropped) plus the reading — enough to diagnose a misread from
  // the tail alone, without the image.
  const e = scanEvent('scan', {
    videoW: 2160, videoH: 3840, boxW: 384, boxH: 742,
    cropW: 1814, cropH: 1814, ms: 2310,
    tiles: [{ a: 3, b: 11, conf: 'ok' }, { a: 0, b: 0, conf: 'check' }],
  });
  assert.strictEqual(e.kind, 'scan');
  assert.strictEqual(e.cam, '2160x3840');
  assert.strictEqual(e.crop, '1814x1814');
  assert.strictEqual(e.n, 2);
  assert.strictEqual(e.ms, 2310);
  assert.deepStrictEqual(e.tiles, ['3/11', '0/0?']);   // '?' marks a low-confidence read
  console.log('scanEvent (a scan carries geometry + reading): PASS');
}

{
  // The submit event is the one that makes this a TEST rather than a log: the
  // player has corrected the reading by then, so scan-vs-submit is ground truth.
  const e = scanEvent('submit', {
    total: 47,
    tiles: [{ a: 3, b: 11, conf: 'ok' }, { a: 6, b: 6, conf: 'ok' }],
  });
  assert.strictEqual(e.kind, 'submit');
  assert.strictEqual(e.total, 47);
  assert.deepStrictEqual(e.tiles, ['3/11', '6/6']);
  assert.ok(!('cam' in e), 'no camera geometry on a submit — it is not a capture');
  console.log('scanEvent (a submit carries the corrected hand): PASS');
}

{
  // Missing geometry must not produce "undefinedxundefined" noise in the tail.
  const e = scanEvent('scan', { tiles: [] });
  assert.ok(!('cam' in e) && !('crop' in e), 'absent geometry is omitted, not stringified');
  assert.strictEqual(e.n, 0);
  console.log('scanEvent (absent geometry is omitted): PASS');
}
