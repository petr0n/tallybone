// app/src/main.js — Tallybone app orchestrator. Home is the entry; the Phase-1
// scanner is a sub-flow reachable solo (fully offline) or in-game. The Phase-2
// game is now REAL multiplayer: net.js holds one WebSocket to the game's Durable
// Object, screens render from the live server snapshot and emit intents, and the
// server's `phase` drives which screen everyone is on (so a manager starting a
// round moves every phone). Navigation is a history-aware stack; live game
// screens also re-render in place whenever a fresh snapshot arrives.
import './style.css';
import './screens.css';
import { ENABLE_UPLOAD_FALLBACK, ENABLE_CORPUS_CAPTURE } from './config.js';
import { requestCamera, stopCamera, captureScanArea } from './camera.js';
import { DIAG_ON, attachCameraDiag, CAMERA_MODE, OBJECT_FIT } from './camera-diag.js';
import { fileToImageData } from './upload.js';
import { initScanner, scanWithProgress } from './scan.js';
import { renderCapture, layoutScanBox } from './screens/capture.js';
import { renderScanning } from './screens/scanning.js';
import { renderReview } from './screens/review.js';
import { renderSubmitted } from './screens/submitted.js';
import { renderDenied, renderEmpty, renderUnavailable, renderCameraBlocked, renderScannerStuck } from './screens/fallback.js';
import { renderHome, renderRules, renderCreate, renderJoin, renderLobby } from './screens/game-setup.js';
import { renderRound, renderSubmit, renderStandings, renderManager, renderOver, renderPickDouble, renderRoundDetail, renderFixScore } from './screens/game-play.js';
import { mintCode, suggestedNextDouble, viewGame, scoredPlayers, joinUrl, joinCodeFromUrl } from './game-state.js';
import { brandLockup } from './brand.js';
import { html } from './dom.js';
import { isIOS, isIOSNonSafari } from './platform.js';
import * as net from './net.js';
import { measure, play, enter, resetGroup, reducedMotion } from './motion.js';
import { scanEvent, postScanLog } from './scanlog.js';

// On iOS every browser is WebKit; the live camera (getUserMedia) is unreliable
// outside Safari, so always offer the native photo-capture path there.
const photoFallback = ENABLE_UPLOAD_FALLBACK || isIOS();

const CONFIDENCE_OK = 0.85;
const root = document.querySelector('#app');
const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } };
const copyText = (t) => { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}); };

let stream = null;
let currentVideo = null;
let captureRelayout = null;   // window resize handler owned by the capture screen
let lastCaptureGeom = null;   // viewfinder geometry of the last capture (?tail=1 telemetry)
let scanContext = 'solo';   // 'solo' | 'ingame'
let lastScan = null;        // { tiles, sourceImageData, photoW, photoH }
let scanRunId = 0;          // bumped on nav/back to invalidate an in-flight scan

// ---------- live multiplayer state ----------
let snapshot = null;        // latest raw game snapshot from the DO
let shownPhase = null;      // phase the UI is currently following
let routeNextSnapshot = false; // route to the phase's screen once we're seated
let liveRepaint = null;     // re-render fn for the current live screen (else null)
let createDraft = null;     // { code, managerName, copied } for the Create screen
let joinError = '';         // last server join error to surface on the Join screen
let joinPrefill = '';       // code to prefill on the Join screen
let joinName = '';          // name to prefill on the Join screen (last attempt)
const view = () => viewGame(snapshot, net.whoami().playerId);

const PHASE_SCREEN = { lobby: showLobby, round: showRound, standings: showStandings, over: showOver };
const AUTO_NAV = new Set(['round', 'over', 'lobby']); // phases that pull every phone to their screen

