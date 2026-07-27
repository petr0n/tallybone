// app/src/screens/scanning.js — full-screen narrated scan progress (state 03).
// Returns { el, setStatus } so the orchestrator updates the status line as the
// real scan reports progress, without remounting (which would restart the
// animations).
import { domino } from '../components/domino.js';
import { html } from '../dom.js';

const MARCH = [[2, 5], [9, 9], [12, 4], [0, 7], [6, 3], [11, 1], [2, 5], [9, 9], [12, 4], [0, 7], [6, 3], [11, 1]];

export function renderScanning({ onCancel } = {}) {
  const root = html('<div class="screen scn"></div>');
  root.appendChild(html('<div class="scn__vignette"></div>'));
  root.appendChild(html('<div class="scn__line"></div>'));

  const body = html('<div class="scn__body"></div>');
  const strip = html('<div class="scn__strip"></div>');
  const march = html('<div class="scn__march"></div>');
  MARCH.forEach(([a, b], i) => {
    const cell = document.createElement('div');
    cell.style.animation = `tb-pulse 1.1s ease-in-out ${(i * 0.15).toFixed(2)}s infinite`;
    cell.appendChild(domino({ a, b, size: 36, vertical: false }));
    march.appendChild(cell);
  });
  strip.appendChild(march);
  body.appendChild(strip);
  body.appendChild(html('<div class="scn__bar"><div class="scn__bar-fill"></div></div>'));

  const titles = html(
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">' +
    '<div class="scn__title">COUNTING PIPS…</div>' +
    '<div class="scn__status">Looking for bones…</div></div>');
  body.appendChild(titles);
  root.appendChild(body);

  const foot = html('<div class="scn__foot"></div>');
  const cancel = html('<button type="button" class="tb-btn--ghost-bone tb-press">Cancel</button>');
  if (onCancel) cancel.addEventListener('click', onCancel);
  foot.appendChild(cancel);
  root.appendChild(foot);

  const statusEl = titles.querySelector('.scn__status');
  return { el: root, setStatus: (t) => { if (t) statusEl.textContent = t; } };
}
