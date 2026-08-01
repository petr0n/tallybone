// app/src/screens/fallback.js — the non-scan branch states:
//   02 permission denied · 05 no tiles detected · 06 camera unavailable.
// "Enter tiles by hand" routes into the review screen with a blank tile
// (manual entry), the same UI used to correct a scan.
import { html } from '../dom.js';
import { button } from '../components/ui.js';
import { tallyMark } from '../brand.js';

// dark header (icon + mark + title) used on the ink denied screen
function darkHeaderBare(title) {
  const h = html('<div style="padding:16px 20px 0;display:flex;align-items:center;gap:12px;"></div>');
  h.appendChild(html('<div class="tb-hicon tb-hicon--chev">‹</div>'));
  h.appendChild(tallyMark(36));
  h.appendChild(html(`<div class="tb-htext" style="flex:1;color:var(--bone);">${title}</div>`));
  return h;
}
// light header used on empty / unavailable
function lightHeader(title, onBack) {
  const h = html('<div style="background:var(--bone);border-bottom:var(--ol-base) solid var(--ink);padding:14px 20px;display:flex;align-items:center;gap:12px;"></div>');
  const chev = html('<div class="tb-hicon tb-hicon--chev tb-press" style="border-color:var(--ink);color:var(--ink);">‹</div>');
  if (onBack) chev.addEventListener('click', onBack);
  h.appendChild(chev);
  h.appendChild(tallyMark(36));
  h.appendChild(html(`<div class="tb-htext" style="flex:1;">${title}</div>`));
  return h;
}

// 02 · permission denied (ink)
export function renderDenied({ onOpenSettings, onRetry } = {}) {
  const root = html('<div class="screen screen--ink msg"></div>');
  root.appendChild(darkHeaderBare('SCAN YOUR TILES'));
  root.appendChild(html(
    '<div class="msg__mid">' +
    '<div style="width:120px;height:120px;border-radius:26px;border:4px solid var(--flare);display:flex;align-items:center;justify-content:center;position:relative;">' +
    '<div style="width:54px;height:40px;border:4px solid var(--bone);border-radius:9px;"></div>' +
    '<div style="position:absolute;width:132px;height:5px;background:var(--flare);transform:rotate(-45deg);"></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div class="msg__title" style="color:var(--bone);">NO CAMERA ACCESS</div>' +
    '<div class="msg__body" style="color:var(--muted-on-dark);">Tallybone needs the camera to count your bones. Nothing leaves your phone — the counting happens right here.</div></div>' +
    '<div class="msg__errbanner"><div class="msg__errbanner-badge">!</div>' +
    '<div class="msg__errbanner-text">Camera permission is off in Settings.</div></div></div>'));
  const foot = html('<div class="msg__foot"></div>');
  foot.appendChild(button({ label: 'Open Settings', variant: 'primary', onClick: onOpenSettings || onRetry }));
  const retry = html('<button type="button" class="tb-btn--ghost-bone tb-press">Try again</button>');
  if (onRetry) retry.addEventListener('click', onRetry);
  foot.appendChild(retry);
  root.appendChild(foot);
  return root;
}

// 05 · no tiles detected (light)
export function renderEmpty({ onRetry, onManual } = {}) {
  const root = html('<div class="screen screen--light msg"></div>');
  root.appendChild(lightHeader('REVIEW YOUR BONES', onRetry));
  root.appendChild(html(
    '<div class="msg__mid">' +
    '<div style="opacity:0.32;font-family:var(--font-display);font-size:64px;color:var(--ink);">□ □</div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div class="msg__title">NO BONES FOUND</div>' +
    "<div class=\"msg__body\" style=\"color:var(--secondary-light-2);\">Nothing in that shot read as a domino. Usually it's tiles touching, a steep angle, or a shadow across the pips.</div></div>" +
    '<div style="width:100%;display:flex;flex-direction:column;gap:9px;background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:var(--r-card);padding:15px;text-align:left;">' +
    '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.18em;color:var(--secondary-light-1);">TRY THIS</div>' +
    '<div style="font-size:14.5px;line-height:1.5;">· Spread the tiles apart<br>· Shoot straight down<br>· Move your shadow off the table</div></div></div>'));
  const foot = html('<div class="msg__foot"></div>');
  foot.appendChild(button({ label: 'Shoot it again', variant: 'primary', onClick: onRetry }));
  foot.appendChild(button({ label: 'Enter tiles by hand', variant: 'secondary', onClick: onManual }));
  root.appendChild(foot);
  return root;
}

// A hidden native file input styled as a button. `capture="environment"` opens
// the rear camera directly on mobile (works in every iOS browser — it's the OS
// camera, not getUserMedia).
function photoInputButton(label, onFile) {
  const el = html(
    `<label class="tb-btn tb-btn--primary tb-press" style="display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;">` +
    `<span class="tb-btn__icon" style="font-size:18px;">▤</span>${label}` +
    `<input type="file" accept="image/*" capture="environment" style="display:none"></label>`);
  el.querySelector('input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) onFile(e.target.files[0]);
  });
  return el;
}

