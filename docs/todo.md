# Tallybone — TODO

Deferred work that is understood but deliberately not built yet. Each entry
should say what is weak today, why the current state is acceptable, and what the
concrete fix is — so a future session can pick it up without re-deriving it.

Phase-2 backlog items decided during design (presence dots, manager handoff,
offline retry queue, cross-device history, hardened auth) live in
[`superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md`](superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md)
§8 and are not duplicated here.

---

## Make it work in Brave

**Status:** requested 2026-07-31, not built. **The actual symptom was not
recorded** — whoever picks this up should get it first ("scanner never loads" vs
"reads garbage" vs "loses my seat" point at three different causes below).

### Why Brave specifically is a risk

Brave Shields is on by default and changes three things this app depends on.
None of these are hypothetical browser trivia — each maps to a line in this repo.

1. **A third-party CDN in the critical path.** `index.html:11` loads the ONNX
   runtime from `cdn.jsdelivr.net`. Shields blocks third-party scripts on some
   settings, and if that script does not load, `initScanner()` fails and the
   scanner is dead on arrival while the rest of the app looks fine. This is the
   most likely cause of a hard "doesn't work" and the easiest to confirm: the
   console shows the blocked request.
2. **Canvas farbling.** Brave's fingerprinting defence perturbs canvas pixel
   reads. This app reads pixels constantly — `camera.js` (three `getImageData`
   calls), `upload.js`, `scanner/preprocess.js`, and `toDataURL` in `review.js`
   for the per-tile crops. Farbled pixels would not throw; they would quietly
   degrade detection and pip counts. A scanner that reads *worse* only in Brave,
   with no error anywhere, is exactly this.
3. **Storage clearing.** Seats are reclaimed from `localStorage` (`tb.id.<CODE>`,
   `tb.name`, `tb.active`). Brave can clear site data aggressively on exit or in
   private windows, which pushes every rejoin onto the name-matching fallback —
   see the identity entry below for why that path is the weak one.

### How to pin it down

Run the same hand in Brave with Shields **up** and Shields **down** on
tallybone.com:

- Scanner never loads with Shields up, works with them down → the CDN script (1).
- Loads either way but reads noticeably worse with Shields up → farbling (2).
- Works, but a refresh loses the seat → storage (3).

`?diag=1` distinguishes a camera problem from the rest; `?tail=1` streams the
readings so a Brave hand can be compared against the same hand in Chrome.

### The fixes, once the cause is known

- **(1) Vendor the ONNX runtime** instead of the CDN `<script>`. Note the
  camera/viewfinder entry below argues vendoring is *not* required for the
  offline promise — that reasoning stands. But a third-party script that a
  popular browser may block is a different argument for the same change, and
  this one is about the app working at all. It also removes the unpinned,
  no-SRI dependency in the critical path.
- **(2)** Nothing in-app can undo farbling; it would mean telling Brave users to
  allow fingerprinting for the site. Measure the real cost first — `?tail=1` on
  the same physical hand in both browsers — before claiming there is one.
- **(3)** Already covered by the durable-device-id entry below.

### Watch out

- Brave is Chromium, so a desktop Chrome check proves nothing about Shields.
- Test on the **phone** build of Brave, not desktop: the camera path and the
  storage lifetime both differ there, and phones are the only real target.

---

## Let a player see their score history in a game

**Status:** requested 2026-07-31, not built. **Do this together with the doubles
entry below** — they are the same missing structure and one change serves both.

### What the game knows today

`scores` in `server/reducer.js` is one flat record per player:

```
scores: { [playerId]: { total, last, turnedIn } }
```

`total` is the running sum and `last` is *this* round's turn-in. `startScores()`
overwrites `last` at the top of every round, so the moment round 3 opens, what
each player scored in rounds 1 and 2 is gone — only the sum remains. Nobody can
answer "what did I get in round 2?", or see the round where a game was lost.

### Why this matters

- Running totals alone hide the shape of a game. A player who was quietly at 12
  a round until one bad hand of 60 has no way to see that.
- It is the natural thing to want on Standings and on the Over screen, and it is
  cheap: six players over a dozen rounds is a few hundred numbers.
