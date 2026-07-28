// tests/support/camera.js — feed a real tile photo into the app's camera so the
// REAL on-device scanner runs on it. getUserMedia is overridden to return a
// canvas.captureStream() that redraws window.__cameraImg each frame; the photo
// is loaded as a data URL (the file isn't served by the dev server).
import fs from 'node:fs';

function installMock() {
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
    const w = img ? Math.max(1, Math.round(img.naturalWidth * scale)) : 640;
    const h = img ? Math.max(1, Math.round(img.naturalHeight * scale)) : 480;
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    const draw = () => { if (window.__cameraImg) ctx.drawImage(window.__cameraImg, 0, 0, w, h); requestAnimationFrame(draw); };
    draw();
    return canvas.captureStream(30);
  };
  const md = navigator.mediaDevices || {};
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: md });
  Object.defineProperty(md, 'getUserMedia', { configurable: true, writable: true, value: getUserMedia });
}

// Add to a context BEFORE any page loads (runs on every navigation).
export async function addCameraMock(context) {
  await context.addInitScript(installMock);
}

// Point the fake camera at a photo file. Call before triggering a scan.
export async function setCameraPhoto(page, absPath) {
  const b64 = fs.readFileSync(absPath).toString('base64');
  await page.evaluate((d) => window.__setCameraImage(d), `data:image/jpeg;base64,${b64}`);
}
