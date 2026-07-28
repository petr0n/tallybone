// app/src/components/qr.js — a real, scannable QR rendered ON DEVICE.
//
// Wraps the vendored MIT encoder (src/vendor/qrcode.js). Nothing leaves the
// phone: no external image service, so the join code stays private and the
// Create/Lobby screens still show a QR with no network.
//
// Drawn as one SVG <path> (a rect subpath per dark module) rather than one node
// per module — a v3 code is 29x29 = 841 modules, and 841 DOM nodes per render
// is real jank on a phone. SVG (not canvas) keeps it crisp at any DPR with no
// devicePixelRatio bookkeeping.
import qrcode from '../vendor/qrcode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Error correction 'M' (~15% recovery) — the usual default. 'L' would fit more
// data per version, but these payloads are short URLs and a phone scanning a
// screen at an angle benefits from the extra margin.
const EC_LEVEL = 'M';

// Quiet zone, in modules. The QR spec requires 4; without it scanners that hunt
// for the finder patterns against a busy background frequently miss.
const QUIET = 4;

/**
 * Encode `text` and lay it out in module units. Pure — no DOM — so the
 * geometry that decides whether a code actually scans is unit-testable
 * (src/components/qr.test.js), the same split as server/reducer.js.
 *
 * @param {string} text payload to encode
 * @returns {{ d: string, span: number, count: number }}
 *   `d` is an SVG path (one 1x1 subpath per dark module, quiet zone applied),
 *   `count` the modules per side, `span` that plus both quiet zones.
 */
export function qrPath(text) {
  // typeNumber 0 = pick the smallest version that fits (vendor/qrcode.js:423).
  const code = qrcode(0, EC_LEVEL);
  code.addData(String(text));
  code.make();

  const count = code.getModuleCount();
  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (code.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  return { d, count, span: count + QUIET * 2 };
}

/**
 * Render `text` as a QR code.
 *
 * @param {string} text   payload to encode (e.g. `${JOIN_URL_BASE}/?j=CODE`)
 * @param {number} size   rendered edge length in CSS pixels
 * @param {string} [label] accessible name; defaults to the payload
 * @returns {SVGSVGElement} a square, self-contained node ready to append
 */
export function qr(text, size, label) {
  const { d, span } = qrPath(text);

  const svg = document.createElementNS(SVG_NS, 'svg');
  // viewBox in module units + a 1-module unit path: the browser scales it, so
  // the same node is crisp whether it's the 66px lobby chip or a 112px hero.
  svg.setAttribute('viewBox', `0 0 ${span} ${span}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || String(text));
  svg.style.cssText = `flex:none;border-radius:8px;background:var(--bone);display:block;`;

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('shape-rendering', 'crispEdges');
  path.style.fill = 'var(--ink)';
  svg.appendChild(path);

  return svg;
}
