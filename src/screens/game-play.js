// app/src/screens/game-play.js — Phase-2 in-game screens: Round, Submit round
// score, Standings, Manager controls, Game over. Markup from the Tallybone
// Phase 2 Game design; derived data from game-state.js.
import { domino } from '../components/domino.js';
import { html, el } from '../dom.js';
import { tallyMark } from '../brand.js';
import { initials, seated, scoredPlayers, ranked, finalRanked, SEAT_TOKENS } from '../game-state.js';

const NUM_WORD = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];

function backChevron(dark, onBack) {
  const c = el('div', 'tb-hicon tb-hicon--chev tb-press', '‹');
  c.style.borderColor = dark ? 'var(--bone)' : 'var(--ink)';
  c.style.color = dark ? 'var(--bone)' : 'var(--ink)';
  if (onBack) c.addEventListener('click', onBack);
  return c;
}
function darkHeader(overline, title, onBack) {
  const h = html('<div style="background:var(--ink);color:var(--bone);padding:14px 20px 16px;display:flex;align-items:center;gap:12px;flex:none;"></div>');
  h.appendChild(backChevron(true, onBack));
  h.appendChild(tallyMark(36));
  h.appendChild(html(`<div style="flex:1;display:flex;flex-direction:column;gap:1px;"><div class="tb-hoverline">${overline}</div><div class="tb-htext" style="color:var(--bone);">${title}</div></div>`));
  return h;
}
function lightHeader(overline, title, onBack) {
  const h = html('<div style="background:var(--bone);border-bottom:var(--ol-base) solid var(--ink);padding:14px 20px;display:flex;align-items:center;gap:12px;flex:none;"></div>');
  h.appendChild(backChevron(false, onBack));
  h.appendChild(tallyMark(36));
  h.appendChild(html(
    `<div style="flex:1;display:flex;flex-direction:column;gap:1px;">${overline ? `<div style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:0.2em;color:var(--secondary-light-1);">${overline}</div>` : ''}<div class="tb-htext">${title}</div></div>`));
  return h;
}

// 10 · Round
export function renderRound({ game, onBack, onScan, onWin, onScores } = {}) {
  const dn = game.currentDouble;
  const root = html('<div class="screen screen--light"></div>');
  const header = lightHeader(`TABLE ${game.code}`, `ROUND ${game.roundNum}`, onBack);
  const scores = html('<div class="tb-press" style="cursor:pointer;font-weight:700;font-size:14px;border-bottom:2.5px solid var(--ink);">Scores</div>');
  scores.addEventListener('click', onScores);
  header.appendChild(scores);
  root.appendChild(header);

  const body = html('<div style="flex:1;overflow:auto;padding:22px 20px 20px;display:flex;flex-direction:column;align-items:center;gap:18px;"></div>');
  body.appendChild(html('<div style="font-family:var(--font-mono);font-size:11.5px;letter-spacing:0.22em;color:var(--secondary-light-1);text-align:center;">STARTING DOUBLE</div>'));
  body.appendChild(domino({ a: dn, b: dn, size: 104, vertical: false }));
  body.appendChild(html(
    `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:-6px;"><div style="font-family:var(--font-display);font-size:30px;letter-spacing:0.03em;">DOUBLE ${NUM_WORD[dn]}</div>` +
    `<div style="font-family:var(--font-mono);font-size:13px;color:var(--secondary-light-1);">${dn} / ${dn} · the manager sets the next double</div></div>`));
  body.appendChild(html('<div style="font-size:15px;line-height:1.5;text-align:center;color:var(--secondary-light-2);max-width:290px;">Play it down and run your train. When somebody goes out, the round\'s over.</div>'));

  const statusBlock = html('<div style="width:100%;display:flex;flex-direction:column;gap:9px;margin-top:4px;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">EVERYONE ELSE</div></div>');
  seated(game).filter((p) => !p.you).forEach((p, i) => {
    const done = !!(game.scores[p.id] && game.scores[p.id].turnedIn);
    const chipBg = done ? 'var(--success-bg)' : 'var(--check-bg)';
    const chipBorder = done ? 'var(--success)' : 'var(--check)';
    const chipFg = done ? 'var(--success-text)' : 'var(--check-text)';
    const chipIconFg = done ? 'var(--bone)' : 'var(--ink)';
    statusBlock.appendChild(html(
      `<div style="display:flex;align-items:center;gap:11px;background:var(--bone);border:2.5px solid var(--ink);border-radius:12px;padding:9px 12px;flex:none;">` +
      `<div style="width:32px;height:32px;flex:none;border-radius:50%;background:${SEAT_TOKENS[(i + 1) % SEAT_TOKENS.length]};border:2px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;">${initials(p.name)}</div>` +
      `<div style="flex:1;font-weight:700;font-size:15px;">${p.name}</div>` +
      `<div style="display:inline-flex;align-items:center;gap:6px;background:${chipBg};border:2px solid ${chipBorder};border-radius:999px;padding:3px 10px 3px 4px;"><div style="width:17px;height:17px;border-radius:50%;background:${chipBorder};border:1.5px solid var(--ink);display:flex;align-items:center;justify-content:center;color:${chipIconFg};font-size:10px;font-weight:800;">${done ? '✓' : '…'}</div><div style="font-weight:700;font-size:12px;color:${chipFg};">${done ? 'Turned in' : 'Counting'}</div></div></div>`));
  });
  body.appendChild(statusBlock);
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:11px;"></div>');
  const scan = html('<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;">Scan my tiles</button>');
  scan.addEventListener('click', onScan);
  const win = html('<button type="button" class="tb-btn tb-btn--secondary tb-press" style="height:58px;"><span class="tb-btn__icon" style="font-size:19px;">★</span>I won this round</button>');
  win.addEventListener('click', onWin);
  foot.append(scan, win);
  root.appendChild(foot);
  return root;
}

// 11 · Submit round score. tiles/total from the in-game scan (fallback seed if
// navigated directly).
const SEED_TILES = [{ a: 9, b: 4 }, { a: 6, b: 11 }, { a: 12, b: 0 }, { a: 5, b: 8 }, { a: 2, b: 2 }, { a: 3, b: 1 }];
export function renderSubmit({ game, tiles, onBack, onTurnIn, onChangeRead } = {}) {
  const list = (tiles && tiles.length ? tiles : SEED_TILES);
  const total = list.reduce((n, t) => n + t.a + t.b, 0);
  const root = html('<div class="screen screen--light"></div>');
  root.appendChild(darkHeader(`ROUND ${game.roundNum} · LAST LOOK`, 'TURN IN YOUR SCORE', onBack));

  const body = html('<div style="flex:1;overflow:auto;padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px;"></div>');
  body.appendChild(html(
    `<div style="display:flex;gap:12px;align-items:flex-start;background:var(--success-bg);border:var(--ol-base) solid var(--success);border-radius:14px;box-shadow:var(--shadow-raised);padding:13px 15px;flex:none;"><div style="width:26px;height:26px;flex:none;border-radius:50%;background:var(--success);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;color:var(--bone);font-family:var(--font-display);font-size:15px;">✓</div><div style="font-size:14.5px;line-height:1.4;color:var(--success-text);"><strong>${list.length} bones scanned and confirmed.</strong> This is what goes on the board.</div></div>`));

  const card = html('<div style="background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:16px;box-shadow:var(--shadow-raised);padding:16px;display:flex;flex-direction:column;gap:14px;flex:none;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">YOUR LEFTOVERS</div></div>');
  const grid = html('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:16px 10px;justify-items:center;"></div>');
  list.forEach((t) => {
    const cell = el('div'); cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;';
    cell.appendChild(domino({ a: t.a, b: t.b, size: 40 }));
    cell.appendChild(html(`<div style="font-family:var(--font-mono);font-size:12px;">${t.a} / ${t.b}</div>`));
    grid.appendChild(cell);
  });
  card.appendChild(grid);
  const changeRow = html('<div style="border-top:2.5px solid var(--concrete);padding-top:13px;display:flex;align-items:center;justify-content:space-between;"></div>');
  const change = html('<div class="tb-press" style="cursor:pointer;font-weight:700;font-size:14px;border-bottom:2.5px solid var(--ink);">Change a read</div>');
  change.addEventListener('click', onChangeRead);
  changeRow.appendChild(change);
  changeRow.appendChild(html(`<div style="font-family:var(--font-mono);font-size:12px;color:var(--secondary-light-1);">${list.length} tiles</div>`));
  card.appendChild(changeRow);
  body.appendChild(card);

  body.appendChild(html(
    `<div style="background:var(--ink);border-radius:16px;padding:20px;display:flex;align-items:center;justify-content:space-between;flex:none;"><div style="display:flex;flex-direction:column;gap:3px;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--sky);">ROUND ${game.roundNum} TOTAL</div><div style="font-size:14px;color:var(--secondary-on-dark);">Adds to your running score</div></div><div style="font-family:var(--font-display);font-size:56px;line-height:0.85;color:var(--bone);">${total}</div></div>`));
  body.appendChild(html(
    '<div style="display:flex;gap:11px;align-items:flex-start;flex:none;"><div style="width:24px;height:24px;flex:none;border-radius:50%;background:var(--check);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;">?</div><div style="font-size:13.5px;line-height:1.45;color:var(--secondary-light-2);">Once you turn it in, only the manager can change it.</div></div>'));
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:10px;"></div>');
  const turnIn = html(`<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;">Turn in ${total} points</button>`);
  turnIn.addEventListener('click', () => onTurnIn(total));
  foot.appendChild(turnIn);
  root.appendChild(foot);
  return root;
}

// 12 · Standings
export function renderStandings({ game, canManage, onBack, onManager, onStartNext, onDetail } = {}) {
  const rows = ranked(game);
  const pending = rows.filter((p) => p.total === null);
  const root = html('<div class="screen screen--light"></div>');
  const header = lightHeader(`TABLE ${game.code} · AFTER ROUND ${game.roundNum}`, 'STANDINGS', onBack);
  if (canManage) {
    const gear = html('<div class="tb-press" style="cursor:pointer;width:44px;height:44px;flex:none;border:2.5px solid var(--ink);border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);font-weight:800;font-size:20px;line-height:1;">⚙</div>');
    gear.addEventListener('click', onManager);
    header.appendChild(gear);
  }
  root.appendChild(header);

  const body = html('<div style="flex:1;overflow:auto;padding:16px 20px 20px;display:flex;flex-direction:column;gap:11px;"></div>');
  body.appendChild(html(
    `<div style="display:flex;align-items:center;justify-content:space-between;flex:none;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">LOWEST TOTAL WINS</div><div style="display:inline-flex;align-items:center;gap:7px;"><div style="width:9px;height:9px;border-radius:50%;background:var(--check);animation:tb-blink 1.6s ease-in-out infinite;"></div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:var(--check-text);">${pending.length ? `${pending.length} STILL COUNTING` : 'ALL IN'}</div></div></div>`));

  rows.forEach((p, i) => {
    const leader = i === 0 && p.total !== null;
    const rowBg = p.total === null ? 'transparent' : 'var(--bone)';
    const bw = leader ? 4 : 3;
    const bc = leader ? 'var(--sky)' : (p.total === null ? 'var(--placeholder-border)' : 'var(--ink)');
    const shadow = p.total === null ? 'none' : 'var(--shadow-raised)';
    const rank = p.total === null ? '—' : String(i + 1);
    const rankFg = leader ? 'var(--link)' : 'var(--disabled-text)';
    const sub = leader ? '★ LOWEST — LEADING' : (p.total === null ? 'STILL SCANNING…' : `+${p.last} LAST ROUND`);
    const subFg = leader ? 'var(--link)' : 'var(--secondary-light-1)';
    const totalFg = p.total === null ? 'var(--disabled-text)' : 'var(--ink)';
    body.appendChild(html(
      `<div style="display:flex;align-items:center;gap:12px;background:${rowBg};border:${bw}px solid ${bc};border-radius:14px;box-shadow:${shadow};padding:12px 14px;flex:none;">` +
      `<div style="width:26px;flex:none;font-family:var(--font-display);font-size:20px;color:${rankFg};text-align:center;">${rank}</div>` +
      `<div style="width:44px;height:44px;flex:none;border-radius:50%;background:${p.token};border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:19px;">${initials(p.name)}</div>` +
      `<div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;"><div style="font-weight:700;font-size:17px;">${p.you ? p.name + ' (you)' : p.name}</div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:${subFg};">${sub}</div></div>` +
      `<div style="font-family:var(--font-display);font-size:32px;line-height:0.9;color:${totalFg};">${p.total === null ? '—' : p.total}</div></div>`));
  });

  const detail = html('<div class="tb-press" style="cursor:pointer;background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;margin-top:4px;"><div style="display:flex;flex-direction:column;gap:2px;"><div style="font-weight:700;font-size:15px;">Round ' + game.roundNum + ' detail</div><div style="font-family:var(--font-mono);font-size:11.5px;color:var(--secondary-light-1);">See what everyone turned in</div></div><div style="font-family:var(--font-display);font-size:24px;">›</div></div>');
  detail.addEventListener('click', onDetail);
  body.appendChild(detail);
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:10px;"></div>');
  const pendNames = pending.length ? pending.map((p) => p.name).join(' and ') : 'nobody';
  if (canManage) {
    const start = html(`<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;">Start round ${game.roundNum + 1}</button>`);
    start.addEventListener('click', onStartNext);
    foot.appendChild(start);
    foot.appendChild(html(`<div style="text-align:center;font-size:13.5px;color:var(--secondary-light-1);">Waiting on ${pendNames} to turn in — you can start anyway.</div>`));
  } else {
    foot.appendChild(html('<div style="text-align:center;font-size:14px;color:var(--secondary-light-1);padding:6px 0;">Waiting for the manager to start the next round.</div>'));
  }
  root.appendChild(foot);
  return root;
}

// 13 · Manager controls
export function renderManager({ game, onBack, onStartNext, onReopen, onRemove, onCallGame } = {}) {
  const root = html('<div class="screen screen--light"></div>');
  root.appendChild(darkHeader('ONLY YOU SEE THIS', 'MANAGER CONTROLS', onBack));
  const body = html('<div style="flex:1;overflow:auto;padding:18px 20px 20px;display:flex;flex-direction:column;gap:20px;"></div>');

  const roundSec = html('<div style="display:flex;flex-direction:column;gap:11px;flex:none;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">THE ROUND</div></div>');
  const startNext = html(`<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:56px;">Start round ${game.roundNum + 1}</button>`);
  startNext.addEventListener('click', onStartNext);
  const reopen = html(`<button type="button" class="tb-btn tb-btn--secondary tb-press" style="height:52px;font-size:16px;">Reopen round ${game.roundNum}</button>`);
  reopen.addEventListener('click', onReopen);
  roundSec.append(startNext, reopen);
  roundSec.appendChild(html('<div style="font-size:13.5px;line-height:1.45;color:var(--secondary-light-2);">Reopening lets anyone re-scan and replace what they turned in.</div>'));
  body.appendChild(roundSec);

  const playSec = html('<div style="display:flex;flex-direction:column;gap:11px;flex:none;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">PLAYERS</div></div>');
  scoredPlayers(game).forEach((p) => {
    const row = html('<div style="display:flex;align-items:center;gap:12px;background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:14px;box-shadow:var(--shadow-raised);padding:11px 13px;flex:none;"></div>');
    row.appendChild(html(`<div style="width:40px;height:40px;flex:none;border-radius:50%;background:${p.token};border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:17px;">${initials(p.name)}</div>`));
    row.appendChild(html(`<div style="flex:1;display:flex;flex-direction:column;gap:1px;min-width:0;"><div style="font-weight:700;font-size:16px;">${p.you ? p.name + ' (you)' : p.name}</div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:var(--secondary-light-1);">${p.total === null ? 'NOT TURNED IN' : 'TOTAL ' + p.total}</div></div>`));
    if (p.total !== null && !p.you) {
      row.appendChild(html('<div class="tb-press" style="cursor:pointer;height:40px;padding:0 12px;border:2.5px solid var(--ink);border-radius:10px;display:flex;align-items:center;font-weight:700;font-size:13px;">Fix score</div>'));
    }
    if (!p.manager) {
      const x = html('<div class="tb-press" style="cursor:pointer;width:44px;height:44px;flex:none;border:2.5px solid var(--flare);border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);font-weight:800;font-size:24px;line-height:1;color:var(--destructive-text);">×</div>');
      x.addEventListener('click', () => onRemove(p.id));
      row.appendChild(x);
    }
    playSec.appendChild(row);
  });
  playSec.appendChild(html('<div style="display:flex;gap:11px;align-items:flex-start;"><div style="width:24px;height:24px;flex:none;border-radius:50%;background:var(--check);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;">?</div><div style="font-size:13.5px;line-height:1.45;color:var(--secondary-light-2);">Removing a player keeps their scores in the round history but drops them from standings.</div></div>'));
  body.appendChild(playSec);

  const endSec = html('<div style="display:flex;flex-direction:column;gap:11px;flex:none;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--error-text);">END THE GAME</div></div>');
  const callIt = html('<button type="button" class="tb-btn tb-btn--blocked tb-press"><span class="tb-btn__icon">!</span>Call it — lowest total wins</button>');
  callIt.addEventListener('click', onCallGame);
  endSec.appendChild(callIt);
  endSec.appendChild(html('<div style="font-size:13.5px;line-height:1.45;color:var(--secondary-light-2);">Ends it for everyone at the table. No undo.</div>'));
  body.appendChild(endSec);
  root.appendChild(body);
  return root;
}

// 14 · Game over
export function renderOver({ game, canManage, onRunItBack, onHome } = {}) {
  const rows = finalRanked(game);
  const winner = rows[0];
  const root = html('<div class="screen screen--ink"></div>');
  const top = html('<div style="flex:none;padding:26px 20px 0;display:flex;flex-direction:column;align-items:center;gap:14px;"></div>');
  top.appendChild(tallyMark(46));
  top.appendChild(html('<div style="font-family:var(--font-mono);font-size:11.5px;letter-spacing:0.24em;color:var(--sky);">TABLE ' + game.code + ' · ' + game.roundNum + (game.roundNum === 1 ? ' ROUND PLAYED' : ' ROUNDS PLAYED') + '</div>'));
  top.appendChild(html('<div style="font-family:var(--font-display);font-size:52px;line-height:0.9;color:var(--bone);letter-spacing:0.02em;">GAME OVER</div>'));
  root.appendChild(top);

  const win = html('<div style="flex:none;padding:22px 20px 18px;display:flex;flex-direction:column;align-items:center;gap:12px;"></div>');
  win.appendChild(html(`<div style="width:96px;height:96px;border-radius:50%;background:var(--sky);border:4px solid var(--bone);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:38px;color:var(--ink);animation:tb-bob 3.6s ease-in-out infinite;">${initials(winner.name)}</div>`));
  win.appendChild(html(`<div style="font-family:var(--font-display);font-size:34px;color:var(--bone);letter-spacing:0.02em;">${winner.name.toUpperCase()} TAKES IT</div>`));
  win.appendChild(html(`<div style="font-size:15px;line-height:1.5;color:var(--secondary-on-dark);text-align:center;">Lowest total wins — ${winner.final} points of leftovers all night.</div>`));
  root.appendChild(win);

  const list = html('<div style="flex:1;overflow:auto;padding:0 20px 16px;display:flex;flex-direction:column;gap:9px;"></div>');
  rows.forEach((p, i) => {
    const rowBg = i === 0 ? 'rgba(91,181,217,0.18)' : 'rgba(242,235,213,0.07)';
    const nameFg = i === 0 ? 'var(--bone)' : 'var(--secondary-on-dark)';
    const rankFg = i === 0 ? 'var(--sky)' : 'var(--dismissed-text)';
    list.appendChild(html(
      `<div style="display:flex;align-items:center;gap:12px;background:${rowBg};border-radius:13px;padding:11px 14px;flex:none;"><div style="width:24px;flex:none;font-family:var(--font-display);font-size:19px;color:${rankFg};text-align:center;">${i + 1}</div><div style="width:38px;height:38px;flex:none;border-radius:50%;background:${p.token};border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:16px;color:var(--ink);">${initials(p.name)}</div><div style="flex:1;font-weight:700;font-size:16px;color:${nameFg};">${p.you ? p.name + ' (you)' : p.name}</div><div style="font-family:var(--font-display);font-size:28px;line-height:0.9;color:${nameFg};">${p.final}</div></div>`));
  });
  root.appendChild(list);

  const foot = html('<div style="flex:none;padding:14px 20px 32px;display:flex;flex-direction:column;gap:11px;"></div>');
  if (canManage) {
    const again = html('<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;box-shadow:var(--shadow-raised-bone);">Run it back — same table</button>');
    again.addEventListener('click', onRunItBack);
    foot.appendChild(again);
  }
  const home = html('<button type="button" class="tb-btn--ghost-bone tb-press" style="height:52px;font-size:16px;">Back to home</button>');
  home.addEventListener('click', onHome);
  foot.appendChild(home);
  root.appendChild(foot);
  return root;
}

// Choose-the-next-double picker (manager only). Pre-selects the suggested
// step-down but any 0–12 double can be picked (open on whatever's in a hand).
export function renderPickDouble({ game, suggested, onBack, onConfirm } = {}) {
  const nextRound = game.roundNum + 1;
  let selected = suggested ?? 0;

  const root = html('<div class="screen screen--light"></div>');
  root.appendChild(lightHeader(`ROUND ${nextRound}`, 'CHOOSE THE DOUBLE', onBack));

  const body = html('<div style="flex:1;overflow:auto;padding:18px 20px 20px;display:flex;flex-direction:column;gap:16px;"></div>');
  body.appendChild(html(
    `<div style="font-size:14.5px;line-height:1.5;color:var(--secondary-light-2);">Usually you'd step down to <strong>${suggested} / ${suggested}</strong> — but open on whichever double someone's holding. Tap to pick.</div>`));
  const grid = html('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:12px;"></div>');
  body.appendChild(grid);
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:10px;"></div>');
  const btnSlot = el('div');
  foot.appendChild(btnSlot);
  root.appendChild(foot);

  function refresh() {
    grid.replaceChildren(...Array.from({ length: 13 }, (_, d) => {
      const isSel = d === selected;
      const isSug = d === suggested;
      const cell = el('div', 'tb-press');
      cell.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:${isSel ? 4 : 3}px solid ${isSel ? 'var(--sky)' : 'var(--ink)'};border-radius:14px;background:var(--bone);box-shadow:${isSel ? 'var(--shadow-raised)' : 'none'};cursor:pointer;`;
      cell.appendChild(domino({ a: d, b: d, size: 34 }));
      cell.appendChild(html(`<div style="font-family:var(--font-mono);font-size:11px;">${d} / ${d}</div>`));
      if (isSug) cell.appendChild(html('<div style="font-family:var(--font-mono);font-size:8.5px;letter-spacing:0.12em;color:var(--link);">SUGGESTED</div>'));
      cell.addEventListener('click', () => { selected = d; refresh(); });
      return cell;
    }));
    const btn = html(`<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;">Start round ${nextRound} on ${selected} / ${selected}</button>`);
    btn.addEventListener('click', () => onConfirm(selected));
    btnSlot.replaceChildren(btn);
  }
  refresh();
  return root;
}
