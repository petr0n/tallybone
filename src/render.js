// app/src/render.js
// Hand-scan testing review UI: the captured photo, then a horizontally
// wrapping grid of editable cards (cropped thumbnail + first/second
// inputs + confidence flag + a Not Tile toggle), a running per-photo
// total, and a Submit button that exports the photo + corrected values as
// a JSON matching the eval-corpus schema (tagged captureCondition:
// "handScan") for the hand-scan-accuracy segment. After a successful
// submit, offers New Scan (back to camera, session counter keeps
// accumulating) or Reload Page.

import { computeRectifyTransform, warpPerspective, RECT_W, RECT_H } from '../../scanner/geometry.js';

const CONFIDENCE_OK = 0.85;

export function formatTileLabel(predicted) {
  const pct = Math.round(predicted.confidence * 100);
  return `${predicted.first} / ${predicted.second} (${pct}% confident)`;
}

// Draws a detection's rectified tile crop onto a small upscaled canvas
// for display, rotated 90 degrees from its native orientation. The pip
// counter itself works on the un-rotated RECT_W(128) x RECT_H(256) crop
// (bar horizontal, first half on top) -- that's a fixed model input
// format, untouched by this. A real tile reads left-to-right, though, so
// this rotates for DISPLAY ONLY: first ends up on the left (matching the
// first-input's position below it), second on the right.
function renderThumbnail(sourceImageData, corners) {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = RECT_H * scale;
  canvas.height = RECT_W * scale;
  canvas.className = 'tile-thumb';
  const ctx = canvas.getContext('2d');
  if (corners.length === 4) {
    const { H } = computeRectifyTransform(corners);
    const rectified = warpPerspective(sourceImageData, H);
    const small = document.createElement('canvas');
    small.width = RECT_W;
    small.height = RECT_H;
    small.getContext('2d').putImageData(rectified, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(small, -(RECT_W * scale) / 2, -(RECT_H * scale) / 2, RECT_W * scale, RECT_H * scale);
    ctx.restore();
  }
  return canvas;
}

// Matches build-plan-v2.md §9.2's "Not Tile" convention: an explicit
// action to invalidate a false positive, normalized to status: "not_tile"
// rather than a guessed pip count.
function buildCorrected(correction) {
  return correction.notTile ? { status: 'not_tile' } : { first: correction.first, second: correction.second };
}

function buildExportPayload(sourceImageData, results, corrections, photoDataUrl) {
  return {
    captureCondition: 'handScan',
    capturedAt: new Date().toISOString(),
    imageWidth: sourceImageData.width,
    imageHeight: sourceImageData.height,
    tiles: results.map((r, i) => ({
      tileId: `t${String(i).padStart(2, '0')}`,
      bbox: r.bbox,
      corners: r.corners,
      predicted: r.predicted,
      corrected: buildCorrected(corrections[i]),
    })),
    photoDataUrl,
  };
}

// container: a DOM element to render into. sourceImageData: the raw
// ImageData scanImage() was run on (needed to rectify tile crops).
// imageBitmap: the same photo for the top-of-page preview. results:
// scanImage()'s output array. callbacks.onSubmitted(totalPips) fires
// after a successful save; callbacks.onNewScan() fires when the user
// chooses to capture another photo in the same session.
export function renderResults(container, imageBitmap, sourceImageData, results, callbacks = {}) {
  const { onSubmitted, onNewScan } = callbacks;
  container.innerHTML = '';

  const preview = document.createElement('canvas');
  preview.width = imageBitmap.width;
  preview.height = imageBitmap.height;
  preview.style.maxWidth = '100%';
  preview.getContext('2d').drawImage(imageBitmap, 0, 0);
  container.appendChild(preview);

  const list = document.createElement('div');
  list.className = 'review-list';
  container.appendChild(list);

  const totalEl = document.createElement('div');
  totalEl.className = 'review-total';
  container.appendChild(totalEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'review-actions';
  container.appendChild(actionsEl);

  const corrections = results.map(r => ({ first: r.predicted.first, second: r.predicted.second, notTile: false }));

  function currentTotal() {
    return corrections.reduce((s, c) => s + (c.notTile ? 0 : Number(c.first) + Number(c.second)), 0);
  }

  function updateTotal() {
    const sum = currentTotal();
    const counted = corrections.filter(c => !c.notTile).length;
    totalEl.textContent = `Total: ${sum} across ${counted} tile${counted === 1 ? '' : 's'}`;
  }

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'review-card';

    card.appendChild(renderThumbnail(sourceImageData, r.corners));

    const inputs = document.createElement('div');
    inputs.className = 'review-inputs';

    const firstInput = document.createElement('input');
    firstInput.type = 'number';
    firstInput.min = '0';
    firstInput.max = '12';
    firstInput.value = r.predicted.first;
    firstInput.addEventListener('input', () => {
      corrections[i].first = firstInput.value;
      updateTotal();
    });

    const sep = document.createElement('span');
    sep.textContent = '/';
    sep.className = 'review-sep';

    const secondInput = document.createElement('input');
    secondInput.type = 'number';
    secondInput.min = '0';
    secondInput.max = '12';
    secondInput.value = r.predicted.second;
    secondInput.addEventListener('input', () => {
      corrections[i].second = secondInput.value;
      updateTotal();
    });

    inputs.appendChild(firstInput);
    inputs.appendChild(sep);
    inputs.appendChild(secondInput);
    card.appendChild(inputs);

    const notTileBtn = document.createElement('button');
    notTileBtn.type = 'button';
    notTileBtn.className = 'not-tile-btn';
    notTileBtn.textContent = 'Not a tile';
    notTileBtn.addEventListener('click', () => {
      corrections[i].notTile = !corrections[i].notTile;
      card.classList.toggle('is-not-tile', corrections[i].notTile);
      firstInput.disabled = corrections[i].notTile;
      secondInput.disabled = corrections[i].notTile;
      notTileBtn.textContent = corrections[i].notTile ? 'Undo' : 'Not a tile';
      updateTotal();
    });
    card.appendChild(notTileBtn);

    const flag = document.createElement('span');
    flag.className = r.predicted.confidence >= CONFIDENCE_OK ? 'review-flag ok' : 'review-flag check';
    flag.textContent = r.predicted.confidence >= CONFIDENCE_OK ? '✓' : '?';
    flag.title = `${Math.round(r.predicted.confidence * 100)}% confident`;
    card.appendChild(flag);

    // Duplicate identity is impossible in a real set -> guaranteed misread.
    if (r.reviewFlags && r.reviewFlags.duplicate) {
      card.classList.add('is-duplicate');
      const dup = document.createElement('div');
      dup.className = 'dup-warning';
      dup.textContent = '⚠ duplicate — one of these is wrong';
      card.appendChild(dup);
    }

    list.appendChild(card);
  });

  updateTotal();

  const submitBtn = document.createElement('button');
  submitBtn.className = 'submit-btn';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    try {
      const photoDataUrl = preview.toDataURL('image/jpeg', 0.92);
      const payload = buildExportPayload(sourceImageData, results, corrections, photoDataUrl);
      const res = await fetch('/api/handscan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      onSubmitted?.(currentTotal());
      renderPostSubmitActions();
    } catch (err) {
      submitBtn.textContent = `Save failed: ${err.message}`;
      submitBtn.disabled = false;
    }
  });
  actionsEl.appendChild(submitBtn);

  function renderPostSubmitActions() {
    actionsEl.innerHTML = '';

    const savedLabel = document.createElement('div');
    savedLabel.className = 'saved-label';
    savedLabel.textContent = 'Saved ✓';
    actionsEl.appendChild(savedLabel);

    const newScanBtn = document.createElement('button');
    newScanBtn.className = 'submit-btn';
    newScanBtn.textContent = 'New Scan';
    newScanBtn.addEventListener('click', () => onNewScan?.());
    actionsEl.appendChild(newScanBtn);

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'submit-btn secondary';
    reloadBtn.textContent = 'Reload Page';
    reloadBtn.addEventListener('click', () => location.reload());
    actionsEl.appendChild(reloadBtn);
  }
}
