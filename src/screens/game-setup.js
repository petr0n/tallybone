// app/src/screens/game-setup.js — Phase-2 pre-game screens: Home, Rules,
// Create, Join, Lobby. Render functions take a context of callbacks + game
// state and return DOM. Markup from the Tallybone Phase 2 Game design.
import { domino } from '../components/domino.js';
import { html, el } from '../dom.js';
import { tallyMark } from '../brand.js';
import { initials, seated, joinUrl, MAX_SEATS, SEAT_TOKENS } from '../game-state.js';
import { qr } from '../components/qr.js';
import { enterIfNew } from '../motion.js';
import heroUrl from '../assets/home-hero.png';

// A REAL, scannable QR of the game's deep link, encoded on device. Scanning it
// opens Tallybone with the code already filled in (main.js reads `?j=`).
function joinQr(code, size) {
  return qr(joinUrl(code), size, `Scan to join game ${code}`);
}

function backChevron(dark, onBack) {
  const c = el('div', 'tb-hicon tb-hicon--chev tb-press', '‹');
  c.style.borderColor = dark ? 'var(--bone)' : 'var(--ink)';
  c.style.color = dark ? 'var(--bone)' : 'var(--ink)';
  if (onBack) c.addEventListener('click', onBack);
  return c;
}

// 06 · Home — the app entry. Two buttons + two quiet actions.
export function renderHome({ onStartGame, onJoin, onSolo, onRules } = {}) {
  const root = html('<div class="screen screen--light"></div>');
  const hero = el('div');
  // contain (not cover) so the splash never clips on shorter phone viewports
  // (Safari's toolbars shrink the height). The poster shares the app's concrete
  // texture, so the fitted image blends seamlessly — no visible side-bars.
  hero.style.cssText = `flex:1;min-height:0;background-image:url(${heroUrl});background-size:contain;background-position:center;background-repeat:no-repeat;`;
  root.appendChild(hero);

  const foot = html('<div style="padding:0 20px 40px;display:flex;flex-direction:column;gap:12px;"></div>');
  const start = html('<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:60px;font-size:18px;">Start a game</button>');
  start.addEventListener('click', onStartGame);
  const join = html('<button type="button" class="tb-btn tb-btn--secondary tb-press" style="height:60px;font-size:18px;">Join a game</button>');
  join.addEventListener('click', onJoin);
  foot.append(start, join);
  foot.appendChild(html(
    '<div style="display:flex;align-items:center;gap:12px;padding:8px 0 2px;">' +
    '<div style="flex:1;height:3px;background:var(--placeholder-border);"></div>' +
    '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.18em;color:var(--secondary-light-1);">OR</div>' +
    '<div style="flex:1;height:3px;background:var(--placeholder-border);"></div></div>'));
  const quiet = html('<div style="display:flex;align-items:center;justify-content:center;gap:22px;"></div>');
  const solo = html(
    '<div class="tb-press" style="display:flex;align-items:center;gap:9px;cursor:pointer;">' +
    '<div style="width:26px;height:26px;border-radius:50%;background:var(--ink);display:flex;align-items:center;justify-content:center;color:var(--bone);font-family:var(--font-display);font-size:14px;">⌾</div>' +
    '<div style="font-weight:700;font-size:16px;border-bottom:3px solid var(--ink);padding-bottom:2px;">Just count my tiles</div></div>');
  solo.addEventListener('click', onSolo);
  const rules = html(
    '<div class="tb-press" style="display:flex;align-items:center;gap:9px;cursor:pointer;">' +
    '<div style="width:26px;height:26px;border-radius:50%;background:var(--ink);display:flex;align-items:center;justify-content:center;color:var(--bone);font-family:var(--font-display);font-size:15px;">?</div>' +
    '<div style="font-weight:700;font-size:16px;border-bottom:3px solid var(--ink);padding-bottom:2px;">How to play</div></div>');
  rules.addEventListener('click', onRules);
  quiet.append(solo, rules);
  foot.appendChild(quiet);
  root.appendChild(foot);
  return root;
}