- **A missed turn-in is invisible.** A round where someone never turned in
  contributes 0 to their total and reads exactly like a round they went out on.

### The concrete fix

1. Add `history: []` to `emptyGame()` — one entry per completed round:
   `{ round, double, scores: { [playerId]: number|null } }`. `null` distinguishes
   "did not turn in" from a genuine `0` (went out); do not collapse them.
   This one structure also answers the doubles question below, so build it once.
2. Append the entry where a round CLOSES, before `startScores()` wipes `last` —
   that is `pickDouble` (starting the next round) and `callGame` (ending the
   game from a live round). Both already mutate `g`.
3. Players who joined late simply have no key for earlier rounds — render a dash,
   not a zero.
4. Read as `history || []` so games persisted before this ships still load; no DO
   storage migration.
5. `runItBack` must clear it, or a rematch shows the previous game's rounds.
6. Display: a per-round column on Standings, or an expandable row per player.
   The Over screen is the other obvious home.

### Watch out

- `reopenRound` sends the game from `standings` back to `round`. If the history
  entry was already appended when the round closed, reopening must drop the last
  entry or the round gets recorded twice when it closes again.
- Removed players (`removed: true`) still have history worth keeping — do not
  purge their entries when they are removed from the roster.
- Tests: `server/reducer.test.js` around the existing `pickDouble increments
  round, keeps totals` and `callGame -> over, runItBack resets` cases, which are
  exactly the transitions this hooks into.

---

## Remember which double started each round

**Status:** requested 2026-07-31, not built.

### What the game knows today

`server/reducer.js` keeps a single `currentDouble` and overwrites it every round:
`startRound` sets 12, `pickDouble` replaces it with the manager's choice and
increments `roundNum`. Nothing anywhere records what round 1, 2 or 3 opened on —
once round 4 starts, rounds 1–3's doubles are gone from the snapshot, from the
DO's persisted state, and from every phone.

`suggestedNextDouble()` (`src/game-state.js:45`) is pure arithmetic on the
current value — `currentDouble - 1`, floor 1 — so it does not know what has
already been played either. If the manager picks off-sequence, or picks the same
double twice, nothing notices.

### Why this matters

- **The table cannot check itself.** "Didn't we already play tens?" has no answer
  in the app; the standings show totals per round but not what each round opened
  on.
- **The picker can offer a double that's already been used**, which is the
  mistake most likely to happen late in a game when people are tired.
- It is the one piece of round context the app drops on the floor — round number,
  totals, and turn-ins all persist.

### The concrete fix

**Prefer the shared `history` array from the score-history entry above** — one
record per round carrying both the double and that round's scores — rather than a
second parallel array. The steps below stand if it is ever built alone.

1. Add `doubles: []` to `emptyGame()` in `server/reducer.js` — an array indexed
   by round, or `[{ round, double }]` if the display wants it explicit.
2. Append in the two places a round begins: `startRound` (always 12) and
   `pickDouble`. Both already mutate `g`, so this is two lines and stays pure.
3. Old games persisted before this ships have no field: read it as `doubles || []`
   wherever it is consumed, rather than migrating DO storage.
4. Surface it on Standings (a per-round column or a "rounds so far" strip) and in
   `renderPickDouble` (`src/screens/game-play.js:280`), which should mark or
   disable doubles already used.
5. `suggestedNextDouble()` should skip used values instead of blind `-1`.

### Watch out

- `runItBack` resets the game for a rematch — it must clear `doubles` too, or
  round 1 of the new game inherits the old game's history.
- The reducer is the single writer; the DO persists the whole game object, so no
  storage-schema work is needed beyond the default-empty read.
- Tests: `server/reducer.test.js` for accumulation across `startRound` →
  `pickDouble` → `pickDouble` and for the `runItBack` reset; the existing
  `pickDouble clamps to 0..12` case is the natural neighbour.

---

## Make player identity solid: a durable device id instead of name matching

**Status:** deferred 2026-07-29. Name matching is good enough for now (owner's
call). This entry exists so the weakness is a known trade-off, not a surprise.

### What the app stores today

Verified by dumping browser storage after a real join — no cookies anywhere in
`src/` or `server/`, everything is localStorage:

