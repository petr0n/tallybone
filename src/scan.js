// Thin wrapper around scanner/index.js: points init() at the app's static
// model assets, and adds a progress callback so the UI never looks frozen
// during a multi-second multi-tile scan (M2's accepted perf finding: pip
// counting alone runs ~90-105ms/tile on real hardware).
import { init, scanImage } from '../../scanner/index.js';

export async function initScanner() {
  // BASE_URL (Vite env, always trailing-slash) rather than a hardcoded
  // absolute path -- GitHub Pages serves this app from a /<repo>/ subpath,
  // not root, so an absolute '/models/...' URL 404s there.
  const base = import.meta.env.BASE_URL;
  await init({
    tileModelUrl: `${base}models/tile.onnx`,
    pipModelUrl: `${base}models/pip.onnx`,
  });
}

// Rounded, conservative per-tile estimate from the M2 phone perf probe
// (docs/superpowers/notes/2026-07-23-m2-perf-results.md): ~180ms detection
// + ~100ms/tile pip counting. This is a UX estimate for the progress
// message, not a promise -- real timing varies by device and tile count.
const DETECTION_MS = 180, PER_TILE_MS = 100;

export function formatEta(tileCount) {
  if (tileCount === 0) return 'Detecting tiles...';
  const seconds = (DETECTION_MS + tileCount * PER_TILE_MS) / 1000;
  const label = tileCount === 1 ? 'tile' : 'tiles';
  return `Reading ${tileCount} ${label} (~${seconds.toFixed(1)}s)...`;
}

// onProgress(message: string) is called once immediately (detection phase)
// and is available for scanImage's caller to call again once tile count is
// known, if a future revision of scanner/index.js exposes that -- for now
// this wraps the single opaque scanImage() call with a before/after
// message, since scanImage() doesn't yet report intermediate progress.
export async function scanWithProgress(imageData, canvasFactory, onProgress) {
  onProgress(formatEta(0));
  const results = await scanImage(imageData, canvasFactory);
  return results;
}
