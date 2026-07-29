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

  it('hits the literal 10px pip and 6px/3px padding at the reference size', () => {
    const half = face(12, 64);
    expect(diameter(half)).toBe(10);
    expect(half.style.padding).toBe('6px 3px');
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
