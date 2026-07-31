// Live camera capture: getUserMedia preview + frame-to-ImageData capture.
// startCamera never throws -- permission denial / no camera is a normal,
// expected outcome the caller handles by falling back to file upload
// (build-plan-v2.md §9.0 hard constraint), not an error state.

// requestCamera classifies the failure so the UI can show the right screen:
// { stream } on success, or { error: 'denied' } when the user blocked the
// camera (recoverable in Settings) vs { error: 'unavailable' } when it's
// missing / busy / unsupported (the CAM-02 case). Resolution rationale below.
// Selectable capture modes, so field-testing the framing is a URL change rather
// than a redeploy (?cam=43 / ?cam=native). Default is unchanged.
//
// Why this is worth testing: iOS rear cameras are natively 4:3 and produce 16:9
// BY CROPPING, so the default '169' request throws away field of view before the
// preview crops it again. '43' asks for the sensor's native shape; 'native'
// drops resolution constraints entirely and takes whatever the device prefers.
export const CAMERA_MODES = {
  // Without explicit resolution constraints, mobile browsers commonly default to
  // a low webcam-grade stream (observed: 480x640) rather than the camera's
  // actual capability -- 'ideal' asks for as much as the device supports,
  // falling back gracefully rather than hard-failing if it isn't available.
  '169': { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
  '43': { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1920 } },
  native: { facingMode: 'environment' },
};

export async function requestCamera(videoEl, mode = '169') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { error: 'unavailable' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: CAMERA_MODES[mode] || CAMERA_MODES['169'],
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return { stream };
  } catch (e) {
    // NotAllowedError / SecurityError => permission; everything else
    // (NotFoundError, NotReadableError, OverconstrainedError, ...) => hardware.
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    return { error: denied ? 'denied' : 'unavailable' };
  }
}

// Back-compat wrapper: stream or null, treating every failure the same.
export async function startCamera(videoEl) {
  const { stream } = await requestCamera(videoEl);
  return stream || null;
}

