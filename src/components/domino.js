// app/src/components/domino.js
// The core Tallybone graphic — a domino face rendering any 0–12 / 0–12 count.
// Pip layouts and sizing math are ported 1:1 from
// design/design_handoff_tallybone/Domino.dc.html (not reinvented). Pips: A half
// = Sky, B half = Flare, both overridable to ink. Bone face, ink outline, hard
// divider bar, hard-offset ink shadow.

// Pip grid per count: c columns, r rows, m = row-major on/off mask (length c*r).
const LAYOUTS = {
  0:  { c: 1, r: 1, m: [0] },
  1:  { c: 1, r: 1, m: [1] },
  2:  { c: 2, r: 2, m: [1, 0, 0, 1] },
  3:  { c: 3, r: 3, m: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  4:  { c: 2, r: 2, m: [1, 1, 1, 1] },
  5:  { c: 3, r: 3, m: [1, 0, 1, 0, 1, 0, 1, 0, 1] },
  6:  { c: 2, r: 3, m: [1, 1, 1, 1, 1, 1] },
  7:  { c: 3, r: 3, m: [1, 0, 1, 1, 1, 1, 1, 0, 1] },
  8:  { c: 3, r: 3, m: [1, 1, 1, 1, 0, 1, 1, 1, 1] },
  9:  { c: 3, r: 3, m: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  10: { c: 2, r: 5, m: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  11: { c: 3, r: 4, m: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1] },
  12: { c: 4, r: 3, m: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
};

function clampCount(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) n = 0;
  return Math.max(0, Math.min(12, n));
}

// domino({ a, b, size, vertical, colorA, colorB, shadow }) -> HTMLElement.
// size = half width/height in px; a vertical domino is `size` wide and
// ~2.2·size tall. Defaults track the Sky/Flare pip tokens.
export function domino({
  a = 0, b = 0, size = 64, vertical = true,
  colorA = 'var(--pip-a)', colorB = 'var(--pip-b)', shadow,
} = {}) {
  const S = Number(size);
  a = clampCount(a);
  b = clampCount(b);
  const la = LAYOUTS[a];
  const lb = LAYOUTS[b];

  // Single dot size across BOTH halves so they read as one tile.
  const avail = S * 0.78;
  const unit = Math.min(
    avail / Math.max(la.c, lb.c),
    avail / Math.max(la.r, lb.r),
    S * 0.30,
  );
  const dot = Math.max(3, unit * 0.78);
  const gap = Math.max(1.5, unit * 0.22);
  const ring = dot * 0.16;
  const inked = dot >= 6; // skip the ink ring/highlight when pips are tiny

  const root = document.createElement('div');
  root.style.cssText = [
    'display:inline-flex',
    `flex-direction:${vertical ? 'column' : 'row'}`,
    'background:var(--bone)',
    'border:var(--ol-base) solid var(--ink)',
    `border-radius:${Math.max(6, S * 0.22)}px`,
    `box-shadow:${shadow ?? `${Math.max(2, S * 0.06)}px ${Math.max(2, S * 0.06)}px 0 var(--ink)`}`,
    'overflow:hidden',
    'flex:none',
  ].join(';');

  const buildHalf = (layout, color) => {
    const cell = document.createElement('div');
    cell.style.cssText =
      `width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center;`;
    const grid = document.createElement('div');
    grid.style.cssText =
      `display:grid;grid-template-columns:repeat(${layout.c}, ${dot}px);gap:${gap}px;`;
    for (const on of layout.m) {
      const pip = document.createElement('div');
      // Off pips are transparent same-size cells so the grid stays aligned.
      pip.style.cssText = on
        ? `width:${dot}px;height:${dot}px;border-radius:50%;background:${color};box-shadow:${
            inked
              ? `inset 0 0 0 ${ring}px var(--ink), inset ${dot * 0.18}px ${dot * 0.18}px 0 rgba(255,255,255,0.4)`
              : 'none'
          };`
        : `width:${dot}px;height:${dot}px;`;
      grid.appendChild(pip);
    }
    cell.appendChild(grid);
    return cell;
  };

  const divider = document.createElement('div');
  divider.style.cssText =
    `width:${vertical ? S : 3}px;height:${vertical ? 3 : S}px;background:var(--ink);flex:none;`;

  root.appendChild(buildHalf(la, colorA));
  root.appendChild(divider);
  root.appendChild(buildHalf(lb, colorB));
  return root;
}