net.onState((g) => {
  snapshot = g;
  if (routeNextSnapshot) {
    if (!net.whoami().playerId) return;        // wait until our seat is confirmed
    routeNextSnapshot = false;
    safeSet('tb.active', net.whoami().code);    // remember the game for reload-reconnect
    shownPhase = g.phase;
    navResetFromServer(PHASE_SCREEN[g.phase] || showHome);
    return;
  }
  if (AUTO_NAV.has(g.phase) && g.phase !== shownPhase) {
    shownPhase = g.phase;
    navResetFromServer(PHASE_SCREEN[g.phase]);
    return;
  }
  shownPhase = g.phase;
  if (liveRepaint) liveRepaint();
});

net.onError((code) => {
  if (code === 'name_taken' || code === 'name_required') { joinError = code; navSwap(showJoin); }
  else if (code === 'seat_lost') {
    // Reconnect found no seat and we have no remembered name to reclaim with.
    // Send the player to Join with the code filled in rather than leaving them
    // stranded on Home waiting for a confirmation that will never arrive.
    const lost = net.whoami().code;
    routeNextSnapshot = false;
    if (lost) { joinPrefill = lost; joinError = ''; navReset(showJoin); }
  } else console.warn('game error:', code);
});

let scannerReady = false;
let scannerError = null;
let scannerInitPromise = null;

// Canvases handed to the scanner during one scan. A 15-tile hand asks for the
// capture, a letterbox for detection, and one per tile for pip counting — and
// WebKit only reliably frees a canvas's backing store when it is resized to 0,
// which is why an iPhone 16 (8GB of RAM) hit iOS's per-tab budget after a few
// scans. They are released together once the scan is done; nothing downstream
// keeps a canvas, only the ImageData read out of it.
let scratchCanvases = [];
function canvasFactory(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  scratchCanvases.push(canvas);
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}
function releaseScratchCanvases() {
  for (const c of scratchCanvases) { c.width = 0; c.height = 0; }
  scratchCanvases = [];
}

// The last scan holds a full-resolution ImageData (~12.6MB at 1814x1814) so
// Review can rebuild its per-tile crops when navigated back to. Drop it the
// moment the scan flow is left, rather than carrying it for the rest of the
// session.
function clearLastScan() {
  lastScan = null;
  releaseScratchCanvases();
}
function mount(node) {
  if (stream) { stopCamera(stream); stream = null; }
  currentVideo = null;
  // The capture screen registers a window resize listener to keep the scan box
  // on the frame; drop it with the screen rather than leaving one per visit.
  if (captureRelayout) { removeEventListener('resize', captureRelayout); captureRelayout = null; }
  root.replaceChildren(node);
}

// ---------- history-aware navigation ----------
// navStack holds "shower" functions; each mounts a screen. Forward = navGo
// (pushState), replace-in-place = navSwap, back = navBack -> popstate pops.
// Every navigation clears liveRepaint; a live game screen re-arms it itself.
const navStack = [];
function paintTop() { liveRepaint = null; const s = navStack[navStack.length - 1]; if (s) s(); }
function navReset(show) { liveRepaint = null; navStack.length = 0; navStack.push(show); history.replaceState({ n: 1 }, ''); show(); }
// The server can move every phone at once — the manager starts a round and your
// screen changes without you touching anything. That deserves a bridge. Taps you
// made yourself do NOT: they are frequent and already feel direct, and a delay
// there reads as lag.
function navResetFromServer(show) {
  navReset(show);
  if (!reducedMotion() && root.firstElementChild) {
    enter(root.firstElementChild, { from: 'translateY(6px)', duration: 'var(--dur-bridge)' });
  }
}
function navGo(show) { liveRepaint = null; navStack.push(show); history.pushState({ n: navStack.length }, ''); show(); }
function navSwap(show) { liveRepaint = null; navStack[navStack.length - 1] = show; show(); }
function navBack() { history.back(); }
window.addEventListener('popstate', () => {
  scanRunId += 1;
  if (navStack.length > 1) { navStack.pop(); paintTop(); } else { paintTop(); }
});

