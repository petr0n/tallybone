# Phase 2 Multiplayer Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real multiplayer for the Tallybone game — phones join by code and see live-synced roster/scores/round/turn-ins — backed by one Cloudflare Durable Object per code, with a real deep-link + QR join, deployable to tallybone.com on the free tier.

**Architecture:** A pure reducer (`server/src/reducer.js`) owns all game rules and is fully unit-tested. A Durable Object (`server/src/game-room.js`) is a thin transport shell that authorizes/persists/broadcasts around the reducer. A Worker (`server/src/worker.js`) routes `/api/game/:code/ws` to the right DO. The app gets a `net.js` WebSocket client; game screens re-render from server snapshots and emit intents.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite-backed, free tier), Wrangler, Vitest (server), existing Vite + vanilla JS app, vendored MIT QR encoder.

**Spec:** `docs/superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md`

## Global Constraints

- **Free-tier Cloudflare only.** No paid features. Confirm before enabling billing. Do not deploy to production / touch DNS without the user (needs their Cloudflare account).
- **Casual trust.** The 5-char code is the only join gate; the creator's device is the manager; manager-only intents are authorized server-side by `actorId === game.managerId`. No hardened crypto.
- **Reducer is pure.** `server/src/reducer.js` imports nothing from Cloudflare and does no I/O or randomness — the DO mints IDs/tokens and passes them in. This is what makes it unit-testable.
- **Full-snapshot broadcast**, not deltas.
- **Solo scanning stays fully offline** — never opens a socket.
- **Join link format:** `<BASE>/?j=CODE` (query param).
- **On-device QR only** — vendored MIT/public-domain encoder, no external image service.
- **Same-origin `/api/*`** model (Vite proxies `/api` to `wrangler dev` locally; a Worker route serves `tallybone.com/api/*` in prod).
- Match existing app conventions (ES modules, `html`/`el` from `dom.js`, tokens.css styling).

---

## File Structure

- `server/package.json` — wrangler + vitest, type module.
- `server/wrangler.toml` — Worker + `GAME` DO binding + SQLite migration.
- `server/src/reducer.js` — pure game logic: `emptyGame`, `applyIntent`, phase/scoring rules.
- `server/src/reducer.test.js` — vitest, exhaustive.
- `server/src/game-room.js` — the `GameRoom` DO (WS accept/hibernation, identity minting, persist, broadcast).
- `server/src/worker.js` — router (`/api/game/:code/ws` → DO).
- `server/smoke.mjs` — two-client integration smoke against `wrangler dev`.
- `app/src/config.js` — add `API_BASE` + `JOIN_URL_BASE`.
- `app/src/net.js` — WebSocket client: `connect/send/onState`, reconnect, identity persistence.
- `app/src/game-state.js` — MODIFY: drop fixtures, keep helpers, operate on snapshot (id-keyed).
- `app/src/main.js` — MODIFY: game screens subscribe to `onState`, emit intents, `phase`→screen, manager gating, `?j=` deep-link.
- `app/src/vendor/qrcode.js` — vendored MIT QR encoder.
- `app/src/components/qr.js` — render a QR into a DOM node from a string.
- `app/src/screens/game-setup.js` — MODIFY: real QR in lobby, `renderJoin` prefill.
- `app/vite.config.js` — MODIFY: proxy `/api` (with ws) to `wrangler dev`.

---

## Reducer contract (used across tasks)

```js
// emptyGame(code) -> initial lobby game
// applyIntent(game, intent, actorId) -> { game, error }
//   game is returned UNCHANGED when error is set (a string code).
// Intents (actorId is the sender's playerId; DO supplies it):
//   { t:'join',        id, token?, name }   // id pre-minted by DO; first joiner => managerId
//   { t:'startRound' } (mgr)                // lobby -> round, round 1 double=12
//   { t:'pickDouble',  d } (mgr)            // roundNum++, new round on double d
//   { t:'turnIn',      total }              // actor's round score (0 = went out)
//   { t:'removePlayer', id } (mgr)
//   { t:'reopenRound' } (mgr)               // standings -> round
//   { t:'callGame' } (mgr)                  // -> over
//   { t:'runItBack' } (mgr)                 // reset scores/round, keep roster -> lobby
// Errors: 'not_manager', 'bad_phase', 'name_required', 'no_such_player', 'not_joined'
```

