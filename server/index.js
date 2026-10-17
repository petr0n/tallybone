// server/index.js — Cloudflare Worker entry point. Routes /api/* requests
// to the GameRoom Durable Object for that join code. Static assets are
// served by Workers Assets (configured in wrangler.jsonc).
import { DEVICE_COOKIE, deviceFrom } from './game-room.js';
export { GameRoom } from './game-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Field telemetry for real-device scan testing (src/scanlog.js). Solo
    // scanning is offline by design, so a scan is otherwise invisible to anyone
    // helping debug it; the client posts here only when the URL carries
    // ?tail=1. Logged and dropped — no storage, no state, so it costs nothing
    // and keeps nothing. `wrangler tail` is the whole point.
    if (url.pathname === '/api/scanlog' && request.method === 'POST') {
      try {
        const body = await request.text();
        console.log('SCANLOG', body.slice(0, 2000));
      } catch (e) {
        console.log('SCANLOG unreadable', e && e.message);
      }
      return new Response(null, { status: 204 });
    }

    // Mint (or refresh) this device's id cookie. HttpOnly + server-set, so it is
    // neither readable by script nor capped like script storage; re-sent on every
    // call to push the expiry out. 400 days is the longest browsers accept.
    if (url.pathname === '/api/device' && request.method === 'POST') {
      const id = deviceFrom(request) || crypto.randomUUID();
      return new Response(null, { status: 204, headers: {
        'Set-Cookie': `${DEVICE_COOKIE}=${id}; Max-Age=34560000; Path=/api; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      } });
    }

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
