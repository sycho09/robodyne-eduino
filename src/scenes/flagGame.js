// flagGame.js — 청기백기 (택트스위치 2개 · 디지털 입력)
// 진행자(EDDIE)의 명령에 맞춰 청기(파랑·버튼1/D4)·백기(흰·버튼2/D5)를 올리고 내린다.
// 명령: "청기 올려/내려", "백기 올려/내려" — 이미 그 상태면 '함정'(누르면 실수!).
// 입력: 실물 택트스위치 2개(D4·D5 / 쉴드 포트 3·4) 에지 감지 / 화면 버튼 / 키보드(1·2 또는 ←·→).
// 판정: 명령 시간 안에 '지목된 깃발 = 목표 상태' + '다른 깃발 = 그대로'면 정답.
// 1차 느긋 · 2차 빠름. 두 판 통과 → 🚩 깃발 메달.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const PINS = [4, 5];   // 0=청기(파랑·D4·포트3), 1=백기(흰·D5·포트4)
const FLAGS = PINS.length;
const COL = ['70,150,255', '232,236,244'];      // 청기 파랑 / 백기 흰
const NAME = ['청기', '백기'];
const GAMES = [
  { key: 'main', no: 1, name: '청기백기', count: 16, target: 12, window: 1050, gap: 420, trick: 0.36 },
];