// Two different intentions, previously conflated into one destructive action.
//
// `tb.active` is the pointer boot uses to reconnect ("the game I'm seated at").
// Deleting it is how a player LOSES their game: the seat and its token are still
// intact, but the app no longer knows which room to return to, so it strands
// them on Home. Backing out of a live screen must therefore NOT delete it —
// tapping a header chevron is navigation, not resignation.
function goHomeKeepingSeat() {
  net.disconnect();                 // stop following; others see us as away
  resetGroup('lobby');              // next table's seats animate in afresh
  safeSet('tb.away', '1');          // deliberate: don't hijack the next load
  snapshot = null; shownPhase = null; routeNextSnapshot = false;
  navReset(showHome);               // tb.active kept: the seat is still ours
}

// The genuine "I'm done with this game" exit, offered once the game is over.
function leaveGame() {
  safeDel('tb.active');
  goHomeKeepingSeat();
}
// Join a game: open the socket + take a seat. Routing to the lobby happens once
// the server confirms our seat (routeNextSnapshot in the onState handler).
function enterGame(code, name, { creator = false } = {}) {
  safeDel('tb.away');
  net.connect(code);
  // `creator` = this phone minted the code and is opening the table. The Create
  // screen shows the QR before this point, so a guest can already have joined;
  // the flag is what keeps the game with the person who started it.
  net.join(name, { creator });
  routeNextSnapshot = true;
}

function bootNode(msg) {
  const node = html('<div class="tb-boot"></div>');
  node.appendChild(brandLockup({ markHeight: 120, onDark: true }));
  node.appendChild(html(`<div class="tb-boot__title" style="font-size:18px;margin-top:4px;">${msg}</div>`));
  return node;
}

// ---------- Phase-2 game screens ----------
function showHome() {
  // Landing on Home means the scan flow is over; let ~13MB of capture go.
  clearLastScan();
  mount(renderHome({
    onStartGame: () => { createDraft = { code: mintCode(), managerName: net.rememberedName() || '', copied: false }; navGo(showCreate); },
    onJoin: () => { joinError = ''; joinPrefill = ''; navGo(showJoin); },
    onSolo: () => { scanContext = 'solo'; ensureScannerThen(() => navGo(showCapture)); },
    onRules: () => navGo(showRules),
  }));
}
function showRules() { mount(renderRules({ onBack: navBack })); }
function showCreate() {
  mount(renderCreate({
    game: createDraft,
    onBack: navBack,
    onName: (v) => { createDraft.managerName = v; },
    onNewCode: () => { createDraft.code = mintCode(); createDraft.copied = false; navSwap(showCreate); },
    // Copy the join LINK, not the bare code — this pill sits next to the QR, so
    // it's the "can't scan, text it to me instead" path. The code itself is on
    // screen in 58px tiles for reading aloud.
    onCopy: () => { copyText(joinUrl(createDraft.code)); createDraft.copied = true; navSwap(showCreate); },
    onRules: () => navGo(showRules),
    onOpen: () => enterGame(createDraft.code, (createDraft.managerName || '').trim() || 'Manager', { creator: true }),
  }));
}
function showJoin() {
  mount(renderJoin({
    prefillCode: joinPrefill || (safeGet('tb.away') === '1' ? (safeGet('tb.active') || '') : ''),
    prefillName: joinName || net.rememberedName() || '',
    error: joinError,
    onBack: navBack,
    onRules: () => navGo(showRules),
    onJoin: (code, name) => { joinError = ''; joinPrefill = code; joinName = name; enterGame(code, name); },
  }));
}
function showLobby() {
  liveRepaint = showLobby;
  mount(renderLobby({
    game: view(),
    canManage: net.isManager(),
    onBack: goHomeKeepingSeat,
    onRules: () => navGo(showRules),
    onStartRound: () => net.send({ t: 'startRound' }),
    onCopy: () => copyText(joinUrl(view().code)),
    onRemove: (id) => net.send({ t: 'removePlayer', id }),
  }));
}
function showRound() {
  liveRepaint = showRound;
  mount(renderRound({
    game: view(),
    onBack: goHomeKeepingSeat,
    onRules: () => navGo(showRules),
    onScan: () => { scanContext = 'ingame'; ensureScannerThen(() => navGo(showCapture)); },
    onWin: () => { net.send({ t: 'turnIn', total: 0 }); navGo(showStandings); },
    onScores: () => navGo(showStandings),
  }));
}
function showPickDouble() {
  mount(renderPickDouble({
    game: view(),
    suggested: suggestedNextDouble(view()),
    onBack: navBack,
    onRules: () => navGo(showRules),
    onConfirm: (d) => net.send({ t: 'pickDouble', d }), // phase -> round routes everyone
  }));
}
// Rows re-sort as scores land. Measure where each player's row IS, let the
// screen re-render, then hand the new nodes their old position so they travel
// to the new one — otherwise the order changes silently under the reader.
const rowsById = () => {
  const m = new Map();
  document.querySelectorAll('[data-pid]').forEach((el) => m.set(el.dataset.pid, el));
  return m;
};

