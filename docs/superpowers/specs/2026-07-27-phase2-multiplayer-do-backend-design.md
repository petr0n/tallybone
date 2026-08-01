# Phase 2 Multiplayer Backend (Durable Objects) — Design Spec

**Date:** 2026-07-27
**Status:** Approved design → ready for implementation plan
**Scope tier chosen:** Core loop across phones **+ real deep-link join + real QR + deploy to tallybone.com**
**Trust tier chosen:** Casual / friends game

---

## 1. Goal

Turn the current single-device Phase-2 game prototype (fake players/scores in
`app/src/game-state.js`) into **real multiplayer**: two or more phones join one
game by code, and the roster, scores, round number, current double, and each
player's turn-in stay **live-synced across every device**, surviving a refresh
or a phone-lock. Plus a **real, scannable QR** to join, with the app living at
**tallybone.com**.

This does not touch the Phase-1 scanner accuracy work. The scanner and each
Tallybone screen's render function stay as they are; only the game's *data
source* (fixtures → live network state) and *event wiring* (mutate local object
→ send intents) change.

---

## 2. Decisions (locked)

- **Backend = one Cloudflare Durable Object per join code** (Option A). No
  separate database — the DO holds canonical state and persists it to its own
  SQLite-backed storage. Verified free-tier as of this writing: SQLite-backed
  Durable Objects are on the Workers **free plan** (~3M requests/mo, 5 GB
  storage; free-plan accounts are not billed for SQLite storage). A
  friends-and-family game stays orders of magnitude under those limits.
- **Trust = casual/friends.** The 5-char code is the only gate to join. The
  creator's device is the manager; the server enforces round flow (only the
  manager may pick doubles, remove players, reopen a round, or call the game)
  but we do **not** harden against a malicious player inside your own game.
- **Solo scanning stays fully offline.** "Just count my tiles" never opens a
  socket. Only game sessions go online.
- **Free tier throughout.** No paid Cloudflare plan is required for this design.
  Confirm with the user before enabling anything billable.

---

## 3. Architecture

```
Phone (Vite app) ──WebSocket──▶ Cloudflare Worker ──▶ Durable Object "GameRoom"
                                  (routes by code)       (one instance per join code)
```

- **Worker (router).** Handles `GET /api/game/:code/ws` (WebSocket upgrade) and
  forwards to the DO for that code via `env.GAME.idFromName(code)` +
  `stub.fetch(request)`. The same code always resolves to the same object.
- **GameRoom Durable Object.** One instance per code. Responsibilities:
  1. Hold the canonical `game` object in memory.
  2. Persist `game` to `state.storage` on every mutation (survives eviction /
     restart, so an active game is never lost).
  3. Own the set of connected WebSockets, each tagged with its `playerId`.
  4. On each inbound intent: **authorize → apply → persist → broadcast**.
- **Pure reducer.** All game rules live in a dependency-free function
  `applyIntent(game, intent, actorId) → { game, error }` in `server/reducer.js`.
  The DO is a thin transport shell around it. This makes every rule unit-testable
  without a running Worker, and lets the same reducer be reused client-side later
  for optimistic updates.
- **Full-snapshot broadcast, not deltas.** Game state is kilobytes; on every
  change the DO sends the whole `game` to every socket. No delta-merge bugs.
- **WebSocket hibernation.** Use the DO WebSocket hibernation API so idle games
  cost nothing while sockets stay open. (Exact API surface to be verified against
  current Cloudflare docs during implementation.)

---

## 4. Canonical data model

The DO's `game` object. Moves from name-keyed (fragile — two players can share a
name) to **stable IDs**.

```js
game = {
  code,               // "KX7Q2"
  phase,              // 'lobby' | 'round' | 'standings' | 'over'
  roundNum,           // 1-based
  currentDouble,      // 0..12; round 1 opens on 12
  managerId,          // the creator's playerId
  players: [
    { id, name, connected, removed }   // connected maintained by the DO
  ],
  scores: {           // keyed by player id
    [id]: { total, last, turnedIn }    // total = running (LOW wins); last = this round; turnedIn per round
  }
}
```

Notes:
- `phase` is new and load-bearing: it tells a reconnecting phone which screen to
  render (lobby / round / standings / over).
- The prototype's `final` field collapses into running `total` (real play ranks
  on the running total).
- `connected` is maintained internally by the DO for reconnect handling. The UI
  *presence dots* feature that would surface it is deferred (§8).

