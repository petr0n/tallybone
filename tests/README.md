# Tallybone test suite

Real-life tests that prove the app before a live game night. Four tiers, run
locally from the Mac. See the design spec + plan in
`docs/superpowers/{specs,plans}/2026-07-28-e2e-stress-test-suite*`.

## Tiers & commands

| Command | Tier | What it proves | ~time |
|---|---|---|---|
| `pnpm test` | **Reducer + components** (vitest) | Pure game rules (13 cases: join/rounds/turn-in/manager auth) + the domino pip layout — 21 cases | seconds |
| `pnpm test:node` | **Plain-node units** | The 9 `node file.js` suites vitest deliberately skips: `scanner/test/*` (decode, geometry, nms, preprocess), `src/{camera,render,scan,game-state}`, `src/components/qr` — 28 assertions. Fails fast, non-zero on first bad file | seconds |
| `pnpm test:e2e` | **Gameplay e2e** (Playwright) | Real browsers + real Durable Object: 6-player flagship, reconnect, gating, collision, deep-link, real in-browser scan | ~1–2 min |
| `pnpm test:accuracy` | **Scanner accuracy** (Playwright) | Labeled corpus hands through the REAL in-browser scanner; per-half accuracy vs a baseline (drift guard) | ~1–2 min |
| `pnpm test:stress` | **Backend stress** (Node+ws bots) | ~25 concurrent games, reconnect storm, idempotency, soak; reports latency p50/p95 | ~15 s |
| `pnpm smoke` | Backend smoke | One 2-client round + reconnect | seconds |
| `pnpm test:all` | Units + node units + e2e + accuracy | Everything that self-hosts its server | ~3–4 min |

`test:stress` and `smoke` need a dev server up first:

```bash
pnpm dev                      # or: pnpm exec vite --port 5199 --strictPort
SMOKE_BASE=ws://localhost:5199 pnpm test:stress
```

The Playwright tiers (`test:e2e`, `test:accuracy`) start their own dev server on
port **5199** automatically (reused if already running).

## How it works

- **Multiple phones = multiple browser contexts.** Each persona gets its own
  isolated context; they all talk to one real Durable Object via `pnpm dev`
  (the Cloudflare Vite plugin serves the Worker + app together).
- **The camera is mocked** (`tests/support/camera.js`): `getUserMedia` returns a
  `canvas.captureStream()` of a chosen photo, so the **real ONNX scanner** runs
  on real tile images.
- **Gameplay asserts invariants, not ML output** (the review total propagates to
  standings, reconnect preserves totals, lowest wins) — so the game tests never
  flake on scanner nondeterminism. Exact pip accuracy is its own tier.
- **The stress bots** (`tests/support/ws-client.js`) speak the WebSocket protocol
  directly — no browser — so many run cheaply. The same client backs `smoke.mjs`.

## Fixtures / photos

- `tests/fixtures/labeled/` — the ~80-photo labeled corpus (`labels.json`
  tracked; `photos/` symlinked to the eval corpus, gitignored). Drives the
  accuracy tier and the persona hands.
- `tests/fixtures/photos/` — **drop your own real tile hands here** (gitignored).
  To scan your hands in the flagship instead of the corpus, point
  `tests/fixtures/personas.js` at this directory.
- `tests/accuracy/baseline.json` — the recorded per-half accuracy the accuracy
  tier guards against regressing (delete it to re-baseline).

## Pre-live-event checklist

1. `pnpm test && pnpm test:node` — reducer, components, and the plain-node units green.
2. `pnpm test:all` — 6-player flagship, reconnect, gating, and scanner accuracy green.
3. Start `pnpm dev`; `SMOKE_BASE=ws://localhost:5199 pnpm test:stress` — 0 errors, p95 latency sane.
4. **Scan a batch of your OWN real tiles** through the app (`pnpm dev`, "Just count
   my tiles") and eyeball the totals — the corpus is not your set/lighting.
5. **On a real iPhone/iPad (both Chrome AND Safari):** open the app and scan.
   iOS forces every browser onto WebKit, and the LIVE camera (`getUserMedia`) is
   unreliable outside Safari — so on iOS the app falls back to a native **"Take a
   photo of your tiles"** button (works in every iOS browser). Confirm that
   fallback actually scans on Chrome-iOS, and that the live camera works in
   Safari-iOS. (Automated `ios-fallback.spec.js` validates the *logic* in
   Chromium; only a real device confirms the OS camera behavior.)
6. Do one real 2-phone dry run over the same wifi you'll use at the event.

## Notes / gotchas

- Vite binds **IPv6** here — use `localhost`/`[::1]`, never `127.0.0.1`.
- The Durable Object **persists games across runs**; tests use fresh random codes
  to avoid collisions. (That persistence is correct behavior — reconnect relies on it.)
- `vitest.config.js` isolates unit tests from the `cloudflare()` Vite plugin
  (which throws under the test runner).