Game shape: `{ code, phase, roundNum, currentDouble, managerId, players:[{id,name,connected,removed}], scores:{[id]:{total,last,turnedIn}} }`. `connected` is set by the DO, not the reducer.

---

### Task 1: Server scaffold + pure reducer + tests

**Files:**
- Create: `server/package.json`, `server/src/reducer.js`, `server/src/reducer.test.js`

**Interfaces:**
- Produces: `emptyGame(code)`, `applyIntent(game, intent, actorId)` (signatures above) consumed by the DO (Task 2) and the app helpers (Task 4).

- [ ] **Step 1:** `server/package.json` with `"type":"module"`, devDeps `vitest`, `wrangler`, `@cloudflare/workers-types`; scripts `test`, `dev`, `deploy`. `npm install` in `server/`.
- [ ] **Step 2:** Write `reducer.test.js` first: lobby join (first→manager, second→player), start round (double=12, turnedIn reset), turnIn updates last+total, pickDouble increments round + resets turnedIn, non-manager rejected with `not_manager`, turnIn in lobby rejected `bad_phase`, join with blank name `name_required`, callGame→over, runItBack resets scores/round keeps roster.
- [ ] **Step 3:** Run `npm test` → FAIL (module not found).
- [ ] **Step 4:** Implement `reducer.js` to pass. Pure; no randomness/I/O.
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Commit `feat(server): pure game reducer + tests`.

### Task 2: GameRoom Durable Object + Worker router

**Files:**
- Create: `server/src/game-room.js`, `server/src/worker.js`, `server/wrangler.toml`, `server/smoke.mjs`

**Interfaces:**
- Consumes: reducer from Task 1.
- Produces: `wss://…/api/game/:code/ws` endpoint speaking the §5 protocol (`hello`/`join`/… → `you`/`state`/`error`).

- [ ] **Step 1:** `wrangler.toml` — `main = src/worker.js`, recent `compatibility_date`, `[[durable_objects.bindings]] name="GAME" class_name="GameRoom"`, `[[migrations]] tag="v1" new_sqlite_classes=["GameRoom"]`. **Verify the DO WebSocket-hibernation + SQLite-migration syntax against current Cloudflare docs before writing** (per CLAUDE.md — no unverified APIs).
- [ ] **Step 2:** `worker.js` — parse `/api/game/:code/ws`, `env.GAME.get(env.GAME.idFromName(code)).fetch(request)`; 404 otherwise.
- [ ] **Step 3:** `game-room.js` — on WS upgrade: hibernation `acceptWebSocket`; load `game` from `storage` (or `emptyGame`). On message: `hello`→resolve seat by token (persisted `tokens` map), reply `you`+`state`; `join`→mint `playerId`+`token`, reducer apply, persist, reply `you`, broadcast `state`; other intents→reducer apply with the socket's `playerId` as actorId, persist, broadcast (or `error`). On close: mark `connected=false`, broadcast. Broadcast = send `{t:'state',game}` to all live sockets.
- [ ] **Step 4:** `smoke.mjs` — connect two `ws` clients to a running `wrangler dev`; client A creates+joins (manager), B joins; A startRound; both turnIn; assert both received matching `state` with the right totals; B reconnects with saved token → reclaims seat. Documented run: `npx wrangler dev` in one shell, `node smoke.mjs` in another.
- [ ] **Step 5:** Run the smoke test → PASS. (Reducer rules already unit-tested in Task 1.)
- [ ] **Step 6:** Commit `feat(server): GameRoom durable object + worker router`.

### Task 3: `net.js` client layer

**Files:**
- Create: `app/src/net.js`; Modify: `app/src/config.js`

**Interfaces:**
- Produces: `connect(code, { create }) -> void`, `send(intent)`, `onState(cb) -> unsubscribe`, `identity() -> {playerId, role}`, used by `main.js` (Task 4).

- [ ] **Step 1:** `config.js` — add `API_BASE` (default `''` = same origin) and `JOIN_URL_BASE` (default `location.origin`).
- [ ] **Step 2:** `net.js` — open `new WebSocket(${API_BASE.replace(/^http/,'ws')}/api/game/${code}/ws)`; on open send `hello` with saved `{playerId,token}` (from `localStorage['tb.id.'+code]`) or nothing; handle `you` (persist id/token), `state` (fan out to `onState` subscribers), `error`; auto-reconnect with capped backoff; `send` queues until open.
- [ ] **Step 3:** Verify against `wrangler dev` from a node harness or the browser (no app unit-test harness exists; net.js is proven by the Task 2 smoke pattern + the headless app check in Task 4).
- [ ] **Step 4:** Commit `feat(app): websocket net client + identity persistence`.

