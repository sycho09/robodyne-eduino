// joystickGame.js — 우주 미로 탈출 (조이스틱 방 · 미로형)
// 우주선(EDDIE)으로 미로를 누벼 별을 모두 모으면 출구가 열린다. 제한시간 안에 탈출하면 통과.
// 입력: 방향(키보드 방향키/WASD · 화면 조이스틱) + ⚡대시(실물 조이스틱 꺾기/버튼).
//  └ 디지털 포트 키트 한계: X·Y(아날로그 전압)를 ADC 없는 디지털 핀(D5/D6)에 꽂아
//    0~1023 측정 불가 → 핀당 ON/OFF 1비트뿐. 그래서 부드러운 방향은 화면/키보드가 맡고,
//    실물 조이스틱은 '꺾음/버튼' 신호를 ⚡대시로 사용(중앙은 보드별로 굳어 읽혀 연결 직후 보정).
//    (아날로그 핀 A0·A1이면 진짜 2축 가능하나 이 키트는 디지털 전용.)
// 1차 별빛 미로 · 2차 운석 미로(움직이는 운석). 두 미로 탈출 → 🚀 조종 메달.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const PINS = { x: 5, y: 6, sw: 7 };
const PR = 0.30;   // 플레이어 반지름(타일 단위)
const GAMES = [
  { key: 'easy', no: 1, name: '별빛 미로', cols: 7, rows: 6, stars: 5, time: 70, rocks: 0, speed: 0.105, rockSpd: 0.05 },
  { key: 'hard', no: 2, name: '운석 미로', cols: 10, rows: 8, stars: 8, time: 95, rocks: 3, speed: 0.115, rockSpd: 0.06 },
];

const bgImg = new Image(); bgImg.src = '/brand/stage-joystick-bg.webp';
const headImg = new Image(); headImg.src = '/brand/eddie-pilot.webp';
const heroImg = new Image(); heroImg.src = '/brand/eddie/eddie-hero.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';

