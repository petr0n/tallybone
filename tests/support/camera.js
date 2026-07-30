// tests/support/camera.js — feed a real tile photo into the app's camera so the
// REAL on-device scanner runs on it. getUserMedia is overridden to return a
// canvas.captureStream() that redraws window.__cameraImg each frame; the photo
// is loaded as a data URL (the file isn't served by the dev server).
import fs from 'node:fs';

function installMock(portrait) {
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
export async function addCameraMock(context, { portrait = false } = {}) {
  await context.addInitScript(installMock, portrait);
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