function showStandings() {
  liveRepaint = showStandings;
  const before = measure(rowsById());
  mount(renderStandings({
    game: view(),
    canManage: net.isManager(),
    onBack: navBack,
    onRules: () => navGo(showRules),
    onManager: () => navGo(showManager),
    onStartNext: () => navGo(showPickDouble),
    onDetail: () => navGo(showRoundDetail),
  }));
  play(before, rowsById());
}
// Live: it reads this round's turn-ins straight off the snapshot, so it keeps
// up as the remaining players turn in.
function showRoundDetail() {
  liveRepaint = showRoundDetail;
  mount(renderRoundDetail({ game: view(), onBack: navBack, onRules: () => navGo(showRules) }));
}
// Deliberately NOT registered for liveRepaint: the manager is typing a number,
// and a snapshot from anyone else turning in would wipe the field mid-entry.
function makeShowFixScore(playerId) {
  return function showFixScore() {
    const g = view();
    const player = scoredPlayers(g).find((p) => p.id === playerId);
    if (!player) { navBack(); return; }
    mount(renderFixScore({
      game: g,
      player,
      onBack: navBack,
      onRules: () => navGo(showRules),
      onSave: (total) => { net.send({ t: 'setScore', id: playerId, total }); navBack(); },
    }));
  };
}
function showManager() {
  liveRepaint = showManager;
  mount(renderManager({
    game: view(),
    onBack: navBack,
    onStartNext: () => navGo(showPickDouble),
    onRules: () => navGo(showRules),
    onReopen: () => net.send({ t: 'reopenRound' }),   // phase -> round routes everyone
    onRemove: (id) => net.send({ t: 'removePlayer', id }),
    onCallGame: () => net.send({ t: 'callGame' }),     // phase -> over routes everyone
    onFixScore: (id) => navGo(makeShowFixScore(id)),
  }));
}
function showOver() {
  liveRepaint = showOver;
  mount(renderOver({
    game: view(),
    canManage: net.isManager(),
    onRules: () => navGo(showRules),
    onRunItBack: () => net.send({ t: 'runItBack' }),   // phase -> lobby routes everyone
    onHome: leaveGame,
  }));
}
function makeShowGameSubmit(tiles) {
  return function showGameSubmit() {
    mount(renderSubmit({
      game: view(), tiles,
      onBack: navBack,
      onChangeRead: () => { if (lastScan) navGo(makeShowReview(lastScan)); else navBack(); },
      onRules: () => navGo(showRules),
    onTurnIn: (total) => { net.send({ t: 'turnIn', total }); navGo(showStandings); },
    }));
  };
}

// ---------- Phase-1 scanner sub-flow ----------
function startScannerInit() {
  if (!scannerInitPromise) {
    scannerInitPromise = initScanner()
      .then(() => { scannerReady = true; })
      // Clear the promise so a retry is a REAL second attempt. Keeping the
      // rejected one made every retry replay the same failure instantly.
      .catch((e) => { scannerError = e; scannerInitPromise = null; throw e; });
  }
  return scannerInitPromise;
}

// How long to sit on WARMING UP before offering a way out. The models are
// ~6.3MB and a first load on a phone is genuinely slow, so this is generous —
// but it is not infinite, which is what it used to be.
const SCANNER_BOOT_TIMEOUT_MS = 20000;