```
tb.name        Rosa                                  <- device-wide, the ONLY cross-game value
tb.id.<CODE>   {playerId, token, name}               <- per GAME CODE, not per device
tb.active      <CODE>                                <- which game to reconnect to
```

Two layers reclaim a seat, in order:

1. **Token** (`tb.id.<code>`) — exact and silent, via the `hello` intent. Handles
   refresh, backgrounding, app-switching. This is the normal path and it is fine.
2. **Name** (`tb.name`) — the fallback when the token is gone: storage eviction
   (iOS caps localStorage lifetime), a reinstall, private mode, or a different
   phone. `server/game-room.js`'s `join` handler reclaims a **disconnected** seat
   whose name matches, case-insensitively.

### Why this is weak

There is no durable device identity — a new `playerId` + `token` is minted per
game, so cross-game "who are you" rests entirely on a display name.

- Two players who share a first name at one table cannot be distinguished by the
  fallback. The second gets `name_taken` while the first is connected, and could
  walk into the other's seat once it goes quiet.
- The fallback cannot simply be tightened. When storage is wiped, name matching
  is the *only* route back in; removing it reintroduces the lockout bug fixed in
  `2b35b90` (a player locked out of their own game by their own name).
- Acceptable because the Phase-2 spec locks a **casual/friends trust tier** (§2):
  the 5-char code is the only gate and we do not defend against a malicious
  player inside your own game.

### The fix, when it matters

1. Mint one `tb.device` UUID on first run; persist it device-wide alongside
   `tb.name` in `src/net.js`.
2. Send it on both `hello` and `join`.
3. In `server/game-room.js`, bind seats to the device id and resolve in this
   order: **token → device id → name (disconnected only)**. Keep the name step as
   a genuine last resort so a wiped device still gets back in.
4. Persist a `devices` map beside the existing `tokens` map in DO storage.

This makes reseating exact, lets same-named players coexist, and shrinks the
name path to the rare case it was meant for. Reducer stays pure — the DO resolves
identity and passes an id in, as it does today.

### Watch out

- `tokens` is already a many-tokens-to-one-`playerId` map; `devices` should be
  one device to one seat *per game*, so a shared device (two people passing one
  phone) must still be able to hold two seats. Do not key seats on device id
  alone.
- Tests to extend: `tests/rejoin.mjs` (protocol-level reclaim, incl. the
  still-connected name being refused), `tests/e2e/remembers-me.spec.js` (stale
  token reseats with nothing typed), `tests/e2e/leave-and-return.spec.js`
  (backing out keeps the seat). A same-name-collision case is the obvious gap to
  add.

---

## Loose ends from the 2026-07-29 session

- **Stray production game.** The hibernation measurement created a real game
  under code `HIBTEST` on tallybone.com, holding a persisted lobby with one
  player `HoldProbe`. Harmless (a few SQLite rows) and there is no per-object
  delete on the free plan, so it was left in place.
- **`test:stress` is not in `test:all`.** Deliberate — it needs a dev server
  already running, whereas the Playwright tiers self-host. Revisit if the
  checklist should be a single command.
- **No explicit "leave the table" before the game ends.** Since `a8fe485` the
  back chevron is navigation and keeps the seat; the only deliberate exit is the
  Over screen's Home button. A player who wants out mid-game has no affordance,
  and reloading pulls them back in (correct — they are still seated server-side —
  but there is no way to say "I'm done").
- **Real GB-s measurement needs a scoped token.** The Wrangler OAuth token
  cannot read the GraphQL Analytics API (`10000 Authentication error`); it needs
  **Account Analytics: Read**. See `server/README.md` for the query.

---

## Considered and rejected: a "are you sure you want to leave?" dialog

**Decided 2026-07-29.** Asked for, investigated, not built — on purpose.

A `beforeunload` confirmation cannot do the job on this app's primary platform:

- **iOS Safari never fires `beforeunload`.** MDN's own example of when it does not
  fire is precisely our scenario — visit the page, switch apps, later close the
  browser from the app manager. A phone-first app at a domino table is exactly
  that case.
- The message **cannot be customized** (generic browser wording only), it needs
  sticky activation, and in Firefox a `beforeunload` listener **disables bfcache**.
