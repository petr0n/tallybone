// server/src/game-room.js — the GameRoom Durable Object: a thin transport shell
// around the pure reducer. It owns the WebSockets for one join code, authorizes
// via the sender's persisted playerId, applies intents through the reducer,
// persists the canonical game + token map, and broadcasts full snapshots.
//
// Uses the WebSocket Hibernation API (ctx.acceptWebSocket / webSocketMessage /
// webSocketClose) so idle games are evicted from memory and don't accrue cost.
import { DurableObject } from 'cloudflare:workers';
import { emptyGame, applyIntent } from './reducer.js';

const CODE_RE = /\/api\/game\/([A-Za-z0-9]+)\/ws/;
const send = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ } };

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;        // canonical game (see reducer.js shape)
    this.tokens = {};        // token -> playerId (seat reclaim)
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get('game')) || null;
      this.tokens = (await ctx.storage.get('tokens')) || {};
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (!this.game) {
      const m = new URL(request.url).pathname.match(CODE_RE);
      this.game = emptyGame(m ? m[1].toUpperCase() : 'UNKNOWN');
      await this.persist();
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null }); // identity assigned on hello/join
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Reconnect: reclaim a seat by token (or connect anonymously).
    if (msg.t === 'hello') {
      const playerId = (msg.token && this.tokens[msg.token]) || null;
      ws.serializeAttachment({ playerId });
      send(ws, { t: 'you', playerId, token: msg.token || null, role: this.roleOf(playerId) });
      this.broadcast();
      return;
    }

    // Take a seat: the DO mints the id + token (keeps the reducer pure).
    if (msg.t === 'join') {
      // RECLAIM BY NAME. A seat whose player is not currently connected can be
      // walked back into by re-entering the same name. Without this, a player
      // who loses their identity token (cleared storage, a new phone, or the
      // app forgetting which game it was in) is locked out of their OWN game:
      // their still-seated name fails the reducer's name_taken check under a
      // freshly minted id, with no path back. The Join screen already promises
      // "Been here before? Same code puts you back in your seat."
      //
      // Only DISCONNECTED seats are reclaimable, so a name in active use is
      // still protected. The 5-char code remains the only gate, per the
      // casual/friends trust tier locked in the Phase-2 spec.
      const wanted = (msg.name || '').trim().toLowerCase();
      const live = this.connectedIds();
      // A socket never blocks itself. This socket may already hold the seat — a
      // client that reconnects sends `hello` (reclaiming by token, which marks
      // the seat connected) and can then send `join` for the same name, e.g.
      // after stepping away and tapping "Join as <name>". Without this the seat
      // would count as occupied by its own owner and the name check below would
      // reject the player from their own seat.
      const mySeat = (ws.deserializeAttachment() || {}).playerId;
      if (mySeat) live.delete(mySeat);
      const reclaim = wanted && this.game && this.game.players.find(
        (p) => !p.removed && p.name.trim().toLowerCase() === wanted && !live.has(p.id));

      // Reusing the seat's id makes the reducer's `x.id !== intent.id` exclusion
      // skip their own row, so name_taken no longer fires and the existing
      // scores are kept (reducer only initialises scores for a brand-new id).
      const playerId = reclaim ? reclaim.id : 'p_' + crypto.randomUUID().slice(0, 8);
      const token = crypto.randomUUID();
      const { game, error } = applyIntent(this.game, { t: 'join', id: playerId, name: msg.name }, playerId);
      if (error) return send(ws, { t: 'error', code: error });
      this.game = game;
      this.tokens[token] = playerId;
      ws.serializeAttachment({ playerId });
      await this.persist();
      send(ws, { t: 'you', playerId, token, role: this.roleOf(playerId) });
      this.broadcast();
      return;
    }

    // Every other intent is authorized by the socket's persisted playerId.
    const actorId = (ws.deserializeAttachment() || {}).playerId;
    if (!actorId) return send(ws, { t: 'error', code: 'not_joined' });
    const { game, error } = applyIntent(this.game, msg, actorId);
    if (error) return send(ws, { t: 'error', code: error });
    this.game = game;
    await this.persist();
    this.broadcast();
  }

  async webSocketClose(ws, code, reason) {
    this.broadcast(); // `connected` is derived live from open sockets
    try { ws.close(code, reason); } catch { /* already closed */ }
  }

  roleOf(playerId) {
    return playerId && playerId === this.game.managerId ? 'manager' : 'player';
  }

  connectedIds() {
    const ids = new Set();
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment();
      if (a && a.playerId) ids.add(a.playerId);
    }
    return ids;
  }

  // Full snapshot with live `connected` flags stamped from open sockets.
  snapshot() {
    const live = this.connectedIds();
    return { ...this.game, players: this.game.players.map((p) => ({ ...p, connected: live.has(p.id) })) };
  }

  broadcast() {
    const payload = JSON.stringify({ t: 'state', game: this.snapshot() });
    for (const s of this.ctx.getWebSockets()) { try { s.send(payload); } catch { /* skip */ } }
  }

  async persist() {
    await this.ctx.storage.put('game', this.game);
    await this.ctx.storage.put('tokens', this.tokens);
  }
}
