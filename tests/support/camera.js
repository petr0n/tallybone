// tests/support/camera.js — feed a real tile photo into the app's camera so the
// REAL on-device scanner runs on it. getUserMedia is overridden to return a
// canvas.captureStream() that redraws window.__cameraImg each frame; the photo
// is loaded as a data URL (the file isn't served by the dev server).
import fs from 'node:fs';

// Compose a camera frame in which the photo sits INSIDE the blue brackets —
// what a player following the on-screen instruction actually hands the scanner
// now that the reticle bounds the scan. Without this a corpus photo fills the
// whole native frame, most of it outside the brackets, which measures a
// scenario the app no longer asks for.
//
// The frame is sized like a real phone's video track (~1080 across), so what
// the scanner receives is what a phone would actually hand it. Composing at the
// corpus photo's own resolution instead made a 17MP canvas: too slow to redraw,
// so an immediate shutter caught a half-drawn frame, and far more pixels than a
// live camera ever delivers.
function installMock({ portrait, inReticle, view, reticle }) {
function composeInReticle(img, iw, ih) {
  const frameW = 1080;
  const frameH = Math.round(frameW * (view.h / view.w));
  const square = frameW * (1 - reticle.insetFrac * 2);   // the reticle itself
  const box = square / 1.08;                             // a little air inside it
  const canvas = Object.assign(document.createElement('canvas'), { width: frameW, height: frameH });
  const ctx = canvas.getContext('2d');
  const fit = Math.min(box / iw, box / ih);
  const dw = iw * fit, dh = ih * fit;
  const sx = frameW * reticle.insetFrac, sy = frameH * reticle.topFrac;
  return { canvas, ctx, frameW, frameH,
    draw: () => {
      ctx.fillStyle = '#8C8A84';             // neutral table, not a clean plate
      ctx.fillRect(0, 0, frameW, frameH);
      ctx.drawImage(img, sx + (square - dw) / 2, sy + (square - dh) / 2, dw, dh);
    } };
}

  window.__setCameraImage = (dataUrl) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { window.__cameraImg = img; res(true); };
    img.onerror = rej;
    img.src = dataUrl;
  });
  const getUserMedia = async () => {
    const img = window.__cameraImg;
    const cap = 2200; // downscale huge corpus photos so headless stays fast
    const scale = img ? Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
    const iw = img ? Math.max(1, Math.round(img.naturalWidth * scale)) : 640;
    const ih = img ? Math.max(1, Math.round(img.naturalHeight * scale)) : 480;
    // `portrait` delivers a tall frame with the scene rotated 90deg — what a
    // phone/tablet held upright actually hands us. The corpus photos are all
    // landscape, and a landscape frame happens to sit within a few percent of
    // the Review strip's aspect, which hides any coordinate-space bug in the
    // outline overlay. The mismatch has to be real for that test to mean
    // anything.
    if (inReticle && img) {
      const framed = composeInReticle(img, iw, ih);
      const loop = () => { framed.draw(); requestAnimationFrame(loop); };
      loop();
      return framed.canvas.captureStream(30);
    }
    const w = portrait ? ih : iw, h = portrait ? iw : ih;
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    const draw = () => {
      if (window.__cameraImg) {
        if (portrait) {
          ctx.save();
          ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 2);
          ctx.drawImage(window.__cameraImg, -iw / 2, -ih / 2, iw, ih);
          ctx.restore();
        } else {
          ctx.drawImage(window.__cameraImg, 0, 0, w, h);
        }
      }
      requestAnimationFrame(draw);
    };
    draw();
    return canvas.captureStream(30);
  };
  const md = navigator.mediaDevices || {};
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: md });
  Object.defineProperty(md, 'getUserMedia', { configurable: true, writable: true, value: getUserMedia });
}

// Add to a context BEFORE any page loads (runs on every navigation).
// `portrait: true` delivers a tall (rotated) frame, as an upright phone does.
// `inReticle: {view: {w,h}, reticle: {insetFrac, topFrac}}` frames the photo
// inside the brackets instead of filling the frame — see composeInReticle.
export async function addCameraMock(context, { portrait = false, inReticle = null } = {}) {
  await context.addInitScript(installMock, {
    portrait,
    inReticle: Boolean(inReticle),
    view: inReticle?.view || null,
    reticle: inReticle?.reticle || null,
  });
}

// Point the fake camera at a photo file. Call before triggering a scan.
export async function setCameraPhoto(page, absPath) {
  const b64 = fs.readFileSync(absPath).toString('base64');
  await page.evaluate((d) => window.__setCameraImage(d), `data:image/jpeg;base64,${b64}`);
}

// Simulate iOS non-Safari: getUserMedia rejects (WKWebView blocks the live
// camera). Combine with an iOS userAgent on the context to exercise the fallback.
export async function blockCamera(context) {
  await context.addInitScript(() => {
    const md = navigator.mediaDevices || {};
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: md });
    Object.defineProperty(md, 'getUserMedia', {
      configurable: true, writable: true,
      value: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')),
    });
  });
}

