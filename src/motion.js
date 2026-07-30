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
