// buttonGame.js — 두더지 잡기 (버튼/택트스위치 방 · 디지털 입력)
// 구멍 2개에서 두더지가 불쑥! 해당 버튼(또는 화면 클릭·1·2 키)을 눌러 잡으면 점수.
// 입력: 실물 택트스위치 2개(D4·D5, 디지털 / 쉴드 포트 3·4) — 연결 직후 쉬는 값을 기준으로 '눌림(변화)' 감지.
//        보드가 없으면 화면 클릭/터치·키보드(1·2)로 플레이.
// 1차 느긋한 들판 · 2차 빠른 들판. 두 판 통과 → 🔨 두더지 메달.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const PINS = [4, 5];   // 구멍 0·1 ↔ 택트스위치 핀 D4·D5 (쉴드 포트 3·4)
const HOLES = PINS.length;
const GAMES = [
  { key: 'main', no: 1, name: '두더지 들판', time: 40, target: 18, upMin: 620, upMax: 1040, gapMin: 440, gapMax: 800, golden: 0.16 },
];

const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-button-bg.png'; } }; bgImg.src = '/brand/stage-button-bg.webp';
// 두더지 이미지(있으면 사용, 없으면 캔버스 moleHead 폴백) — 콘텐츠 기준 정렬값
const moleImg = new Image(); moleImg.src = '/brand/mole.webp';
const moleGoldImg = new Image(); moleGoldImg.src = '/brand/mole-gold.webp';
const MOLE = { cx: 0.5, cBottom: 0.927, cwFrac: 0.962, ar: 520 / 420 };  // 이미지 내 콘텐츠 중심/바닥/폭비/종횡비
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function showButtonGame(root, { onExit, onComplete } = {}) {
  root.innerHTML = `
    <div class="led scene-fade joygame buttongame">
      <div class="joy-stage-bg" id="bt-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="bt-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="bt-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="bt-host"></div>
      <div class="led-hud" id="bt-hud" hidden>
        <span class="lh-item" id="bt-stage">1단계</span>
        <span class="lh-item">🔨 <b id="bt-score">0</b>/<span id="bt-target">0</span></span>
        <span class="lh-item" id="bt-combo">콤보 0</span>
        <span class="lh-item">⏱ <b id="bt-time">0</b>초</span>
      </div>
      <div class="led-prep" id="bt-prep">
        <div class="prep-card" style="max-width:720px">
          <h2>🔨 두더지 잡기</h2>
          <p class="prep-sub">구멍 2곳에서 두더지가 불쑥! 튀어나온 두더지의 <b>버튼(또는 화면 구멍·1·2 키)</b>을 재빨리 눌러 잡아요. 제한시간 안에 <b>목표 점수</b>를 넘으면 통과! ✨금두더지는 3점!</p>
          <div class="prep-grid">
            <div class="prep-img" id="bt-wimg"><span class="prep-img-ph">🔘 결선 사진</span></div>
            <div class="prep-side">
              <table class="prep-table">
                <thead><tr><th>택트스위치</th><th>핀</th><th>쉴드 포트</th></tr></thead>
                <tbody>
                  <tr><td>버튼 1 (왼쪽)</td><td>D4</td><td>포트 3</td></tr>
                  <tr><td>버튼 2 (오른쪽)</td><td>D5</td><td>포트 4</td></tr>
                  <tr><td>공통</td><td colspan="2">GND · VCC(5V) (포트에 함께 연결)</td></tr>
                </tbody>
              </table>
              <div class="prep-status" id="bt-pstat">버튼을 누르면 그 칸 두더지를 잡아요! 보드가 없으면 <b>화면 구멍 클릭</b>이나 <b>1·2 키</b>로도 OK 🔨</div>
            </div>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="bt-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="bt-start">결선 완료 · 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#bt-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const wImg = new Image();
  wImg.onload = () => { const e = root.querySelector('#bt-wimg'); if (e) { e.style.backgroundImage = `url(${wImg.src})`; e.classList.add('has-img'); } };
  wImg.onerror = () => { if (!wImg._p) { wImg._p = 1; wImg.src = '/brand/wiring-button.png'; } };
  wImg.src = '/brand/wiring-button.webp';
  const host = root.querySelector('#bt-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#bt-exit').onclick = () => { cleanup(); onExit?.(); };
  const elScore = root.querySelector('#bt-score'), elTarget = root.querySelector('#bt-target'), elTime = root.querySelector('#bt-time'), elStage = root.querySelector('#bt-stage'), elCombo = root.querySelector('#bt-combo');
  const hud = root.querySelector('#bt-hud'), skipBtn = root.querySelector('#bt-skip');

  let W = 0, H = 0, bgGrad = null;
  function resize() {
    W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600;
    bgGrad = ctx.createLinearGradient(0, 0, 0, H); bgGrad.addColorStop(0, '#bfe8ff'); bgGrad.addColorStop(0.55, '#dff3c0'); bgGrad.addColorStop(1, '#a7d36b');
  }
  resize(); window.addEventListener('resize', resize);
  // 배경(stage-button-bg, 1600×900)의 그려진 구멍 위치에 맞춰 두더지를 올린다.
  // background:center/cover 와 동일한 매핑으로 이미지 좌표 → 캔버스 좌표 변환.
  const IMG_W = 1600, IMG_H = 900;
  // 두더지 구멍 2곳(좌·우) — stage-button-bg(1600×900)의 실제 구멍 위치에 맞춤(픽셀+육안 보정).
  const HOLE_UV = [
    { u: 397 / IMG_W, v: 674 / IMG_H, rw: 74 },    // 왼쪽 구멍
    { u: 1155 / IMG_W, v: 672 / IMG_H, rw: 74 },   // 오른쪽 구멍 (오른쪽·위로)
  ];
  function geom() {
    const sc = Math.max(W / IMG_W, H / IMG_H), dw = IMG_W * sc, dh = IMG_H * sc, ox = (W - dw) / 2, oy = (H - dh) / 2;
    return HOLE_UV.map((h) => ({ x: ox + h.u * dw, y: oy + h.v * dh, r: h.rw * sc }));
  }

  // ── 입력 ──
  const keys = ['1', '2'];
  const onKeyDown = (e) => { const i = keys.indexOf(e.key); if (i >= 0) { e.preventDefault(); bonk(i); } };
  window.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('pointerdown', (e) => {
    const rc = canvas.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, g = geom();
    for (let i = 0; i < HOLES; i++) if (Math.hypot(x - g[i].x, y - g[i].y) < g[i].r * 1.5) { bonk(i); return; }
  });

  // 실물 택트스위치 폴링(D4·D5): 쉬는 값 기준으로 '눌림(변화)' 에지 감지 → 해당 구멍 타격.
  let hwTimer = null;
  const rings = Array.from({ length: HOLES }, () => []), rest = Array(HOLES).fill(null), pressed = Array(HOLES).fill(false), RING = 2;
  const unanim = (r) => { if (r.length < RING) return null; const a = r[0]; for (const v of r) if (v !== a) return null; return a; };
  function startHw() {
    stopHw(); if (!board.connected) return;
    hwTimer = setInterval(async () => {
      const vals = await Promise.all(PINS.map((p) => board.digitalRead(p)));
      for (let i = 0; i < HOLES; i++) {
        const v = vals[i]; if (v == null) continue;
        const r = rings[i]; r.push(v); if (r.length > RING) r.shift();
        const s = unanim(r); if (s == null) continue;
        if (rest[i] === null) rest[i] = s;
        const down = s !== rest[i];
        if (down && !pressed[i]) bonk(i);   // 누르는 순간(에지)
        pressed[i] = down;
      }
    }, 30);
  }
  function stopHw() { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } for (let i = 0; i < HOLES; i++) { rings[i].length = 0; rest[i] = null; pressed[i] = false; } }

  const pstat = root.querySelector('#bt-pstat');
  root.querySelector('#bt-connect').onclick = async () => { const b = root.querySelector('#bt-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startHw(); pstat.innerHTML = '버튼을 한 번씩 눌러 확인해봐! 연결 직후 <b>쉬는 값</b>을 기준으로 눌림을 알아채요 🔨'; } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startHw()).catch(() => {});
  root.querySelector('#bt-start').onclick = () => { root.querySelector('#bt-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = {};
  let gi = 0, game = GAMES[0];
  const holes = Array.from({ length: HOLES }, () => ({ up: false, hit: false, golden: false, t: 0, dur: 0, pop: 0 }));
  const whack = Array(HOLES).fill(0), parts = [], pops = [], hitFx = Array(HOLES).fill(0);
  let comboFx = 0;
  const state = { phase: 'prep', countT: 0, score: 0, combo: 0, bestCombo: 0, target: 0, timeLeft: 0, ended: false, spawnAt: 0 };

  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true;
    const el = panel(`<h2>🔨 ${game.name}</h2>
      <p class="prep-sub">${game.time}초 안에 두더지를 <b>${game.target}마리</b> 이상 잡으면 통과! 튀어나온 두더지의 버튼(또는 구멍 클릭·1·2)을 재빨리 눌러요. ✨금두더지=3점, 연속으로 잡으면 콤보 보너스!</p>
      <p class="lp-cond">⏱ 시간 안에 🔨 목표 점수 달성 = 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); parts.length = 0; pops.length = 0; comboFx = 0;
    for (const m of holes) Object.assign(m, { up: false, hit: false, golden: false, t: 0, dur: 0, pop: 0 });
    for (let i = 0; i < HOLES; i++) { whack[i] = 0; hitFx[i] = 0; }
    Object.assign(state, { phase: 'count', countT: performance.now(), score: 0, combo: 0, bestCombo: 0, target: game.target, timeLeft: game.time, ended: false, spawnAt: performance.now() + 800 });
    elTarget.textContent = game.target; elStage.textContent = game.name; sync();
    hud.hidden = false;
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '두더지 소탕! 🎉' : '시간 초과! ⏱'}</h2>
      <p class="prep-sub">${game.name} · 🔨 ${state.score}마리 (목표 ${state.target}) · 최고 콤보 ${state.bestCombo}</p>
      <p class="lp-cond">${pass ? (onComplete ? '잘했어! 이어서 청기백기 🚩' : '두더지 소탕 완료! 메달을 받자 🏅') : `목표 ${state.target}마리에 조금 모자라요 — 다시!`}</p>
      <button class="cel-go" id="lp-next">${pass ? (onComplete ? '청기백기 하러 가기 ▶' : '메달 받기 🏅') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (GAMES.every((g) => cleared[g.key])) {
      if (onComplete) { onComplete(); return; }   // 순차 플레이: 다음(청기백기)로
      progress.mark('button'); celebrateRoom({ title: '두더지 마스터! 🔨', message: '버튼(디지털 입력)으로 두더지를 재빨리 잡았어요 — 🔨 두더지 메달 획득!', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };
  function sync() { elScore.textContent = state.score; elCombo.textContent = `콤보 ${state.combo}`; }
  function burst(x, y, c, n = 12) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 32, color: c }); } }
  function endPlay(win) { if (state.ended) return; state.ended = true; state.phase = 'result'; showResult(win ? gradeOf(clamp(state.score / (game.target * 1.5), 0, 1)) : 'D', win); }

  function bonk(i) {
    if (state.phase !== 'play' || state.ended) return;
    whack[i] = 16;
    const m = holes[i], gg = geom()[i];
    if (m.up && !m.hit) {
      m.hit = true; m.up = false; hitFx[i] = 1;
      const pts = m.golden ? 3 : 1; state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo);
      const bonus = state.combo >= 3 ? 1 : 0, gain = pts + bonus; state.score += gain;
      // 잡았다! — 효과음(상승)·파티클 폭발·점수 팝업
      sfx.note(560 + Math.min(10, state.combo) * 40 + (m.golden ? 220 : 0), 150);
      setTimeout(() => sfx.note(760 + (m.golden ? 240 : 0), 90), 70);
      burst(gg.x, gg.y - gg.r * 0.5, m.golden ? '255,210,90' : '255,150,70', m.golden ? 30 : 22);
      burst(gg.x, gg.y - gg.r * 0.5, '255,255,255', 8);
      pops.push({ x: gg.x, y: gg.y - gg.r * 0.9, vy: -1.4, life: 56, text: `+${gain}`, gold: m.golden });
      if (state.combo >= 2) { comboFx = 1; pops.push({ x: gg.x, y: gg.y - gg.r * 1.5, vy: -1.0, life: 50, text: `${state.combo} 콤보!`, combo: true }); }
    } else { state.combo = 0; sfx.hover && sfx.hover(); }
    sync();
    if (state.score >= state.target) endPlay(true);   // 목표 달성 즉시 통과(점수 폭주 방지)
  }

  let lastT = performance.now();
  function update(dt) {
    const now = performance.now();
    if (state.phase === 'count') { if ((now - state.countT) / 1000 >= 3) { state.phase = 'play'; state.spawnAt = now + 400; } }
    if (state.phase !== 'play' || state.ended) return;
    state.timeLeft -= dt / 60;
    if (state.timeLeft <= 0) { state.timeLeft = 0; endPlay(state.score >= state.target); return; }
    // 두더지 등장
    if (now >= state.spawnAt) {
      const free = []; for (let i = 0; i < HOLES; i++) if (!holes[i].up && holes[i].pop < 0.05) free.push(i);
      if (free.length) {
        const i = free[Math.floor(Math.random() * free.length)], m = holes[i];
        m.up = true; m.hit = false; m.golden = Math.random() < game.golden; m.t = 0; m.dur = rand(game.upMin, game.upMax) * (m.golden ? 0.75 : 1);
      }
      const ramp = clamp(1 - (game.time - state.timeLeft) / game.time * 0.35, 0.65, 1);
      state.spawnAt = now + rand(game.gapMin, game.gapMax) * ramp;
    }
    // 두더지 상태
    for (const m of holes) {
      if (m.up) { m.t += dt / 60 * 1000; if (m.t >= m.dur) { m.up = false; state.combo = 0; } }
      m.pop += ((m.up ? 1 : 0) - m.pop) * Math.min(1, 0.3 * dt);
      if (m.pop < 0.004) m.pop = 0;
    }
    for (let i = 0; i < HOLES; i++) { if (whack[i] > 0) whack[i] -= dt; if (hitFx[i] > 0) hitFx[i] = Math.max(0, hitFx[i] - dt * 0.12); }
    if (comboFx > 0) comboFx = Math.max(0, comboFx - dt * 0.04);
    for (let k = pops.length - 1; k >= 0; k--) { const p = pops[k]; p.y += p.vy; p.vy += 0.012; p.life -= dt; if (p.life <= 0) pops.splice(k, 1); }
  }

  function moleHead(cx, cy, r, golden, dead) {
    const fur = golden ? ['#ffe07a', '#e3a826'] : ['#b98a5c', '#7d5536'];
    // 귀
    ctx.fillStyle = fur[1];
    ctx.beginPath(); ctx.arc(cx - r * 0.66, cy - r * 0.72, r * 0.3, 0, 6.283); ctx.arc(cx + r * 0.66, cy - r * 0.72, r * 0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = golden ? '#fff1c6' : '#caa07a';
    ctx.beginPath(); ctx.arc(cx - r * 0.66, cy - r * 0.72, r * 0.15, 0, 6.283); ctx.arc(cx + r * 0.66, cy - r * 0.72, r * 0.15, 0, 6.283); ctx.fill();
    // 머리(세로 그라데이션)
    const g = ctx.createLinearGradient(cx, cy - r * 1.1, cx, cy + r * 1.15); g.addColorStop(0, fur[0]); g.addColorStop(1, fur[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.96, r * 1.04, 0, 0, 6.283); ctx.fill();
    // 볼/주둥이
    ctx.fillStyle = golden ? '#fff6da' : '#e6c79f';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.36, r * 0.58, r * 0.44, 0, 0, 6.283); ctx.fill();
    // 앞니
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    ctx.fillRect(cx - r * 0.15, cy + r * 0.4, r * 0.13, r * 0.24); ctx.fillRect(cx + r * 0.02, cy + r * 0.4, r * 0.13, r * 0.24);
    ctx.strokeRect(cx - r * 0.15, cy + r * 0.4, r * 0.13, r * 0.24); ctx.strokeRect(cx + r * 0.02, cy + r * 0.4, r * 0.13, r * 0.24);
    // 코
    ctx.fillStyle = '#c0625e'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.24, r * 0.16, r * 0.12, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.05, cy + r * 0.2, r * 0.05, r * 0.035, 0, 0, 6.283); ctx.fill();
    // 수염
    ctx.strokeStyle = 'rgba(60,40,28,.45)'; ctx.lineWidth = Math.max(1, r * 0.03);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * r * 0.2, cy + r * 0.28); ctx.lineTo(cx + s * r * 0.95, cy + r * 0.16); ctx.moveTo(cx + s * r * 0.2, cy + r * 0.34); ctx.lineTo(cx + s * r * 0.98, cy + r * 0.36); ctx.stroke(); }
    // 눈
    const ex = r * 0.36, ey = -r * 0.18;
    if (dead) { ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = r * 0.1; const e = r * 0.13; for (const sx of [-1, 1]) { const bx = cx + sx * ex; ctx.beginPath(); ctx.moveTo(bx - e, cy + ey - e); ctx.lineTo(bx + e, cy + ey + e); ctx.moveTo(bx + e, cy + ey - e); ctx.lineTo(bx - e, cy + ey + e); ctx.stroke(); } }
    else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(cx - ex, cy + ey, r * 0.17, r * 0.2, 0, 0, 6.283); ctx.ellipse(cx + ex, cy + ey, r * 0.17, r * 0.2, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#241a12'; ctx.beginPath(); ctx.arc(cx - ex, cy + ey + r * 0.02, r * 0.1, 0, 6.283); ctx.arc(cx + ex, cy + ey + r * 0.02, r * 0.1, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - ex + r * 0.04, cy + ey - r * 0.04, r * 0.035, 0, 6.283); ctx.arc(cx + ex + r * 0.04, cy + ey - r * 0.04, r * 0.035, 0, 6.283); ctx.fill();
    }
    if (golden) { ctx.font = `${r * 0.55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✨', cx + r * 0.85, cy - r * 0.85); }
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (!ready(bgImg)) { ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H); } else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, W, H); }
    const g = geom(), bgOk = ready(bgImg);
    for (let i = 0; i < HOLES; i++) {
      const { x, y, r } = g[i], m = holes[i], headR = r * 0.86, clipB = y + r * 0.42;
      if (!bgOk) {   // 배경 이미지가 없을 때만 구멍을 직접 그림(폴백)
        const mg = ctx.createLinearGradient(0, y - r * 0.55, 0, y + r * 0.95); mg.addColorStop(0, '#b9824e'); mg.addColorStop(1, '#744d2c');
        ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r * 1.7, r * 0.9, 0, 0, 6.283); ctx.fill();
        const hg = ctx.createRadialGradient(x, y - r * 0.08, r * 0.12, x, y, r); hg.addColorStop(0, '#140b04'); hg.addColorStop(1, '#3c2614');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, 6.283); ctx.fill();
      }
      // 두더지: 구멍 앞테두리(clipB) 위로만 보이게 클립해 '쏙' 올라오게
      if (m.pop > 0.02) {
        ctx.save(); ctx.beginPath(); ctx.rect(x - r * 1.6, 0, r * 3.2, clipB); ctx.clip();
        // 그림자(구멍 바닥 접지)
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x, clipB - r * 0.04, headR * 0.85, r * 0.16, 0, 0, 6.283); ctx.fill();
        const mi = m.golden ? moleGoldImg : moleImg;
        if (ready(mi)) {
          const MW = (r * 2.5) / MOLE.cwFrac, MH = MW * MOLE.ar;
          const cBottomY = (y + r * 0.92) + (1 - m.pop) * (MH * 0.92);   // pop=1 솟음 / pop=0 구멍 속
          const dx = x - MOLE.cx * MW, dy = cBottomY - MOLE.cBottom * MH;
          if (m.hit) ctx.globalAlpha = 0.92;
          ctx.drawImage(mi, dx, dy, MW, MH);
          ctx.globalAlpha = 1;
        } else {
          const cy = (y + r * 1.2) - m.pop * (r * 1.9);
          moleHead(x, cy, headR, m.golden, m.hit);
        }
        ctx.restore();
      }
      if (!bgOk) { ctx.fillStyle = '#2c1b0d'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); ctx.fill(); }
      // 잡힘 충격 링(별) — 잡았다는 걸 확실히
      if (hitFx[i] > 0) {
        const k = hitFx[i], rr0 = r * (1.0 + (1 - k) * 1.4);
        ctx.save(); ctx.globalAlpha = clamp(k, 0, 1) * 0.9; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = r * 0.16 * k;
        ctx.beginPath(); ctx.arc(x, y - r * 0.5, rr0, 0, 6.283); ctx.stroke();
        ctx.font = `${r * 1.2 * (0.7 + k * 0.5)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💥', x, y - r * 0.5);
        ctx.restore();
      }
      // 망치 타격 효과
      if (whack[i] > 0) { ctx.save(); ctx.globalAlpha = clamp(whack[i] / 16, 0, 1); ctx.translate(x + r * 0.6, y - r * 1.0); ctx.rotate(-0.5 + (1 - whack[i] / 16) * 0.6); ctx.font = `${r * 1.25}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔨', 0, 0); ctx.restore(); }
      // 번호 표
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y + r * 0.62, 12, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a512f'; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${i + 1}`, x, y + r * 0.62);
      ctx.textBaseline = 'alphabetic';
    }
    // 파티클
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 32); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    // 점수 팝업(+N / 콤보!) — 잡았다는 걸 또렷하게
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of pops) {
      const a = clamp(p.life / 56, 0, 1);
      if (p.combo) { ctx.font = `900 ${Math.round(26 + (1 - a) * 6)}px "Space Grotesk",sans-serif`; ctx.fillStyle = `rgba(255,120,40,${a})`; ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`; ctx.lineWidth = 4; ctx.strokeText(`🔥 ${p.text}`, p.x, p.y); ctx.fillText(`🔥 ${p.text}`, p.x, p.y); }
      else { ctx.font = `900 ${p.gold ? 42 : 34}px "Space Grotesk",sans-serif`; ctx.fillStyle = p.gold ? `rgba(255,196,40,${a})` : `rgba(255,255,255,${a})`; ctx.strokeStyle = `rgba(60,30,10,${a * 0.8})`; ctx.lineWidth = 5; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); }
    }
    ctx.textBaseline = 'alphabetic';
    // 콤보 배너(2콤보부터, 펀치감 있게)
    if (state.phase === 'play' && state.combo >= 2) {
      const s = 1 + comboFx * 0.5; ctx.save(); ctx.translate(W / 2, H * 0.15); ctx.scale(s, s);
      ctx.font = '900 30px "Space Grotesk",sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.strokeText(`🔥 ${state.combo} 콤보!`, 0, 0);
      ctx.fillStyle = state.combo >= 5 ? '#ff4d4d' : '#ff8a3c'; ctx.fillText(`🔥 ${state.combo} 콤보!`, 0, 0); ctx.restore();
    }
    // 카운트다운
    if (state.phase === 'count') { const el = (now - state.countT) / 1000, n = 3 - Math.floor(el); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6; ctx.font = '900 90px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; const t = n > 0 ? String(n) : '시작!'; ctx.strokeText(t, W / 2, H * 0.5); ctx.fillText(t, W / 2, H * 0.5); }
    if (!hud.hidden) elTime.textContent = Math.ceil(state.timeLeft);
  }
  function loop(now) { const dt = Math.min(2.4, (now - lastT) / 16.67); lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopHw(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize); }
}
