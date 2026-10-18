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
