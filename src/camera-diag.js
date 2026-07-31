// app/src/camera-diag.js — field diagnostics for the viewfinder, shown only
// when the URL carries `?diag=1`. Off by default and never imported into the
// normal capture path's behaviour.
//
// Exists because "the camera is too zoomed on my iPad" cannot be settled by
// reading code: the answer depends on what the device actually negotiates. This
// reports the three things that decide the framing —
//   1. what we ASKED for vs what the camera GAVE (aspect + resolution),
//   2. what the camera COULD give (capabilities), so we know if a different
//      request would widen the view,
//   3. the SCAN BOX in real pixels — the dashed square bounds the scan
//      (camera.js's computeScanCrop), so this is what the scanner receives and
//      what decides whether pips are readable.
// Read the same page on two devices and the difference is the answer.
//
// Measured on a Samsung (2026-07-31): asked 3840x2160, got 2160x3840 (the
// camera rotated it to portrait), preview box 384x742, scan box 1814x1814 —
// 40% of the frame, ~3.3MP to the scanner.
import { CAMERA_MODES, computeScanCrop } from './camera.js';

const qp = (k) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };

export const DIAG_ON = () => qp('diag') === '1';
// ?cam=43 / ?cam=native are still field-test toggles (default '169').
export const CAMERA_MODE = () => qp('cam') || '169';

// The viewfinder now shows the WHOLE captured frame. It used to be `cover`,
// which cropped ~74% of the frame away on a phone and ~61% on an iPad while
// captureFullFrame() scanned all of it — so the preview hid tiles that were
// being captured anyway, and people backed away from the table to fit them in.
// Confirmed on an iPad: with `contain` the framing "looked right" at normal
// height. `?fit=cover` restores the old full-bleed crop.
export const OBJECT_FIT = () => (qp('fit') === 'cover' ? 'cover' : 'contain');

// Fraction of the source frame left visible by object-fit: cover in `box`.
export function visibleFraction(videoW, videoH, boxW, boxH) {
  if (!videoW || !videoH || !boxW || !boxH) return { w: 1, h: 1 };
  const av = videoW / videoH, ab = boxW / boxH;
  return av > ab ? { w: ab / av, h: 1 } : { w: 1, h: av / ab };
}

const row = (k, v) => `<div style="display:flex;gap:8px;"><span style="opacity:.6;min-width:96px;">${k}</span><span>${v}</span></div>`;

export function attachCameraDiag(videoEl, stream) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute', 'left:8px', 'right:8px', 'top:8px', 'z-index:9999',
    'background:rgba(0,0,0,.82)', 'color:#fff', 'font:11px/1.45 ui-monospace,Menlo,monospace',
    'padding:10px 12px', 'border-radius:10px', 'pointer-events:none', 'white-space:pre-wrap',
  ].join(';');

  const paint = () => {
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    const s = (track && track.getSettings) ? track.getSettings() : {};
    const caps = (track && track.getCapabilities) ? (() => { try { return track.getCapabilities(); } catch { return {}; } })() : {};
    const box = videoEl.getBoundingClientRect();
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const vis = visibleFraction(vw, vh, box.width, box.height);
    const crop = (vw && vh && box.width && box.height)
      ? computeScanCrop(vw, vh, box.width, box.height, OBJECT_FIT()) : null;
    const cropShare = crop ? (crop.width * crop.height) / (vw * vh) : 0;
    const ratio = (w, h) => (w && h ? (w / h).toFixed(3) : '—');
    const range = (r) => (r && r.max ? `${r.min ?? '?'}–${r.max}` : 'n/a');

    panel.innerHTML =
      `<div style="font-weight:700;margin-bottom:6px;">camera diag — screenshot this</div>` +
      row('mode', `?cam=${CAMERA_MODE()}  ?fit=${OBJECT_FIT()}`) +
      row('asked', JSON.stringify(CAMERA_MODES[CAMERA_MODE()] || CAMERA_MODES['169'])) +
      row('got', `${s.width || vw}×${s.height || vh} (${ratio(s.width || vw, s.height || vh)})`) +
      row('aspectRatio', s.aspectRatio != null ? Number(s.aspectRatio).toFixed(3) : '—') +
      row('camera', (track && track.label) || '—') +
      row('facing', s.facingMode || '—') +
      row('zoom', s.zoom != null ? `${s.zoom} (range ${range(caps.zoom)})` : 'not reported') +
      row('cap width', range(caps.width)) +
      row('cap height', range(caps.height)) +
      `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.25);"></div>` +
      row('preview box', `${Math.round(box.width)}×${Math.round(box.height)} (${ratio(box.width, box.height)})`) +
      row('shown', OBJECT_FIT() === 'contain'
        ? '100% of the frame (letterboxed to fit)'
        : `${(vis.w * 100).toFixed(1)}% wide × ${(vis.h * 100).toFixed(1)}% tall`) +
      // What the scanner ACTUALLY reads. The dashed box bounds the scan now, so
      // the old "N% is scanned but NOT shown" line was wrong twice over: nothing
      // is hidden under contain, and the scan is a subset of what's shown, not a
      // superset. This is the number that decides whether pips are readable.
      row('scan box', crop
        ? `${Math.round(crop.width)}×${Math.round(crop.height)} px  (${(cropShare * 100).toFixed(0)}% of the frame)`
        : '—') +
      `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.25);"></div>` +
      row('screen', `${screen.width}×${screen.height} @${window.devicePixelRatio}x`) +
      row('viewport', `${innerWidth}×${innerHeight}`);
  };

  // Track dimensions arrive after metadata; repaint until they settle.
  paint();
  videoEl.addEventListener('loadedmetadata', paint);
  const timer = setInterval(paint, 1000);
  panel.addEventListener('remove', () => clearInterval(timer));
  setTimeout(() => clearInterval(timer), 30000);
  return panel;
}