### Task 4: Rewire game-state + main.js to live state

**Files:**
- Modify: `app/src/game-state.js`, `app/src/main.js`

- [ ] **Step 1:** `game-state.js` — remove `createGame()` fixtures; keep `mintCode`, `initials`, `suggestedNextDouble`, seat tokens; rewrite `seated/scoredPlayers/ranked/finalRanked` to take a server `game` snapshot with id-keyed `scores` and `players[]`.
- [ ] **Step 2:** `main.js` — replace local `game` mutation with net: create flow (`mintCode`→`connect(code,{create:true})`→`join(name)`→lobby), join flow (`connect(code)`→`join(name)`). Subscribe game screens to `onState`; re-render on snapshot; map `phase`→screen for reconnect; emit intents (`startRound`, `pickDouble`, `turnIn`, `removePlayer`, `reopenRound`, `callGame`, `runItBack`); hide manager-only controls unless `identity().role==='manager'`. Turn-in from the scanner review submits `turnIn{total}`. Solo path unchanged (never connects).
- [ ] **Step 3:** Headless screentest: feed each game screen a mock snapshot, assert it renders (extend the existing headless harness). Two-phone LAN check against `wrangler dev` + Vite.
- [ ] **Step 4:** Commit `feat(app): wire game screens to live multiplayer state`.

### Task 5: Deep-link join + real QR

**Files:**
- Create: `app/src/vendor/qrcode.js`, `app/src/components/qr.js`; Modify: `app/src/screens/game-setup.js`, `app/src/main.js`

- [ ] **Step 1:** Vendor a small MIT/public-domain QR encoder into `app/src/vendor/qrcode.js` (record source + license header).
- [ ] **Step 2:** `components/qr.js` — `qr(text, size)` → a DOM node (canvas or SVG) rendered from the encoder.
- [ ] **Step 3:** `game-setup.js` — replace `qrMock` with `qr(`${JOIN_URL_BASE}/?j=${game.code}`)`; `renderJoin` accepts a prefilled code.
- [ ] **Step 4:** `main.js` — on boot, read `?j=CODE`; if present, route to Join with the code prefilled (strip the param from the URL after).
- [ ] **Step 5:** Headless check: lobby shows a real QR node encoding the join URL; loading `?j=ABCDE` lands on Join prefilled.
- [ ] **Step 6:** Commit `feat(app): real deep-link join + on-device QR`.

### Task 6: Local dev wiring + deploy readiness

**Files:**
- Modify: `app/vite.config.js`; Create: `server/README.md` (run + deploy steps)

- [ ] **Step 1:** `vite.config.js` — `server.proxy` `'/api'` → `http://127.0.0.1:8787` with `ws:true` (wrangler dev default port), so the phone sees one origin.
- [ ] **Step 2:** `server/README.md` — local run (`wrangler dev` + `vite`), the two-phone LAN recipe, and the **production deploy checklist** (Pages deploy, Worker route `tallybone.com/api/*`, DNS, set `JOIN_URL_BASE`/`API_BASE`) marked as a **user-gated step** (their Cloudflare account, free tier).
- [ ] **Step 3:** Full local two-phone smoke: create on phone A, scan the QR on phone B → join → play a round → both synced → refresh B → reclaims seat.
- [ ] **Step 4:** Commit `chore: local dev proxy + deploy runbook`.

---

## Self-Review

- **Spec coverage:** §3 arch → Tasks 1–2; §4 model → Task 1; §5 protocol → Task 2; §6 reconnect → Tasks 2–3; §7 QR/deep-link → Task 5; §9 wiring → Tasks 3–4; §10 deploy/test → Tasks 1,2,6. Covered.
- **Placeholders:** none — one explicit "verify Cloudflare API against current docs" is a required action (CLAUDE.md), not a gap.
- **Type consistency:** reducer signature, game shape, and intent names identical across Tasks 1/2/4. `role` from `you` used for manager gating in Task 4. Consistent.
- **Deploy gate:** production/DNS is explicitly user-gated (their account); everything else builds and is proven locally on the free path.
