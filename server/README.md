# Tallybone server — run & deploy

The Worker (`index.js`), the `GameRoom` Durable Object (`game-room.js`), and the
pure game reducer (`reducer.js`). Config is `wrangler.jsonc` at the **repo root**.

## Local development

`@cloudflare/vite-plugin` runs the Vite app **and** the Worker/DO in one process.
There is no separate `wrangler dev`, and no `/api` proxy to configure.

```bash
pnpm dev      # app + Worker + DO, one origin
pnpm test     # vitest: the pure reducer (server/**/*.test.js)
pnpm smoke    # 2-client WebSocket integration smoke (needs a server up)
```

The smoke defaults to `ws://127.0.0.1:8787`, which does **not** work here — Vite
binds IPv6 only on this machine, so pass the dev server's real port over
`localhost`:

```bash
SMOKE_BASE=ws://localhost:5173 pnpm smoke     # against `pnpm dev`
SMOKE_BASE=wss://tallybone.com pnpm smoke     # against production
```

It exercises create + join (first joiner becomes manager), a second join, a full
round with turn-ins syncing to both clients, and a reconnect that reclaims a seat
by token.

## Two-phone LAN check

`pnpm dev` binds localhost only. To reach it from a phone, expose it on the LAN
(`vite --host`) — the camera needs a secure context, so serve HTTPS
(`@vitejs/plugin-basic-ssl`) or use a tunnel. The join QR needs no configuration
either way: `JOIN_URL_BASE` defaults to `location.origin`, so the QR encodes
whatever origin the page was loaded from.

## Production

Live at **https://tallybone.com** on the Workers **free** plan.

```bash
pnpm build && npx wrangler deploy      # the documented @cloudflare/vite-plugin path
npx wrangler deploy --dry-run          # validate config/bindings, change nothing
```

`vite build` emits `dist/client` (assets) plus `dist/tallybone/wrangler.json`, and
`wrangler deploy` picks up that generated config — the output notes it is "Using
redirected Wrangler configuration". Deploying is **user-gated**: it targets the
owner's Cloudflare account, so ask before running it.

### How the origin is wired

- `routes: ["tallybone.com/*"]` — the Worker owns the apex.
- `assets.run_worker_first: ["/api/*"]` — `/api/*` goes to the Worker; everything
  else is served straight from Workers Assets (those requests are free, and they
  do not appear in `wrangler tail` because the Worker is never invoked).
- `assets.not_found_handling: "single-page-application"` — unknown paths serve
  `index.html`. Join links are a query param (`/?j=CODE`), so they need no
  rewrite rule at all.
- `API_BASE` is `''` (same origin), so the client dials
  `wss://tallybone.com/api/game/:code/ws`. No CORS anywhere.

### Free-tier notes

Verified against current Cloudflare docs (2026-07-27):

- **SQLite-backed Durable Objects are on the free plan**; KV-backed ones are paid
  only. That is why the `v1` migration must use `new_sqlite_classes`, not
  `new_classes`. Confirm the deployed namespace really is SQLite-backed —
  `use_sqlite: true` on
  `GET /accounts/:id/workers/durable_objects/namespaces`.
- Free DO limits: 100k requests/day, **13,000 GB-s/day**, 100k SQLite row writes,
  5M row reads, 5 GB storage. Static asset requests are free and unlimited.
- **WebSocket hibernation is load-bearing for staying free.** A DO holding an
  open socket without hibernating bills wall-clock time: 24h at 128 MB is ~11,000
  GB-s, i.e. ~85% of the daily allowance for a *single* game. `game-room.js` uses
  `ctx.acceptWebSocket()` + the `webSocketMessage`/`webSocketClose` handlers, and
  the docs state "Billable Duration (GB-s) charges do not accrue during
  hibernation". Do not refactor to a plain `server.accept()`.

### Gotcha: a more specific route silently wins

Worker routes are matched **most-specific-first**, and a route whose `script` is
`null` means "run no Worker here". A stale `tallybone.com/api/*` → `null` route
shadowed `tallybone.com/*` → `tallybone` and sent every `/api/*` request to the
old origin instead — showing up as 522s and third-party 404 pages while the
static site worked perfectly. `wrangler tail` stays silent in this state, because
the Worker is never invoked at all. That route was deleted 2026-07-28.

If `/api/*` ever misbehaves while `/` is fine, list the zone's routes first:

```
GET https://api.cloudflare.com/client/v4/zones/:zone_id/workers/routes
```

Expect exactly one: `tallybone.com/*` → `tallybone`.

Note that `curl` cannot test the WebSocket upgrade over HTTP/2 (`Upgrade` is a
forbidden connection header there), so it always returns the DO's `426 expected
websocket`. Use an HTTP/1.1 client — `pnpm smoke` — to actually prove the socket.
