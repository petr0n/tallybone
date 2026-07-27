// app/src/screens/submitted.js — solo "counted & locked in" (state 07).
import { html } from '../dom.js';

export function renderSubmitted({ total, onScanAnother } = {}) {
  const root = html(
    '<div class="screen screen--ink" style="align-items:center;justify-content:center;gap:26px;padding:0 30px;">' +
    '<div style="width:100px;height:100px;border-radius:50%;background:var(--success);border:4px solid var(--bone);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:48px;color:var(--bone);">✓</div>' +
    '<div style="text-align:center;display:flex;flex-direction:column;gap:10px;">' +
    '<div style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.22em;color:var(--sky);">COUNTED &amp; LOCKED IN</div>' +
    `<div style="font-family:var(--font-display);font-size:88px;line-height:0.85;color:var(--bone);">${total}</div>` +
    '<div style="font-size:16px;line-height:1.5;color:var(--muted-on-dark);">points on your bones this round.</div></div>' +
    '<div style="width:100%;background:var(--bone);border-radius:var(--r-card);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;color:var(--ink);">' +
    '<div style="font-weight:700;font-size:15px;">Playing solo — no game attached</div>' +
    '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:var(--secondary-light-1);">PHASE 2</div></div></div>');

  const btn = html(
    '<button type="button" class="tb-press" style="width:100%;height:56px;background:var(--sky);color:var(--ink);' +
    'border:3px solid var(--bone);border-radius:var(--r-card);font-family:var(--font-ui);font-weight:800;font-size:17px;cursor:pointer;">Scan another hand</button>');
  if (onScanAnother) btn.addEventListener('click', onScanAnother);
  root.appendChild(btn);
  return root;
}
