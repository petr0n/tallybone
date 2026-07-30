# Home Screen Entrance Animation — Design Spec

**Date:** 2026-07-30
**Status:** Approved design → ready for implementation plan
**Scope:** Home screen only (`renderHome`). No other screen changes.
**Character chosen:** Springy (option C of three previewed side by side at true proportions)
**Frequency chosen:** Once per app session

---

## 1. Goal

Give the Home screen an entrance: the logo bounces in, then the buttons slide up
with a little bounce behind it. Home is the first thing anyone sees and the only
screen in the app that is pure brand rather than pure function — it is where a
generous beat belongs.

This is polish, not a rule change. Nothing about scanning, scoring, or the
multiplayer protocol is touched.

---

## 2. What is actually on the screen

`renderHome` ([`src/screens/game-setup.js`](../../../src/screens/game-setup.js))
builds five things inside a `.screen--light` root:

1. `hero` — a flex-filling `div` whose `background-image` is
   `src/assets/home-hero.png`, sized `contain`.
2. `Start a game` — `.tb-btn--primary`.
3. `Join a game` — `.tb-btn--secondary`.
4. The `OR` rule.
5. The quiet row: `Just count my tiles` and `How to play`.

**The logo is not a separate element.** `home-hero.png` is one flat 1.2MB poster
with the two tiles, the wordmark, the overline *and its own concrete texture*
baked in. There is no transparent logo layer to move on its own, so "the logo
bounces" means the whole poster bounces. Two consequences, both accepted
deliberately after seeing them animate:

- When the poster scales, its baked texture slides against the `app-bg.png`
  texture of the screen behind it. At an 8% overshoot this is visible if you
  look for it. Accepted: it lasts ~600ms and happens once per session.
- Producing a transparent mark + separate wordmark to animate independently is
  out of scope. (`src/brand.js` already has a transparent mark and a composed
  `brandLockup`, but swapping Home's art for it is a visual redesign, not an
  animation task.)

---

## 3. The motion

Every value below was chosen by watching all three options loop side by side at
true phone proportions with the real poster and real button styles.

| Element | From | Overshoot path | Duration | Delay |
|---|---|---|---|---|
| Hero poster | `scale(.72) translateY(28px)`, opacity 0 | 45% → `scale(1.08) translateY(-14px)`; 68% → `scale(.97) translateY(4px)`; 84% → `scale(1.02) translateY(-2px)` | 620ms | 0 |
| `Start a game` | `translateY(34px)`, opacity 0 | 55% → `translateY(-9px)`; 78% → `translateY(3px)` | 480ms | 200ms |
| `Join a game` | same | same | 480ms | 290ms |
| `OR` rule | same | same | 480ms | 380ms |
| Quiet row | same | same | 480ms | 470ms |

- Easing is `--ease-out` (`cubic-bezier(.23,1,.32,1)`), already in
  [`src/tokens.css`](../../../src/tokens.css). The bounce comes from keyframe
  overshoot, not from a new easing curve — no `back-out` token is added.
- Only `transform` and `opacity` animate, so nothing hits layout or paint.
- Opacity reaches 1 at the first overshoot keyframe and stays there; only the
  transform wobbles. Fading in sync with the wobble reads as a flicker.
- Total sequence: ~950ms.
- The `OR` rule and the quiet row ride the same ladder as the buttons. Animating
  only the two buttons leaves the bottom third of the screen looking
  half-finished — that was visible in the preview.

### Stagger

90ms between rows, not the existing `--stagger` (40ms). At this travel distance
and duration, 40ms reads as "everything at once".

---

## 4. When it plays

**Once per app session**, on the first Home the player sees.

Home is not only the launch screen: [`src/main.js`](../../../src/main.js) re-mounts
it via `navReset(showHome)` when a player leaves a game, and `navBack` re-mounts
it on every return from Rules, Create, Join, or a solo scan. Replaying a 950ms
entrance on every back-tap is the classic thing people disable.

The gate is `isNew('home', 'entrance')` from
[`src/motion.js`](../../../src/motion.js) — the same identity bookkeeping the
roster rows and Game Over already use. No new mechanism, and no new state to
persist: a full page reload is a new session and animates again, which is
correct.

