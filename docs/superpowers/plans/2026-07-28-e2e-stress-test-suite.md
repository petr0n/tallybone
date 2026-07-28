# Tallybone E2E + Stress Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A local, real-life test suite that proves the app before a live 6-player
playtest (~2026-08-01): full-stack gameplay e2e (up to 6 phones), flaky-network
robustness, and browser scanner accuracy.

**Architecture:** Playwright drives the real app in multiple browser contexts
(personas) against a real Worker/DO (`pnpm dev`), mocking `getUserMedia` to feed
tile photos into the real scanner. A Node+ws bot harness (sharing one protocol
client with `server/smoke.mjs`) stress-tests the backend. A browser-faithful eval
checks scanner accuracy.

**Tech:** `@playwright/test` (Chromium), Node + `ws`, existing `pnpm dev`.

**Spec:** `docs/superpowers/specs/2026-07-28-e2e-stress-test-suite-design.md`

## Global Constraints

- **No changes to ship code.** Tests drive the real UI; exact hands via manual-entry
  steppers; scan output read from the Review DOM (`.rev__card .val--a`/`.val--b`).
- **Gameplay asserts INVARIANTS, never exact ML counts** (spec §4): capture the total
  the Review screen shows, assert it propagates to standings and that standings order
  matches those captured totals. No ground truth needed for gameplay.
- **Friends-scale, local-only.** Run from the Mac via pnpm scripts; no CI.
- **Vite binds IPv6** — use `localhost`/`[::1]`, never `127.0.0.1`. Use a dedicated
  test port so tests never collide with a hand-run `pnpm dev` on 5173.
- Reuse, don't duplicate: one shared `tests/support/ws-client.js` for smoke + bots.

**Priority order (deadline-driven):** Task 1 → Task 2 (6-player flagship + reconnect
FIRST) → Task 3 (reconnect storm) → Task 4 (accuracy on real tiles) → Task 5. Partial
completion still ships the highest-value tests.

---

### Task 1: Playwright foundation + camera mock + happy path

**Files:** `playwright.config.js`; `tests/support/camera.js`; `tests/support/game.js`
(persona/context helpers); `tests/fixtures/personas.js`; `tests/e2e/happy.spec.js`;
`package.json` (scripts); seed a few labeled corpus photos into `tests/fixtures/photos/`.

- [ ] Add `@playwright/test`; `npx playwright install chromium`.
- [ ] `playwright.config.js`: `testDir: 'tests'`, projects for `e2e` + `accuracy`,
  `webServer: { command: 'pnpm dev -- --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 120000 }`,
  `use: { baseURL: 'http://localhost:5199' }`.
