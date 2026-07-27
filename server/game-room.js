// server/game-room.js — GameRoom Durable Object. Holds one game's canonical
// state in memory, persists to SQLite-backed storage, manages connected
// WebSockets, and broadcasts full snapshots on every mutation.
//
// TODO: implement applyIntent reducer, WebSocket hibernation, persistence.

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    // WebSocket upgrade handling will go here.
    return new Response('GameRoom not yet implemented', { status: 501 });
  }
}