// 15 · How to play
export function renderRules({ onBack } = {}) {
  const root = html('<div class="screen screen--light"></div>');
  const header = html('<div style="background:var(--bone);border-bottom:var(--ol-base) solid var(--ink);padding:14px 20px;display:flex;align-items:center;gap:13px;flex:none;"></div>');
  header.appendChild(backChevron(false, onBack));
  header.appendChild(tallyMark(36));
  header.appendChild(html('<div class="tb-htext" style="flex:1;">HOW TO PLAY</div>'));
  root.appendChild(header);

  const body = html('<div style="flex:1;overflow:auto;padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px;"></div>');
  body.appendChild(html(
    '<div style="background:var(--ink);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:8px;">' +
    '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--sky);">THE POINT OF IT</div>' +
    "<div style=\"font-size:15.5px;line-height:1.55;color:var(--bone);\">Get rid of your bones. Whatever's still in your hand when someone goes out gets counted against you. <strong>Lowest total after the last round wins.</strong></div>" +
    "<div style=\"font-size:15.5px;line-height:1.55;color:var(--bone);border-top:1px solid rgba(242,235,213,0.25);padding-top:9px;\">One exception: the <strong>double blank</strong> is worth <strong>40</strong>, not nothing. Don't get caught holding it.</div></div>"));

  const steps = ['The round opens on a starting double. Play it down and run your train.',
    'First player out of bones ends the round and taps <strong>I won this round</strong> — that\'s 0 points.',
    'Everyone else spreads their leftovers on the table and scans them. Tallybone counts the pips.',
    'Totals land on the board. The manager starts the next round.'];
  const roundCard = html('<div style="background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:16px;box-shadow:var(--shadow-raised);padding:18px;display:flex;flex-direction:column;gap:13px;"><div style="font-family:var(--font-display);font-size:21px;">A ROUND, START TO FINISH</div></div>');
  steps.forEach((s, i) => roundCard.appendChild(html(
    `<div style="display:flex;gap:12px;align-items:flex-start;"><div style="width:28px;height:28px;flex:none;border-radius:50%;background:var(--sky);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:15px;">${i + 1}</div><div style="font-size:14.5px;line-height:1.5;padding-top:3px;">${s}</div></div>`)));
  body.appendChild(roundCard);

  const walkCard = html('<div style="background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:16px;box-shadow:var(--shadow-raised);padding:18px;display:flex;flex-direction:column;gap:14px;"><div style="font-family:var(--font-display);font-size:21px;">THE STARTING DOUBLE</div></div>');
  const walkRow = html('<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"></div>');
  [[12, 'R1'], [11, 'R2'], [10, 'R3'], [0, 'R13']].forEach(([n, r], idx) => {
    const cell = el('div'); cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
    cell.appendChild(domino({ a: n, b: n, size: 40 }));
    cell.appendChild(html(`<div style="font-family:var(--font-mono);font-size:11px;">${r}</div>`));
    walkRow.appendChild(cell);
    if (idx < 3) walkRow.appendChild(html(`<div style="font-family:var(--font-display);font-size:22px;color:var(--disabled-text);">${idx < 2 ? '›' : '…'}</div>`));
  });
  walkCard.appendChild(walkRow);
  walkCard.appendChild(html('<div style="font-size:14.5px;line-height:1.5;">Round one opens on double twelve. After that the <strong>manager picks each round\'s double</strong> — usually the next one down, but you open on whichever double a player is still holding.</div>'));
  body.appendChild(walkCard);

  const worthCard = html('<div style="background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:16px;box-shadow:var(--shadow-raised);padding:18px;display:flex;flex-direction:column;gap:11px;"><div style="font-family:var(--font-display);font-size:21px;">WHAT A BONE IS WORTH</div></div>');
  const worthRow = html('<div style="display:flex;align-items:center;gap:14px;"></div>');
  worthRow.appendChild(domino({ a: 9, b: 4, size: 44, vertical: false }));
  worthRow.appendChild(html('<div style="font-family:var(--font-display);font-size:24px;">= 13</div>'));
  worthCard.appendChild(worthRow);
  worthCard.appendChild(html('<div style="font-size:14.5px;line-height:1.5;">Both halves added together. A double twelve is the worst thing you can be holding at 24.</div>'));
  body.appendChild(worthCard);

  body.appendChild(html(
    '<div style="background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:16px;box-shadow:var(--shadow-raised);padding:18px;display:flex;flex-direction:column;gap:11px;">' +
    '<div style="font-family:var(--font-display);font-size:21px;">AT THE TABLE</div>' +
    '<div style="font-size:14.5px;line-height:1.6;">· Up to six seats. Anyone can join mid-game — they start at 0 and pick up next round.<br>· Two people can\'t share a name.<br>· Lost signal? Same code puts you back in your seat.<br>· The manager can reopen a round, fix a score, or call the game.</div></div>'));
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;"></div>');
  const got = html('<button type="button" class="tb-btn tb-btn--primary tb-press">Got it</button>');
  got.addEventListener('click', onBack);
  foot.appendChild(got);
  root.appendChild(foot);
  return root;
}

