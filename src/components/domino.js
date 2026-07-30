// app/src/components/domino.js
// The core Tallybone graphic — a domino face rendering any 0–12 / 0–12 count.
// Pip layouts and sizing math come from the design handoff; the rules are the
// comments below, and domino.test.js pins every one of them. Pips: A half =
// Sky, B half = Flare, both overridable to ink. Bone face, ink outline, hard
// divider bar, hard-offset ink shadow.

// Pips per column, left to right. A short column spans the FULL height of the
// tallest one — first pip on the top row, last on the bottom, evenly spaced
// between (8 = 3/2/3 with the pair on the outer rows; 11 = 4/3/4 staggered).
const COLS = {
  0: [], 1: [1], 4: [2, 2], 6: [3, 3], 7: [3, 1, 3], 8: [3, 2, 3],
  9: [3, 3, 3], 10: [4, 2, 4], 11: [4, 3, 4], 12: [4, 4, 4],
};

// Counts that read as diagonals / corner sets: explicit row slots per column,
// as fractions of the column height.
const SPECIAL = {
  2: [[0], [1]],
  3: [[0], [0.5], [1]],
  5: [[0, 1], [0.5], [0, 1]],
};

// Faces that must share one row lattice so their pip spacing matches from face
// to face: 10, 11 and 12 all ride 11's 7-row lattice.
const LATTICE = { 10: 6, 11: 6, 12: 6 };

// Pip diameter is RELATIVE: a fraction of the lattice pitch (the centre-to-centre
// spacing), so pips grow with the tile and a big tile reads as a big domino.
// 0.78 leaves 22% of the pitch as bone between pips — the original ratio, before
// a fixed 10px cap was tried. The cap made every tile above ~64px wear the same
// tiny pips: a 220px half on the Round screen showed 10px dots adrift in space.
const PIP_RATIO = 0.78;
// Absolute floor on the gap, for thumbnails where 22% of a small pitch is
// sub-pixel. Only bites below a ~5.5px pitch; the ratio governs everywhere else.
const MIN_CLEARANCE = 1.2;

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

function clampCount(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) n = 0;
  return Math.max(0, Math.min(12, n));
}

// Build a row lattice fine enough that every column's pips land on whole rows.
// -> { rows, denom, cols: [{ gc, slots: [1-based row] }] }
function layout(n) {
  const raw = SPECIAL[n] || (COLS[n] || []).map((k) => (
    k === 1 ? [0.5] : Array.from({ length: k }, (_, j) => j / (k - 1))
  ));
  // Slots are always j/(k-1) or 0.5, so the lcm of the (k-1) values (and 2, for
  // a lone centered pip) gives a lattice every column lands on exactly.
  let denom = 1;
  for (const col of raw) denom = lcm(denom, col.length === 1 ? 2 : col.length - 1);
  if (LATTICE[n] && LATTICE[n] % denom === 0) denom = LATTICE[n];
  return {
    rows: denom + 1,
    denom,
    cols: raw.map((col, i) => ({
      gc: i + 1,
      slots: col.map((f) => Math.round(f * denom) + 1),
    })),
  };
}

// Tightest pip-to-pip distance a layout allows inside the padded face.
function pitch(L, innerW, innerH) {
  const cols = Math.max(1, L.cols.length);
  const k = Math.max(1, ...L.cols.map((c) => c.slots.length));
  const vert = k > 1 ? (innerH * (L.denom / (k - 1))) / L.rows : innerH;
  return Math.min(innerW / cols, vert);
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
  const la = layout(a);
  const lb = layout(b);

  // Literal 6px / 3px padding from the 64px reference half up; below that it is
  // capped proportionally so a small thumbnail isn't mostly padding.
  const padX = Math.min(3, S * 0.047);
  const padY = Math.min(6, S * 0.094);
  const innerW = S - padX * 2;
  const innerH = S - padY * 2;

  // One pip size for every face at a given tile size — measured off the densest
  // face in the set (11), never off the face being drawn, so a 5/5 and an 11/11
  // side by side match.
  const p = pitch(layout(11), innerW, innerH);
  const dot = Math.max(2, Math.min(p * PIP_RATIO, p - MIN_CLEARANCE));
  const ring = dot * 0.16;
  const inked = dot >= 6; // skip the ink ring/highlight when pips are tiny
  const pipShadow = inked
    ? `inset 0 0 0 ${ring}px var(--ink), inset ${dot * 0.18}px ${dot * 0.18}px 0 rgba(255,255,255,0.4)`
    : 'none';

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

  // Pips turn with the tile. The lattice is built once, 3 columns by 4 pip rows
  // (see CLAUDE.md's pip-grid facts), which is how a face reads on a VERTICAL
  // tile. Lay a tile on its side and a real domino's pips go with it — 10, 11
  // and 12 then read 4 across by 3 down, "top/bottom rows full at 4 each". They
  // used to stay 3x4 whichever way the tile was turned.
  //
  // Rotating the rendered lattice rather than transposing the data keeps every
  // rule in layout()/pitch() untouched: same lattice, same pip size, same
  // cross-face consistency, just turned. The half is square, so the rotated box
  // lands back inside it — and the 6px/3px insets swap over on their own, which
  // is what the rotated design wants anyway.
  const turn = !vertical;

  const buildHalf = (L, color) => {
    const cell = document.createElement('div');
    cell.style.cssText =
      `width:${S}px;height:${S}px;padding:${padY}px ${padX}px;box-sizing:border-box;flex:none;position:relative;`;

    // minmax(0, 1fr) is required: plain 1fr is minmax(auto, 1fr), so rows honor
    // the auto minimum of the pip inside them — on the 7-row lattice the filled
    // rows would inflate and the empty ones collapse, unevenly spacing face 11.
    // Centred absolutely at the lattice's own size so the rotation below can
    // overflow the layout box without being clipped or shrunk.
    const grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid',
      'position:absolute',
      'left:50%',
      'top:50%',
      `transform:translate(-50%, -50%)${turn ? ' rotate(90deg)' : ''}`,
      `width:${innerW}px`,
      `height:${innerH}px`,
      `grid-template-columns:repeat(${Math.max(1, L.cols.length)}, minmax(0, 1fr))`,
      `grid-template-rows:repeat(${L.rows}, minmax(0, 1fr))`,
    ].join(';');

    // Each column is a subgrid spanning the full row track, so short columns
    // still reach the top and bottom rows.
    for (const col of L.cols) {
      const colEl = document.createElement('div');
      colEl.style.cssText =
        `grid-column:${col.gc};grid-row:1 / -1;display:grid;grid-template-rows:subgrid;`;
      for (const slot of col.slots) {
        const pip = document.createElement('div');
        pip.style.cssText = [
          `grid-row:${slot}`,
          'place-self:center',
          `width:${dot}px`,
          `height:${dot}px`,
          'border-radius:50%',
          `background:${color}`,
          `box-shadow:${pipShadow}`,
          // Counter-turn so the inset highlight keeps lighting from the same
          // corner on every tile; a circle is otherwise unchanged by this.
          ...(turn ? ['transform:rotate(-90deg)'] : []),
        ].join(';');
        colEl.appendChild(pip);
      }
      grid.appendChild(colEl);
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