**Scoring semantics (dominoes, low-total-wins):**
- Each round, a player either "goes out" (turns in `0`) or turns in the pip
  count left in their hand. Both are the same `turnIn{total}` intent.
- `turnIn` sets `scores[id].last = total`, `scores[id].total += total`,
  `scores[id].turnedIn = true`.
- Starting a round (`startRound` for round 1, `pickDouble` thereafter) resets
  every seated player's `turnedIn = false` and `last = 0`, preserving `total`.
- Standings rank ascending by `total`; players who haven't turned in this round
  sort last. Game-over ranks ascending by `total` (lowest wins).

---

## 5. Message protocol (phone ↔ DO, over WebSocket)

**Phone → DO (intents).** Each is authorized server-side; manager-only intents
are marked *(mgr)*.

| Intent | Payload | Effect |
|---|---|---|
| `hello` | `{ playerId?, token? }` | Reconnect to an existing seat, or announce a fresh connection. DO replies `you` + `state`. |
| `join` | `{ name, creator? }` | Take a lobby seat. DO mints `playerId` + `token`, replies `you`, broadcasts `state`. `creator: true` (the phone that minted the code, tapping "Open the table") claims `managerId` **while the game is in the lobby**; otherwise the first joiner of a fresh code becomes `managerId`. The flag exists because the Create screen shows the code and QR *before* the creator has taken a seat, so a guest who scans it arrives first and would otherwise own the game — observed at a real table, 2026-07-31. Client-asserted, which suits the casual/friends tier where the 5-char code is already the only gate. |
| `startRound` *(mgr)* | — | `lobby → round`, round 1 on double-12. |
| `pickDouble` *(mgr)* | `{ d }` | Set `currentDouble = d`, `roundNum += 1`, start the next round. |
| `turnIn` | `{ total, tiles? }` | Record the calling player's round score (`tiles` optional, for future audit). |
| `removePlayer` *(mgr)* | `{ id }` | Mark a player `removed`. |
| `reopenRound` *(mgr)* | — | `standings → round`. |
| `callGame` *(mgr)* | — | `→ over`. |
| `runItBack` *(mgr)* | — | Reset scores/round for a new game, keep the roster; `→ lobby`. |

**DO → phone.**

| Message | Payload | Meaning |
|---|---|---|
| `state` | `{ game }` | Full snapshot. Broadcast on every change; also sent on connect. |
| `you` | `{ playerId, token, role }` | Identity assignment. `role` is `'manager'` or `'player'`. Client persists `playerId` + `token`. |
| `error` | `{ code, message }` | e.g. `game_not_found`, `not_manager`, `name_required`. |

---

## 6. Reconnect & identity (casual trust)

- On `join`, the DO mints `playerId` (`p_` + random) and a random `token`. The
  phone stores `{ code, playerId, token }` in `localStorage`, scoped by code.
- On refresh / phone-lock / dropped socket, the phone reconnects and sends
  `hello { playerId, token }`. The DO matches the seat, marks it connected, and
  replies with `you` + the current `state`, dropping the phone back on the right
  screen via `phase`.
- **Manager authority:** manager-only intents are allowed only when the sending
  socket's `playerId === game.managerId`. The token is just enough to reclaim a
  seat and gate manager buttons — no hardened crypto (per the casual-trust
  decision).
- If a `hello` token doesn't match a known seat, the DO treats the phone as a
  new visitor (sent to join), not an error.

---

## 7. Deep-link join + real QR

For a QR to be "real" for someone **not on your LAN**, the app and Worker must
live at a real HTTPS origin (tallybone.com). This build delivers that.

- **Join link format:** `https://tallybone.com/?j=KX7Q2` (query param, so
  Cloudflare Pages needs no SPA-fallback routing config).
- **Deep-link handling:** on app load, if a `?j=CODE` is present, the app skips
  Home and lands on the **Join screen with the code prefilled** — the player
  types their name and joins. (We prefill, not silently auto-join, so the player
  still chooses a name.)
- **Real QR:** replace the decorative `qrMock` with an actual QR generated
  **on-device** by a small vendored MIT / public-domain QR encoder (e.g.
  `qrcode-generator`). No external image service — keeps it offline-capable and
  never sends the join code to a third party.
- **Configurable base URL:** the join URL is built from a single configured
  base — the LAN dev URL locally, `https://tallybone.com` in production. So the
  QR is **fully testable on two phones over LAN before the domain is wired**;
  going live is a config swap + deploy.

---

## 8. Deferred enhancements (Phase 2.x backlog)

