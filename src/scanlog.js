// app/src/scanlog.js — field telemetry for real-device scan testing.
//
// Solo scanning is fully on-device and offline: the models run in the browser
// and nothing about a scan touches the network. That is the point of the
// feature, but it also means a scan is invisible to anyone helping debug it.
// With `?tail=1` the app posts a small JSON summary per scan to /api/scanlog,
// which the Worker logs so `wrangler tail` streams it live.
//
// OFF by default, and never on without the flag in the URL — a normal player
// makes no requests at all while scanning. No image is ever sent: only geometry,
// timings and the readings, which is what diagnoses a misread anyway.

export const TAIL_ON = () => {
  try { return new URLSearchParams(location.search).get('tail') === '1'; } catch { return false; }
};

const face = (t) => `${t.a}/${t.b}${t.conf === 'check' ? '?' : ''}`;

/**
 * Build a compact event. `kind` is 'scan' (what the scanner read) or 'submit'
 * (what the player turned in after correcting it) — the difference between the
 * two is the accuracy measurement this whole thing exists to produce.
 *
 * Fields are omitted rather than sent undefined, so a tail line stays readable.
 */
export function scanEvent(kind, { videoW, videoH, boxW, boxH, cropW, cropH, ms, total, tiles } = {}) {
  const e = { kind, t: new Date().toISOString().slice(11, 19) };
  if (videoW && videoH) e.cam = `${videoW}x${videoH}`;
  if (boxW && boxH) e.box = `${Math.round(boxW)}x${Math.round(boxH)}`;
  if (cropW && cropH) e.crop = `${Math.round(cropW)}x${Math.round(cropH)}`;
  if (ms != null) e.ms = Math.round(ms);
  if (total != null) e.total = total;
  e.n = (tiles || []).length;
  e.tiles = (tiles || []).map(face);
  return e;
}

// Fire and forget. sendBeacon survives the page navigating on to Review;
// fetch with keepalive is the fallback where it is missing.
export function postScanLog(event) {
  if (!TAIL_ON()) return;
  try {
    const body = JSON.stringify(event);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/scanlog', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/scanlog', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
    }
  } catch { /* telemetry must never break a scan */ }
}
