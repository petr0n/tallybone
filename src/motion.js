// app/src/motion.js — the few motion primitives this app needs.
//
// One constraint shapes all of it: every live screen re-renders in full on every
// server snapshot (main.js mount() -> root.replaceChildren). An entrance keyed to
// insertion would therefore replay on EVERY element each time anyone's state
// changes — six roster rows flashing because one player turned in. So entrances
// here are keyed to IDENTITY, not to insertion: a thing animates the first time
// it is seen and never again.

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

// Remembers which identities have already made their entrance, per group. The
// caller owns the group name so unrelated screens can't collide.
const seen = new Map();

const groupOf = (group) => {
  if (!seen.has(group)) seen.set(group, new Set());
  return seen.get(group);
};

// True the first time this id is offered in this group, false forever after.
export function isNew(group, id) {
  const g = groupOf(group);
  const fresh = !g.has(id);
  g.add(id);
  return fresh;
}

// Forget a group — call when its context ends (leaving a game, a fresh scan) so
// the next one animates again instead of being silently suppressed.
export function resetGroup(group) { seen.delete(group); }

/**
 * Play an entrance on `el`. Transform + opacity only, so it stays off the
 * layout/paint path.
 *
 * @param {Element} el
 * @param {{from?: string, duration?: string, delay?: number, ease?: string}} opts
 *   `from` is the starting transform (the settled state is always none).
 */
export function enter(el, { from = 'translateY(8px)', duration = 'var(--dur-enter)', delay = 0, ease = 'var(--ease-out)' } = {}) {
  if (reducedMotion()) return el;   // reduced motion: appear, don't move
  el.style.opacity = '0';
  el.style.transform = from;
  el.style.willChange = 'transform, opacity';
  // Two frames: one for the browser to accept the start state, one to leave it.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = `opacity ${duration} ${ease} ${delay}ms, transform ${duration} ${ease} ${delay}ms`;
    el.style.opacity = '';
    el.style.transform = '';
  }));
  const done = () => { el.style.willChange = ''; el.style.transition = ''; el.removeEventListener('transitionend', done); };
  el.addEventListener('transitionend', done);
  return el;
}

// Entrance, but only the first time this identity appears in this group.
export function enterIfNew(el, group, id, opts) {
  if (isNew(group, id)) enter(el, opts);
  return el;
}

/**
 * May the Home screen play its entrance right now?
 *
 * Home is not only the launch screen — main.js re-mounts it on leaving a game
 * and on every back out of Rules, Create, Join or a scan — so the ~950ms
 * sequence is spent on the first Home of a session and never again.
 *
 * The reduced-motion refusal comes FIRST so it does not spend the identity:
 * someone who turns the setting off mid-session should still get their
 * entrance, not silence.
 */
export function shouldPlayHomeEntrance() {
  if (reducedMotion()) return false;
  return isNew('home', 'entrance');
}

// How long the entrance will wait for the hero poster before giving up on it.
const HERO_DECODE_CAP = 700;

/**
 * Arm and play the Home entrance on `root` (the screen element; the CSS drives
 * its `.home-enter__*` children).
 *
 * The hero is a 1.2MB background image that nothing currently waits for, so the
 * sequence holds the rows hidden until it has decoded. Bouncing an empty box and
 * popping the art in afterwards looks broken — worse than no animation.
 *
 * Every exit reveals: decoded in time -> animate; too slow, failed, or no
 * `decode()` -> settle instantly. There is no path that leaves a row hidden.
 *
 * @param {Element} root
 * @param {string} heroSrc  the same hashed asset URL the CSS background uses,
 *                          so this hits the one cache entry rather than a second
 *                          download.
 */
export function homeEntrance(root, heroSrc) {
  if (!shouldPlayHomeEntrance()) return root;
  root.classList.add('home-enter--armed');

  let settled = false;
  const reveal = (animate) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    root.classList.remove('home-enter--armed');
    if (animate) root.classList.add('home-enter');
  };
  const timer = setTimeout(() => reveal(false), HERO_DECODE_CAP);

  const img = new Image();
  img.src = heroSrc;
  const decoded = img.decode ? img.decode() : Promise.reject(new Error('no decode()'));
  decoded.then(() => reveal(true), () => reveal(false));
  return root;
}

/**
 * FLIP a set of rows that are about to be re-ordered by a full re-render.
 *
 * Standings re-sort under the player's eyes as scores land, and with nothing
 * bridging it you cannot tell whether a row moved or you misread it. Usage:
 * take a snapshot BEFORE the re-render, then call play() with the new nodes.
 *
 * @param {Map<string, DOMRect>} before  id -> rect, from measure()
 * @param {Map<string, Element>} after   id -> the freshly rendered node
 */
export function measure(nodes) {
  const m = new Map();
  nodes.forEach((el, id) => { if (el) m.set(id, el.getBoundingClientRect()); });
  return m;
}

export function play(before, after, { duration = 'var(--dur-enter)', ease = 'var(--ease-out)' } = {}) {
  if (reducedMotion() || !before || !before.size) return;
  after.forEach((el, id) => {
    const was = before.get(id);
    if (!was || !el) return;                       // new rows are not FLIPped
    const dy = was.top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;                  // it did not actually move
    el.style.transform = `translateY(${dy}px)`;
    el.style.willChange = 'transform';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `transform ${duration} ${ease}`;
      el.style.transform = '';
    }));
    const done = () => { el.style.willChange = ''; el.style.transition = ''; el.removeEventListener('transitionend', done); };
    el.addEventListener('transitionend', done);
  });
}
