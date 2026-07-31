// app/src/screens/capture.js — full-bleed live viewfinder (state 01).
// Returns { el, video } so the orchestrator can attach the camera stream.
// Per the M3-2 decisions: no live in-frame count, and the upload affordance
// only appears when ENABLE_UPLOAD_FALLBACK is on (camera is required by default).
import { html } from '../dom.js';
import { tallyMark } from '../brand.js';
import { computeDisplayRect, SCAN_INSET_FRAC } from '../camera.js';

// Lay the dashed box onto the video's DISPLAYED rect, inset by the same
// fraction the crop uses (camera.js's computeScanCrop) — so the box encloses
// exactly the pixels that get scanned. The viewfinder is `contain` by default,
// so that rect is letterboxed and moves with the frame's aspect; anchoring the
// box to the screen instead would put it partly on the black bars.
export function layoutScanBox(video, reticle, fit = 'contain') {
  const vw = video.videoWidth, vh = video.videoHeight;
  const bw = video.clientWidth, bh = video.clientHeight;
  if (!vw || !vh || !bw || !bh) return;
  const d = computeDisplayRect(vw, vh, bw, bh, fit);
  // Under `cover` the rect overflows the box; the visible part is the box.
  const left = Math.max(d.x, 0), top = Math.max(d.y, 0);
  const right = Math.min(d.x + d.width, bw), bottom = Math.min(d.y + d.height, bh);
  const insetX = (right - left) * SCAN_INSET_FRAC, insetY = (bottom - top) * SCAN_INSET_FRAC;
  reticle.style.left = `${left + insetX}px`;
  reticle.style.top = `${top + insetY}px`;
  reticle.style.width = `${Math.max(0, right - left - insetX * 2)}px`;
  reticle.style.height = `${Math.max(0, bottom - top - insetY * 2)}px`;
}

export function renderCapture({ onShutter, onHelp, onUpload, onBack } = {}) {
  const root = html('<div class="cap"></div>');

  const video = html('<video class="cap__video" autoplay playsinline muted></video>');
  root.appendChild(video);
  root.appendChild(html('<div class="cap__scrim"></div>'));
  // The tip lives inside the reticle so it always sits just BELOW the brackets
  // rather than across them (it was pinned to top:112px and overlapped on
  // shorter viewports). Reticle is pointer-events:none; nothing here is tappable.
  const reticle = html(
    '<div class="cap__reticle">' +
    '<div class="cap__scanarea"></div>' +
    '<div class="cap__bracket cap__bracket--tl"></div>' +
    '<div class="cap__bracket cap__bracket--tr"></div>' +
    '<div class="cap__bracket cap__bracket--bl"></div>' +
    '<div class="cap__bracket cap__bracket--br"></div>' +
    '<div class="cap__tip"><div class="cap__tip-badge">i</div>' +
    "<div style=\"font-size:13px;line-height:1.35;\">Leave a small gap between tiles — don't stack 'em or let 'em touch.</div></div></div>");
  root.appendChild(reticle);

  const header = html('<div class="cap__header"></div>');
  if (onBack) {
    const back = html('<div class="tb-hicon tb-hicon--chev tb-press">‹</div>');
    back.addEventListener('click', onBack);
    header.appendChild(back);
  }
  header.appendChild(tallyMark(34));
  header.appendChild(html(
    '<div class="tb-htitle">' +
    '<div class="tb-hoverline">STEP 1 OF 2</div>' +
    '<div class="tb-htext">SCAN YOUR TILES</div></div>'));
  const helpBtn = html('<div class="tb-hicon tb-hicon--q tb-press">?</div>');
  if (onHelp) helpBtn.addEventListener('click', onHelp);
  header.appendChild(helpBtn);
  root.appendChild(header);

  const bottom = html('<div class="cap__bottom"></div>');
  const shutter = html('<div class="cap__shutter tb-press" role="button" aria-label="Scan"><div class="cap__shutter-inner">SCAN</div></div>');
  if (onShutter) shutter.addEventListener('click', onShutter);
  bottom.appendChild(shutter);

  if (onUpload) {
    const up = html(
      '<label class="cap__upload tb-press"><span style="font-family:var(--font-display);font-size:14px;">⤢</span>' +
      'Take a photo<input type="file" accept="image/*" capture="environment" style="display:none"></label>');
    up.querySelector('input').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) onUpload(e.target.files[0]);
    });
    bottom.appendChild(up);
  }
  root.appendChild(bottom);

  return { el: root, video, reticle };
}
