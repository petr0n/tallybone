// Live camera capture: getUserMedia preview + frame-to-ImageData capture.
// startCamera never throws -- permission denial / no camera is a normal,
// expected outcome the caller handles by falling back to file upload
// (build-plan-v2.md §9.0 hard constraint), not an error state.

// requestCamera classifies the failure so the UI can show the right screen:
// { stream } on success, or { error: 'denied' } when the user blocked the
// camera (recoverable in Settings) vs { error: 'unavailable' } when it's
// missing / busy / unsupported (the CAM-02 case). Resolution rationale below.
export async function requestCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { error: 'unavailable' };
  }
  try {
    // Without explicit resolution constraints, mobile browsers commonly
    // default to a low webcam-grade stream (observed: 480x640) rather than
    // the camera's actual capability -- 'ideal' asks for as much as the
    // device supports, falling back gracefully rather than hard-failing if
    // this exact resolution isn't available.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
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

// Full-frame capture for the full-bleed Tallybone viewfinder (what you see is
// what you scan). captureFrame() below still crops to the 3:4 guide box for
// the legacy bounded-card layout; the new capture screen uses this instead.
export function captureFullFrame(videoEl, canvasFactory) {
  const w = videoEl.videoWidth, h = videoEl.videoHeight;
  const { ctx } = canvasFactory(w, h);
  ctx.drawImage(videoEl, 0, 0, w, h);
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
