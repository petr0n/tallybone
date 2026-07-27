// app/src/brand.js — Tallybone brand marks. The real screen-printed T-domino
// logo (design/tallybone-logo-*.png) as an <img>, plus a full lockup (mark +
// TALLYBONE wordmark in Anton + overline) for splash/branded moments. The PNG
// is transparent and reads on both light and ink screens.
import { html } from './dom.js';
import markSm from './assets/brand/tallybone-mark-sm.png';
import markLg from './assets/brand/tallybone-mark-lg.png';

// The mark's natural aspect (w/h ≈ 0.82); width follows height automatically.
export function tallyMark(height = 38) {
  const img = document.createElement('img');
  img.src = height > 90 ? markLg : markSm;
  img.alt = 'Tallybone';
  img.style.cssText = `height:${height}px;width:auto;display:block;flex:none;`;
  return img;
}

// Full vertical lockup: mark, TALLYBONE wordmark (Anton), overline. `onDark`
// picks bone vs ink text so it works on either ground.
export function brandLockup({ markHeight = 132, onDark = true } = {}) {
  const wrap = html('<div style="display:flex;flex-direction:column;align-items:center;gap:12px;"></div>');
  wrap.appendChild(tallyMark(markHeight));
  const wordColor = onDark ? 'var(--bone)' : 'var(--ink)';
  wrap.appendChild(html(
    `<div style="font-family:var(--font-display);font-size:52px;line-height:0.9;letter-spacing:0.02em;color:${wordColor};">TALLYBONE</div>`));
  wrap.appendChild(html(
    '<div style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.22em;color:var(--sky);">DOMINO TALLY GAME</div>'));
  return wrap;
}