// 07 · Create game (ink screen)
export function renderCreate({ game, onBack, onOpen, onNewCode, onCopy, onName } = {}) {
  const root = html('<div class="screen screen--ink"></div>');
  const header = html('<div style="padding:16px 20px 0;display:flex;align-items:center;gap:14px;flex:none;"></div>');
  header.appendChild(backChevron(true, onBack));
  header.appendChild(tallyMark(36));
  header.appendChild(html(
    '<div style="flex:1;display:flex;flex-direction:column;gap:1px;">' +
    '<div class="tb-hoverline">YOU\'RE THE MANAGER</div>' +
    '<div class="tb-htext" style="color:var(--bone);">YOUR TABLE IS OPEN</div></div>'));
  root.appendChild(header);

  const mid = html('<div style="flex:1;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:16px 24px;"></div>');
  mid.appendChild(html('<div style="font-family:var(--font-mono);font-size:12px;letter-spacing:0.24em;color:var(--sky-tint);">READ THIS OUT LOUD</div>'));
  const codeRow = html('<div style="display:flex;gap:9px;"></div>');
  game.code.split('').forEach((ch) => codeRow.appendChild(html(
    `<div style="width:58px;height:80px;background:var(--bone);border-radius:12px;box-shadow:var(--shadow-code-bone);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:42px;color:var(--ink);">${ch}</div>`)));
  mid.appendChild(codeRow);

  const qrRow = html('<div style="display:flex;align-items:center;gap:16px;width:100%;"></div>');
  qrRow.appendChild(joinQr(game.code, 112));
  const qrText = html('<div style="flex:1;display:flex;flex-direction:column;gap:9px;"></div>');
  qrText.appendChild(html('<div style="font-family:var(--font-display);font-size:21px;color:var(--bone);line-height:1.05;">OR POINT A PHONE AT THIS</div>'));
  qrText.appendChild(html('<div style="font-size:13.5px;line-height:1.45;color:var(--secondary-on-dark);">Opens Tallybone with the code already in.</div>'));
  const copyPill = html(
    '<div class="tb-press" style="cursor:pointer;align-self:flex-start;display:inline-flex;align-items:center;gap:9px;border:2.5px solid var(--bone);border-radius:var(--r-pill);padding:8px 15px;">' +
    '<div style="width:16px;height:16px;border:2.5px solid var(--sky);border-radius:4px;"></div>' +
    `<div style="font-weight:700;font-size:13.5px;color:var(--bone);">${game.copied ? 'Copied to clipboard' : 'Tap to copy'}</div></div>`);
  copyPill.addEventListener('click', onCopy);
  qrText.appendChild(copyPill);
  qrRow.appendChild(qrText);
  mid.appendChild(qrRow);

  const namePanel = html(
    '<div style="width:100%;background:var(--inset-panel-1);border:2.5px solid var(--inset-panel-2);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;">' +
    '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.18em;color:#9A938C;">YOUR NAME AT THIS TABLE</div></div>');
  const nameInput = html('<input type="text" placeholder="Rosa" maxlength="12" style="width:100%;height:56px;background:var(--bone);border:var(--ol-base) solid var(--ink);border-radius:12px;padding:0 16px;font-family:var(--font-display);font-size:26px;letter-spacing:0.02em;color:var(--ink);outline:none;">');
  nameInput.value = game.managerName || '';
  nameInput.addEventListener('input', (e) => onName(e.target.value));
  namePanel.appendChild(nameInput);
  mid.appendChild(namePanel);
  mid.appendChild(html(
    '<div style="display:flex;gap:11px;align-items:flex-start;width:100%;">' +
    '<div style="width:24px;height:24px;flex:none;border-radius:50%;background:var(--sky);border:2.5px solid var(--bone);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;">i</div>' +
    '<div style="font-size:13.5px;line-height:1.45;color:var(--secondary-on-dark);">Up to 6 at a table. Anyone who loses signal can walk back in with the same code.</div></div>'));
  root.appendChild(mid);

  const foot = html('<div style="padding:16px 20px 34px;display:flex;flex-direction:column;gap:11px;flex:none;"></div>');
  const open = html('<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;box-shadow:var(--shadow-raised-bone);">Open the table</button>');
  open.addEventListener('click', onOpen);
  const newCode = html('<button type="button" class="tb-btn--ghost-bone tb-press" style="height:52px;font-size:16px;">Give me a different code</button>');
  newCode.addEventListener('click', onNewCode);
  foot.append(open, newCode);
  root.appendChild(foot);
  return root;
}

