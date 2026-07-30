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
import { requestCamera, stopCamera, captureFullFrame } from './camera.js';
import { fileToImageData } from './upload.js';
import { initScanner, scanWithProgress } from './scan.js';
import { renderCapture } from './screens/capture.js';
import { renderScanning } from './screens/scanning.js';
import { renderReview } from './screens/review.js';
import { renderSubmitted } from './screens/submitted.js';
import { renderDenied, renderEmpty, renderUnavailable, renderCameraBlocked } from './screens/fallback.js';
import { renderHome, renderRules, renderCreate, renderJoin, renderLobby } from './screens/game-setup.js';
import { renderRound, renderSubmit, renderStandings, renderManager, renderOver, renderPickDouble } from './screens/game-play.js';
import { mintCode, suggestedNextDouble, viewGame, joinUrl, joinCodeFromUrl } from './game-state.js';
import { brandLockup } from './brand.js';
import { html } from './dom.js';
import { isIOS, isIOSNonSafari } from './platform.js';
import * as net from './net.js';

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
let scanContext = 'solo';   // 'solo' | 'ingame'
let lastScan = null;        // { tiles, sourceImageData, photoBitmap, photoW, photoH }
let scanRunId = 0;          // bumped on nav/back to invalidate an in-flight scan

// ---------- live multiplayer state ----------
let snapshot = null;        // latest raw game snapshot from the DO
let shownPhase = null;      // phase the UI is currently following
let routeNextSnapshot = false; // route to the phase's screen once we're seated
let liveRepaint = null;     // re-render fn for the current live screen (else null)
let createDraft = null;     // { code, managerName, copied } for the Create screen
let joinError = '';         // last server join error to surface on the Join screen
let joinPrefill = '';       // code to prefill on the Join screen
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
    navReset(PHASE_SCREEN[g.phase] || showHome);
    return;
  }
  if (AUTO_NAV.has(g.phase) && g.phase !== shownPhase) {
    shownPhase = g.phase;
    navReset(PHASE_SCREEN[g.phase]);
    return;
  }
  shownPhase = g.phase;
  if (liveRepaint) liveRepaint();
});

net.onError((code) => {
  if (code === 'name_taken' || code === 'name_required') { joinError = code; navSwap(showJoin); }
  else console.warn('game error:', code);
});

let scannerReady = false;
let scannerError = null;
let scannerInitPromise = null;

function canvasFactory(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}
function mount(node) {
  if (stream) { stopCamera(stream); stream = null; }
  currentVideo = null;
  root.replaceChildren(node);
}

// ---------- history-aware navigation ----------
// navStack holds "shower" functions; each mounts a screen. Forward = navGo
// (pushState), replace-in-place = navSwap, back = navBack -> popstate pops.
// Every navigation clears liveRepaint; a live game screen re-arms it itself.
const navStack = [];
function paintTop() { liveRepaint = null; const s = navStack[navStack.length - 1]; if (s) s(); }
function navReset(show) { liveRepaint = null; navStack.length = 0; navStack.push(show); history.replaceState({ n: 1 }, ''); show(); }
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
  snapshot = null; shownPhase = null; routeNextSnapshot = false;
  navReset(showHome);               // tb.active kept: returning reconnects us
}

// The genuine "I'm done with this game" exit, offered once the game is over.
function leaveGame() {
  safeDel('tb.active');
  goHomeKeepingSeat();
}
// Join a game: open the socket + take a seat. Routing to the lobby happens once
// the server confirms our seat (routeNextSnapshot in the onState handler).
function enterGame(code, name) {
  net.connect(code);
  net.join(name);
  routeNextSnapshot = true;
}

function bootNode(msg) {
  const node = html('<div class="tb-boot"></div>');
  node.appendChild(brandLockup({ markHeight: 120, onDark: true }));
  node.appendChild(html(`<div class="tb-boot__title" style="font-size:18px;margin-top:4px;">${msg}</div>`));
  return node;
}
function errorBoot() {
  return html('<div class="tb-boot"><div class="tb-boot__title">SCANNER FAILED TO LOAD</div>' +
    `<div class="tb-boot__sub">${(scannerError && scannerError.message) || 'model load error'}</div></div>`);
}