// 재귀 백트래킹 미로 생성 → 벽 그리드 g[j][i] (1=벽, 0=길)
function genMaze(cols, rows) {
  const gW = 2 * cols + 1, gH = 2 * rows + 1;
  const g = Array.from({ length: gH }, () => new Array(gW).fill(1));
  const vis = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [[0, 0]]; vis[0][0] = true; g[1][1] = 0;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = [];
    for (const [dx, dy] of dirs) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !vis[ny][nx]) opts.push([nx, ny, dx, dy]); }
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = opts[Math.floor(Math.random() * opts.length)];
    vis[ny][nx] = true; g[1 + cy * 2 + dy][1 + cx * 2 + dx] = 0; g[1 + ny * 2][1 + nx * 2] = 0;
    stack.push([nx, ny]);
  }
  return { g, gW, gH };
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function showJoystickGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade joygame">
      <div class="joy-stage-bg" id="jy-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="jy-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="jy-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="jy-host"></div>
      <div class="led-hud" id="jy-hud" hidden>
        <span class="lh-item" id="jy-stage">1단계</span>
        <span class="lh-item">⭐ <b id="jy-star">0</b>/<span id="jy-tot">0</span></span>
        <span class="lh-item">⏱ <b id="jy-time">0</b>초</span>
      </div>
      <div class="joy-pad" id="jy-pad" hidden><div class="joy-knob"></div></div>
      <div class="led-prep" id="jy-prep">
        <div class="prep-card" style="max-width:700px">
          <h2>🌀 우주 미로 탈출</h2>
          <p class="prep-sub">우주선으로 미로를 누벼 <b>별을 모두 모으면 출구가 열려요</b>! 제한시간 안에 탈출하면 통과 🚀 — 방향키·화면으로 이동, 조이스틱 꺾기·버튼으로 ⚡대시!</p>
          <div class="prep-grid">
            <div class="prep-img" id="jy-wimg"><span class="prep-img-ph">🕹️ 결선 사진</span></div>
            <div class="prep-side">
              <table class="prep-table">
                <thead><tr><th>조이스틱 핀</th><th>아두이노</th></tr></thead>
                <tbody>
                  <tr><td>GND</td><td>GND</td></tr>
                  <tr><td>VCC</td><td>5V</td></tr>
                  <tr><td>X</td><td>D5 ⚡대시</td></tr>
                  <tr><td>Y</td><td>D6 ⚡대시</td></tr>
                  <tr><td>SW(버튼)</td><td>D7 ⚡대시</td></tr>
                </tbody>
              </table>
              <div class="prep-status"><b>방향</b>은 방향키·화면 조이스틱으로! 실물 조이스틱을 <b>꺾거나 버튼(SW)</b>을 누르면 ⚡<b>대시</b> (디지털 포트라 X·Y는 ON/OFF 신호 — 방향은 화면으로)</div>
            </div>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="jy-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="jy-start">결선 완료 · 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#jy-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const wImg = new Image();
  wImg.onload = () => { const e = root.querySelector('#jy-wimg'); if (e) { e.style.backgroundImage = `url(${wImg.src})`; e.classList.add('has-img'); } };
  wImg.src = '/brand/wiring-joystick.webp';
  const host = root.querySelector('#jy-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#jy-exit').onclick = () => { cleanup(); onExit?.(); };
  const elStar = root.querySelector('#jy-star'), elTot = root.querySelector('#jy-tot'), elTime = root.querySelector('#jy-time'), elStage = root.querySelector('#jy-stage');
  const hud = root.querySelector('#jy-hud'), pad = root.querySelector('#jy-pad'), skipBtn = root.querySelector('#jy-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ── 입력 ──
  const keys = new Set();
  const onKeyDown = (e) => { const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { e.preventDefault(); keys.add(k); } };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  const joy = { x: 0, y: 0 }; const knob = pad.querySelector('.joy-knob');
  const RAD = 48; let joyId = null, jcx = 0, jcy = 0;
  const jMove = (e) => { if (joyId !== e.pointerId) return; let dx = e.clientX - jcx, dy = e.clientY - jcy; const d = Math.hypot(dx, dy); const m = d > 0 ? Math.min(1, d / RAD) / d : 0; joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * RAD}px, ${joy.y * RAD}px)`; };
  const jEnd = (e) => { if (joyId !== e.pointerId) return; joyId = null; joy.x = 0; joy.y = 0; knob.style.transform = 'translate(0,0)'; };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); joyId = e.pointerId; const r = pad.getBoundingClientRect(); jcx = r.left + r.width / 2; jcy = r.top + r.height / 2; try { pad.setPointerCapture(e.pointerId); } catch (_) {} jMove(e); });
  pad.addEventListener('pointermove', jMove); pad.addEventListener('pointerup', jEnd); pad.addEventListener('pointercancel', jEnd);
  // 실물 조이스틱(디지털 D5=X · D6=Y · D7=SW) 폴링 — 중앙 보정 후 '꺾음/버튼'을 대시 신호로.
  let hwTimer = null, swDown = false, swRest = null, xRest = null, yRest = null;
  const hwDir = { x: 0, y: 0 };
  const ringX = [], ringY = [], RING = 5;
  const unanim = (ring) => { if (ring.length < RING) return null; const a = ring[0]; for (const v of ring) if (v !== a) return null; return a; };
  function startHw() {
    stopHw(); if (!board.connected) return;
    hwTimer = setInterval(async () => {
      const [vx, vy, vs] = await Promise.all([board.digitalRead(PINS.x), board.digitalRead(PINS.y), board.digitalRead(PINS.sw)]);
      if (vs != null) { if (swRest === null) swRest = vs; swDown = vs !== swRest; }
      if (vx != null) { ringX.push(vx); if (ringX.length > RING) ringX.shift(); const s = unanim(ringX); if (s != null) { if (xRest === null) xRest = s; hwDir.x = s === xRest ? 0 : (xRest ? -1 : 1); } }
      if (vy != null) { ringY.push(vy); if (ringY.length > RING) ringY.shift(); const s = unanim(ringY); if (s != null) { if (yRest === null) yRest = s; hwDir.y = s === yRest ? 0 : (yRest ? -1 : 1); } }
    }, 50);
  }
  function stopHw() { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } swDown = false; swRest = null; xRest = null; yRest = null; ringX.length = 0; ringY.length = 0; hwDir.x = 0; hwDir.y = 0; }
  function inputVec() {
    let x = 0, y = 0;
    if (keys.has('arrowleft') || keys.has('a')) x -= 1; if (keys.has('arrowright') || keys.has('d')) x += 1;
    if (keys.has('arrowup') || keys.has('w')) y -= 1; if (keys.has('arrowdown') || keys.has('s')) y += 1;
    if (joy.x || joy.y) { x = joy.x; y = joy.y; }
    return { x, y };   // 방향은 키보드·화면(부드러운 360°). 실물 스틱 X/Y는 디지털이라 대시로만.
  }
  const dashing = () => swDown || hwDir.x !== 0 || hwDir.y !== 0;   // 버튼 OR 스틱 꺾음 = ⚡대시

  root.querySelector('#jy-connect').onclick = async () => { const b = root.querySelector('#jy-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startHw(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startHw()).catch(() => {});
  root.querySelector('#jy-start').onclick = () => { root.querySelector('#jy-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, game = GAMES[0], maze = null, P = null, exitM = null, stars = [], rocks = [], parts = [];
  const state = { phase: 'prep', countT: 0, collected: 0, target: 0, ended: false, timeLeft: 0 };

  // 레이아웃(타일 픽셀 환산) — 매 프레임 갱신해 리사이즈에 안전
  let tile = 0, originX = 0, originY = 0;
  function layout() {
    if (!maze) return;
    const topPad = 48, botPad = 16, side = 14;
    const availW = Math.max(40, W - side * 2), availH = Math.max(40, H - topPad - botPad);
    tile = Math.min(availW / maze.gW, availH / maze.gH);
    originX = (W - maze.gW * tile) / 2; originY = topPad + (availH - maze.gH * tile) / 2;
  }
  const pxX = (mx) => originX + mx * tile, pxY = (my) => originY + my * tile;

  function collides(mx, my, r) {
    const i0 = Math.floor(mx - r), i1 = Math.floor(mx + r), j0 = Math.floor(my - r), j1 = Math.floor(my + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wall = (j < 0 || i < 0 || j >= maze.gH || i >= maze.gW) || maze.g[j][i] === 1;
      if (!wall) continue;
      const nx = Math.max(i, Math.min(mx, i + 1)), ny = Math.max(j, Math.min(my, j + 1));
      const dx = mx - nx, dy = my - ny; if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  function tryMove(dmx, dmy) {
    const dist = Math.hypot(dmx, dmy); if (dist === 0) return;
    const steps = Math.max(1, Math.ceil(dist / 0.18)); const sx = dmx / steps, sy = dmy / steps;
    for (let s = 0; s < steps; s++) { if (!collides(P.mx + sx, P.my, PR)) P.mx += sx; if (!collides(P.mx, P.my + sy, PR)) P.my += sy; }
  }

  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; pad.hidden = true;
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div><h2>🌀 ${game.name}</h2>
      <p class="prep-sub">우주선으로 미로를 누벼 <b>별 ${game.stars}개</b>를 모두 모으면 <b>출구 🌀</b>가 열려요! ${game.rocks ? '움직이는 운석 ☄️을 피해 ' : ''}<b>${game.time}초</b> 안에 탈출하면 통과 🚀<br>방향키·화면으로 이동, <b>꺾기/버튼</b>으로 ⚡대시!</p>
      <p class="lp-cond">⏱ 시간 안에 ⭐ 다 모으고 출구 도착 = 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); pad.hidden = false;
    maze = genMaze(game.cols, game.rows);
    P = { mx: 1.5, my: 1.5, face: 1, inv: 0 };
    exitM = { mx: maze.gW - 1.5, my: maze.gH - 1.5 };
    const cells = [];
    for (let cy = 0; cy < game.rows; cy++) for (let cx = 0; cx < game.cols; cx++) {
      if ((cx === 0 && cy === 0) || (cx === game.cols - 1 && cy === game.rows - 1)) continue;
      cells.push({ mx: 1 + cx * 2 + 0.5, my: 1 + cy * 2 + 0.5 });
    }
    shuffle(cells);
    stars = cells.slice(0, game.stars).map((c) => ({ mx: c.mx, my: c.my, got: false, t: Math.random() * 6 }));
    rocks = [];
    const rcells = cells.slice(game.stars);
    for (let i = 0; i < game.rocks; i++) { const c = rcells[i] || { mx: maze.gW / 2, my: maze.gH / 2 }; const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)]; rocks.push({ mx: c.mx, my: c.my, dx: d[0], dy: d[1] }); }
    parts = [];
    Object.assign(state, { phase: 'count', countT: performance.now(), collected: 0, target: game.stars, ended: false, timeLeft: game.time });
    elTot.textContent = game.stars; elStage.textContent = `${game.no}단계 · ${game.name}`; sync();
    hud.hidden = false;
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); pad.hidden = true; const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '미로 탈출! 🎉' : '시간 초과 ☄️'}</h2>
      <p class="prep-sub">${game.name} · ⭐ ${state.collected}/${state.target} · ⏱ ${Math.ceil(state.timeLeft)}초 남음</p>
      <p class="lp-cond">${pass ? (last ? '두 미로 클리어! 메달을 받자 🏅' : '다음 미로로 ▶') : '별을 다 모아 출구로! 다시 도전 ⏱'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 미로 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) { progress.mark('joystick'); celebrateRoom({ title: '우주 파일럿! 🚀', message: '우주선으로 미로를 누비며 별을 모아 탈출했어요 — 🚀 조종 메달 획득!', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() }); }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };
  function sync() { elStar.textContent = state.collected; }
  function burstAt(mx, my, c, n = 12) { const x = pxX(mx), y = pxY(my); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 34, color: c }); } }
  function endPlay(win) { if (state.ended) return; state.ended = true; state.phase = 'result'; const tf = state.timeLeft / game.time; showResult(win ? gradeOf(0.55 + tf * 0.45) : 'D', win); }

  let lastT = performance.now();
  function update(dt) {
    if (state.ended || state.phase !== 'play') return;
    state.timeLeft -= dt / 60;
    if (state.timeLeft <= 0) { state.timeLeft = 0; endPlay(false); return; }
    let { x: vx, y: vy } = inputVec(); const m = Math.hypot(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    if (m > 0.05) { const sp = game.speed * (dashing() ? 1.7 : 1) * dt; if (Math.abs(vx) > 0.01) P.face = vx < 0 ? -1 : 1; tryMove(vx * sp, vy * sp); }
    if (P.inv > 0) P.inv -= dt;
    // 별 수집
    for (const s of stars) { if (!s.got && Math.hypot(P.mx - s.mx, P.my - s.my) < 0.55) { s.got = true; state.collected++; sfx.note(560 + Math.min(10, state.collected) * 28, 150); burstAt(s.mx, s.my, '255,220,90', 10); sync(); } }
    // 운석(움직임 + 충돌 시 시간 페널티)
    for (const k of rocks) {
      const nmx = k.mx + k.dx * game.rockSpd * dt, nmy = k.my + k.dy * game.rockSpd * dt;
      if (collides(nmx, nmy, 0.30)) { const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter((d) => !collides(k.mx + d[0] * 0.55, k.my + d[1] * 0.55, 0.30)); const d = opts[Math.floor(Math.random() * opts.length)] || [-k.dx, -k.dy]; k.dx = d[0]; k.dy = d[1]; }
      else { k.mx = nmx; k.my = nmy; }
      if (P.inv <= 0 && Math.hypot(P.mx - k.mx, P.my - k.my) < 0.30 + PR) {
        state.timeLeft = Math.max(0, state.timeLeft - 3); P.inv = 60;
        const a = Math.atan2(P.my - k.my, P.mx - k.mx), bx = Math.cos(a) * 0.45, by = Math.sin(a) * 0.45;
        if (!collides(P.mx + bx, P.my, PR)) P.mx += bx; if (!collides(P.mx, P.my + by, PR)) P.my += by;
        burstAt(P.mx, P.my, '255,140,140', 16); sfx.no();
      }
    }
    // 출구(별 다 모으면 활성)
    if (state.collected >= state.target && Math.hypot(P.mx - exitM.mx, P.my - exitM.my) < 0.6) { sfx.perfect(); burstAt(exitM.mx, exitM.my, '95,255,168', 22); endPlay(true); }
  }
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (!ready(bgImg)) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a1640'); g.addColorStop(1, '#0a0820'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = 'rgba(10,8,26,0.34)'; ctx.fillRect(0, 0, W, H); }
    if (maze && tile > 0) {
      // 벽
      ctx.save(); ctx.beginPath();
      for (let j = 0; j < maze.gH; j++) for (let i = 0; i < maze.gW; i++) if (maze.g[j][i] === 1) ctx.rect(originX + i * tile + 1, originY + j * tile + 1, tile - 2, tile - 2);
      ctx.fillStyle = 'rgba(52,38,98,0.82)'; ctx.shadowColor = 'rgba(150,120,255,0.55)'; ctx.shadowBlur = 7; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(175,150,255,0.45)'; ctx.stroke(); ctx.restore();
      // 출구
      const open = state.collected >= state.target, ex = pxX(exitM.mx), ey = pxY(exitM.my), pr = tile * 0.42, pulse = 0.7 + 0.3 * Math.sin(now * 0.006);
      ctx.save(); ctx.globalAlpha = open ? pulse : 0.6; ctx.fillStyle = open ? '#5fffa8' : '#ff6f8a'; ctx.shadowColor = open ? 'rgba(95,255,168,.95)' : 'rgba(255,111,138,.8)'; ctx.shadowBlur = open ? 26 : 12; ctx.beginPath(); ctx.arc(ex, ey, pr, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.save(); ctx.font = `${Math.round(tile * 0.66)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(open ? '🌀' : '🔒', ex, ey); ctx.restore();
      // 별
      for (const s of stars) { if (s.got) continue; const tw = 0.7 + 0.3 * Math.sin(now * 0.006 + s.t); ctx.save(); ctx.globalAlpha = tw; ctx.fillStyle = '#ffe066'; ctx.shadowColor = 'rgba(255,220,90,.9)'; ctx.shadowBlur = 14; star(ctx, pxX(s.mx), pxY(s.my), tile * 0.32, 5); ctx.fill(); ctx.restore(); }
      // 운석
      for (const k of rocks) { const rx = pxX(k.mx), ry = pxY(k.my), rr = tile * 0.3; ctx.save(); ctx.fillStyle = '#8a8496'; ctx.strokeStyle = '#5a5568'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6f6a7e'; ctx.beginPath(); ctx.arc(rx - rr * 0.3, ry - rr * 0.2, rr * 0.24, 0, 6.283); ctx.fill(); ctx.restore(); }
      // 플레이어(에디 우주선)
      if (P) {
        const px = pxX(P.mx), py = pxY(P.my);
        if (dashing() && state.phase === 'play') { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = '#6fe0ff'; ctx.shadowColor = 'rgba(110,224,255,.95)'; ctx.shadowBlur = 26; ctx.beginPath(); ctx.arc(px, py, tile * 0.62, 0, 6.283); ctx.fill(); ctx.restore(); }
        const img = ready(headImg) ? headImg : (ready(heroImg) ? heroImg : null), s = tile * 1.5;
        if (img) { const w = s * (img.naturalWidth / img.naturalHeight); ctx.save(); ctx.translate(px, py); if (P.face < 0) ctx.scale(-1, 1); ctx.globalAlpha = P.inv > 0 ? 0.4 + 0.4 * Math.abs(Math.sin(now * 0.03)) : 1; ctx.drawImage(img, -w / 2, -s / 2, w, s); ctx.restore(); }
        else { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(px, py, tile * 0.36, 0, 6.283); ctx.fill(); }
      }
      // 카운트다운
      if (state.phase === 'count') { const el = (now - state.countT) / 1000, n = 3 - Math.floor(el); ctx.fillStyle = '#fff'; ctx.font = '900 90px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.5); if (el >= 3) state.phase = 'play'; }
    }
    // 파티클
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.life--; ctx.globalAlpha = Math.max(0, p.life / 34); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    if (hud && !hud.hidden) elTime.textContent = Math.ceil(state.timeLeft);
  }
  function loop(now) { const dt = Math.min(2.4, (now - lastT) / 16.67); lastT = now; layout(); update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopHw(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', resize); }
}

function star(ctx, cx, cy, r, n) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const rad = i % 2 ? r * 0.45 : r; const a = (Math.PI / n) * i - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } ctx.closePath(); }
