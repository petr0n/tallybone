# Claude Code Rules for This Project

## ⚠️ Working environment & file paths — settle BEFORE writing (TOP PRIORITY)

The device the user chats from and the machine where commands run are **different
things**. What matters for file paths is **where Claude Code is actually
executing**, not which device the user is looking at.

- **Running locally on the user's Mac** (VS Code extension, or the `claude` CLI in a
  Mac terminal) → write to the local checkout:
  `/Users/peterabeln/Documents/github/petr0n/tallybone/`
- **Running in the cloud / remote** (web, phone, remote session) → the Mac disk is
  unreachable; work in the cloud checkout and **push to GitHub**.

**How to tell (detect first, don't guess):** check the execution environment — macOS
(Darwin) with the `/Users/peterabeln/...` path present = local Mac; a Linux container
(e.g. `/home/user/...`) = remote/cloud. **If it's genuinely ambiguous, or before the
first file write when unsure, ASK the user** ("Is this running on your Mac, or
remote?") — never assume.

**`petr0n/tallybone` is the canonical repo for the app.** The app lives at the
**repo root** (`src/`, `index.html`, `vite.config.js`, `public/`, `scanner/`) — there
is no `app/` subdirectory. The older `petr0n/domino-counter-app` repo is the
**scanner-research** repo (build plan, training pipeline, eval corpus); it is *not*
where app code goes. Don't cross-write between them.

**GitHub `main` is the single source of truth.** Local Mac work and remote work both
sync through it, so nothing is lost switching between Mac and phone: remote sessions
push to GitHub; on the Mac, `git pull` brings that work down.

---

## Source of truth

**Phase-2 multiplayer** (the current focus) is specified and planned in:

- [`docs/superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md`](docs/superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md)
  — the design spec (architecture, data model, protocol, trust tier, deploy).
- [`docs/superpowers/plans/2026-07-27-phase2-multiplayer-do-backend.md`](docs/superpowers/plans/2026-07-27-phase2-multiplayer-do-backend.md)
  — the task-by-task implementation plan.

**Read both before doing multiplayer work.** Their locked decisions: one Durable
Object per join code; a pure, unit-tested reducer holding all game rules; full-snapshot
broadcast (no deltas); casual/friends trust (the 5-char code is the only join gate,
creator = manager, manager intents authorized server-side); free-tier Cloudflare only;
solo scanning stays fully offline.

**Phase-1 scanner accuracy work lives in the other repo.** The scanner's build plan
and its four load-bearing decisions (synthetic-data-first; detect-don't-classify;
accuracy before deployment; a numeric kill-gate up front) are
`docs/build-plan-v2.md` in `petr0n/domino-counter-app`. Read it there before
touching scanner accuracy. This repo carries the *shipped* scanner (`scanner/` +
the ONNX weights), not the training/eval pipeline.

---

## One Goal

**Turn a phone-camera image of domino tiles into accurate pip counts, every time** —
and let a table of friends keep score with it from their own phones. Every change
must serve one of those. If a change doesn't make tile detection or pip reading more
accurate/consistent/reliable — or directly support *measuring* those (eval, synthetic
data, the training loop) — or make the shared game work correctly across phones,
don't make it.

### Pursue it cheaply — token cost is a first-class constraint

Wasted context and tokens are a real cost the user pays. Being economical is never
an excuse to cut an accuracy corner; it means landing the same *verified* result
with less waste.

- **Read narrowly.** Use `offset`/`limit` and targeted search; never read a large
  file in full when part will do. Never re-read a file already read this session
  unless it changed.
- **Mute noisy commands.** Pipe anything that can dump huge output through
  `tail`/`head`.
- **Fewer loops.** Think a change through and verify locally before iterating.
- **Keep files small and replies concise.** Don't pad, re-explain settled
  decisions, or re-derive established facts.

---

## Working rules

### Do NOT assume anything
Check facts against the actual code, docs, or a real source before acting. Cite the
file/line or the doc you read. Never state something about the code or an API (e.g.
an ONNX Runtime Web, Durable Objects, Wrangler, or `@cloudflare/vite-plugin` call)
without verifying it exists.

### Use the internet; own your mistakes
When stuck on an API, technique, or error you don't know cold, search the web for a
working example *before* guessing — then verify it against the real API. No excuses:
diagnose the real cause, don't hand-wave past a failure or ship something
unverified. If you screw up, produce a concrete fix, not an apology.

### Accuracy is measured, not guessed
No accuracy number ships that you didn't run. Evaluate on the **real held-out set**
(`docs/build-plan-v2.md` §7 — in the scanner repo). No milestone advances without its
gate measured (§6). **Regressions are unacceptable** — confirm a metric held or
improved before pushing.

### Get cost approval before spending money
Do not incur paid cloud/compute/API charges (training runs, hosted inference, any
paid API, **any Cloudflare step that requires a paid plan or enabling billing**)
without the user's explicit per-task approval. Validate accuracy on the real held-out
eval set — locally and free where possible.

**"Push" means push to GitHub AND deploy to tallybone.com** (standing instruction,
2026-07-30). Any phrasing of it — "push", "push to main", "push it" — is one
action: `git push`, then `pnpm build && npx wrangler deploy`, without asking. It
is free-tier and free-tier only — the paid-plan gate above is untouched. Before deploying,
confirm `public/models/` holds `tile.onnx` and `pip.onnx`: they are gitignored, and
deploying from a machine without them ships an app whose scanner cannot load.
**Then verify the live site actually serves the new build** — Cloudflare's edge can
keep serving a cached `index.html` pointing at the previous build's hashed assets,
so check the hash in the live HTML rather than trusting a clean `wrangler deploy`.

### DRY — don't repeat yourself
Before writing any function/constant/logic, search for it first; reuse or extend it
rather than pasting a second copy. One responsibility → one place.

### Keep CLAUDE.md and the plan in sync with the code
This file and the Phase-2 spec/plan under `docs/superpowers/` are guardrails — a
wrong statement here sends the next session down the wrong path. When a change makes
either inaccurate, update it in the **same PR**. Don't document aspirational behavior
as if it ships; verify before you write.

### Respect the user's uncommitted work
The user keeps their own WIP in this tree. Never `git add -A` / `git commit -a`.
Stage only the files you changed, by path, and ask before touching a file that
already has uncommitted changes.

---

## Domino facts (first principles — do not revisit without instruction)

- **Pip color is NEVER a signal.** Sets use many pip colors (yellow, orange, green,
  blue, purple, dark tones near-black, …) but never literal pure black — the
  divider is always the true black on the tile. Count every pip regardless of
  color; never base detection, counting, thresholds, or training labels on a
  color. Everything must be fully color-agnostic — randomize pip color
  (excluding pure black) in synthetic data; never condition on it.
- **Tile body is always white; the divider bar is always black.** This is a
  fixed, universal fact across domino sets — not a variable. Do not randomize
  body color in synthetic data. It gives bar-detection
  (`docs/build-plan-v2.md` §5.3) a guaranteed-contrast target, not merely a
  typical one.
- **These are DOUBLE-12 tiles.** Each half holds **0–12 pips**. 91 unique tiles.
  Counting logic must handle the full 0–12 range per half — never assume ≤6.
- **The pip-grid layout is deterministic and known.**
  [`src/components/domino.js`](src/components/domino.js) is the reference
  implementation and `domino.test.js` pins every rule below.
  **0–9** use the classic grids that fit inside 3×3 — 4 → 2×2, 6 → 2×3,
  7 → columns 3/1/3, 8 → 3/2/3, 9 → 3×3, and 2/3/5 as diagonals.
  **10–12** ride **3 columns on one shared 7-row lattice**: outer columns full at
  4 pips, middle column = 10:2 on the outer rows, 11:3 at top/centre/bottom with
  the centre pip **NOT row-aligned** with the outer columns, 12:4. A half is
  square, so this and its 90° transpose describe the same pip set — the app
  renders the column form. Use it as geometry — render training data from it and
  validate predicted counts against it; orientation is free, since a
  photographed tile arrives at any angle.
- **Tiles NEVER overlap.** They may touch edge-to-edge but never sit on top of each
  other. Detection and synthetic scene generation may rely on this.

**Game scoring (double-12, low total wins).** Each round a player either goes out
(turns in `0`) or turns in the pip count left in their hand — the same `turnIn{total}`
intent either way. Round 1 opens on the double-12; each later round opens on the
double the manager picks. Standings rank **ascending** by running total; players who
haven't turned in this round sort last.

- **The double blank scores 40, not 0.** House rule: get caught holding the 0/0 at
  the end of a round and it costs 40. It is the one tile whose pip count lies, so
  never total a hand with a bare `a + b` sum — use `handTotal()` from
  [`src/scoring.js`](src/scoring.js), which is the single home for this.
- A 0/0 only scores once it is a real claim — the scanner read a blank (`scanned`)
  or the player moved its steppers (`touched`). Every tile added by hand starts at
  0/0, so counting any blank would charge 40 for a tile nobody has filled in yet.
- The server is not involved: the reducer records whatever `total` a player turns
  in, and what a hand is *worth* is decided client-side next to the scan.

---

## Current repo state

**Single package, flattened layout.** One `package.json` at the root, **pnpm** as the
package manager. `@cloudflare/vite-plugin` means **one command runs everything**:

```
pnpm dev      # Vite app AND the Worker/Durable Object together — NO separate `wrangler dev`
pnpm test     # vitest (vitest.config.js, see below)
pnpm build    # production build (Vite + Worker bundle)
pnpm smoke    # two-client WebSocket smoke against a running `pnpm dev`

pnpm build && npx wrangler deploy    # deploy to tallybone.com — runs whenever the user says "push"
```

**Dev gotchas (measured here, not guessed):**
- Vite binds **IPv6 only** on this machine — use `localhost` / `[::1]`, never
  `127.0.0.1` (the smoke's default base fails otherwise). Run it as
  `SMOKE_BASE=ws://localhost:<port> pnpm smoke` with `pnpm dev` already up.
- `vitest.config.js` is deliberately separate from `vite.config.js`: the
  `cloudflare()` plugin expects a real dev/build and throws under the test runner.
  Its `include` currently scopes `pnpm test` to `server/**/*.test.js` plus the one
  named file `src/components/domino.test.js` — the rest of `src/**` and
  `scanner/test/**` exist but are **not** in it; run them explicitly
  (`npx vitest run <path>`) or widen the glob deliberately. Do **not** glob
  `src/**`: the other `src` tests (`render`, `camera`, `game-state`, `scan`, `qr`)
  are plain `node <file>` scripts with no vitest suite, so vitest collects them
  and fails.
- The domino test needs a DOM, so it opts into **happy-dom** (a devDependency)
  with a `// @vitest-environment happy-dom` docblock. It is the only DOM test;
  everything else runs in `node`.
- Connecting to any code **auto-creates an empty lobby**, so a typo makes a new game
  rather than an error. Accepted for casual scope.
- `public/models/` is **gitignored** — `tile.onnx` / `pip.onnx` live only on disk.
  A fresh clone has no models; a build/deploy from a machine without them ships an
  app whose scanner can't load.

**Layout:**
- `index.html`, `gallery.html`, `src/` — the Vite app.
  - `src/main.js` — orchestrator: history-aware nav stack, scanner sub-flow, and the
    live game (subscribes to `net.onState`, emits intents, server `phase` → screen).
  - `src/net.js` — the WebSocket client: connect/send/onState, auto-reconnect,
    `{code,playerId,token}` persisted in `localStorage`.
  - `src/game-state.js` — pure view helpers over a server snapshot (`viewGame`,
    ranking, initials, `mintCode`, `suggestedNextDouble`). No fixtures.
  - `src/config.js` — `API_BASE` (same-origin default) and `JOIN_URL_BASE`
    (join links / QR: `${JOIN_URL_BASE}/?j=CODE`), plus scanner feature flags.
  - `src/screens/` — one render function per screen; `game-setup.js` (Home, Rules,
    Create, Join, Lobby) and `game-play.js` (Round, Submit, Standings, Manager,
    Over, PickDouble) are the gated game screens.
  - `src/components/`, `src/dom.js`, `src/brand.js`, `src/tokens.css` — shared UI.
- `scanner/` — the shipped on-device scanner (ONNX Runtime Web: preprocess, decode,
  NMS, geometry) with its own tests; `src/scan.js` is the app's thin wrapper.
- `server/` — the Cloudflare Worker + Durable Object:
  - `server/index.js` — router; `GET /api/game/:code/ws` → the DO for that code.
  - `server/game-room.js` — the `GameRoom` DO: WebSocket hibernation, identity
    minting, SQLite persistence, full-snapshot broadcast.
  - `server/reducer.js` — the pure `applyIntent` game logic (no Cloudflare imports,
    no I/O, no randomness — the DO mints IDs/tokens and passes them in).
  - `server/reducer.test.js` — 13 vitest cases; `server/smoke.mjs` — 2-client smoke.
- `wrangler.jsonc` (root) — `GAME` DO binding, `v1` SQLite migration, SPA assets with
  `run_worker_first: ["/api/*"]`, and the `tallybone.com/*` route.
- `.claude/hooks/js-check.sh` — Stop hook, syntax-checks changed JS/HTML.

**Phase 2 status: SHIPPED and live at https://tallybone.com** (Workers free plan).
The multiplayer backend is built, the client is wired to it, the join QR is real
(vendored on-device encoder in `src/vendor/qrcode.js`, rendered by
`src/components/qr.js`), and `/?j=CODE` deep links land on Join prefilled.
`pnpm test` is green; the 2-client smoke passes against both `pnpm dev` and
production. **Run/deploy details, free-tier limits, and the routing gotchas live in
[`server/README.md`](server/README.md) — read it before deploying.**

**Protocol (implemented — reference, don't re-derive).**
Phone→DO: `hello{playerId?,token?}`, `join{name,creator?}` (`creator` = the phone
that minted the code opening the table; it claims the game **in the lobby only**,
because the Create screen shows the QR before the creator has taken a seat and a
guest who scans it would otherwise become manager. Without the flag, first joiner
wins), 
`startRound`(mgr), `pickDouble{d}`(mgr), `turnIn{total}`, `removePlayer{id}`(mgr),
`reopenRound`(mgr), `callGame`(mgr), `runItBack`(mgr).
DO→phone: `state{game}`, `you{playerId,token,role}`, `error{code}`.
`game = { code, phase:'lobby'|'round'|'standings'|'over', roundNum, currentDouble,
managerId, players:[{id,name,connected,removed}], scores:{[id]:{total,last,turnedIn}} }`.

**`main` is not the whole history — check other branches before assuming something
doesn't exist**, in this repo and in `petr0n/domino-counter-app` (its "clean start"
reset moved the legacy OpenCV scanner and the hand-labeled eval corpus off `main`
rather than deleting them). Check `git branch -a` / `git log --all` first.

---

## Triple-check before pushing

- Verify any external API you call (ONNX Runtime Web, Durable Objects, Wrangler,
  `@cloudflare/vite-plugin`, GitHub) actually exists and is used correctly — don't
  assume. Check current docs; these APIs move.
- Run `pnpm test` (and the smoke, if you touched the server) before pushing.
- Run the relevant eval and confirm accuracy held or improved before pushing a
  change that touches the scanner.
- The Stop hook (`.claude/hooks/js-check.sh`) syntax-checks changed JS/HTML — fix
  any reported errors before pushing.

---

## PR workflow

Develop on the branch the task specifies. Commit per logical unit. After pushing,
open a PR **ready for review** (not draft). Do not auto-merge — leave PRs for the
user to review unless they say otherwise.

---

## Project overview

**Tallybone** — a phone-first domino tally app. Solo: scan your tiles and get an
accurate pip count, fully offline. Together: one player starts a game, everyone else
joins by 5-char code or QR from their own phone, and the roster, round, current
double, turn-ins, and standings stay live-synced across every device via a Cloudflare
Durable Object. No accounts. Deployed to tallybone.com on the Workers free tier.