function showScannerStuck(cb, detail) {
  mount(renderScannerStuck({
    detail,
    onManual: showManual,
    onBack: navBack,
    onRetry: () => { scannerError = null; scannerInitPromise = null; ensureScannerThen(cb); },
  }));
}

function ensureScannerThen(cb) {
  if (scannerReady) { cb(); return; }
  mount(bootNode('WARMING UP…'));
  let done = false;
  // A hang is the failure that stranded a player mid-game: init never settled,
  // so the screen never changed and there was no route even to manual entry.
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    showScannerStuck(cb, 'Error SCN-01 · still loading after 20s');
  }, SCANNER_BOOT_TIMEOUT_MS);
  startScannerInit().then(
    () => {
      clearTimeout(timer);
      // If we already gave up and offered the escape, do NOT yank the player
      // off it — they may be typing a hand in by now.
      if (done) return;
      done = true;
      cb();
    },
    (e) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      showScannerStuck(cb, `Error SCN-02 · ${(e && e.message) || 'scanner failed to load'}`);
    });
}
function showCapture() {
  const cap = renderCapture({
    onShutter: doScan,
    onHelp: () => navGo(showRules),
    onUpload: photoFallback ? doUpload : null,
    onBack: navBack,
  });
  mount(cap.el);
  currentVideo = cap.video;
  cap.video.style.objectFit = OBJECT_FIT();   // ?fit=contain shows the whole frame
  // The dashed box tracks the video's displayed rect, which is not known until
  // the stream reports its dimensions and changes on rotate/resize.
  const relayout = () => layoutScanBox(cap.video, cap.reticle, OBJECT_FIT());
  cap.video.addEventListener('loadedmetadata', relayout);
  cap.video.addEventListener('resize', relayout);
  addEventListener('resize', relayout);
  captureRelayout = relayout;
  requestCamera(cap.video, CAMERA_MODE()).then((res) => {
    if (res.stream) {
      stream = res.stream;
      // ?diag=1 only: overlay what the camera actually negotiated vs what the
      // preview shows. Used to settle framing questions with real device
      // numbers instead of inference. No effect on the normal path.
      if (DIAG_ON()) cap.el.appendChild(attachCameraDiag(cap.video, res.stream));
    } else if (photoFallback) navSwap(showCameraBlocked); // iOS: live camera blocked -> take a photo
    else if (res.error === 'denied') navSwap(showDenied);
    else navSwap(showUnavailable);
  });
}
function showCameraBlocked() {
  mount(renderCameraBlocked({
    iosNonSafari: isIOSNonSafari(),
    onUpload: doUpload,
    onManual: showManual,
    onBack: navBack,
  }));
}
function doScan() {
  if (!currentVideo || !currentVideo.videoWidth) return;
  // Only what the brackets enclose: they are the promise the screen makes, and
  // Review shows this same image back, so the two cannot disagree.
  lastCaptureGeom = {
    videoW: currentVideo.videoWidth, videoH: currentVideo.videoHeight,
    boxW: currentVideo.clientWidth, boxH: currentVideo.clientHeight,
  };
  navGo(makeShowScanning(captureScanArea(currentVideo, canvasFactory, OBJECT_FIT())));
}
function doUpload(file) {
  if (!file) return;
  lastCaptureGeom = null;   // a library photo has no viewfinder geometry
  fileToImageData(file, canvasFactory).then((imageData) => navGo(makeShowScanning(imageData)));
}
function makeShowScanning(imageData) {
  return function showScanning() {
    const myRun = ++scanRunId;
    const scanning = renderScanning({ onCancel: navBack });
    mount(scanning.el);
    (async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let results;
      const t0 = Date.now();
      try {
        results = await scanWithProgress(imageData, canvasFactory, (m) => scanning.setStatus(m));
      } catch (err) {
        console.error('scan failed', err);
        if (myRun === scanRunId) navSwap(showEmpty);
        return;
      }
      if (myRun !== scanRunId) return; // navigated away mid-scan
      if (!results || results.length === 0) { navSwap(showEmpty); return; }
      const tiles = results.map((r) => ({
        a: r.predicted.first, b: r.predicted.second,
        conf: (r.predicted.confidence ?? 1) >= CONFIDENCE_OK ? 'ok' : 'check',
        bbox: r.bbox, corners: r.corners,
      }));
      lastScan = { tiles, sourceImageData: imageData, photoW: imageData.width, photoH: imageData.height };
      // The scanner is done with its working canvases; only ImageData survives.
      releaseScratchCanvases();
      // ?tail=1 only: stream the read to `wrangler tail` so a real-device scan
      // is observable. What it read here, versus what gets submitted after the
      // player fixes it, is the accuracy measurement.
      postScanLog(scanEvent('scan', {
        ...(lastCaptureGeom || {}),
        cropW: imageData.width, cropH: imageData.height,
        ms: Date.now() - t0, tiles,
      }));
      navSwap(makeShowReview(lastScan));
    })();
  };
}
function makeShowReview(scan) {
  return function showReview() {
    mount(renderReview({
      tiles: scan.tiles,
      sourceImageData: scan.sourceImageData,
      photoW: scan.photoW, photoH: scan.photoH,
      onBack: navBack,
      onRules: () => navGo(showRules),
      onSubmit: (total, corrected) => {
        if (ENABLE_CORPUS_CAPTURE) { /* TODO: post corrected payload to /api/handscan */ }
        // The corrected hand — ground truth for the scan logged a moment ago.
        postScanLog(scanEvent('submit', { total, tiles: corrected }));
        if (scanContext === 'ingame') navGo(makeShowGameSubmit(corrected));
        else navGo(makeShowSubmitted(total));
      },
    }));
  };
}
function makeShowSubmitted(total) {
  return function showSubmitted() {
    mount(renderSubmitted({ total, onScanAnother: () => navGo(showCapture) }));
  };
}
// Manual entry: review seeded with one blank tile (domino fallback, no crop).
function showManual() {
  navGo(makeShowReview({ tiles: [{ a: 0, b: 0, conf: 'ok' }], sourceImageData: null, photoW: 0, photoH: 0 }));
}
function showDenied() { mount(renderDenied({ onRetry: () => navSwap(showCapture), onOpenSettings: () => navSwap(showCapture) })); }
function showUnavailable() { mount(renderUnavailable({ onRetry: () => navSwap(showCapture), onManual: showManual })); }
function showEmpty() { mount(renderEmpty({ onRetry: () => navSwap(showCapture), onManual: showManual })); }

