// app/src/config.js
// Feature flags for the Tallybone scanner UI (see the M3-2 plan's Global
// Constraints). Kept in one place so behaviour can be flipped without hunting
// through screen code.

// Camera is required to play. The file/photo-upload fallback is OFF by default.
// Flip to true to re-enable the app/src/upload.js path (kept wired, just gated).
export const ENABLE_UPLOAD_FALLBACK = false;

// The review screen's product Submit keeps the round locally and shows the
// Submitted screen. When true it ALSO POSTs the corrected payload to
// /api/handscan so eval-corpus capture still works (dev-only; the Vite plugin
// serves that endpoint). Off in the shipped product flow.
export const ENABLE_CORPUS_CAPTURE = false;

// Multiplayer backend origin. Empty string = same origin as the app (prod: the
// Worker route on tallybone.com; local dev: Vite proxies /api to `wrangler dev`).
// Override only to point at a differently-hosted backend.
export const API_BASE = '';

// Base URL used to build join links + QR codes (`${JOIN_URL_BASE}/?j=CODE`).
// Defaults to wherever the app is served from, so it is correct locally (LAN)
// and in production (tallybone.com) with no per-environment edit.
export const JOIN_URL_BASE =
  typeof location !== 'undefined' ? location.origin : 'https://tallybone.com';
