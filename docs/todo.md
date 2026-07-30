# Tallybone — TODO

Deferred work that is understood but deliberately not built yet. Each entry
should say what is weak today, why the current state is acceptable, and what the
concrete fix is — so a future session can pick it up without re-deriving it.

Phase-2 backlog items decided during design (presence dots, manager handoff,
offline retry queue, cross-device history, hardened auth) live in
[`superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md`](superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md)
§8 and are not duplicated here.

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
