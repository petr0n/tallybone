# Tallybone E2E + Stress Test Suite — Design Spec

**Date:** 2026-07-28
**Status:** Approved design → ready for implementation plan
**Driver:** Live 6-player playtest ~2026-08-01. The app must be near-perfect for
real people around a table. This suite exists to find the failures *before* that.

---

## 1. Goal

Prove the whole app works like a real game night: 6 phones join one game, scan
real tiles through the real on-device scanner, turn in scores that stay synced,
survive flaky networks and reconnects, and finish with a correct winner — and
prove the backend holds up under friends-and-family load.

## 2. Decisions (locked)

- **Scale:** friends-and-family robustness (dozens of concurrent games, ≤6
  players), not internet-scale. Local-only, run from the Mac via pnpm scripts (no
  CI wiring this round).
- **Scanner accuracy is in scope** as its own tier (a browser-run check), separate
  from gameplay assertions.
- **Photos are mostly raw/unlabeled** → gameplay tests assert *invariants*, never
  exact ML pip counts (see §4). The existing ~80-photo labeled corpus is the
  accuracy fixture.
- **Two tools:** Playwright for browser e2e + accuracy; Node + `ws` bots for
  stress. No Cypress, no k6.
- **No production test-hooks.** Tests drive the real UI. Where an exact known hand
  is required, use the app's manual-entry + steppers. The scanner's DOM output
  (Review card `.val--a`/`.val--b`) is read directly — no `window` seam in ship
  code.

## 3. Layout

```
tests/
  e2e/         Playwright — personas, gameplay, reconnect, deep-link   (pnpm test:e2e)
  accuracy/    Playwright — labeled photos through the REAL scanner     (pnpm test:accuracy)
  stress/      Node+ws bots — concurrency / reconnect / soak            (pnpm test:stress)
  fixtures/    photos (gitignored), personas.js, labeled corpus + labels
  support/     getUserMedia mock, persona/context helpers, shared ws client
playwright.config.js
```

`server/smoke.mjs` and the stress bots share **one extracted WS protocol client**
(`tests/support/ws-client.js`) — the smoke test becomes the first bot (DRY).

## 4. The invariant-not-ML-output principle (load-bearing)

Raw photos have no ground truth and the scanner isn't bit-deterministic, so
gameplay tests must not assert exact pip totals (that path is flaky). Instead they
assert **invariants** that hold regardless of what the scanner read:

- Whatever total the Review screen shows for a player is exactly what lands in
  that player's standings entry.
- The running total equals the sum of that player's per-round turn-ins.
- Lowest total wins; standings order is correct.
- A reconnect (context reload) never changes a total or a seat.
- Manager-only controls are invisible/absent for non-managers.

Where a test needs an **exact** hand (e.g., verifying scoring math or the winner),
it enters tiles via the app's **manual-entry steppers** — deterministic, no ML.

Scanner *accuracy* is proven separately in Tier 3 against the labeled corpus.

## 5. Tiers

### Tier 1 — Playwright gameplay e2e (`tests/e2e/`)
Multiple browser contexts = multiple phones (isolated storage). `getUserMedia` is
mocked by painting a persona's photo onto a canvas → `captureStream`, so the real
scanner runs on a chosen photo. Auto-starts `pnpm dev` (real Worker/DO) via
Playwright's `webServer`. Chromium first; WebKit (iOS Safari) an opt-in flag later.

**Personas:** Rosa (decisive manager), Dee (slow, drops signal mid-round →
rejoins), Marco (steady), Bea (late walk-in), plus Cy & Nan to fill the table.

**Scenarios:**
1. **6-player flagship (mirrors the live event):** Rosa creates; five join (mix of
   code entry + `?j=CODE` deep-link); play 3 rounds — manager picks each next
   double — everyone scans/turns in each round; finish to Game Over with the
   correct lowest-total winner. Assert full cross-phone sync at every step.
2. **Reconnect mid-round:** Dee reloads during a round → reclaims seat, totals
   intact, can still turn in.
3. **Late walk-in:** Bea joins after round 2 starts → seated at 0, picks up next.
4. **Name collision:** a second "Rosa" is rejected with the error banner.
5. **Manager-only gating:** a non-manager sees no Start / gear / Call-game.
6. **Wrong-code typo:** joining a never-used code lands in an empty lobby
   (documents the accepted casual behavior).
7. **Manager flow:** reopen a round, remove a player, call the game.
8. **Deep-link:** `/?j=CODE` → Join prefilled. (Full QR-scan e2e depends on the
   Task-5 QR work landing; the join-link contract is already unit-pinned.)

### Tier 2 — Stress bots (`tests/stress/`, Node + ws, friends-scale)
Bots speak the WS protocol directly (no browser) so hundreds are cheap. Must pass
on the Mac against a running dev server:
- **Concurrency:** ~30 games × 5 players each play a full round; every client ends
  on identical final state; zero dropped intents.
- **Reconnect storm:** in one game, all non-managers disconnect+reconnect
  repeatedly mid-round; seats reclaim; totals never corrupt.
- **Rapid/duplicate turn-in:** fire `turnIn` many times fast; prove end-to-end
  idempotency (no double-count).
- **Soak:** a configurable few-minute game loop; no crash, no unbounded growth.
- Report: games/players/errors + broadcast-latency p50/p95.

### Tier 3 — Browser accuracy (`tests/accuracy/`)
A labeled subset of the corpus (`eval/corpus_photos` + `corpus_merged.json` from
the old repo, copied into `tests/fixtures/labeled/`) is fed through the **real
in-app scan path** in Chromium. Per-half pip accuracy is computed from the Review
DOM values and asserted against a **recorded browser baseline** (fail on
regression) — not a hard 0.97, which the model doesn't yet meet. Catches
ONNX-WASM/browser drift the Python eval can't see.

## 6. Fixtures & photos

- `tests/fixtures/photos/` (gitignored) — the user's raw "hands." Documented naming
  so scenarios can pick them. User populates; more can be added anytime.
- `tests/fixtures/labeled/` — labeled accuracy subset copied from the old repo
  corpus (photos gitignored; the labels JSON tracked).
- `tests/fixtures/personas.js` — persona definitions + assigned photos.

## 7. Scripts & reporting

`pnpm test:e2e`, `pnpm test:accuracy`, `pnpm test:stress`, plus a `pnpm test:all`;
existing `pnpm test` (units) and `pnpm smoke` stay. Playwright HTML report; the
stress harness prints a summary line. `tests/README.md` documents how to run each,
how to drop in photos, what each tier proves, and a **pre-live-event checklist**.

## 8. Out of scope

CI wiring (deferred; suite is structured to add it later), internet-scale load,
WebKit/iOS in the default matrix (opt-in), and any change to ship code.

## 9. Build order (deadline-driven)

Highest live-event risk first: Tier-1 foundation → **6-player flagship** +
reconnect + gating → stress reconnect-storm/concurrency → browser accuracy on the
user's real tiles → fixtures/docs. Partial completion still yields the tests that
matter most for Aug 1.
