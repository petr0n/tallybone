// tests/support/ws-client.js — a minimal Tallybone protocol client shared by the
// server smoke test and the stress bots. Connect, send intents, await a matching
// inbound message. No browser — speaks the WebSocket protocol directly.
import WebSocket from 'ws';

export function makeClient(base, code) {
  const ws = new WebSocket(`${base}/api/game/${code}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    let msg; try { msg = JSON.parse(d.toString()); } catch { return; }
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(msg)) { clearTimeout(waiters[i].timer); waiters[i].resolve(msg); waiters.splice(i, 1); }
    }
  });
  return {
    ws,
    open: () => new Promise((r, j) => { ws.on('open', r); ws.on('error', j); }),
    send: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
    waitFor: (pred, label, timeoutMs = 5000) => new Promise((resolve, reject) => {
      const found = inbox.find(pred);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error('timeout: ' + (label || 'msg'))), timeoutMs);
      waiters.push({ pred, resolve, timer });
    }),
  };
}

export const isYou = (m) => m.t === 'you' && m.playerId;
export const stateWhere = (fn) => (m) => m.t === 'state' && fn(m.game);