// Camera blocked (iOS non-Safari / no live camera) -> take a photo instead. The
// native photo path works where the live viewfinder can't.
export function renderCameraBlocked({ iosNonSafari, onUpload, onManual, onBack } = {}) {
  const root = html('<div class="screen screen--light msg"></div>');
  root.appendChild(lightHeader('SCAN YOUR TILES', onBack));
  const nudge = iosNonSafari
    ? '<div class="msg__errbanner" style="box-shadow:var(--shadow-raised);"><div class="msg__errbanner-badge">i</div>' +
      '<div class="msg__errbanner-text">For a live viewfinder, open Tallybone in <strong>Safari</strong>. Either way, you can take a photo right here.</div></div>'
    : '';
  root.appendChild(html(
    '<div class="msg__mid">' +
    '<div style="width:112px;height:112px;border-radius:24px;border:4px solid var(--ink);background:var(--bone);box-shadow:var(--shadow-lifted-6);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:52px;color:var(--ink);">▤</div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div class="msg__title">TAKE A PHOTO OF YOUR TILES</div>' +
    "<div class=\"msg__body\" style=\"color:var(--secondary-light-2);\">This browser can't open the live camera, but snap a photo and Tallybone counts it just the same.</div></div>" +
    nudge + '</div>'));
  const foot = html('<div class="msg__foot"></div>');
  foot.appendChild(photoInputButton('Take a photo of your tiles', onUpload));
  foot.appendChild(button({ label: 'Enter tiles by hand', variant: 'secondary', onClick: onManual }));
  root.appendChild(foot);
  return root;
}

// 06 · camera unavailable (light)
export function renderUnavailable({ onRetry, onManual } = {}) {
  const root = html('<div class="screen screen--light msg"></div>');
  root.appendChild(lightHeader('SCAN YOUR TILES', onRetry));
  root.appendChild(html(
    '<div class="msg__mid">' +
    '<div style="width:112px;height:112px;border-radius:24px;border:4px solid var(--ink);background:var(--bone);box-shadow:var(--shadow-lifted-6);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:52px;color:var(--flare);">!</div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div class="msg__title">CAMERA UNAVAILABLE</div>' +
    "<div class=\"msg__body\" style=\"color:var(--secondary-light-2);\">Another app has the camera, or this device doesn't have one Tallybone can use. Close the other app and try again — the scanner needs a live camera.</div></div>" +
    '<div class="msg__errbanner" style="box-shadow:var(--shadow-raised);"><div class="msg__errbanner-badge">!</div>' +
    '<div class="msg__errbanner-text">Error CAM-02 · camera stream busy</div></div></div>'));
  const foot = html('<div class="msg__foot"></div>');
  foot.appendChild(button({ label: 'Try the camera again', variant: 'primary', onClick: onRetry }));
  foot.appendChild(button({ label: 'Enter tiles by hand', variant: 'secondary', onClick: onManual }));
  root.appendChild(foot);
  return root;
}

// 07 · the scanner never finished loading.
//
// The boot screen used to be a dead end: a logo, the words WARMING UP, and no
// timeout, no retry and no way out — so a phone that stalls loading the ~6.3MB
// of models (or hits iOS's WASM memory ceiling) strands the player mid-game with
// no route even to manual entry, which is only reachable from the other fallback
// screens. Reported from a real table, 2026-07-31.
export function renderScannerStuck({ onRetry, onManual, onBack, detail } = {}) {
  const root = html('<div class="screen screen--light msg"></div>');
  root.appendChild(lightHeader('SCAN YOUR TILES', onBack));
  root.appendChild(html(
    '<div class="msg__mid">' +
    '<div style="width:112px;height:112px;border-radius:24px;border:4px solid var(--ink);background:var(--bone);box-shadow:var(--shadow-lifted-6);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:52px;color:var(--check);">?</div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div class="msg__title">SCANNER WON\'T LOAD</div>' +
    '<div class="msg__body" style="color:var(--secondary-light-2);">It downloads about 6MB the first time, and this phone hasn\'t managed it. A patchy signal or a low-memory phone will do it. You can keep playing — enter your tiles by hand and carry on.</div></div>' +
    `<div class="msg__errbanner" style="box-shadow:var(--shadow-raised);"><div class="msg__errbanner-badge">!</div>` +
    `<div class="msg__errbanner-text">${detail || 'Error SCN-01 · scanner did not finish loading'}</div></div></div>`));
  const foot = html('<div class="msg__foot"></div>');
  // Manual entry FIRST: the player is mid-round with people waiting, and a
  // retry that already failed is the less useful of the two.
  foot.appendChild(button({ label: 'Enter tiles by hand', variant: 'primary', onClick: onManual }));
  foot.appendChild(button({ label: 'Try loading again', variant: 'secondary', onClick: onRetry }));
  root.appendChild(foot);
  return root;
}
