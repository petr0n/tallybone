// app/src/net.js — the multiplayer WebSocket client. Owns one connection to a
// game's Durable Object: sends intents, receives full-state snapshots, persists
// the player's identity so a refresh reclaims the same seat, and auto-reconnects
// with capped backoff. Speaks the same protocol proven by server/smoke.mjs
// (hello/join/intents -> you/state/error).
import { API_BASE } from './config.js';

const idKey = (c) => `tb.id.${c}`;
// Durable user record, NOT scoped to a game: who this device is. A per-game
// token alone is not enough — when it goes stale (storage eviction, reinstall,
// private mode, a new phone) the player used to be dumped on the Join screen and
// made to retype their name from memory. Remembering the name means a matching
// name is enough to put them back in their seat with nothing typed.
const NAME_KEY = 'tb.name';
const wsOrigin = () => {
  const base = API_BASE || (typeof location !== 'undefined' ? location.origin : '');
  return base.replace(/^http/, 'ws');
};

let socket = null;
let code = null;
let identity = { playerId: null, token: null, role: null, name: null };
let outbox = [];
let lastGame = null;
let reconnectDelay = 500;
let closedByUs = false;
let joinSent = false;   // per connection: did WE already take a seat on this socket?
const stateSubs = new Set();
const errorSubs = new Set();

function loadIdentity(c) {
  try { return JSON.parse(localStorage.getItem(idKey(c))) || {}; } catch { return {}; }
}
function saveIdentity() {
  try {
    localStorage.setItem(idKey(code), JSON.stringify({
      playerId: identity.playerId, token: identity.token, name: identity.name,
    }));
  } catch { /* private mode */ }
}
// The remembered display name, surviving individual games so Join/Create can
// prefill it and reconnect can reclaim a seat with it.
function readName() {
  try { return localStorage.getItem(NAME_KEY) || null; } catch { return null; }
}
function rememberName(name) {
  identity.name = name;
  try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
}
export function rememberedName() { return readName(); }

function rawSend(m) {
  socket.send(JSON.stringify(m));
  if (m && m.t === 'join') joinSent = true;
}

function open() {
  closedByUs = false;
  socket = new WebSocket(`${wsOrigin()}/api/game/${code}/ws`);
  socket.addEventListener('open', () => {
    reconnectDelay = 500;
    joinSent = false;   // fresh socket: nothing claimed on it yet
    socket.send(JSON.stringify({ t: 'hello', playerId: identity.playerId, token: identity.token }));
    // Flush before any reply can land, so a queued join is counted as ours and
    // the recovery below does not fire on top of it.
    const queued = outbox; outbox = [];
    queued.forEach(rawSend);
  });
  socket.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'state') { lastGame = msg.game; stateSubs.forEach((cb) => cb(msg.game)); }
    else if (msg.t === 'you') {
      const name = identity.name;                       // survives the reassignment
      identity = { playerId: msg.playerId, token: msg.token || identity.token, role: msg.role, name };
      if (identity.playerId) { saveIdentity(); if (name) rememberName(name); }
      else if (!joinSent && name) {
        // The token reclaimed nothing — stale, evicted, or a different device.
        // We still know who this user is, so retake the seat by name; the server
        // reclaims a disconnected seat whose name matches. No typing required.
        rawSend({ t: 'join', name });
      } else if (!joinSent) {
        // Nothing to recover with: tell the app rather than silently stranding
        // it waiting for a seat that will never be confirmed.
        errorSubs.forEach((cb) => cb('seat_lost'));
      }
    } else if (msg.t === 'error') { errorSubs.forEach((cb) => cb(msg.code)); }
  });
  socket.addEventListener('close', () => {
    if (closedByUs) return;
    setTimeout(open, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
  socket.addEventListener('error', () => { try { socket.close(); } catch { /* noop */ } });
}

// Connect to (or switch to) a game code. Restores any saved identity for that
// code so a refresh reclaims the seat.
export function connect(newCode) {
  const live = socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  if (live && code === newCode) return;
  disconnect();
  code = newCode;
  lastGame = null;
  const saved = loadIdentity(code);
  // Fall back to the device-wide name when this game's record is gone — that is
  // the case that used to force a manual retype.
  identity = {
    playerId: saved.playerId || null,
    token: saved.token || null,
    role: null,
    name: saved.name || readName(),
  };
  open();
}

export function send(intent) {
  if (socket && socket.readyState === WebSocket.OPEN) rawSend(intent);
  else outbox.push(intent);
}

// `creator: true` is the person who minted this code tapping "Open the table".
// The server hands them the game even if a guest scanned the QR first — see
// the join case in server/reducer.js.
export function join(name, { creator = false } = {}) {
  rememberName(name);
  send(creator ? { t: 'join', name, creator: true } : { t: 'join', name });
}
export function onState(cb) { stateSubs.add(cb); if (lastGame) cb(lastGame); return () => stateSubs.delete(cb); }
export function onError(cb) { errorSubs.add(cb); return () => errorSubs.delete(cb); }
export function getState() { return lastGame; }
export function whoami() { return { ...identity, code }; }
// The LIVE snapshot decides, not the `role` latched into the `you` message at
// join time. managerId can move under a player — the creator claiming a table a
// guest reached first — and a latched role left the old manager holding controls
// the server would reject as `not_manager`. `role` remains the fallback for the
// moment before the first snapshot lands.
export function isManager() {
  if (lastGame && identity.playerId) return lastGame.managerId === identity.playerId;
  return identity.role === 'manager';
}

export function disconnect() {
  closedByUs = true;
  if (socket) { try { socket.close(); } catch { /* noop */ } }
  socket = null;
  outbox = [];
}
