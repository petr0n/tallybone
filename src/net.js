// app/src/net.js — the multiplayer WebSocket client. Owns one connection to a
// game's Durable Object: sends intents, receives full-state snapshots, persists
// the player's identity so a refresh reclaims the same seat, and auto-reconnects
// with capped backoff. Speaks the same protocol proven by server/smoke.mjs
// (hello/join/intents -> you/state/error).
import { API_BASE } from './config.js';

const idKey = (c) => `tb.id.${c}`;
const wsOrigin = () => {
  const base = API_BASE || (typeof location !== 'undefined' ? location.origin : '');
  return base.replace(/^http/, 'ws');
};

let socket = null;
let code = null;
let identity = { playerId: null, token: null, role: null };
let outbox = [];
let lastGame = null;
let reconnectDelay = 500;
let closedByUs = false;
const stateSubs = new Set();
const errorSubs = new Set();

function loadIdentity(c) {
  try { return JSON.parse(localStorage.getItem(idKey(c))) || {}; } catch { return {}; }
}
function saveIdentity() {
  try { localStorage.setItem(idKey(code), JSON.stringify({ playerId: identity.playerId, token: identity.token })); } catch { /* private mode */ }
}

function open() {
  closedByUs = false;
  socket = new WebSocket(`${wsOrigin()}/api/game/${code}/ws`);
  socket.addEventListener('open', () => {
    reconnectDelay = 500;
    socket.send(JSON.stringify({ t: 'hello', playerId: identity.playerId, token: identity.token }));
    const queued = outbox; outbox = [];
    queued.forEach((m) => socket.send(JSON.stringify(m)));
  });
  socket.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'state') { lastGame = msg.game; stateSubs.forEach((cb) => cb(msg.game)); }
    else if (msg.t === 'you') {
      identity = { playerId: msg.playerId, token: msg.token || identity.token, role: msg.role };
      if (identity.playerId) saveIdentity();
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
  identity = { playerId: saved.playerId || null, token: saved.token || null, role: null };
  open();
}

export function send(intent) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(intent));
  else outbox.push(intent);
}

export function join(name) { send({ t: 'join', name }); }
export function onState(cb) { stateSubs.add(cb); if (lastGame) cb(lastGame); return () => stateSubs.delete(cb); }
export function onError(cb) { errorSubs.add(cb); return () => errorSubs.delete(cb); }
export function getState() { return lastGame; }
export function whoami() { return { ...identity, code }; }
export function isManager() { return identity.role === 'manager'; }

export function disconnect() {
  closedByUs = true;
  if (socket) { try { socket.close(); } catch { /* noop */ } }
  socket = null;
  outbox = [];
}
