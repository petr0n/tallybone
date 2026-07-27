// app/src/screens/review.js — the review & correct screen (state 04), the
// heart of the app. Owns the editable tile list and recomputes duplicates,
// per-tile status, banner, and total live. Logic ported from
// design/design_handoff_tallybone/Tallybone Phase 1 Scanner.dc.html.
import { domino } from '../components/domino.js';
import { banner } from '../components/ui.js';
import { tallyMark } from '../brand.js';
import { html, el } from '../dom.js';
import { computeRectifyTransform, warpPerspective, RECT_W, RECT_H } from '../../../scanner/geometry.js';

const clamp = (n) => Math.max(0, Math.min(12, n));
const key = (t) => `${Math.min(t.a, t.b)}-${Math.max(t.a, t.b)}`;

// Rectify a detected tile's quad into an upright landscape crop of the REAL
// pixels (a data URL), so the player verifies against the actual tile — not a
// re-render of the read. Returns null with no photo/corners (manual entry).
function tileCropUrl(sourceImageData, corners) {
  if (!sourceImageData || !corners || corners.length !== 4) return null;
  const { H } = computeRectifyTransform(corners);
  const rectified = warpPerspective(sourceImageData, H); // RECT_W x RECT_H, bar horizontal
  const src = document.createElement('canvas');
  src.width = RECT_W; src.height = RECT_H;
  src.getContext('2d').putImageData(rectified, 0, 0);
  // rotate 90° so it reads left-to-right (first half left, second half right)
  const scale = 2;
  const out = document.createElement('canvas');
  out.width = RECT_H * scale; out.height = RECT_W * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(src, -(RECT_W * scale) / 2, -(RECT_H * scale) / 2, RECT_W * scale, RECT_H * scale);
  return out.toDataURL('image/jpeg', 0.9);
}

