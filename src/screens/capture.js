// app/src/screens/capture.js — full-bleed live viewfinder (state 01).
// Returns { el, video } so the orchestrator can attach the camera stream.
// Per the M3-2 decisions: no live in-frame count, and the upload affordance
// only appears when ENABLE_UPLOAD_FALLBACK is on (camera is required by default).
import { html } from '../dom.js';
import { tallyMark } from '../brand.js';
import { computeScanBox } from '../camera.js';

// Draw the brackets on camera.js's scan box — the same rect captureScanArea
// crops to, so what the box encloses is exactly what gets scanned. Sized from
// the image on screen rather than the screen, since the viewfinder is `contain`
// and a letterboxed frame would otherwise leave the box over the black bars.
export function layoutScanBox(video, reticle, fit = 'contain') {
  const vw = video.videoWidth, vh = video.videoHeight;
  const bw = video.clientWidth, bh = video.clientHeight;
  if (!vw || !vh || !bw || !bh) return;
  const b = computeScanBox(vw, vh, bw, bh, fit);
  reticle.style.left = `${b.x}px`;
  reticle.style.top = `${b.y}px`;
  reticle.style.width = `${b.width}px`;
  reticle.style.height = `${b.height}px`;
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