// Full-frame capture. Kept for callers with no viewfinder geometry (the upload
// path hands over a photo from the library, which has no brackets to obey).
export function captureFullFrame(videoEl, canvasFactory) {
  const w = videoEl.videoWidth, h = videoEl.videoHeight;
  const { ctx } = canvasFactory(w, h);
  ctx.drawImage(videoEl, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// The blue brackets: a square about half the screen, sized from the displayed
// image's width and dropped `topFrac` down it. The scanner reads exactly what
// is inside — put your tiles in the box.
export const SCAN_BOX = { widthFrac: 0.84, topFrac: 0.16 };

/**
 * Where the video's pixels actually land on screen, in CSS px relative to the
 * video element's own box.
 *
 * The viewfinder runs `object-fit: contain` by default (camera-diag.js's
 * OBJECT_FIT, applied in main.js) so the player sees the WHOLE frame, usually
 * letterboxed — cover was hiding ~74% of the frame on a phone. The brackets are
 * drawn onto this rect, not onto the screen, or they would sit partly on the
 * black bars and promise a scan area that does not exist.
 */
export function computeDisplayRect(videoW, videoH, viewW, viewH, fit = 'contain') {
  if (!videoW || !videoH || !viewW || !viewH) return { x: 0, y: 0, width: viewW || 0, height: viewH || 0 };
  const scale = fit === 'cover'
    ? Math.max(viewW / videoW, viewH / videoH)
    : Math.min(viewW / videoW, viewH / videoH);
  const width = videoW * scale, height = videoH * scale;
  return { x: (viewW - width) / 2, y: (viewH - height) / 2, width, height, scale };
}

/**
 * The scan box in CSS px — where the brackets are drawn.
 *
 * Sized from the image ON SCREEN, never from the screen itself: under `contain`
 * a 16:9 frame in a tall phone is letterboxed, and a screen-anchored box would
 * hang over the black bars promising a scan area that has no pixels behind it.
 * The square shrinks to fit a short image rather than spilling off it.
 */
export function computeScanBox(videoW, videoH, viewW, viewH, fit = 'contain', box = SCAN_BOX) {
  const d = computeDisplayRect(videoW, videoH, viewW, viewH, fit);
  // Under `cover` the image overflows the viewport; only the on-screen part counts.
  const left = Math.max(d.x, 0), top = Math.max(d.y, 0);
  const right = Math.min(d.x + d.width, viewW), bottom = Math.min(d.y + d.height, viewH);
  const availW = Math.max(0, right - left), availH = Math.max(0, bottom - top);
  const side = Math.max(0, Math.min(availW * box.widthFrac, availH * 0.92));
  const y = Math.min(top + availH * box.topFrac, bottom - side);
  return { x: left + (availW - side) / 2, y, width: side, height: side, display: d };
}

/**
 * The same box in NATIVE video pixels — what the scanner actually reads, and
 * what Review shows back. One box, two coordinate spaces, so they cannot
 * disagree about where the scan area is.
 */
export function computeScanCrop(videoW, videoH, viewW, viewH, fit = 'contain', box = SCAN_BOX) {
  if (!videoW || !videoH || !viewW || !viewH) {
    return { x: 0, y: 0, width: videoW || 1, height: videoH || 1 };
  }
  const b = computeScanBox(videoW, videoH, viewW, viewH, fit, box);
  const { x: dx, y: dy, scale } = b.display;
  const x = Math.max(0, (b.x - dx) / scale), y = Math.max(0, (b.y - dy) / scale);
  return {
    x, y,
    width: Math.max(1, Math.min(b.width / scale, videoW - x)),
    height: Math.max(1, Math.min(b.height / scale, videoH - y)),
  };
}

// Capture exactly what the dashed box encloses. This is what the scanner reads,
// so a tile outside the box is genuinely out of play — and Review shows this
// same image back, which is why the two can never disagree.
export function captureScanArea(videoEl, canvasFactory, fit = 'contain') {
  const { x, y, width, height } = computeScanCrop(
    videoEl.videoWidth, videoEl.videoHeight, videoEl.clientWidth, videoEl.clientHeight, fit);
  const w = Math.round(width), h = Math.round(height);
  const { ctx } = canvasFactory(w, h);
  ctx.drawImage(videoEl, x, y, width, height, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export function stopCamera(stream) {
  if (stream) stream.getTracks().forEach(track => track.stop());
}

// Single source of truth for the visual guide (main.js sets .inner-guide's
// CSS inset from this) and the actual crop below -- they must never drift
// apart, or the box on screen would lie about what's actually captured.
export const GUIDE_INSET_FRAC = 0.06;
// Matches .camera-view's CSS `aspect-ratio: 3 / 4`.
const BOX_ASPECT = 3 / 4;

// object-fit: cover means the on-screen video is not necessarily a 1:1
// view of the full native frame -- if the native stream's aspect ratio
// doesn't match the 3:4 box, cover scales it up and crops whichever
// dimension overflows (centered) to fill the box. This computes that
// same "visible native region" first, then applies the guide-box inset
// within it, so the crop always matches what was actually on screen,
// regardless of what aspect ratio the camera happened to deliver.
export function computeGuideCrop(videoWidth, videoHeight, boxAspect = BOX_ASPECT, insetFrac = GUIDE_INSET_FRAC) {
  const videoAspect = videoWidth / videoHeight;
  let visible;
  if (videoAspect > boxAspect) {
    // native is wider than the box -- cover crops left/right
    const visW = videoHeight * boxAspect;
    visible = { x: (videoWidth - visW) / 2, y: 0, width: visW, height: videoHeight };
  } else {
    // native is narrower/taller than the box -- cover crops top/bottom
    const visH = videoWidth / boxAspect;
    visible = { x: 0, y: (videoHeight - visH) / 2, width: videoWidth, height: visH };
  }
  const insetX = visible.width * insetFrac;
  const insetY = visible.height * insetFrac;
  return {
    x: visible.x + insetX,
    y: visible.y + insetY,
    width: visible.width - insetX * 2,
    height: visible.height - insetY * 2,
  };
}

// videoEl: a playing <video> showing the camera stream. Returns an
// ImageData-shaped object ({data, width, height}) matching what
// scanner.scanImage() expects, cropped to the visual guide box -- full
// native-frame capture was producing false-positive detections on
// background clutter at the edges, which the guide box's margin excludes.
export function captureFrame(videoEl, canvasFactory) {
  const { x, y, width, height } = computeGuideCrop(videoEl.videoWidth, videoEl.videoHeight);
  const w = Math.round(width), h = Math.round(height);
  const { ctx } = canvasFactory(w, h);
  ctx.drawImage(videoEl, x, y, width, height, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
