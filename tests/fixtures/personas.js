// tests/fixtures/personas.js — the six players for the flagship game night.
// Each gets a distinct labeled corpus photo as their "hand" so scanned totals
// come out different (and a winner is well-defined). Behaviour flags drive the
// reconnect / late-join scenarios.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('tests/fixtures/labeled/photos');
const PHOTOS = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();

const DEFS = [
  { name: 'Rosa', manager: true },
  { name: 'Dee', reconnects: true },
  { name: 'Marco' },
  { name: 'Bea', late: true },
  { name: 'Cy' },
  { name: 'Nan' },
];

export const PERSONAS = DEFS.map((p, i) => ({ ...p, photo: path.join(DIR, PHOTOS[i % PHOTOS.length]) }));
