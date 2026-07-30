// app/src/components/domino.test.js
// Guards the pip layout and sizing rules documented in domino.js.
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { domino } from './domino.js';

const halves = (el) => [...el.children].filter((c) => c.style.padding);
// Walk half > grid > column > pip explicitly. A descendant selector can't do
// this: `querySelectorAll('div > div > div')` matches the column wrappers too,
// because the combinators are free to reach ancestors above the scope element.
const columns = (half) => [...half.firstChild.children];
const pips = (half) => columns(half).flatMap((col) => [...col.children]);
const diameter = (half) => parseFloat(pips(half)[0].style.width);
const colSlots = (half) => columns(half)
  .map((col) => [...col.children].map((p) => Number(p.style.gridRow)));

const face = (n, size = 64) => halves(domino({ a: n, b: n, size }))[0];

describe('pip layouts', () => {
  it('renders 10 as 4/2/4 with the pair on the outer rows', () => {
    expect(colSlots(face(10))).toEqual([[1, 3, 5, 7], [1, 7], [1, 3, 5, 7]]);
  });

  it('spaces 11 evenly as 4/3/4', () => {
    expect(colSlots(face(11))).toEqual([[1, 3, 5, 7], [1, 4, 7], [1, 3, 5, 7]]);
  });

  it('puts 8 middle pair on the outer rows', () => {
    expect(colSlots(face(8))).toEqual([[1, 2, 3], [1, 3], [1, 2, 3]]);
  });

  it('shares one row lattice across 10, 11 and 12', () => {
    for (const n of [10, 11, 12]) {
      expect(colSlots(face(n))[0]).toEqual([1, 3, 5, 7]);
    }
  });

  it('uses one pip size for every face at a given tile size', () => {
    const sizes = new Set();
    for (let n = 1; n <= 12; n++) sizes.add(diameter(face(n, 52)).toFixed(3));
    expect(sizes.size).toBe(1);
  });

  it('hits the literal 6px/3px padding at the reference size', () => {
    const half = face(12, 64);
    expect(half.style.padding).toBe('6px 3px');
  });

  // Pip size is RELATIVE to the tile, not a fixed diameter. A fixed 10px cap was
  // tried and reverted: it left a 220px half on the Round screen wearing the same
  // 10px pips as a thumbnail, adrift in empty bone.
  it('grows pips with the tile, with no upper cap', () => {
    const sizes = [24, 32, 48, 64, 96, 128, 192, 256];
    const dots = sizes.map((s) => diameter(face(11, s)));
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i], `pip must grow from ${sizes[i - 1]}px to ${sizes[i]}px`)
        .toBeGreaterThan(dots[i - 1]);
    }
    // And it must stay a real fraction of the tile at every size — the check a
    // constant cap fails, since dot/size collapses as the tile grows.
    sizes.forEach((s, i) => {
      expect(dots[i] / s, `pip is a sane fraction of a ${s}px half`).toBeGreaterThan(0.15);
    });
  });

  it('leaves ~22% of the pitch as bone between pips', () => {
    const half = face(11, 128);
    const rows = Number(half.firstChild.style.gridTemplateRows.match(/repeat\((\d+)/)[1]);
    const innerH = 128 - parseFloat(half.style.paddingTop) * 2;
    const pitch = (innerH * 2) / rows;          // adjacent 11-face slots are 2 rows apart
    expect(diameter(half) / pitch).toBeCloseTo(0.78, 2);
  });

  it('never lets pips touch, down to thumbnail sizes', () => {
    for (const size of [18, 22, 28, 36, 44, 52]) {
      const half = face(11, size);
      const dot = diameter(half);
      const rows = Number(half.firstChild.style.gridTemplateRows.match(/repeat\((\d+)/)[1]);
      const innerH = size - parseFloat(half.style.paddingTop) * 2;
      expect(dot).toBeLessThanOrEqual((innerH * 2) / rows);
    }
  });

  it('clamps counts to the double-12 set', () => {
    expect(pips(face(0)).length).toBe(0);
    expect(pips(halves(domino({ a: 99, b: -3, size: 64 }))[0]).length).toBe(12);
  });
});