// 08 · Join game. Self-managing: the code + name inputs update the boxes, hints,
// and Join button IN PLACE so typing never loses focus. onJoin(code, name) fires
// when a 5-char lookalike-free code + a non-empty name are entered. A duplicate
// name is caught server-side and surfaced via the `error` prop on re-render.
export function renderJoin({ onBack, onJoin, prefillCode = '', prefillName = '', error = '' } = {}) {
  let entry = (prefillCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  let name = prefillName || '';

  const root = html('<div class="screen screen--light"></div>');
  const header = html('<div style="background:var(--bone);border-bottom:var(--ol-base) solid var(--ink);padding:14px 20px;display:flex;align-items:center;gap:14px;flex:none;"></div>');
  header.appendChild(backChevron(false, onBack));
  header.appendChild(tallyMark(36));
  header.appendChild(html('<div class="tb-htext" style="flex:1;">JOIN A TABLE</div>'));
  root.appendChild(header);

  const body = html('<div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:26px;padding:28px 20px 0;"></div>');

  if (error) {
    const msg = error === 'name_taken'
      ? 'Somebody at this table already has that name. Add an initial so the standings don\'t lie.'
      : (error === 'name_required' ? 'Enter a name the table will see.' : 'Could not join — try again.');
    body.appendChild(errBanner(msg));
  }

  const codeBlock = html('<div style="display:flex;flex-direction:column;gap:12px;"></div>');
  codeBlock.appendChild(html('<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">TABLE CODE</div>'));
  const codeWrap = html('<div style="position:relative;"></div>');
  const boxes = html('<div style="display:flex;gap:8px;"></div>');
  const codeInput = html('<input type="text" maxlength="5" autocomplete="off" spellcheck="false" inputmode="text" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;border:none;background:transparent;cursor:pointer;">');
  codeWrap.append(boxes, codeInput);
  codeBlock.appendChild(codeWrap);
  const hintEl = html('<div style="font-family:var(--font-mono);font-size:12px;color:var(--secondary-light-1);"></div>');
  codeBlock.appendChild(hintEl);
  const codeErrSlot = el('div');
  const codeSlot = el('div');
  codeSlot.append(codeBlock, codeErrSlot);
  body.appendChild(codeSlot);

  const nameBlock = html('<div style="display:flex;flex-direction:column;gap:12px;"></div>');
  nameBlock.appendChild(html('<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">YOUR NAME</div>'));
  const nameInput = html('<input type="text" placeholder="Dee" maxlength="12" style="width:100%;height:60px;background:var(--field-white);border:var(--ol-base) solid var(--ink);border-radius:12px;box-shadow:var(--shadow-raised);padding:0 16px;font-family:var(--font-display);font-size:28px;color:var(--ink);outline:none;">');
  nameBlock.appendChild(nameInput);
  nameBlock.appendChild(html('<div style="font-family:var(--font-mono);font-size:12px;color:var(--secondary-light-1);">This is what the table sees. 12 characters max.</div>'));
  const nameErrSlot = el('div');
  nameBlock.appendChild(nameErrSlot);
  body.appendChild(nameBlock);

  body.appendChild(html(
    '<div style="display:flex;gap:11px;align-items:flex-start;">' +
    '<div style="width:24px;height:24px;flex:none;border-radius:50%;background:var(--sky);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:14px;">i</div>' +
    '<div style="font-size:13.5px;line-height:1.45;color:var(--secondary-light-2);">Game already going? Walk in any time — you start at 0 and pick up from the next round.</div></div>'));
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:11px;"></div>');
  const btnSlot = el('div');
  foot.appendChild(btnSlot);
  foot.appendChild(html('<div style="text-align:center;font-size:13.5px;color:var(--secondary-light-1);">Been here before? Same code puts you back in your seat.</div>'));
  root.appendChild(foot);

  function refresh() {
    const badChars = /[O0I1]/.test(entry);
    const complete = entry.length === 5;
    const nameTrim = name.trim();
    const ready = complete && !badChars && nameTrim.length > 0;

    boxes.replaceChildren(...Array.from({ length: 5 }, (_, i) => {
      const ch = entry[i] || '';
      const bad = /[O0I1]/.test(ch);
      const cursor = i === entry.length;
      const bg = bad ? 'var(--error-bg)' : (ch ? 'var(--field-white)' : 'var(--stepper-btn)');
      const bw = bad || cursor ? 4 : 3;
      const bc = bad ? 'var(--flare)' : (cursor ? 'var(--sky)' : 'var(--ink)');
      return html(`<div style="flex:1;height:78px;background:${bg};border:${bw}px solid ${bc};border-radius:12px;box-shadow:var(--shadow-raised);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:40px;">${ch}</div>`);
    }));
    hintEl.textContent = badChars ? 'Codes never use O, 0, I or 1 — swap the lookalike.'
      : (complete ? 'Looks like a real code.' : 'Five characters. Tap the boxes and type.');
    codeErrSlot.replaceChildren(...(complete && badChars
      ? [errBanner('Codes skip <strong>O</strong>, <strong>0</strong>, <strong>I</strong> and <strong>1</strong> — check for a lookalike.')] : []));

    const label = ready ? `Join as ${nameTrim}` : 'Join the table';
    if (ready) {
      const btn = html(`<button type="button" class="tb-btn tb-btn--primary tb-press">${label}</button>`);
      btn.addEventListener('click', () => onJoin(entry, nameTrim));
      btnSlot.replaceChildren(btn);
    } else {
      btnSlot.replaceChildren(html(`<button type="button" class="tb-btn" disabled>${label}</button>`));
    }
  }

  codeInput.value = entry;
  nameInput.value = name;
  codeInput.addEventListener('input', (e) => {
    entry = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    e.target.value = entry;
    refresh();
  });
  nameInput.addEventListener('input', (e) => { name = e.target.value; refresh(); });
  refresh();
  return root;
}

function errBanner(htmlText) {
  return html(
    '<div style="display:flex;gap:12px;align-items:flex-start;background:var(--error-bg);border:var(--ol-base) solid var(--flare);border-radius:14px;box-shadow:var(--shadow-raised);padding:13px 15px;">' +
    '<div style="width:26px;height:26px;flex:none;border-radius:50%;background:var(--flare);border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;color:var(--bone);font-family:var(--font-display);font-size:15px;">!</div>' +
    `<div style="font-size:14.5px;line-height:1.4;color:var(--error-text);">${htmlText}</div></div>`);
}

// 09 · Lobby
export function renderLobby({ game, canManage, onBack, onStartRound, onCopy, onRemove } = {}) {
  const players = seated(game);
  const root = html('<div class="screen screen--light"></div>');
  const header = html('<div style="background:var(--ink);color:var(--bone);padding:14px 20px 16px;display:flex;align-items:center;gap:13px;flex:none;"></div>');
  header.appendChild(backChevron(true, onBack));
  header.appendChild(tallyMark(36));
  header.appendChild(html('<div style="flex:1;display:flex;flex-direction:column;gap:1px;"><div class="tb-hoverline">WAITING ROOM</div><div class="tb-htext" style="color:var(--bone);">THE TABLE</div></div>'));
  root.appendChild(header);

  const codeStrip = html('<div class="tb-press" style="flex:none;cursor:pointer;background:var(--ink);padding:0 20px 18px;display:flex;align-items:center;justify-content:space-between;gap:14px;"></div>');
  const codeTiles = html('<div style="display:flex;gap:6px;"></div>');
  game.code.split('').forEach((ch) => codeTiles.appendChild(html(`<div style="width:42px;height:54px;background:var(--bone);border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:30px;color:var(--ink);">${ch}</div>`)));
  codeStrip.appendChild(codeTiles);
  const qrCol = html('<div style="display:flex;flex-direction:column;align-items:center;gap:5px;"></div>');
  qrCol.appendChild(joinQr(game.code, 66));
  qrCol.appendChild(html('<div style="font-family:var(--font-mono);font-size:9.5px;letter-spacing:0.14em;color:var(--sky-tint);">SCAN TO JOIN</div>'));
  codeStrip.appendChild(qrCol);
  codeStrip.addEventListener('click', onCopy);
  root.appendChild(codeStrip);

  const body = html('<div style="flex:1;overflow:auto;padding:18px 20px 20px;display:flex;flex-direction:column;gap:11px;"></div>');
  body.appendChild(html(
    `<div style="display:flex;align-items:center;justify-content:space-between;"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.2em;color:var(--secondary-light-1);">PLAYERS · ${players.length} OF ${MAX_SEATS}</div>` +
    '<div style="display:inline-flex;align-items:center;gap:7px;"><div style="width:9px;height:9px;border-radius:50%;background:var(--success);animation:tb-blink 1.6s ease-in-out infinite;"></div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:var(--success-text);">LIVE</div></div></div>'));

  players.forEach((p, i) => {
    const badge = p.manager ? (p.you ? 'MANAGER · YOU' : 'MANAGER')
      : (p.connected === false ? 'AWAY' : (p.you ? 'YOU' : 'READY'));
    const badgeFg = p.manager ? 'var(--link)' : 'var(--secondary-light-1)';
    const bw = p.you ? 4 : 3;
    const bc = p.you ? 'var(--sky)' : 'var(--ink)';
    const row = html(`<div style="display:flex;align-items:center;gap:12px;background:var(--bone);border:${bw}px solid ${bc};border-radius:14px;box-shadow:var(--shadow-raised);padding:12px 14px;flex:none;"></div>`);
    // Someone taking a seat should arrive, not blink into existence. Keyed on
    // the player id: the lobby re-renders on every snapshot, so anything keyed
    // to insertion would replay for the whole table each time.
    enterIfNew(row, 'lobby', p.id);
    row.appendChild(html(`<div style="width:44px;height:44px;flex:none;border-radius:50%;background:${SEAT_TOKENS[i % SEAT_TOKENS.length]};border:2.5px solid var(--ink);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:19px;">${initials(p.name)}</div>`));
    row.appendChild(html(`<div style="flex:1;display:flex;flex-direction:column;gap:2px;"><div style="font-weight:700;font-size:17px;">${p.name}</div><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.14em;color:${badgeFg};">${badge}</div></div>`));
    if (canManage && !p.manager) {
      const x = html('<div class="tb-press" style="cursor:pointer;width:44px;height:44px;flex:none;border:2.5px solid var(--ink);border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);font-weight:800;font-size:24px;line-height:1;">×</div>');
      x.addEventListener('click', () => onRemove(p.id));
      row.appendChild(x);
    }
    body.appendChild(row);
  });
  for (let i = players.length; i < MAX_SEATS; i++) {
    body.appendChild(html(`<div style="display:flex;align-items:center;gap:12px;border:3px dashed var(--placeholder-border);border-radius:14px;padding:12px 14px;color:var(--disabled-text);flex:none;"><div style="width:44px;height:44px;flex:none;border-radius:50%;border:2.5px dashed var(--placeholder-border);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:19px;">${i + 1}</div><div style="font-weight:700;font-size:16px;">Open seat</div></div>`));
  }
  root.appendChild(body);

  const foot = html('<div style="flex:none;background:var(--bone);border-top:var(--ol-base) solid var(--ink);padding:16px 20px 30px;display:flex;flex-direction:column;gap:10px;"></div>');
  if (canManage) {
    const start = html(`<button type="button" class="tb-btn tb-btn--primary tb-press" style="height:58px;">Start round ${game.roundNum}</button>`);
    start.addEventListener('click', onStartRound);
    foot.appendChild(start);
    foot.appendChild(html('<div style="text-align:center;font-size:13.5px;color:var(--secondary-light-1);">Only you can start — you opened the table.</div>'));
  } else {
    foot.appendChild(html('<div style="text-align:center;font-size:14px;color:var(--secondary-light-1);padding:8px 0;">Waiting for the manager to start the round.</div>'));
  }
  root.appendChild(foot);
  return root;
}
