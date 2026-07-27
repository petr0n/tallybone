// server/index.js — Cloudflare Worker entry point. Routes /api/* requests
// to the GameRoom Durable Object for that join code. Static assets are
// served by Workers Assets (configured in wrangler.jsonc).
export { GameRoom } from './game-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/game/')) {
      const parts = url.pathname.split('/');
      // /api/game/:code/ws
      if (parts.length === 5 && parts[4] === 'ws') {
        const code = parts[3];
        const id = env.GAME.idFromName(code);
        const stub = env.GAME.get(id);
        return stub.fetch(request);
      }
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