- [ ] `tests/support/camera.js`: `addCameraMock(context)` → `context.addInitScript` that
  overrides `navigator.mediaDevices.getUserMedia` to return a `<canvas>.captureStream()`
  which redraws `window.__cameraImg` each frame; export `setCameraPhoto(page, absPath)`
  that reads the file (Node fs), base64s it, and `page.evaluate`s it into an `Image` →
  `window.__cameraImg`. (Verify Chromium `canvas.captureStream` + fake stream works with
  the app's `<video>` capture; adjust if the app needs `video.play()`.)
- [ ] `tests/support/game.js`: helpers — `newPhone(browser)` (fresh context + camera
  mock), `createGame(page, name)`, `joinByCode(page, code, name)`, `readCode(page)`,
  `scanHand(page, photo)` (open scan → shutter → wait Review → return the shown total),
  `turnIn(page)`, `winRound(page)`, `standingsTotals(page)`.
- [ ] `tests/e2e/happy.spec.js`: 2 phones — manager creates, player joins by code,
  start round, each scans a photo (capture review totals), turn in, assert both phones'
  standings show the captured totals and correct order; play to Game Over; assert winner
  = lowest total.
- [ ] `package.json`: add `"test:e2e": "playwright test --project=e2e"`.
- [ ] Run `pnpm test:e2e` → PASS.
- [ ] Commit.

### Task 2: Personas + gameplay scenarios (incl. 6-player flagship)

**Files:** `tests/fixtures/personas.js` (extend); `tests/e2e/gameplay.spec.js`;
`tests/e2e/reconnect.spec.js`.

- [ ] Personas: Rosa (manager), Dee (drops/rejoins), Marco, Bea (late), Cy, Nan — each
  with an assigned photo.
- [ ] **6-player flagship** (`gameplay.spec.js`): Rosa creates; 5 join (≥1 via
  `/?j=CODE` deep-link, rest by code); play 3 rounds — manager picks each next double via
  the picker; every player scans + turns in each round (capture review totals); reach
  Game Over. Assert at each step: all 6 contexts see the same roster/round/double; each
  player's standings entry == their captured review total; final order ascending; winner
  correct.
- [ ] **Reconnect mid-round** (`reconnect.spec.js`): Dee `page.reload()` during a round →
  seat reclaimed, prior totals intact, can still turn in and it lands.
- [ ] **Late walk-in:** Bea joins after round 2 starts → seated at 0, plays round 3.
- [ ] **Name collision:** second phone joins with an existing name → error banner shown,
  not seated.
- [ ] **Manager-only gating:** a non-manager context has no Start / gear / Call-game
  controls; the manager does.
- [ ] **Wrong-code typo:** join an unused code → empty lobby (documents accepted casual
  behavior).
- [ ] **Manager flow:** reopen a round; remove a player (drops from standings); call game
  → all phones land on Game Over.
- [ ] **Deep-link:** navigate `/?j=CODE` → Join screen prefilled. (QR-scan e2e deferred
  until the Task-5 QR feature lands.)
- [ ] `package.json`: `test:e2e` already covers these (same project). Run → PASS.
- [ ] Commit.

### Task 3: Stress bot harness (friends-scale)

**Files:** `tests/support/ws-client.js` (extract from `server/smoke.mjs`); refactor
`server/smoke.mjs` to import it; `tests/stress/robustness.mjs`; `package.json`.

- [ ] Extract the `client()`/`waitFor` logic from `smoke.mjs` into
  `tests/support/ws-client.js` (a `makeClient(base, code)` returning
  `{ send, waitFor, close, inbox }`); make `smoke.mjs` import it (DRY, still green).
- [ ] `tests/stress/robustness.mjs` (needs a dev server; document `SMOKE_BASE`):
  - **Concurrency:** ~30 games × 5 players each play one full round; assert every client
    ends on identical final state; zero errors.
  - **Reconnect storm:** one game, all non-managers close+reopen repeatedly mid-round;
    assert seats reclaim and totals never corrupt.
  - **Idempotency:** one player fires `turnIn` 20× rapidly; assert final total counts once.
  - **Soak:** run a game loop for `SOAK_MIN` (default 2) minutes; assert no crash / no
    error growth.
  - Print a summary: games, players, errors, broadcast-latency p50/p95.
- [ ] `package.json`: `"test:stress": "node tests/stress/robustness.mjs"`.
- [ ] Start `pnpm dev` (port 5199), run `SMOKE_BASE=ws://localhost:5199 pnpm test:stress`
  → PASS at friends-scale.
- [ ] Commit.

### Task 4: Browser scanner accuracy

**Files:** `tests/fixtures/labeled/` (subset of old-repo `eval/corpus_photos` +
`corpus_merged.json`); `tests/accuracy/scanner.spec.js` (or an adapted browser-eval
script); `tests/accuracy/baseline.json`; `package.json`.

- [ ] Copy a labeled subset (photos gitignored; labels JSON tracked) from
  `/Users/peterabeln/Documents/github/petr0n/domino-counter-app/eval/`
  (`corpus_photos/` + `corpus_merged.json`) into `tests/fixtures/labeled/`.
- [ ] Decide the runner (first step of this task): **prefer adapting the existing
  browser-faithful eval** (`browser_eval.cjs` / `capture.sh` in the old repo — proven to
  match phone decoding; see the browser-faithful-eval memory) to the tallybone build +
  local `public/models`; fall back to a Playwright runner that feeds each labeled photo
  through the real scan flow and reads `.rev__card .val--a/.val--b`. Verify the chosen
  tool's real interface before wiring (no assumptions).
- [ ] Compute per-half pip accuracy vs `corpus_merged.json` using the SAME matching as
  `eval/score.py` (reuse it, don't re-derive). Write the first run to
  `tests/accuracy/baseline.json`; on later runs assert **no regression** below baseline
  (tolerance, e.g. −0.5%), and print the number. (Not a hard 0.97 — the model doesn't yet
  meet it; this tier catches browser/ONNX drift.)
- [ ] `package.json`: `"test:accuracy": "..."`. Run → prints accuracy, passes vs baseline.
- [ ] Commit.

### Task 5: Fixtures, scripts, docs, pre-live checklist

**Files:** `tests/fixtures/photos/README.md`; `tests/README.md`; `.gitignore`;
`package.json`.

- [ ] `.gitignore`: ignore `tests/fixtures/photos/*` and `tests/fixtures/labeled/*.jpg`
  (keep labels JSON + READMEs).
- [ ] `tests/fixtures/photos/README.md`: naming convention so scenarios pick photos; note
  the user drops their hundreds of real hands here (more anytime).
- [ ] `package.json`: `"test:all": "pnpm test && pnpm test:e2e && pnpm test:accuracy"`
  (stress run separately — needs a live server + is longer).
- [ ] `tests/README.md`: how to run each tier, how to add photos, what each proves, and a
  **pre-live-event checklist** (run all tiers; scan a batch of the user's OWN real tiles
  through Tier-1 and eyeball totals; confirm reconnect + 6-player flagship green).
- [ ] Run the full suite once end-to-end. Commit.

---

## Self-Review

- **Spec coverage:** Tier 1 → Tasks 1–2; Tier 2 → Task 3; Tier 3 → Task 4; fixtures/docs
  → Tasks 1 & 5. 6-player flagship = Task 2. Covered.
- **No ship-code changes:** all tests read real DOM / drive real UI; manual-entry for
  exact hands; no `window` seam. ✓
- **Determinism:** gameplay asserts invariants (captured review total → standings),
  independent of ML output. ✓
- **DRY:** one `ws-client.js` shared by smoke + bots; accuracy reuses `score.py` matching
  and (preferably) the existing browser-faithful eval. ✓
- **Risk-first:** priority note front-loads the 6-player flagship, reconnect, and
  real-tile accuracy for the Aug-1 event.
