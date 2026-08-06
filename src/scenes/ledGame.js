// ledGame.js — 반짝반짝 라이트쇼 (LED · 디지털 출력)
// [준비] 결선 안내 → 보드 연결/진단 → 통과 시 [2단계 게임]
//   1단계 타이밍 쇼: 빛 마커가 판정선에 닿을 때 Space.
//   2단계 라이트 연주: 노트 색에 맞는 LED(초록1·노랑2·빨강3)를 눌러 연주.
// 각 단계 A등급(정확도 85%↑) 이상이어야 통과. 두 단계 모두 통과해야 💡 조명 메달.
// LED 3개 ↔ D2(초록)/D3(노랑)/D4(빨강), 보드 연결 시 실제 점등.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const LEAD = 1450, W_PERFECT = 90, W_GOOD = 170;
const LEDS = [
  { pin: 2, color: '46,200,106', label: '초록', flash: 0 },
  { pin: 3, color: '255,205,50', label: '노랑', flash: 0 },
  { pin: 4, color: '239,77,77', label: '빨강', flash: 0 },
];
const GAMES = [
  { key: 'timing', no: 1, name: '타이밍 쇼', icon: '🎯', desc: '빛 마커가 <b>판정선(◎)</b>에 닿는 순간 <b>Space</b>! 박자에 맞춰 무대 조명을 켜자.', n: 44 },
  { key: 'play', no: 2, name: '라이트 연주', icon: '🎹', desc: '음 높이에 맞는 LED를 눌러 <b>작은별</b>을 연주! <b>① 초록(낮음) · ② 노랑(중간) · ③ 빨강(높음)</b> — 키 1·2·3 또는 LED 클릭. 제때 누르면 멜로디가 흘러요 🎵' },
];
const PASS_ACC = 0.85;   // A등급 이상

const bgImg = new Image(); bgImg.src = '/brand/stage-led-bg.webp';
const eddieImg = new Image(); eddieImg.src = '/brand/eddie-conductor.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;

