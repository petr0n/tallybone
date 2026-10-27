// app/src/status-banner.js — one bar pinned to the top of the app for the two
// things a player must know but cannot otherwise see: the connection dropped
// (taps are queued, not lost — tapping again only queues more), and a newer
// Tallybone is live (this tab still runs the old one). Lives outside the screen
// root, so screen re-renders never wipe it.
const bar = document.createElement('div');
bar.setAttribute('role', 'status');
bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:1000;display:none;padding:10px 16px;' +
  'padding-top:calc(10px + env(safe-area-inset-top));text-align:center;font-family:var(--font-ui);' +
  'font-weight:700;font-size:14px;line-height:1.35;background:var(--ink);color:var(--bone);' +
  'border-bottom:3px solid var(--sky);box-shadow:0 2px 0 rgba(0,0,0,0.25);';
document.body.appendChild(bar);

let offline = false;
let updated = false;
let offlineTimer = null;

function paint() {
  if (updated) {
    bar.textContent = 'Tallybone was updated — tap here to reload';
    bar.style.cursor = 'pointer';
    bar.style.display = 'block';
  } else if (offline) {
    bar.textContent = 'Reconnecting… your taps will send when you\'re back. No need to tap again.';
    bar.style.cursor = '';
    bar.style.display = 'block';
  } else bar.style.display = 'none';
}
bar.addEventListener('click', () => { if (updated) location.reload(); });

// A blip that reconnects within a second is not worth flashing a bar for.
export function setOffline(on) {
  clearTimeout(offlineTimer);
  if (!on) { offline = false; paint(); return; }
  offlineTimer = setTimeout(() => { offline = true; paint(); }, 1000);
}

export function setUpdated() { updated = true; paint(); }

// A short message just above the button that was tapped, fading on its own —
// for a tap that was ignored because the first one is already being handled.
// Never takes a tap itself (pointer-events: none).
const toastEl = document.createElement('div');
toastEl.setAttribute('role', 'status');
toastEl.setAttribute('aria-live', 'polite');
toastEl.style.cssText = 'position:fixed;left:0;right:0;margin:0 auto;width:fit-content;z-index:1001;' +
  'max-width:calc(100% - 32px);padding:10px 16px;border-radius:999px;' +
  'background:var(--ink);color:var(--bone);font-family:var(--font-ui);font-weight:700;font-size:14px;' +
  'line-height:1.3;text-align:center;box-shadow:0 3px 0 rgba(0,0,0,0.25);pointer-events:none;' +
  'opacity:0;transition:opacity 0.18s ease;';
document.body.appendChild(toastEl);
let toastTimer = null;

export function toast(text, anchor) {
  toastEl.textContent = text;
  // Above the tapped button; below it when the button is too near the top.
  const r = anchor ? anchor.getBoundingClientRect() : { top: innerHeight - 140, bottom: innerHeight - 140 };
  toastEl.style.top = (r.top > 70 ? r.top - 50 : r.bottom + 10) + 'px';
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
}
