// app/src/gallery.js
// DEV-ONLY visual verification page for the Tallybone foundation (Tasks 1–3).
// Not part of the product flow — open /gallery.html in dev to eyeball the
// design tokens, the Domino element, and every shared primitive.
import './style.css';
import { domino } from './components/domino.js';
import { button, statusChip, banner, stepper, header, bottomBar } from './components/ui.js';

const app = document.querySelector('#app');
app.style.padding = '0 0 40px';

function section(title) {
  const s = document.createElement('div');
  s.style.cssText = 'padding:20px;display:flex;flex-direction:column;gap:14px;';
  const h = document.createElement('div');
  h.style.cssText = 'font-family:var(--font-display);font-size:22px;letter-spacing:0.03em;';
  h.textContent = title;
  s.appendChild(h);
  app.appendChild(s);
  return s;
}
function row(parent, gap = 14) {
  const r = document.createElement('div');
  r.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:${gap}px;`;
  parent.appendChild(r);
  return r;
}
function stack(parent, gap = 12) {
  const c = document.createElement('div');
  c.style.cssText = `display:flex;flex-direction:column;gap:${gap}px;`;
  parent.appendChild(c);
  return c;
}
function caption(text) {
  const d = document.createElement('div');
  d.style.cssText = 'font-family:var(--font-mono);font-size:11px;letter-spacing:0.12em;color:var(--secondary-light-1);';
  d.textContent = text;
  return d;
}

// --- Domino 0–12 doubles (the starting-double walk) ---
const doubles = section('The Bone — 0–12');
const dgrid = document.createElement('div');
dgrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(60px,1fr));gap:16px 10px;justify-items:center;';
for (let n = 0; n <= 12; n++) {
  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';
  cell.appendChild(domino({ a: n, b: n, size: 44 }));
  cell.appendChild(caption(`${n}/${n}`));
  dgrid.appendChild(cell);
}
doubles.appendChild(dgrid);

const orient = section('Orientation & ink');
const or = row(orient, 26);
[['9 / 4 vertical', domino({ a: 9, b: 4, size: 56 })],
 ['12 / 6 horizontal', domino({ a: 12, b: 6, size: 46, vertical: false })],
 ['ink (decor)', domino({ a: 12, b: 6, size: 46, colorA: 'var(--ink)', colorB: 'var(--ink)' })],
].forEach(([label, node]) => {
  const c = document.createElement('div');
  c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';
  c.appendChild(node); c.appendChild(caption(label)); or.appendChild(c);
});

// --- Buttons ---
const btns = section('Buttons');
stack(btns).append(
  button({ label: "Count 'em up", variant: 'primary' }),
  button({ label: 'Enter by hand', variant: 'secondary' }),
  button({ label: 'Fix 2 twins first', variant: 'blocked', icon: '!' }),
  button({ label: 'Submit 47 points', variant: 'primary', disabled: true }),
  button({ label: 'Not a tile', variant: 'quiet' }),
);

// --- Status chips ---
const chips = section('Status chips');
row(chips).append(statusChip('ok'), statusChip('check'), statusChip('error'));

// --- Banners ---
const banners = section('Banners');
stack(banners).append(
  banner('info', "Leave a small gap between tiles — don't stack 'em or let 'em touch."),
  banner('check', '<strong>2 tiles need a look.</strong> Glare on the top edge — nudge the phone.'),
  banner('error', '<strong>Twins found.</strong> Two tiles read 3 / 3 — fix one before you submit.'),
  banner('success', '<strong>7 bones, all clean.</strong> Nothing to fix.'),
);

// --- Steppers (live) ---
const steppers = section('Steppers (tap to try)');
const sr = row(steppers, 18);
const a = stepper({ value: 9, half: 'a' });
const sep = document.createElement('div');
sep.style.cssText = 'font-family:var(--font-display);font-size:24px;color:var(--disabled-text);';
sep.textContent = '/';
const b = stepper({ value: 4, half: 'b' });
sr.append(a, sep, b);

// --- Header + bottom bar ---
const chrome = section('Header & bottom bar');
chrome.appendChild(header({ variant: 'dark', overline: 'STEP 2 OF 2', title: 'REVIEW YOUR BONES', onBack: () => {}, trailing: { label: '?' } }));
chrome.appendChild(header({ variant: 'light', title: 'SCAN YOUR TILES', onBack: () => {} }));
chrome.appendChild(bottomBar({
  totalLabel: 'YOUR ROUND TOTAL', total: 47,
  button: button({ label: 'Submit 47 points', variant: 'primary' }),
}));
chrome.appendChild(bottomBar({
  totalLabel: '2 TWINS TO FIX', total: 47, blocked: true,
  button: button({ label: 'Fix 2 twins first', variant: 'blocked', icon: '!' }),
}));