function buildBeats(game) {
  if (game.key === 'timing') {
    // 속도 패턴 변화: 느림→빠름→폭주→숨고르기→…(구간마다 다른 간격)
    const segs = [{ gap: 640, n: 5 }, { gap: 440, n: 6 }, { gap: 300, n: 6 }, { gap: 560, n: 4 }, { gap: 250, n: 7 }, { gap: 470, n: 5 }, { gap: 340, n: 8 }];
    const a = []; let t = 1000;
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si];
      for (let i = 0; i < s.n; i++) { a.push({ target: t, color: -1 }); t += s.gap; }
      t += 200;                                  // 구간 사이 살짝 숨
    }
    return a;
  }
  // 라이트 연주: 저작권 없는 멜로디(작은별, public domain)를 실제로 연주.
  // 음 높이에 따라 LED 배정(낮음=초록·중간=노랑·높음=빨강), 제때 누르면 그 음정이 소리난다.
  const a = []; let t = 900; const gap = 470;
  for (let i = 0; i < MELODY.length; i++) {
    const f = MELODY[i];
    a.push({ target: t, color: f <= 300 ? 0 : f <= 355 ? 1 : 2, freq: f });
    t += gap; if ((i + 1) % 7 === 0) t += 170;     // 7음마다 한 박 쉼(프레이즈)
  }
  return a;
}
// 작은별: 도도 솔솔 라라 솔 / 파파 미미 레레 도 / 솔솔 파파 미미 레 (×2) / 도도 솔솔 라라 솔 / 파파 미미 레레 도
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.0, A4 = 440.0;
const MELODY = [
  C4, C4, G4, G4, A4, A4, G4, F4, F4, E4, E4, D4, D4, C4,
  G4, G4, F4, F4, E4, E4, D4, G4, G4, F4, F4, E4, E4, D4,
  C4, C4, G4, G4, A4, A4, G4, F4, F4, E4, E4, D4, D4, C4,
];
function gradeOf(acc) { return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D'; }

export function showLedGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade">
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="led-exit">✕ 나가기</button>
      <button class="bx-exit led-skip" id="led-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="led-host"></div>
      <div class="led-hud" id="led-hud" hidden>
        <span class="lh-item" id="lh-stage">1단계</span>
        <span class="lh-item">🎯 적중 <b id="lh-hit">0</b>/<span id="lh-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="lh-combo">0</b></span>
        <span class="lh-item">⭐ <b id="lh-score">0</b></span>
      </div>
      <div class="led-prep" id="led-prep">
        <div class="prep-card">
          <h2>🔌 결선 준비 · 반짝반짝 라이트쇼</h2>
          <p class="prep-sub">이지 커넥트로 LED 3개만 꽂으면 끝! 회로도대로 연결하고 보드를 연결하면 시작돼요. (2단계 모두 A등급↑이면 메달!)</p>
          <div class="prep-grid">
            <div class="prep-img" id="prep-img"></div>
            <div class="prep-side">
              <table class="prep-table">
                <thead><tr><th>LED</th><th>아두이노 핀</th></tr></thead>
                <tbody>
                  <tr><td>🟢 초록 LED</td><td>D2</td></tr>
                  <tr><td>🟡 노랑 LED</td><td>D3</td></tr>
                  <tr><td>🔴 빨강 LED</td><td>D4</td></tr>
                </tbody>
              </table>
              <div class="prep-status" id="prep-status">상태 · 보드 연결을 눌러 시작하세요</div>
            </div>
          </div>
          <div class="prep-actions">
            <button class="prep-btn" id="p-connect">🔌 보드 연결</button>
            <button class="prep-btn" id="p-test" disabled>💡 LED 테스트</button>
            <button class="cel-go" id="p-start" disabled>결선 완료 · 시작 ▶</button>
          </div>
          <button class="prep-skip" id="p-skip">보드 없이 데모로 해볼래요 ▶</button>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const host = root.querySelector('#led-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle');
  snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#led-exit').onclick = () => { cleanup(); onExit?.(); };
  const elScore = root.querySelector('#lh-score'), elCombo = root.querySelector('#lh-combo'), elHit = root.querySelector('#lh-hit'), elTot = root.querySelector('#lh-tot'), elStage = root.querySelector('#lh-stage');

  const wImg = new Image();
  wImg.onload = () => { const e = root.querySelector('#prep-img'); e.style.backgroundImage = `url(${wImg.src})`; e.classList.add('has-img'); };
  wImg.src = '/brand/wiring-led.webp';

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ===== 준비 =====
  const pStatus = root.querySelector('#prep-status');
  const bConnect = root.querySelector('#p-connect'), bTest = root.querySelector('#p-test'), bStart = root.querySelector('#p-start');
  function setStatus(t, kind = '') { pStatus.textContent = '상태 · ' + t; pStatus.className = 'prep-status ' + kind; }
  if (!board.isSupported()) setStatus('이 브라우저는 보드 연결 미지원 — 아래 데모로 플레이할 수 있어요', 'warn');
  else board.connectAuto().then((a) => { if (a.ok) onConnected(); }).catch(() => {});
  bConnect.onclick = async () => {
    if (!board.isSupported()) { setStatus('Chrome/Edge 데스크톱에서 열어야 보드를 연결할 수 있어요', 'warn'); return; }
    setStatus('연결 중… 포트를 골라주세요 🔌'); sfx.click();
    try { await board.connect(); onConnected(); } catch (e) { setStatus(board.classify(e).note, 'warn'); }
  };
  function onConnected() { setStatus('보드 연결 완료! ✅ LED 테스트로 결선을 확인하거나 바로 시작하세요', 'ok'); bTest.disabled = false; bStart.disabled = false; bConnect.textContent = '🔌 연결됨 ✓'; }
  bTest.onclick = async () => { setStatus('초록·노랑·빨강 순서로 깜빡여 볼게요! 💡'); sfx.ok(); try { for (const l of LEDS) await board.blink(l.pin, 2, 200); } catch (e) { setStatus('테스트 실패 — 결선을 다시 확인해주세요', 'warn'); } };
  bStart.onclick = () => { root.querySelector('#led-prep').classList.add('hide'); startFlow(); };
  root.querySelector('#p-skip').onclick = () => { root.querySelector('#led-prep').classList.add('hide'); startFlow(); };

  // ===== 게임 플로우(2단계) =====
  const cleared = { timing: false, play: false };
  let gi = 0, game = GAMES[0], beats = [], pops = [];
  const state = { phase: 'prep', t0: 0, countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, seen: 0, ended: false };

  const skipBtn = root.querySelector('#led-skip');
  skipBtn.onclick = () => {                       // 테스트용: 현재 단계 통과 처리하고 다음으로
    document.querySelectorAll('.led-panel').forEach((e) => e.remove());
    cleared[game.key] = true; state.ended = true; state.phase = 'result';
    bgm.setDuck(1); gi++; nextGame();
  };
  function startFlow() { gi = 0; skipBtn.hidden = false; nextGame(); }
  function nextGame() {
    if (gi >= GAMES.length) { finishAll(); return; }
    game = GAMES[gi]; showIntro();
  }
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function showIntro() {
    bgm.setDuck(1);
    root.querySelector('#led-hud').hidden = true;
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div>
      <h2>${game.icon} ${game.name}</h2><p class="prep-sub">${game.desc}</p>
      <p class="lp-cond">⭐ <b>A등급(정확도 85%↑)</b> 이상이면 통과!</p>
      <button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0);                               // 연주 중엔 배경음악 끄고 게임 소리만
    beats = buildBeats(game).map((b, i) => ({ ...b, i, judged: false }));
    pops = []; LEDS.forEach((l) => l.flash = 0);
    Object.assign(state, { phase: 'count', countT: performance.now(), t0: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, seen: 0, ended: false });
    elTot.textContent = beats.length; elStage.textContent = `${game.no}단계 · ${game.name}`;
    root.querySelector('#led-hud').hidden = false; sync();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1);
    const acc = Math.round((state.hits / beats.length) * 100);
    const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div>
      <h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${game.name} · 적중 ${state.hits}/${beats.length} (정확도 ${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '두 단계 완료! 메달을 받자 🏅' : '다음 단계로 가자 ▶') : 'A등급(85%↑) 이상이어야 통과예요. 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 단계 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => {
      el.remove();
      if (pass) { cleared[game.key] = true; gi++; nextGame(); }
      else beginPlay();
    };
  }
  function finishAll() {
    cleanup();
    if (cleared.timing && cleared.play) {
      progress.mark('led');
      celebrateRoom({ title: '두 단계 클리어! 🎉', message: '타이밍 쇼 + 라이트 연주 모두 A등급↑ — 💡 조명 메달 획득! 무대가 환하게 빛났어요.', exitLabel: '무대로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }

  // ===== 입력/판정 =====
  function flashLed(idx) { const l = LEDS[idx]; l.flash = performance.now(); if (board.connected) { board.digital(l.pin, true).catch(() => {}); setTimeout(() => board.digital(l.pin, false).catch(() => {}), 170); } }
  function press(inputColor) {
    if (state.phase !== 'play' || state.ended) return;
    const now = performance.now() - state.t0;
    let best = null, bestD = 1e9;
    for (const b of beats) { if (b.judged) continue; const d = Math.abs(now - b.target); if (d < bestD) { bestD = d; best = b; } }
    if (!best || bestD >= 340) return;
    const inWindow = bestD <= W_GOOD;
    const colorOk = game.key === 'timing' || best.color === inputColor;
    best.judged = true; state.seen++;
    if (inWindow && colorOk) {
      const perfect = bestD <= W_PERFECT;
      state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.score += (perfect ? 100 : 60) + state.combo * 5; state.hits++;
      const li = game.key === 'play' ? best.color : (perfect ? 0 : 1);
      if (game.key === 'play') sfx.note(best.freq); else perfect ? sfx.perfect() : sfx.ok();
      flashLed(li);
      pop(perfect ? 'PERFECT!' : 'GOOD!', `rgb(${LEDS[li].color})`);
    } else { state.combo = 0; sfx.no(); flashLed(2); pop('MISS', `rgb(${LEDS[2].color})`); }
    sync();
  }
  function pop(text, color) { pops.push({ text, color, y: H * 0.46, life: 55 }); }
  function sync() { elScore.textContent = state.score; elCombo.textContent = state.combo; elHit.textContent = state.hits; }
  function onKey(e) {
    if (state.phase !== 'play') return;
    if (game.key === 'timing' && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); press(-1); }
    else if (game.key === 'play' && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); press(+e.key - 1); }
  }
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'play') return;
    if (game.key === 'timing') { press(-1); return; }
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sp = Math.min(150, W * 0.12);
    for (let i = 0; i < 3; i++) { const lx = W / 2 + (i - 1) * sp; if (Math.hypot(mx - lx, my - H * 0.13) < 44) { press(i); return; } }
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (ready(bgImg)) { drawCover(ctx, bgImg, W, H); ctx.fillStyle = 'rgba(14,8,22,0.32)'; ctx.fillRect(0, 0, W, H); }
    else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a2140'); g.addColorStop(1, '#1c1230'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }

    const nowAbs = performance.now();
    const ly = H * 0.13, sp = Math.min(150, W * 0.12);
    for (let i = 0; i < 3; i++) {
      const lx = W / 2 + (i - 1) * sp, on = nowAbs - LEDS[i].flash < 280;
      drawLed(ctx, lx, ly, 26, LEDS[i].color, on, LEDS[i].label, game.key === 'play' ? String(i + 1) : '');
    }

    if (state.phase === 'count') {
      const el = (nowAbs - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 92px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.5); ctx.textAlign = 'start';
      if (el >= 3) { state.phase = 'play'; state.t0 = performance.now(); }
    }

    const now = state.phase === 'play' ? nowAbs - state.t0 : -1e9;
    const hx = Math.max(160, W * 0.24), laneY = H * 0.46;
    const pulse = 1 + Math.sin(nowAbs * 0.012) * 0.08;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, laneY, 34 * pulse, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,90,0.75)'; ctx.beginPath(); ctx.arc(hx, laneY, 22 * pulse, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, laneY); ctx.lineTo(W, laneY); ctx.stroke();

    for (const b of beats) {
      if (b.judged) continue;
      const dt = b.target - now; if (dt > LEAD || dt < -W_GOOD - 80) continue;
      const x = hx + (dt / LEAD) * (W - hx - 50), near = Math.abs(dt) < W_GOOD;
      const col = game.key === 'play' ? LEDS[b.color].color : (near ? '255,240,176' : '255,210,74');
      ctx.save(); ctx.shadowColor = `rgba(${game.key === 'play' ? col : '255,210,90'},0.9)`; ctx.shadowBlur = near ? 24 : 10;
      ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(x, laneY, 17, 0, 6.283); ctx.fill(); ctx.restore();
    }

    if (ready(eddieImg)) {
      const eh = H * 0.34, ew = eh * (eddieImg.naturalWidth / eddieImg.naturalHeight);
      const flip = state.phase === 'play' && Math.floor(now / 420) % 2 === 0 ? -1 : 1;
      const bob = now > 0 ? Math.abs(Math.sin(now * 0.012)) * 9 : 0;
      const cxp = W * 0.11, topY = H * 0.93 - eh - bob;
      ctx.save(); ctx.translate(cxp + ew / 2, topY); ctx.scale(flip, 1); ctx.drawImage(eddieImg, -ew / 2, 0, ew, eh); ctx.restore();
      const rk = gradeOf(state.seen ? state.hits / state.seen : 0);
      ctx.save(); ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(16,20,34,0.82)'; rr(ctx, cxp + ew / 2 - 52, topY - 52, 104, 40, 12); ctx.fill();
      ctx.fillStyle = '#cfe0ff'; ctx.font = '700 11px "Space Grotesk", sans-serif'; ctx.fillText('현재 등급', cxp + ew / 2, topY - 36);
      ctx.fillStyle = rk === 'S' ? '#ffd24a' : rk === 'A' ? '#7ef0a0' : rk === 'B' ? '#6fb7ff' : '#ff9e3c';
      ctx.font = '900 22px "Space Grotesk", sans-serif'; ctx.fillText(rk, cxp + ew / 2, topY - 16);
      ctx.restore(); ctx.textAlign = 'start';
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.y -= 0.9; p.life--;
      ctx.globalAlpha = Math.max(0, p.life / 55); ctx.fillStyle = p.color;
      ctx.font = '900 30px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.text, Math.max(160, W * 0.24), p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1);
    }
    ctx.textAlign = 'start';

    if (state.phase === 'play' && !state.ended) {
      for (const b of beats) if (!b.judged && now - b.target > W_GOOD) { b.judged = true; state.seen++; state.combo = 0; sync(); }
      if (beats.length && now > beats[beats.length - 1].target + 800) endPlay();
    }
  }
  function endPlay() {
    if (state.ended) return; state.ended = true; state.phase = 'result';
    const acc = state.hits / beats.length, grade = gradeOf(acc);
    showResult(grade, acc >= PASS_ACC);
  }
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize); }
}

function drawLed(ctx, x, y, r, color, on, label, key) {
  if (on) { const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.4); g.addColorStop(0, `rgba(${color},0.85)`); g.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 6.283); ctx.fill(); }
  ctx.fillStyle = on ? `rgb(${color})` : `rgba(${color},0.32)`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  ctx.strokeStyle = `rgba(${color},0.9)`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  if (on) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.28, r * 0.18, -0.5, 0, 6.283); ctx.fill(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 11px "Space Grotesk", sans-serif'; ctx.fillText(label, x, y + r + 15);
  if (key) { ctx.fillStyle = `rgb(${color})`; ctx.font = '900 14px "Space Grotesk", sans-serif'; ctx.fillText(key, x, y + r + 31); }
  ctx.textAlign = 'start';
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawCover(ctx, img, W, H) { const ir = img.naturalWidth / img.naturalHeight, r = W / H; let dw, dh; if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; } ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