Recorded here so they are not lost. All come *after* the core loop lands; none
block two phones playing a full game.

1. **Presence dots ("who's online").** Surface each player's live `connected`
   state in the UI. Comfort feature; correctness doesn't depend on it.
2. **Manager handoff if the creator drops.** Pass the manager role to another
   player automatically or by vote when the creator leaves permanently. The
   common case (creator refresh / lock) is already covered by reconnect; the
   fallback for true loss today is "start a new game."
3. **Offline retry queue.** Buffer an intent fired during a dead network window
   and replay it on reconnect. The socket already auto-reconnects and re-syncs
   full state, so the *displayed* game is always correct; only an action fired
   mid-drop is lost, and the player just taps again.
4. **Server-side cross-device history.** "Every game I've played, from any
   device." Needs persistent storage beyond the live session. Build-plan §10
   already gives per-device local history (IndexedDB) for free; this is only for
   history that follows you across devices.
5. **Hardened auth.** Per-player cryptographic secrets + strict server-side
   authorization on every action + tamper-resistant scores. Only matters if
   untrusted people might join; easy to layer on later.

---

## 9. Wiring into the existing app

- **New `app/src/net.js`** — owns the WebSocket. Exposes `connect(code)`,
  `send(intent)`, `onState(cb)`; manages auto-reconnect with backoff; persists
  and restores `{ code, playerId, token }`.
- **`app/src/game-state.js`** — keep the pure helpers (`ranked`,
  `scoredPlayers`, `initials`, `mintCode`, `suggestedNextDouble`, seat tokens),
  but they now read the server snapshot. The fake `createGame()` roster/scores
  are removed (or gated behind an explicit demo flag for the component gallery).
- **`app/src/main.js`** — the game shower functions re-render on each `onState`;
  buttons emit intents via `net.send(...)` instead of mutating a local `game`;
  manager-only controls are hidden/disabled for non-managers; `phase` from the
  snapshot decides which screen a reconnecting phone shows.
- **Create flow:** mint a code → `connect(code)` → `join(name)` → become
  manager → lobby. **Join flow:** `connect(code)` → `join(name)` → lobby.
- **Untouched:** the entire scanner sub-flow, and each screen's render function
  (they receive data from the net layer and emit intents). **Solo mode never
  opens a socket.**

This is a real refactor of `main.js`'s game section — unavoidable to go from
fixtures to live sync — but kept surgical: screens and the scanner stay put.

---

## 10. Deployment & testing

**New top-level `server/` directory:**
- `wrangler.toml` — Worker + DO binding (`GAME`) + migration declaring the
  `GameRoom` SQLite-backed DO class.
- `src/worker.js` — the router (WebSocket upgrade → DO).
- `src/game-room.js` — the DO (transport shell + persistence + broadcast).
- `src/reducer.js` — pure `applyIntent` game logic (no Cloudflare imports).

**Local development (build & prove here first, free):**
- `wrangler dev` serves the Worker on localhost.
- The Vite dev server **proxies `/api` (including WebSocket upgrades) to
  `wrangler dev`**, so the phone sees a single origin — matching the prod
  same-origin model and reusing the existing HTTPS-over-LAN setup used for the
  camera (M2 workflow).
- Two-phone LAN testing proves the full loop *and* the QR before any domain
  wiring.

**Production (tallybone.com, free tier):**
- Point tallybone.com's DNS at Cloudflare.
- Deploy the app to **Cloudflare Pages**; deploy the Worker with a route so
  `tallybone.com/api/*` → Worker (DO) and everything else → Pages static. Same
  origin, no CORS. WebSocket at `wss://tallybone.com/api/game/:code/ws`.
- Set the app's join-URL base + API base to `https://tallybone.com`.
- The existing GitHub Pages deploy may remain as a legacy mirror, but
  tallybone.com becomes the primary origin the QR/join links point at.

**Testing:**
- **Vitest on the pure reducer** — every phase transition, every scoring rule,
  and rejection of every illegal action (non-manager attempting a manager
  intent, turn-in in the wrong phase, join with no name, etc.).
- **Two-client integration smoke** against `wrangler dev` — create, join from a
  second client, play a round, verify both see the same broadcast state, drop
  and reconnect a client and verify it reclaims its seat.

---

## 11. Out of scope (this build)

Everything in §8 (deferred enhancements), plus: Phase-1 scanner changes, PWA /
service-worker offline caching, and any paid Cloudflare features. Solo offline
scanning is unchanged.