const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-flag-bg.png'; } }; bgImg.src = '/brand/stage-flag-bg.webp';
const callerImg = new Image(); callerImg.onerror = () => { if (!callerImg._p) { callerImg._p = 1; callerImg.src = '/brand/eddie-conductor.webp'; } }; callerImg.src = '/brand/eddie/eddie-hero.webp';
// 깃발 이미지(있으면 캔버스 그림 대신 사용 — 0=청기, 1=백기). 없으면 폴리곤 폴백.
const flagImg = [new Image(), new Image()];
flagImg[0].onerror = () => { if (!flagImg[0]._p) { flagImg[0]._p = 1; flagImg[0].src = '/brand/flag-blue.png'; } }; flagImg[0].src = '/brand/flag-blue.webp';
flagImg[1].onerror = () => { if (!flagImg[1]._p) { flagImg[1]._p = 1; flagImg[1].src = '/brand/flag-white.png'; } }; flagImg[1].src = '/brand/flag-white.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function showFlagGame(root, { onExit, onComplete, skipPrep } = {}) {
  root.innerHTML = `
    <div class="led scene-fade joygame flaggame">
      <div class="joy-stage-bg" id="fl-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="fl-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="fl-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="fl-host"></div>
      <div class="led-hud" id="fl-hud" hidden>
        <span class="lh-item" id="fl-stage">1단계</span>
        <span class="lh-item">🚩 <b id="fl-score">0</b>/<span id="fl-target">0</span></span>
        <span class="lh-item" id="fl-combo">콤보 0</span>
        <span class="lh-item">📩 <b id="fl-left">0</b></span>
      </div>
      <div class="flag-pads" id="fl-pads" hidden>
        <button class="flag-pad blue" id="fl-b0"><span>🔵</span>청기<small>버튼1·D4</small></button>
        <button class="flag-pad white" id="fl-b1"><span>⚪</span>백기<small>버튼2·D5</small></button>
      </div>
      <div class="led-prep" id="fl-prep">
        <div class="prep-card" style="max-width:720px">
          <h2>🚩 청기백기</h2>
          <p class="prep-sub">진행자의 <b>명령</b>을 잘 듣고 깃발을 움직여요! <b>청기 올려</b>=버튼1, <b>백기 올려</b>=버튼2.
            이미 올라가 있으면 <b>그대로 두기</b>(함정!). 제한시간 안에 <b>목표 점수</b>를 넘으면 통과! 🚩</p>
          <div class="prep-grid">
            <div class="prep-img" id="fl-wimg"><span class="prep-img-ph">🔘 결선 사진</span></div>
            <div class="prep-side">
              <table class="prep-table">
                <thead><tr><th>택트스위치</th><th>핀</th><th>쉴드 포트</th></tr></thead>
                <tbody>
                  <tr><td>버튼 1 (청기 🔵)</td><td>D4</td><td>포트 3</td></tr>
                  <tr><td>버튼 2 (백기 ⚪)</td><td>D5</td><td>포트 4</td></tr>
                  <tr><td>공통</td><td colspan="2">GND · VCC(5V) (포트에 함께 연결)</td></tr>
                </tbody>
              </table>
              <div class="prep-status" id="fl-pstat">버튼을 누르면 그 깃발이 올라가요(다시 누르면 내려가요)! 보드 없으면 <b>화면 버튼</b>이나 <b>1·2 키</b>로도 OK 🚩</div>
            </div>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="fl-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="fl-start">결선 완료 · 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#fl-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const wImg = new Image();
  wImg.onload = () => { const e = root.querySelector('#fl-wimg'); if (e) { e.style.backgroundImage = `url(${wImg.src})`; e.classList.add('has-img'); } };
  wImg.onerror = () => { if (!wImg._p) { wImg._p = 1; wImg.src = '/brand/wiring-button.png'; } };
  wImg.src = '/brand/wiring-button.webp';
  const host = root.querySelector('#fl-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#fl-exit').onclick = () => { cleanup(); onExit?.(); };
  const elScore = root.querySelector('#fl-score'), elTarget = root.querySelector('#fl-target'), elLeft = root.querySelector('#fl-left'), elStage = root.querySelector('#fl-stage'), elCombo = root.querySelector('#fl-combo');
  const hud = root.querySelector('#fl-hud'), pads = root.querySelector('#fl-pads'), skipBtn = root.querySelector('#fl-skip');

  let W = 0, H = 0, bgGrad = null;
  function resize() {
    W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600;
    bgGrad = ctx.createLinearGradient(0, 0, 0, H); bgGrad.addColorStop(0, '#bfe8ff'); bgGrad.addColorStop(0.6, '#dff3c0'); bgGrad.addColorStop(1, '#a7d36b');
  }
  resize(); window.addEventListener('resize', resize);
  // 깃대 위치: 좌(청기)·우(백기)
  const poleX = () => [W * 0.28, W * 0.72];
  const baseY = () => H * 0.82;

  // ── 입력 ──
  function onPress(i) {
    if (state.phase !== 'play' || state.ended) return;
    up[i] = !up[i]; anim[i].t = 1; touched[i] = true;
    sfx.note(up[i] ? 620 : 360, 90);
  }
  const keys = { '1': 0, '2': 1, ArrowLeft: 0, ArrowRight: 1 };
  const onKeyDown = (e) => { if (e.key in keys) { e.preventDefault(); onPress(keys[e.key]); } };
  window.addEventListener('keydown', onKeyDown);
  root.querySelector('#fl-b0').addEventListener('pointerdown', (e) => { e.preventDefault(); onPress(0); });
  root.querySelector('#fl-b1').addEventListener('pointerdown', (e) => { e.preventDefault(); onPress(1); });

  // 실물 택트 폴링(D4·D5): 쉬는 값 기준 '눌림(변화)' 에지 감지 → 해당 깃발 토글.
  let hwTimer = null;
  const rings = Array.from({ length: FLAGS }, () => []), rest = Array(FLAGS).fill(null), pressed = Array(FLAGS).fill(false), RING = 2;
  const unanim = (r) => { if (r.length < RING) return null; const a = r[0]; for (const v of r) if (v !== a) return null; return a; };
  function startHw() {
    stopHw(); if (!board.connected) return;
    hwTimer = setInterval(async () => {
      const vals = await Promise.all(PINS.map((p) => board.digitalRead(p)));
      for (let i = 0; i < FLAGS; i++) {
        const v = vals[i]; if (v == null) continue;
        const r = rings[i]; r.push(v); if (r.length > RING) r.shift();
        const s = unanim(r); if (s == null) continue;
        if (rest[i] === null) rest[i] = s;
        const down = s !== rest[i];
        if (down && !pressed[i]) onPress(i);   // 누르는 순간(에지)
        pressed[i] = down;
      }
    }, 30);
  }
  function stopHw() { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } for (let i = 0; i < FLAGS; i++) { rings[i].length = 0; rest[i] = null; pressed[i] = false; } }

  const pstat = root.querySelector('#fl-pstat');
  root.querySelector('#fl-connect').onclick = async () => { const b = root.querySelector('#fl-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startHw(); pstat.innerHTML = '버튼을 한 번씩 눌러봐! 깃발이 오르락내리락 하면 준비 끝 🚩'; } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startHw()).catch(() => {});
  root.querySelector('#fl-start').onclick = () => { root.querySelector('#fl-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };
  if (skipPrep) setTimeout(() => { const p = root.querySelector('#fl-prep'); if (p) p.classList.add('hide'); skipBtn.hidden = false; startFlow(); }, 0);   // 순차 플레이: 결선 안내 건너뛰고 바로 시작

  // ── 상태 ──
  const cleared = {};
  let gi = 0, game = GAMES[0];
  const up = [false, false];           // 깃발 상태(올림/내림)
  const anim = [{ t: 0 }, { t: 0 }];   // 토글 애니메이션
  const touched = [false, false];      // 이번 명령에서 만졌는지
  const parts = [];
  const state = { phase: 'prep', countT: 0, score: 0, combo: 0, bestCombo: 0, target: 0, ended: false,
    cmd: null, prevUp: [false, false], cmdStart: 0, resolved: false, idx: 0, nextAt: 0, judge: null };

  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; pads.hidden = true;
    const el = panel(`<h2>🚩 ${game.name}</h2>
      <p class="prep-sub">명령 <b>${game.count}</b>번 중 <b>${game.target}</b>번 이상 맞히면 통과! 진행자의 말을 잘 듣고 깃발을 올리거나 내려요.
        <b>이미 그 상태면 가만히!</b></p>
      <p class="lp-cond">🚩 청기=버튼1(D4·포트3) · 백기=버튼2(D5·포트4)</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); parts.length = 0;
    up[0] = up[1] = false; anim[0].t = anim[1].t = 0;
    Object.assign(state, { phase: 'count', countT: performance.now(), score: 0, combo: 0, bestCombo: 0, target: game.target,
      ended: false, cmd: null, resolved: false, idx: 0, nextAt: performance.now() + 3000 + 400, judge: null });
    elTarget.textContent = game.target; elStage.textContent = game.name; elLeft.textContent = game.count;
    sync(); hud.hidden = false; pads.hidden = false;
  }
  function nextCommand(now) {
    if (state.idx >= game.count) { endPlay(state.score >= state.target); return; }
    const flag = Math.random() < 0.5 ? 0 : 1;
    const isTrick = Math.random() < game.trick;
    const target = isTrick ? up[flag] : !up[flag];
    state.prevUp = [up[0], up[1]]; touched[0] = touched[1] = false;
    state.cmd = { flag, target }; state.cmdStart = now; state.resolved = false; state.judge = null;
    state.idx++; elLeft.textContent = game.count - state.idx + 1;
    sfx.note(480, 70);
  }
  function resolveCommand() {
    const c = state.cmd; if (!c) return;
    const other = c.flag ^ 1;
    const ok = (up[c.flag] === c.target) && (up[other] === state.prevUp[other]);
    state.resolved = true; state.judge = ok ? 'ok' : 'no';
    if (ok) {
      state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.score += 1 + (state.combo >= 3 ? 1 : 0);
      sfx.note(720 + Math.min(8, state.combo) * 30, 150);
      heroFx = 1;   // 정답 → 히어로 신나게 점프
      const px = poleX(); burst(px[c.flag], baseY() - H * 0.36, COL[c.flag], 16);
    } else { state.combo = 0; sfx.note(180, 220); }
    sync();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); pads.hidden = true; const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '명령 완벽 수행! 🎉' : '조금 아쉬워요! 🚩'}</h2>
      <p class="prep-sub">${game.name} · 🚩 ${state.score}점 (목표 ${state.target}) · 최고 콤보 ${state.bestCombo}</p>
      <p class="lp-cond">${pass ? '청기백기 통과! 메달을 받자 🏅' : `목표 ${state.target}점에 살짝 모자라요 — 다시!`}</p>
      <button class="cel-go" id="lp-next">${pass ? '메달 받기 🏅' : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (GAMES.every((g) => cleared[g.key])) {
      if (onComplete) { onComplete(); return; }   // 순차 플레이: 최종 메달은 호출측에서
      progress.mark('flag'); celebrateRoom({ title: '청기백기 챔피언! 🚩', message: '명령(디지털 입력)을 잘 듣고 청기·백기를 척척 — 🚩 깃발 메달 획득!', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };
  function sync() { elScore.textContent = state.score; elCombo.textContent = `콤보 ${state.combo}`; }
  function burst(x, y, c, n = 12) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 34, color: c }); } }
  function endPlay(win) { if (state.ended) return; state.ended = true; state.phase = 'result'; showResult(win ? gradeOf(clamp(state.score / (game.count), 0, 1)) : 'D', win); }

  let lastT = performance.now(), heroFx = 0;
  function update(dt) {
    const now = performance.now();
    if (state.phase === 'count') { if ((now - state.countT) / 1000 >= 3) { state.phase = 'play'; state.nextAt = now + 300; } }
    if (state.phase !== 'play' || state.ended) return;
    // 명령 진행
    if (!state.cmd) { if (now >= state.nextAt) nextCommand(now); }
    else if (!state.resolved) { if (now - state.cmdStart >= game.window) resolveCommand(); }
    else { if (now - state.cmdStart >= game.window + game.gap) { if (state.idx >= game.count) endPlay(state.score >= state.target); else { state.cmd = null; state.nextAt = now; } } }
    for (let i = 0; i < FLAGS; i++) anim[i].t = Math.max(0, anim[i].t - dt * 0.12);
    heroFx = Math.max(0, heroFx - dt * 0.06);
  }

  function drawFlag(x, by, raise, idx, glow) {
    const im = flagImg[idx], hasIm = ready(im);
    if (hasIm) {
      // 이미지 깃발(손잡이 포함): 손잡이 끝을 피벗으로 올리고/내리기 회전. 왼쪽 깃발은 좌우반전.
      const fh = H * 0.34, fw = fh * (im.naturalWidth / im.naturalHeight);
      const gx = 0.136 * fw, gy = 0.96 * fh;            // 손잡이 끝(피벗)
      const side = idx === 0 ? -1 : 1;
      ctx.save();
      ctx.translate(x, by); ctx.scale(side, 1);
      ctx.rotate((1 - raise) * 1.05 - 0.04);            // 올림≈세움 / 내림≈바깥 아래로
      if (glow) { ctx.shadowColor = `rgba(${COL[idx]},0.95)`; ctx.shadowBlur = 28; }
      ctx.drawImage(im, -gx, -gy, fw, fh);
      ctx.restore();
    } else {
      const poleH = H * 0.40, topY = by - poleH;
      ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = Math.max(5, W * 0.007); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x, topY); ctx.stroke();
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, topY, ctx.lineWidth, 0, 6.283); ctx.fill();
      const fw = W * 0.17, fh = H * 0.13, fy = topY + (1 - raise) * (poleH * 0.52);
      if (glow) { ctx.save(); ctx.shadowColor = `rgba(${COL[idx]},0.95)`; ctx.shadowBlur = 26; }
      const wave = Math.sin(performance.now() / 160 + idx) * fh * 0.12;
      ctx.fillStyle = `rgb(${COL[idx]})`; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, fy);
      ctx.quadraticCurveTo(x + fw * 0.5, fy - wave, x + fw, fy + fh * 0.16 + wave);
      ctx.quadraticCurveTo(x + fw * 0.5, fy + fh * 0.5 + wave, x + fw, fy + fh * 0.84 + wave);
      ctx.lineTo(x, fy + fh); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (idx === 0) { ctx.fillStyle = '#fff'; ctx.font = `${fh * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', x + fw * 0.5, fy + fh * 0.5); }
      if (glow) ctx.restore();
    }
    // 라벨
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = `rgba(${COL[idx]},0.9)`; ctx.lineWidth = 2;
    const lw = W * 0.09, lh = H * 0.05, lx = x - lw * 0.5, ly = by + 8;
    rrect(lx, ly, lw, lh, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2f3a'; ctx.font = `800 ${lh * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${idx === 0 ? '🔵' : '⚪'} ${NAME[idx]}`, lx + lw / 2, ly + lh / 2);
    ctx.textBaseline = 'alphabetic';
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (!ready(bgImg)) { ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H); } else { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, 0, W, H); }
    const px = poleX(), by = baseY();
    // 진행자(EDDIE) — 최신 히어로, 살아 움직이게: 둥실 흔들 + 명령 쪽으로 기울 + 정답 시 점프
    if (ready(callerImg)) {
      const cw = W * 0.16, ch = cw * (callerImg.naturalHeight / callerImg.naturalWidth);
      const footY = by + ch * 0.08;                       // 발 위치(스케일 기준점)
      const idle = Math.sin(now / 420) * ch * 0.025;       // 둥실 호흡
      const jump = Math.sin(Math.min(1, heroFx) * Math.PI) * ch * 0.16; // 정답 점프(반원 궤적)
      const lean = state.cmd ? (state.cmd.flag === 0 ? -0.07 : 0.07) : 0; // 명령한 깃발 쪽으로 기울
      const sx = 1 + heroFx * 0.06, sy = 1 - heroFx * 0.05; // 점프 순간 살짝 늘림
      ctx.save();
      ctx.translate(W / 2, footY - idle - jump);
      ctx.rotate(lean);
      ctx.scale(sx, sy);
      ctx.drawImage(callerImg, -cw / 2, -ch, cw, ch);
      ctx.restore();
    }
    // 깃발 2개
    for (let i = 0; i < FLAGS; i++) {
      const raise = up[i] ? 1 : 0, eased = raise + (anim[i].t * (up[i] ? -0.12 : 0.12));
      drawFlag(px[i], by, clamp(eased, 0, 1), i, state.resolved && state.judge === 'ok' && state.cmd && state.cmd.flag === i);
    }
    // 파티클
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 34); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    // 명령 배너 (알약 패널 + 그림자 + 그라데이션)
    if (state.phase === 'play' && state.cmd) {
      const c = state.cmd, txt = `${NAME[c.flag]} ${c.target ? '올려' : '내려'}!`;
      const remain = clamp(1 - (now - state.cmdStart) / game.window, 0, 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(H * 0.082)}px "Space Grotesk",sans-serif`;
      const pw = ctx.measureText(txt).width + H * 0.18, ph = H * 0.135, bx = W / 2 - pw / 2, byb = H * 0.1;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
      const grad = ctx.createLinearGradient(0, byb, 0, byb + ph);
      if (c.flag === 0) { grad.addColorStop(0, '#7db0ff'); grad.addColorStop(1, '#2f6bff'); }
      else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d7dce8'); }
      ctx.fillStyle = grad; rrect(bx, byb, pw, ph, ph / 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 4; rrect(bx, byb, pw, ph, ph / 2); ctx.stroke();
      ctx.fillStyle = c.flag === 0 ? '#fff' : '#28304a'; ctx.fillText(txt, W / 2, byb + ph * 0.54);
      ctx.textBaseline = 'alphabetic';
      // 남은 시간 바 / 판정
      if (!state.resolved) { const bw = pw * 0.82, bxr = W / 2 - bw / 2, byr = byb + ph + H * 0.018; ctx.fillStyle = 'rgba(0,0,0,0.16)'; rrect(bxr, byr, bw, 12, 6); ctx.fill(); ctx.fillStyle = remain > 0.35 ? '#5ad17a' : '#ff8a3c'; rrect(bxr, byr, bw * remain, 12, 6); ctx.fill(); }
      else { ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(H * 0.07)}px sans-serif`; ctx.fillStyle = state.judge === 'ok' ? '#3ec06b' : '#ff5b5b'; ctx.fillText(state.judge === 'ok' ? '정답! ✅' : '땡! ❌', W / 2, byb + ph + H * 0.1); }
    }
    if (state.phase === 'play' && state.combo >= 3) { ctx.fillStyle = '#ff8a3c'; ctx.font = '900 26px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🔥 ${state.combo} 콤보!`, W / 2, H * 0.4); }
    // 카운트다운
    if (state.phase === 'count') { const el = (now - state.countT) / 1000, n = 3 - Math.floor(el); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6; ctx.font = '900 90px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; const t = n > 0 ? String(n) : '시작!'; ctx.strokeText(t, W / 2, H * 0.5); ctx.fillText(t, W / 2, H * 0.5); }
  }
  function loop(now) { const dt = Math.min(2.4, (now - lastT) / 16.67); lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopHw(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize); }
}