- It would fire on reloads the player intended, which is friction for no gain.

More to the point, the loss it would guard against no longer happens: leaving and
returning reseats the player (token first, remembered name as fallback), and no
in-app action drops a seat mid-game. So the effort went into *proving recovery*
instead — see `tests/e2e/never-lose-your-place.spec.js`, which covers the phone
locking / app switching (socket killed while offline), the tab being closed and
reopened, and a completely different device with empty storage.

If a mid-game **Leave the table** affordance is ever added (see the loose end
above), *that* is where a confirm belongs — our own in-app dialog, which works on
iOS too, rather than the browser's.

---

## Stale `index.html` at the edge after a deploy

**Found 2026-07-30.** Not urgent, but it bites every deploy and it wasted time
during the iPad camera investigation.

After `wrangler deploy`, `https://tallybone.com/` serves the PREVIOUS
`index.html` from some Cloudflare edge nodes for a while — inconsistently, so
repeated requests flip between the old and new bundle hash. Observed
`cf-cache-status: HIT` even though the response carries
`cache-control: public, max-age=0, must-revalidate`, i.e. the edge is serving it
without revalidating.

Consequences:

- A phone that loads during that window runs the OLD app. It does not break —
  Workers Assets keeps prior asset paths addressable, so the stale HTML's
  `/assets/index-<old>.js` still returns 200 — it just silently runs old code.
- Anything gated behind a new flag (e.g. `?diag=1`) appears to "not work".
- Server-side fixes are unaffected: the Worker and DO update immediately for
  everyone regardless of which bundle a phone holds.

Likely fix: ship a `_headers` file (or set headers in the Worker for the SPA
document) so the HTML is `Cache-Control: no-store` — or at minimum ensure the
edge revalidates it — while the hashed `/assets/*` keep their long cache. Verify
with repeated plain `curl https://tallybone.com/` immediately after a deploy;
the bundle hash should be stable on the first try.

Gotcha for whoever checks this: `curl` on `/assets/*.js` returns **gzip**, so
grepping the body without `--compressed` finds nothing and looks like a failed
deploy. It is not.

---

## Camera / viewfinder — closed 2026-07-30

**Resolved.** "The camera is too zoomed on my iPad" was never the camera. The
viewfinder was `object-fit: cover`, hiding ~74% of the frame on a phone and ~61%
on an iPad while `captureFullFrame()` scanned all of it — so tiles that were
already being captured were invisible, and the natural reaction is to back away
from the table. Confirmed on device: `?fit=contain` "looked right" at normal
height, and that toggle is pure CSS, which proves the lens and the getUserMedia
constraints were never at fault. Both the viewfinder and the Review photo now
show the whole frame. Owner: "the camera is fine, leave it."

**Deliberately not pursued:**

- **`?cam=43` / `?cam=native`.** Whether requesting 16:9 from a natively-4:3 iOS
  sensor also discards field of view is still unmeasured. It stopped mattering
  once the preview was honest. The toggles remain in `camera-diag.js` if anyone
  wants the comparison; `?fit=cover` restores the old full-bleed crop.
- **Vendoring onnxruntime-web** (currently a CDN `<script>` in index.html).
  I argued for this on the grounds that it broke the spec's "solo scanning stays
  fully offline". **That was wrong** — read the next sentence of §2: it means
  "never opens a socket. Only game sessions go online", i.e. privacy and
  architecture, not network independence. §11 lists PWA / service-worker offline
  caching as explicitly OUT of scope. The app is served from tallybone.com, so a
  network is required to load it at all. What genuinely remains is minor hygiene:
  an unpinned third-party runtime with no SRI hash in the critical path. Not
  worth doing on its own.

**Still open, and real:** a WASM `RangeError: out of memory` on the iPad
("no available backend found"), cleared by a reload, so memory pressure rather
than a code fault. The lever is capture size — a 4K frame is a 32 MB ImageData
per scan and the tile detector letterboxes to 640x640 regardless. But the PIP
stage reads crops at native resolution, so shrinking capture could cost pip
accuracy, and `pnpm test:accuracy` runs on corpus photos and would NOT catch
that. Needs a real measurement of pip accuracy at each capture size before any
change.