// ---------- start ----------
startScannerInit().catch(() => {}); // warm the models in the background

// Deep link: `/?j=CODE`, from a scanned QR or a shared link. Strip the param
// straight away (replaceState, so no extra history entry) — otherwise a reload
// or a back-out of the game would keep dragging the player to Join, and the
// code would linger in the address bar after they've moved on.
const linkCode = joinCodeFromUrl(location.search);
// Following a join link is an explicit intent to be in that game, so it cancels
// any earlier "stepped away".
if (linkCode) { history.replaceState(null, '', location.pathname + location.hash); safeDel('tb.away'); }

const activeCode = safeGet('tb.active');
const steppedAway = safeGet('tb.away') === '1';
if (linkCode && linkCode !== activeCode) {
  // A table we're not already sitting at: Join, code filled in, name to enter.
  joinPrefill = linkCode;
  navReset(showJoin);
} else {
  // No link, or a link back to the game we're already in. Reclaim the seat and
  // route to it on the first snapshot — UNLESS the player deliberately backed
  // out to Home last time, in which case the seat is kept but they land on Home
  // rather than being dragged back into a game they chose to leave. A real drop
  // (crash, phone lock, closed tab) never sets that flag, so it still recovers.
  if (activeCode && !steppedAway) { routeNextSnapshot = true; net.connect(activeCode); }
  navReset(showHome);
}