// ---------- Phase-2 game screens ----------
function showHome() {
  mount(renderHome({
    onStartGame: () => { createDraft = { code: mintCode(), managerName: '', copied: false }; navGo(showCreate); },
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
    onOpen: () => enterGame(createDraft.code, (createDraft.managerName || '').trim() || 'Manager'),
  }));
}
function showJoin() {
  mount(renderJoin({
    prefillCode: joinPrefill,
    error: joinError,
    onBack: navBack,
    onJoin: (code, name) => { joinError = ''; joinPrefill = code; enterGame(code, name); },
  }));
}
function showLobby() {
  liveRepaint = showLobby;
  mount(renderLobby({
    game: view(),
    canManage: net.isManager(),
    onBack: goHomeKeepingSeat,
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
    onConfirm: (d) => net.send({ t: 'pickDouble', d }), // phase -> round routes everyone
  }));
}
function showStandings() {
  liveRepaint = showStandings;
  mount(renderStandings({
    game: view(),
    canManage: net.isManager(),
    onBack: navBack,
    onManager: () => navGo(showManager),
    onStartNext: () => navGo(showPickDouble),
    onDetail: () => navGo(makeShowGameSubmit(lastScan ? lastScan.tiles : null)),
  }));
}
function showManager() {
  liveRepaint = showManager;
  mount(renderManager({
    game: view(),
    onBack: navBack,
    onStartNext: () => navGo(showPickDouble),
    onReopen: () => net.send({ t: 'reopenRound' }),   // phase -> round routes everyone
    onRemove: (id) => net.send({ t: 'removePlayer', id }),
    onCallGame: () => net.send({ t: 'callGame' }),     // phase -> over routes everyone
  }));
}
function showOver() {
  liveRepaint = showOver;
  mount(renderOver({
    game: view(),
    canManage: net.isManager(),
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
      onTurnIn: (total) => { net.send({ t: 'turnIn', total }); navGo(showStandings); },
    }));
  };
}

// ---------- Phase-1 scanner sub-flow ----------
function startScannerInit() {
  if (!scannerInitPromise) {
    scannerInitPromise = initScanner()
      .then(() => { scannerReady = true; })
      .catch((e) => { scannerError = e; throw e; });
  }
  return scannerInitPromise;
}
function ensureScannerThen(cb) {
  if (scannerReady) { cb(); return; }
  if (scannerError) { mount(errorBoot()); return; }
  mount(bootNode('WARMING UP…'));
  startScannerInit().then(cb).catch(() => mount(errorBoot()));
}
function showCapture() {
  const cap = renderCapture({
    onShutter: doScan,
    onUpload: photoFallback ? doUpload : null,
    onBack: navBack,
  });
  mount(cap.el);
  currentVideo = cap.video;
  requestCamera(cap.video).then((res) => {
    if (res.stream) stream = res.stream;
    else if (photoFallback) navSwap(showCameraBlocked); // iOS: live camera blocked -> take a photo
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
  navGo(makeShowScanning(captureFullFrame(currentVideo, canvasFactory)));
}
function doUpload(file) {
  if (!file) return;
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
      try {
        results = await scanWithProgress(imageData, canvasFactory, (m) => scanning.setStatus(m));
      } catch (err) {
        console.error('scan failed', err);
        if (myRun === scanRunId) navSwap(showEmpty);
        return;
      }
      if (myRun !== scanRunId) return; // navigated away mid-scan
      if (!results || results.length === 0) { navSwap(showEmpty); return; }
      const bitmap = await createImageBitmap(imageData);
      if (myRun !== scanRunId) return;
      const tiles = results.map((r) => ({
        a: r.predicted.first, b: r.predicted.second,
        conf: (r.predicted.confidence ?? 1) >= CONFIDENCE_OK ? 'ok' : 'check',
        bbox: r.bbox, corners: r.corners,
      }));
      lastScan = { tiles, sourceImageData: imageData, photoBitmap: bitmap, photoW: imageData.width, photoH: imageData.height };
      navSwap(makeShowReview(lastScan));
    })();
  };
}
function makeShowReview(scan) {
  return function showReview() {
    mount(renderReview({
      tiles: scan.tiles,
      photoBitmap: scan.photoBitmap,
      sourceImageData: scan.sourceImageData,
      photoW: scan.photoW, photoH: scan.photoH,
      onBack: navBack,
      onSubmit: (total, corrected) => {
        if (ENABLE_CORPUS_CAPTURE) { /* TODO: post corrected payload to /api/handscan */ }
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
  navGo(makeShowReview({ tiles: [{ a: 0, b: 0, conf: 'ok' }], sourceImageData: null, photoBitmap: null, photoW: 0, photoH: 0 }));
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
if (linkCode) history.replaceState(null, '', location.pathname + location.hash);

const activeCode = safeGet('tb.active');
if (linkCode && linkCode !== activeCode) {
  // A table we're not already sitting at: Join, code filled in, name to enter.
  joinPrefill = linkCode;
  navReset(showJoin);
} else {
  // No link, or a link back to the game we're already in — reclaim that seat
  // rather than asking for a name again. Routing happens on the first snapshot.
  if (activeCode) { routeNextSnapshot = true; net.connect(activeCode); }
  navReset(showHome);
}