// tiles: [{ a, b, conf, bbox?, corners? }]. photoBitmap + sourceImageData +
// photoW/H optional (absent for manual entry). onSubmit(total, tiles), onBack().
export function renderReview({ tiles, photoBitmap, sourceImageData, photoW, photoH, onSubmit, onBack } = {}) {
  const items = (tiles || []).map((t, i) => ({
    id: i, a: clamp(t.a | 0), b: clamp(t.b | 0), conf: t.conf === 'check' ? 'check' : 'ok',
    dismissed: false, bbox: t.bbox || null, cropUrl: tileCropUrl(sourceImageData, t.corners),
  }));
  let nextId = items.length;

  const root = html('<div class="rev"></div>');

  const header = html(
    '<div class="rev__header">' +
    '<div class="tb-hicon tb-hicon--chev tb-press" style="border-color:var(--bone);color:var(--bone);">‹</div>' +
    '<div class="tb-htitle"><div class="tb-hoverline">STEP 2 OF 2</div><div class="tb-htext">REVIEW YOUR BONES</div></div>' +
    '<div class="tb-hicon tb-hicon--q" style="border-color:var(--bone);color:var(--bone);">?</div></div>');
  if (onBack) header.querySelector('.tb-hicon--chev').addEventListener('click', onBack);
  header.insertBefore(tallyMark(34), header.querySelector('.tb-htitle'));
  root.appendChild(header);

  const body = html('<div class="rev__body"></div>');
  root.appendChild(body);

  // captured photo + outline layer
  const photoWrap = html('<div class="rev__photo"></div>');
  if (photoBitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = photoW; canvas.height = photoH;
    canvas.getContext('2d').drawImage(photoBitmap, 0, 0);
    photoWrap.appendChild(canvas);
  } else {
    photoWrap.style.display = 'none';
  }
  const countPill = html('<div class="rev__count-pill"></div>');
  photoWrap.appendChild(countPill);
  body.appendChild(photoWrap);

  const bannerBox = el('div');
  body.appendChild(bannerBox);

  const list = el('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  body.appendChild(list);

  const addRow = html(
    '<div class="rev__addtile-row"><div class="rule"></div>' +
    '<div class="rev__addtile tb-press">+ Add a missed tile</div><div class="rule"></div></div>');
  addRow.querySelector('.rev__addtile').addEventListener('click', () => {
    items.push({ id: nextId++, a: 0, b: 0, conf: 'ok', dismissed: false, bbox: null });
    rerender();
  });
  body.appendChild(addRow);

  const footer = el('div', 'rev__footer');
  root.appendChild(footer);

  function derive() {
    const live = items.filter((t) => !t.dismissed);
    const counts = {};
    live.forEach((t) => { counts[key(t)] = (counts[key(t)] || 0) + 1; });
    const isDup = (t) => !t.dismissed && counts[key(t)] > 1;
    const dupTiles = live.filter(isDup);
    const checkTiles = live.filter((t) => t.conf === 'check' && !isDup(t));
    const total = live.reduce((n, t) => n + t.a + t.b, 0);
    return { live, isDup, dupTiles, checkTiles, total, blocked: dupTiles.length > 0 };
  }

  function bump(item, half, delta) {
    const nv = clamp(item[half] + delta);
    if (nv !== item[half]) { item[half] = nv; item.conf = 'ok'; rerender(); }
  }

  function stepper(item, half) {
    const wrap = el('div', 'rev__stepper');
    const minus = html('<button type="button" class="minus">–</button>');
    const val = el('div', `val val--${half}`, String(item[half]));
    const plus = html('<button type="button" class="plus">+</button>');
    minus.addEventListener('click', () => bump(item, half, -1));
    plus.addEventListener('click', () => bump(item, half, 1));
    wrap.append(minus, val, plus);
    return wrap;
  }

  function activeCard(item, dup, check) {
    const card = el('div', 'rev__card');
    card.style.background = dup ? '#FDEDED' : (check ? '#FDF6E4' : 'var(--bone)');
    card.style.border = `${dup || check ? 4 : 3}px solid ${dup ? 'var(--flare)' : (check ? 'var(--check)' : 'var(--ink)')}`;
    card.style.boxShadow = 'var(--shadow-raised)';

    // the real rectified tile photo (or a domino render fallback for manual entry)
    if (item.cropUrl) {
      const img = document.createElement('img');
      img.className = 'rev__crop';
      img.src = item.cropUrl;
      img.alt = `Tile reading ${item.a} / ${item.b}`;
      card.appendChild(img);
    } else {
      const thumb = el('div');
      thumb.style.cssText = 'display:flex;justify-content:center;';
      thumb.appendChild(domino({ a: item.a, b: item.b, size: 42, vertical: false }));
      card.appendChild(thumb);
    }

    const steprow = el('div', 'rev__steprow');
    steprow.append(stepper(item, 'a'), el('div', 'rev__slash', '/'), stepper(item, 'b'));
    card.appendChild(steprow);

    const foot = el('div', 'rev__card-foot');
    const chipVariant = dup ? 'error' : (check ? 'check' : 'ok');
    const chipLabel = dup ? "Twins — one's wrong" : (check ? 'Please check' : 'Looks good');
    foot.appendChild(chip(chipVariant, chipLabel));
    const right = el('div');
    right.style.cssText = 'display:flex;align-items:center;gap:10px;flex:none;';
    right.appendChild(el('div', 'rev__pts', `${item.a + item.b} pts`));
    const nt = el('div', 'rev__nottile tb-press', 'Not a tile');
    nt.addEventListener('click', () => { item.dismissed = true; rerender(); });
    right.appendChild(nt);
    foot.appendChild(right);
    card.appendChild(foot);
    return card;
  }

  function chip(variant, label) {
    const c = el('div', `tb-chip tb-chip--${variant}`);
    const icon = variant === 'error' ? '!' : (variant === 'check' ? '?' : '✓');
    c.append(el('div', 'tb-chip__badge', icon), el('div', 'tb-chip__label', label));
    return c;
  }

  function dismissedCard(item) {
    const card = el('div', 'rev__card');
    card.style.cssText = 'background:transparent;border:3px dashed var(--placeholder-border);box-shadow:none;';
    const row = html(
      '<div class="rev__dismissed"><div style="display:flex;align-items:center;gap:11px;">' +
      '<div class="rev__dismissed-x">×</div><div style="display:flex;flex-direction:column;gap:2px;">' +
      '<div style="font-weight:700;font-size:15px;color:var(--dismissed-text);">Dismissed — not a tile</div>' +
      '<div style="font-family:var(--font-mono);font-size:11.5px;color:var(--disabled-text);">Not counted</div></div></div>' +
      '<div class="rev__nottile tb-press" style="border-color:var(--ink);">Undo</div></div>');
    row.querySelector('.rev__nottile').addEventListener('click', () => { item.dismissed = false; rerender(); });
    card.appendChild(row);
    return card;
  }

  function rerender() {
    const d = derive();

    // photo outlines (redraw) + count pill
    photoWrap.querySelectorAll('.rev__box').forEach((b) => b.remove());
    if (photoBitmap) {
      items.filter((t) => !t.dismissed && t.bbox).forEach((t) => {
        const box = el('div', d.isDup(t) ? 'rev__box rev__box--dup' : (t.conf === 'check' ? 'rev__box rev__box--check' : 'rev__box'));
        box.style.left = `${(t.bbox.x / photoW) * 100}%`;
        box.style.top = `${(t.bbox.y / photoH) * 100}%`;
        box.style.width = `${(t.bbox.width / photoW) * 100}%`;
        box.style.height = `${(t.bbox.height / photoH) * 100}%`;
        photoWrap.insertBefore(box, countPill);
      });
      countPill.textContent = `${d.live.length} OUTLINED`;
    }

    // banner (priority: duplicates > check > clean)
    let variant = 'success', text = `${d.live.length} bones, all clean. Nothing to fix.`;
    if (d.blocked) {
      variant = 'error';
      text = `<strong>Twins found.</strong> ${d.dupTiles.length} tiles share a face — a set has no repeats, so fix one before you submit.`;
    } else if (d.checkTiles.length) {
      variant = 'check';
      const n = d.checkTiles.length;
      text = `<strong>${n} ${n === 1 ? 'tile needs' : 'tiles need'} a look.</strong> Glare on the pips — tap the steppers to set it straight.`;
    }
    bannerBox.replaceChildren(banner(variant, text));

    // tile cards
    list.replaceChildren(...items.map((t) => {
      if (t.dismissed) return dismissedCard(t);
      const dup = d.isDup(t);
      return activeCard(t, dup, t.conf === 'check' && !dup);
    }));

    // footer total + submit
    footer.replaceChildren();
    const row = el('div', 'rev__totalrow');
    row.appendChild(el('div', `rev__totallabel${d.blocked ? ' rev__totallabel--blocked' : ''}`,
      d.blocked ? `${d.dupTiles.length} TWINS TO FIX` : 'YOUR ROUND TOTAL'));
    row.appendChild(el('div', `rev__total${d.blocked ? ' rev__total--blocked' : ''}`, String(d.total)));
    footer.appendChild(row);

    if (d.blocked) {
      footer.appendChild(html(
        '<button type="button" class="tb-btn tb-btn--blocked">' +
        `<span class="tb-btn__icon">!</span>Fix ${d.dupTiles.length} twins first</button>`));
    } else {
      const submit = html(`<button type="button" class="tb-btn tb-btn--primary tb-press">Submit ${d.total} points</button>`);
      submit.addEventListener('click', () => onSubmit && onSubmit(d.total, d.live.map((t) => ({ a: t.a, b: t.b }))));
      footer.appendChild(submit);
    }
  }

  rerender();
  return root;
}
