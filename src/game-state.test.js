// app/src/game-state.test.js — the join-link contract.
// Plain `node src/game-state.test.js` (same style as src/render.test.js).
//
// This format is load-bearing in three places at once — the QR on Create/Lobby,
// the copy-to-clipboard pill, and main.js's boot-time parser. If they ever
// disagree, scanned links silently stop working, so pin the round trip here.
import assert from 'node:assert';
import { joinUrl, joinCodeFromUrl, JOIN_PARAM, mintCode, CODE_ALPHABET , wonThisRound } from './game-state.js';

{
  // Under node there is no `location`, so config.js falls back to the prod base.
  assert.strictEqual(joinUrl('KX7Q2'), 'https://tallybone.com/?j=KX7Q2');
  console.log('joinUrl: builds the documented format: PASS');
}

{
  // Round trip: whatever joinUrl builds, joinCodeFromUrl must recover.
  for (let i = 0; i < 50; i++) {
    const code = mintCode();
    const search = new URL(joinUrl(code)).search;
    assert.strictEqual(joinCodeFromUrl(search), code, `round trip failed for ${code}`);
  }
  console.log('join link: round-trips every minted code: PASS');
}

{
  assert.strictEqual(joinCodeFromUrl(''), '', 'no query string');
  assert.strictEqual(joinCodeFromUrl('?foo=bar'), '', 'unrelated param');
  assert.strictEqual(joinCodeFromUrl('?j='), '', 'empty code');
  console.log('joinCodeFromUrl: absent/empty yields no code: PASS');
}

{
  // Normalized the same way the Join input normalizes, so a mangled or
  // hand-typed link still lands somewhere sane instead of erroring.
  assert.strictEqual(joinCodeFromUrl('?j=kx7q2'), 'KX7Q2', 'lower-case');
  assert.strictEqual(joinCodeFromUrl('?j=kx-7q2'), 'KX7Q2', 'punctuation stripped');
  assert.strictEqual(joinCodeFromUrl('?j=KX7Q2EXTRA'), 'KX7Q2', 'clamped to 5');
  assert.strictEqual(joinCodeFromUrl('?a=1&j=KX7Q2&b=2'), 'KX7Q2', 'among other params');
  console.log('joinCodeFromUrl: normalizes like the Join input: PASS');
}

{
  assert.strictEqual(JOIN_PARAM, 'j', 'param name is part of the shared link contract');
  // A query param (not a path) is what lets a static host serve join links with
  // no SPA-rewrite rule — guard the choice, not just the letter.
  assert.ok(joinUrl('KX7Q2').includes('/?'), 'code travels as a query param');
  console.log('join link: stays a query param: PASS');
}

{
  // Codes avoid read-aloud lookalikes; the parser must not reintroduce them.
  assert.ok(!/[O0I1]/.test(CODE_ALPHABET), 'alphabet excludes O/0/I/1');
  console.log('code alphabet: still lookalike-free: PASS');
}

// --- who just won the round -------------------------------------------------
// Going out is the only way to finish a round on zero: a hand with any tile is
// worth at least 1, and the one tile that looks like nothing — the double blank
// — scores 40, not 0. So a turned-in 0 IS the round win, with no extra state
// from the server.
{
  const won = { you: true, total: 14, last: 0 };
  assert.strictEqual(wonThisRound(won), true, 'turned in 0 = went out');

  assert.strictEqual(wonThisRound({ you: true, total: 14, last: 6 }), false, 'turned in points');
  assert.strictEqual(wonThisRound({ you: true, total: null, last: 0 }),
    false, 'has NOT turned in yet — last is 0 because the round reset it');
  assert.strictEqual(wonThisRound({ you: false, total: 14, last: 0 }),
    false, 'somebody else winning is not my celebration');
  assert.strictEqual(wonThisRound({ you: true, total: 40, last: 40 }),
    false, 'caught with the double blank is the opposite of winning');
  console.log('wonThisRound: only the player who turned in 0: PASS');
}
