// app/src/screens/capture.js — full-bleed live viewfinder (state 01).
// Returns { el, video } so the orchestrator can attach the camera stream.
// Per the M3-2 decisions: no live in-frame count, and the upload affordance
// only appears when ENABLE_UPLOAD_FALLBACK is on (camera is required by default).
import { html } from '../dom.js';
import { tallyMark } from '../brand.js';

export function renderCapture({ onShutter, onHelp, onUpload, onBack } = {}) {
  const root = html('<div class="cap"></div>');

  const video = html('<video class="cap__video" autoplay playsinline muted></video>');
  root.appendChild(video);
  root.appendChild(html('<div class="cap__scrim"></div>'));
  root.appendChild(html(
    '<div class="cap__reticle">' +
    '<div class="cap__bracket cap__bracket--tl"></div>' +
    '<div class="cap__bracket cap__bracket--tr"></div>' +
    '<div class="cap__bracket cap__bracket--bl"></div>' +
    '<div class="cap__bracket cap__bracket--br"></div></div>'));

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

  root.appendChild(html(
    '<div class="cap__tip"><div class="cap__tip-badge">i</div>' +
    "<div style=\"font-size:14.5px;line-height:1.4;\">Leave a small gap between tiles — don't stack 'em or let 'em touch.</div></div>"));

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

  return { el: root, video };
}
