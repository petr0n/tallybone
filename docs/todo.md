# Tallybone — TODO

Deferred work that is understood but deliberately not built yet. Each entry
should say what is weak today, why the current state is acceptable, and what the
concrete fix is — so a future session can pick it up without re-deriving it.

Phase-2 backlog items decided during design (presence dots, manager handoff,
offline retry queue, cross-device history, hardened auth) live in
[`superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md`](superpowers/specs/2026-07-27-phase2-multiplayer-do-backend-design.md)
§8 and are not duplicated here.

---

## iPhone: close-up photos read badly

**Status:** reported 2026-07-31 from a real table, not investigated. Placed above
the feature entries because it is an ACCURACY bug — the app's one goal — not
because the owner ranked it; move it if that is wrong.

**Blocker on picking this up: the owner has no iPhone** (iPad + Samsung). This
needs a borrowed device, so gather everything in one sitting rather than
discovering a missing detail later.

### A second iPhone symptom, same night — and what it ruled out

Later the same session, an iPhone at the table got stuck on the **WARMING UP**
scanner-boot screen and could not scan at all, mid-game. Diagnostic value is in
what cleared it: **a page reload did NOT fix it; force-quitting the browser
did.** A reload reuses the same browser process, a force-quit does not — which
points at memory pressure in the WASM runtime rather than the network, the CDN,
or the model files (all three were verified serving 200 with correct sizes from
production at the time). Same family as the iPad `RangeError: out of memory`
recorded in the camera entry below.

The dead-end *symptom* is fixed (`f41a862`: the boot screen now times out into
manual entry and a real retry). **The underlying memory failure is not** — that
fix makes the failure survivable, it does not prevent it. If close-up photos and
the boot hang turn out to share a cause, it is memory, and the lever is capture
size, which is exactly the change the camera entry warns not to make blind.

### What the close-up report actually says

"iPhone has problems with up close photos." That is the whole of it. Before
theorising, get:

- iPhone model and iOS version (close-focus behaviour differs sharply by model).
- **Which browser** — this decides which code path was even running (below).
- The `?diag=1` panel: what the camera negotiated vs the 3840x2160 asked for,
  and the reported `zoom` range.
- One hand through `?tail=1` at the distance that fails, and the same hand at
  arm's length, so the readings can be compared rather than described.

### The fork that has to be resolved first

iOS runs two completely different capture paths, and the report does not say
which one broke:

- **Safari** → live viewfinder, the dashed scan box, `captureScanArea` crops to
  the box. Moving closer is the natural way to fill that box.
- **Any other iOS browser** → `photoFallback` (`main.js:32`, `isIOS()`) sends
  them to the native photo picker. **No viewfinder, no scan box, no crop** — the
  whole image goes to the scanner. If the complaint came from Chrome on iOS, none
  of the scan-box work is involved and the cause is elsewhere.

### Why "up close" is a plausible failure mode

1. **Minimum focus distance.** iPhone rear cameras cannot focus below a few
   centimetres; newer models switch to the ultra-wide for macro automatically,
   but that switch is a camera-app behaviour and is not guaranteed under
   `getUserMedia`. Past the limit the tiles are simply blurred, and blurred pips
   are exactly what the detector under-reads (see the session log: every observed
   error under-read a half).
2. **Our constraints may pin the lens.** `CAMERA_MODES['169']` asks for
   3840x2160. A specific resolution request can select a particular camera and
   suppress automatic lens switching. `?cam=43` and `?cam=native` already exist
   in `camera-diag.js` for exactly this kind of comparison and cost a URL change,
   not a deploy.
3. **The scan box may be causing it.** Shipped 2026-07-31: the dashed box bounds
   the scan, so the instinct is to move the phone closer until the hand fills it.
   That pushes people toward the focus limit. If this report post-dates that
   change, treat the two as related until proven otherwise.

### Levers, cheapest first

- **Zoom instead of proximity.** The Samsung reported `zoom: 1 (range 1-8)`. If
  iOS exposes zoom too, zooming lets the player stand back — outside the focus
  limit — while still filling the box. Nothing in the app touches zoom today.
- **`?cam=43` / `?cam=native`** to see whether the lens changes behaviour.
- **Guidance:** the tip card already says to leave gaps; "hold about a forearm
  away" is a one-line change if distance is the cause.
- **A bigger scan box** would let a hand fill it from further back — but that
  reopens the framing decision made today, so measure before touching it.

### Watch out

- Do not fix this by shrinking capture resolution: the iPad already has a WASM
  out-of-memory issue whose lever is capture size (see the camera entry below),
  and pip accuracy at reduced capture size is unmeasured. Changing both at once
  makes either result unreadable.
- `pnpm test:accuracy` cannot see this. It feeds corpus photos through the file
  path — no camera, no focus, no lens. A close-focus regression is invisible to
  every automated test in this repo and needs the device.

---

## Make it work in Brave

**Status:** requested 2026-07-31, not built. **Not a priority** — owner's call,
re-confirmed 2026-10-17. No actual failure has been observed; the risks below are
read off this repo's code. Do not pick this up unless someone turns up with Brave
and something breaks.

**The actual symptom was not recorded** — whoever picks this up should get it
first ("scanner never loads" vs "reads garbage" vs "loses my seat" point at three
different causes below).

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
   private windows. The `tb_dev` device cookie (2026-10-17) reseats a player whose
   token is gone, but clearing ALL site data drops the cookie too, leaving name.

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

## Loose ends from the 2026-07-29 session

- **Stray production game.** The hibernation measurement created a real game
  under code `HIBTEST` on tallybone.com, holding a persisted lobby with one
  player `HoldProbe`. Harmless (a few SQLite rows) and there is no per-object
  delete on the free plan, so it was left in place.
- **`test:stress` is not in `test:all`.** Deliberate — it needs a dev server
  already running, whereas the Playwright tiers self-host. Revisit if the
  checklist should be a single command.
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

The mid-game **Leave the table** link (2026-10-17) is where a confirm belongs, and
it has one: a plain `confirm()` from a tap, which iOS Safari does show — unlike
`beforeunload`, which is the thing that never fires there.

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
