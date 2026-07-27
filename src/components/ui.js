// app/src/components/ui.js
// Shared Tallybone UI primitives as DOM-building factories. Styles live in
// components.css; specs from design/design_handoff_tallybone/Tallybone
// Components.dc.html. Each factory returns an HTMLElement.
import './components.css';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

// button({ label, variant, onClick, disabled, icon })
// variant: 'primary' | 'secondary' | 'quiet' | 'blocked'. 'blocked' is the
// Flare "can't submit yet" style — styled un-submittable, not DOM-disabled, so
// a tap can still react (e.g. scroll to the offending tile).
export function button({ label, variant = 'primary', onClick, disabled = false, icon } = {}) {
  const btn = el('button', `tb-btn tb-btn--${variant} tb-press`);
  btn.type = 'button';
  if (icon) btn.appendChild(el('span', 'tb-btn__icon', icon));
  btn.appendChild(document.createTextNode(label));
  if (disabled) btn.disabled = true;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

const CHIP = {
  ok:    { cls: 'tb-chip--ok',    icon: '✓', label: 'Looks good' },
  check: { cls: 'tb-chip--check', icon: '?', label: 'Please check' },
  error: { cls: 'tb-chip--error', icon: '!', label: "Twins — one's wrong" },
};

// statusChip(variant, labelOverride?) -> pill with icon badge + word.
export function statusChip(variant, label) {
  const spec = CHIP[variant] || CHIP.ok;
  const chip = el('div', `tb-chip ${spec.cls}`);
  chip.appendChild(el('div', 'tb-chip__badge', spec.icon));
  chip.appendChild(el('div', 'tb-chip__label', label ?? spec.label));
  return chip;
}

const BANNER_ICON = { info: 'i', check: '?', error: '!', success: '✓' };

// banner(variant, content) — content may be a Node or a trusted HTML string
// (callers pass static copy with <strong> emphasis, never user input).
export function banner(variant, content) {
  const b = el('div', `tb-banner tb-banner--${variant}`);
  b.appendChild(el('div', 'tb-banner__badge', BANNER_ICON[variant] ?? 'i'));
  const body = el('div', 'tb-banner__body');
  if (content instanceof Node) body.appendChild(content);
  else body.innerHTML = content;
  b.appendChild(body);
  return b;
}

// stepper({ value, half, onChange, min, max }) -> control with a .setValue(n)
// method. half 'a'|'b' picks the numeral color. Hard-clamps [min,max]=[0,12].
export function stepper({ value = 0, half = 'a', onChange, min = 0, max = 12 } = {}) {
  const clamp = (n) => Math.max(min, Math.min(max, Math.round(Number(n) || 0)));
  let v = clamp(value);

  const wrap = el('div', 'tb-stepper');
  const minus = el('div', 'tb-stepper__btn tb-stepper__btn--minus', '–');
  const val = el('div', `tb-stepper__val tb-stepper__val--${half}`, String(v));
  const plus = el('div', 'tb-stepper__btn tb-stepper__btn--plus', '+');

  function refresh() {
    val.textContent = String(v);
    minus.classList.toggle('tb-stepper__btn--limit', v <= min);
    plus.classList.toggle('tb-stepper__btn--limit', v >= max);
  }
  function bump(d) {
    const nv = clamp(v + d);
    if (nv !== v) { v = nv; refresh(); onChange && onChange(v); }
  }
  minus.addEventListener('click', () => bump(-1));
  plus.addEventListener('click', () => bump(1));
  wrap.append(minus, val, plus);
  refresh();

  // External update (e.g. a future pip-pad) without firing onChange.
  wrap.setValue = (n) => { v = clamp(n); refresh(); };
  return wrap;
}

// header({ variant, overline, title, onBack, trailing:{label,onClick} })
export function header({ variant = 'light', overline, title, onBack, trailing } = {}) {
  const h = el('div', `tb-header tb-header--${variant}`);
  if (onBack) {
    const back = el('div', 'tb-header__icon tb-header__chevron tb-press', '‹');
    back.addEventListener('click', onBack);
    h.appendChild(back);
  }
  const titles = el('div', 'tb-header__titles');
  if (overline) titles.appendChild(el('div', 'tb-header__overline', overline));
  titles.appendChild(el('div', 'tb-header__title', title));
  h.appendChild(titles);
  if (trailing) {
    const t = el('div', 'tb-header__icon tb-header__trailing tb-press', trailing.label);
    if (trailing.onClick) t.addEventListener('click', trailing.onClick);
    h.appendChild(t);
  }
  return h;
}

// bottomBar({ totalLabel, total, blocked, button, helper }) — the total row is
// rendered only when totalLabel/total are supplied.
export function bottomBar({ totalLabel, total, blocked = false, button: btn, helper } = {}) {
  const bar = el('div', 'tb-bottombar');
  if (totalLabel != null || total != null) {
    const row = el('div', 'tb-bottombar__totalrow');
    row.appendChild(el('div', `tb-bottombar__label${blocked ? ' tb-bottombar__label--blocked' : ''}`, totalLabel ?? ''));
    row.appendChild(el('div', `tb-bottombar__total${blocked ? ' tb-bottombar__total--blocked' : ''}`, total == null ? '' : String(total)));
    bar.appendChild(row);
  }
  if (btn) bar.appendChild(btn);
  if (helper) bar.appendChild(el('div', 'tb-bottombar__helper', helper));
  return bar;
}