---

## 5. Waiting for the poster

`home-hero.png` is a 1.2MB CSS background; nothing in the current code waits for
it to load. Playing the entrance before it decodes bounces an empty box and pops
the art in afterwards — worse than no animation at all.

**Rule:** the sequence waits on `new Image()` with `src = heroUrl` followed by
`.decode()`, capped at **700ms**. Past the cap, or if `decode()` rejects, the
screen renders settled with no entrance at all — never a half-played one.

`heroUrl` is already imported by `game-setup.js`, so the preloader points at the
same hashed asset URL the CSS background uses and hits the same cache entry.
After the first load it resolves within a frame or two.

**Error handling:** `decode()` rejecting (decode failure, or the image being
detached) is handled by the same path as the timeout — settle, don't animate. A
broken poster must not leave the buttons invisible, so the class that hides
elements pre-animation is only ever applied together with the animation itself.

---

## 6. Reduced motion

Two independent guards, because this one fails silently for the people it
affects:

1. `reducedMotion()` in `homeEntrance()` returns early — no classes applied.
2. A `@media (prefers-reduced-motion: reduce)` block in `screens.css` sets
   `animation: none` and `opacity: 1` on the entrance classes, so they are inert
   even if applied some other way.

---

## 7. Where the code goes

Four files, each with one responsibility.

**`src/screens.css`** — the `@keyframes` and the entrance classes. Keyframes are
styling and belong in CSS, next to the other screen-level rules. Two keyframe
sets (`home-logo`, `home-row`), and one explicit class per participating element
carrying its own `animation-delay` — not `nth-of-type`, which silently
re-targets if anyone adds a row to the footer.

**`src/motion.js`** — one new export:

```
homeEntrance(root) → void
```

Bails on `reducedMotion()`; bails unless `isNew('home', 'entrance')`; awaits the
poster (§5); adds the entrance class to `root`, which switches on the CSS for
all five children at once. The decision half is factored as a pure
`shouldPlayHomeEntrance()` so it can be asserted in Node without a DOM.

It reuses `reducedMotion()` and `isNew()` rather than re-implementing either —
one responsibility, one place.

**`src/screens/game-setup.js`** — `renderHome()` tags its five rows with the
entrance classes and calls `homeEntrance(root)` before returning. No behavior
change to any callback.

**`src/tokens.css`** — new tokens for the two durations and the stagger, beside
the existing motion tokens.

The existing comment in that block states durations stay under 300ms "apart from
`--dur-reveal`". A 620ms logo breaks that claim, so **the comment is corrected in
the same change**: Home's once-a-session entrance is the second and last
exception, for the same reason Game Over is the first — you see it once, and it
is a brand moment rather than a response to a tap.

---

## 8. Testing

Follows the split the motion work already established.

**`src/motion.test.js`** (plain `node src/motion.test.js`, no DOM):
- `shouldPlayHomeEntrance()` is true the first time and false on every
  subsequent call — a re-mounted Home does not replay.
- It is false under reduced motion, first call included.
- `resetGroup('home')` restores it, so the helper is testable in isolation.

**`tests/e2e/motion.spec.js`** (Playwright, asserts on classes rather than
racing a 950ms animation):
- With `reducedMotion: 'reduce'`, the hero carries no entrance class and both
  buttons are visible and clickable immediately.
- On a fresh page load the entrance class is present on first Home.
- After navigating to Rules and back, Home renders without it — the once-per-
  session promise, which is the part most likely to regress.
- Both buttons end up visible and clickable in every case, including when the
  poster never loads (route the PNG to abort) — the settle-don't-animate
  fallback of §5.

`pnpm test` (vitest) does not collect either file: `vitest.config.js` scopes
`include` to `server/**/*.test.js` plus `src/components/domino.test.js`. That is
deliberate and unchanged here — `src/motion.test.js` runs under `pnpm test:node`
and the spec under `pnpm test:e2e`.

---

## 9. Out of scope

- Any other screen. The rest of the app's motion budget was settled by the
  animation audit and is not reopened.
- A transparent logo asset or a recomposed Home lockup (§2).
- Any change to `--dur-bridge`, `--dur-enter`, `--dur-reveal`, or press feedback.
