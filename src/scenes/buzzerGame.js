// buzzerGame.js — 멜로디 연주단 (수동 부저 · 리듬게임)
// 밤 숲 콘서트 무대 위, 4레인으로 떨어지는 음표를 키(D·F·J·K)나 클릭으로 연주 → 멜로디 완성.
// 1차 쉬운 곡(작은별) · 2차 어려운 곡(환희의 송가). 각 단계 A등급(85%↑) 이상 + 둘 다 통과해야 메달.
// 누르면 화면 음(sfx.note) + 보드 연결 시 실제 부저음(tone, D5).
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';
import { isTablet } from '../app/device.js';

const PIN = 5, LANES = 4, KEYS = ['d', 'f', 'j', 'k'];
const LEAD = 1600, W_PERFECT = 110, W_GOOD = 200, PASS_ACC = 0.85;
const LANE_COL = ['46,200,106', '90,201,255', '255,200,74', '239,120,90'];

const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25;
const EASY = [C4, C4, G4, G4, A4, A4, G4, F4, F4, E4, E4, D4, D4, C4, G4, G4, F4, F4, E4, E4, D4];
const HARD = [E4, E4, F4, G4, G4, F4, E4, D4, C4, C4, D4, E4, E4, D4, D4, E4, E4, F4, G4, G4, F4, E4, D4, C4, C4, D4, E4, D4, C4, C4];
const GAMES = [
  { key: 'easy', no: 1, name: '쉬운 곡 · 작은별', melody: EASY, gap: 560 },
  { key: 'hard', no: 2, name: '어려운 곡 · 환희의 송가', melody: HARD, gap: 420 },
];

const bgImg = new Image(); bgImg.src = '/brand/stage-buzzer-bg.webp';
const noteImg = new Image(); noteImg.src = '/brand/note-leaf.webp';
const eddieImg = new Image(); eddieImg.src = '/brand/eddie-buzzer.webp';
const singImg = new Image(); singImg.src = '/brand/eddie-buzzer-sing.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;

function gradeOf(a) { return a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D'; }
function laneOf(freq) { const lo = C4, hi = C5; return Math.max(0, Math.min(LANES - 1, Math.floor(((freq - lo) / (hi - lo)) * LANES))); }

export function showBuzzerGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade">
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="bz-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="bz-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="bz-host"></div>
      <div class="led-hud" id="bz-hud" hidden>
        <span class="lh-item" id="bz-stage">1단계</span>
        <span class="lh-item">🎯 적중 <b id="bz-hit">0</b>/<span id="bz-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="bz-combo">0</b></span>
        <span class="lh-item">⭐ <b id="bz-score">0</b></span>
      </div>
      <div class="led-prep" id="bz-prep">
        <div class="prep-card" style="max-width:560px;text-align:center">
          <h2>🎵 멜로디 연주단</h2>
          <p class="prep-sub">떨어지는 음표가 판정선에 닿을 때 <b>그 레인의 키(D·F·J·K)</b>나 음표를 눌러 연주! 1차·2차 모두 A등급↑이면 메달 🏅</p>
          <p class="prep-sub">부저를 <b>D5</b>에 연결하면 실제 소리까지! (없어도 화면 소리로 플레이)</p>
          <div class="prep-wire"><b>🔌 결선</b>
            <table class="prep-table prep-wire-t"><tbody><tr><td>🔊 Grove 부저</td><td><b>D5</b> 포트</td></tr></tbody></table>
            <span class="prep-wire-note">Grove 케이블을 D5 포트에 꽂기 (전원·GND 자동)</span>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="bz-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="bz-start">시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const host = root.querySelector('#bz-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#bz-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHit = root.querySelector('#bz-hit'), elTot = root.querySelector('#bz-tot'), elCombo = root.querySelector('#bz-combo'), elScore = root.querySelector('#bz-score'), elStage = root.querySelector('#bz-stage');
  const skipBtn = root.querySelector('#bz-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  root.querySelector('#bz-connect').onclick = async () => { try { await board.connect(); root.querySelector('#bz-connect').textContent = '🔌 연결됨 ✓'; } catch (e) { root.querySelector('#bz-connect').textContent = board.classify(e).note.slice(0, 18) + '…'; } };
  board.connectAuto().catch(() => {});
  root.querySelector('#bz-start').onclick = () => { root.querySelector('#bz-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, game = GAMES[0], beats = [], pops = [];
  const state = { phase: 'prep', t0: 0, countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, seen: 0, ended: false, lastHit: 0 };
  const scene = root.querySelector('.led');
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); root.querySelector('#bz-hud').hidden = true;
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div><h2>🎵 ${game.name}</h2>
      <p class="prep-sub">레인 음표를 <b>D·F·J·K</b>(또는 클릭)으로! 제때 누르면 멜로디가 흘러요 🎶</p>
      <p class="lp-cond">⭐ <b>A등급(85%↑)</b> 이상이면 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0);
    const t0 = 1000;
    beats = game.melody.map((freq, i) => ({ i, freq, lane: laneOf(freq), target: t0 + i * game.gap, judged: false }));
    pops = []; Object.assign(state, { phase: 'count', countT: performance.now(), t0: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, seen: 0, ended: false, lastHit: 0 });
    elTot.textContent = beats.length; elStage.textContent = `${game.no}단계 · ${game.name}`;
    root.querySelector('#bz-hud').hidden = false; sync();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); const acc = Math.round((state.hits / beats.length) * 100); const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${game.name} · 적중 ${state.hits}/${beats.length} (${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '두 곡 완주! 메달을 받자 🏅' : '다음 곡으로 ▶') : 'A등급(85%↑) 이상이어야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 곡 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) {
      progress.mark('buzzer');
      celebrateRoom({ title: '두 곡 완주! 🎉', message: '쉬운 곡 + 어려운 곡 모두 A등급↑ — 🎵 리듬 메달 획득! 숲이 노래로 가득 찼어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };

  // ── 입력/판정 ──
  function hitLane(lane) {
    if (state.phase !== 'play' || state.ended) return;
    const now = performance.now() - state.t0;
    let best = null, bestD = 1e9;
    for (const b of beats) { if (b.judged || b.lane !== lane) continue; const d = Math.abs(now - b.target); if (d < bestD) { bestD = d; best = b; } }
    if (!best || bestD >= 360) return;
    best.judged = true; state.seen++;
    if (bestD <= W_GOOD) {
      const perfect = bestD <= W_PERFECT;
      state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.lastHit = performance.now();
      state.score += (perfect ? 100 : 60) + state.combo * 5; state.hits++;
      sfx.note(best.freq, 280); if (board.connected) board.tone(PIN, best.freq, 260).catch(() => {});
      pop(lane, perfect ? 'PERFECT!' : 'GOOD!', `rgb(${LANE_COL[lane]})`);
    } else { state.combo = 0; sfx.no(); pop(lane, 'MISS', '255,120,120'); }
    sync();
  }
  function pop(lane, text, color) { pops.push({ lane, text, color, y: H * 0.82, life: 50 }); }
  function sync() { elHit.textContent = state.hits; elCombo.textContent = state.combo; elScore.textContent = state.score; }
  function onKey(e) { if (state.phase !== 'play') return; const k = e.key.toLowerCase(); const l = KEYS.indexOf(k); if (l >= 0) { e.preventDefault(); hitLane(l); } }
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'play') return;
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left;
    const lw = laneW(); const lane = Math.floor((mx - laneX0()) / lw); if (lane >= 0 && lane < LANES) hitLane(lane);
  });

  function laneW() { return Math.min(120, W * 0.13); }
  function laneX0() { return W / 2 - laneW() * LANES / 2; }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (ready(bgImg)) { drawCover(ctx, bgImg, W, H); ctx.fillStyle = 'rgba(10,14,22,0.42)'; ctx.fillRect(0, 0, W, H); }
    else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1c2c2a'); g.addColorStop(1, '#0e1a18'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }

    const nowAbs = performance.now();
    const lw = laneW(), x0 = laneX0(), hitY = H * 0.82;
    // 레인
    for (let i = 0; i < LANES; i++) {
      const lx = x0 + i * lw;
      ctx.fillStyle = `rgba(${LANE_COL[i]},0.08)`; ctx.fillRect(lx, 0, lw, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(lx, 0, lw, H);
      // 판정 패드 + 키
      const padOn = nowAbs - state.lastHit < 90;
      ctx.fillStyle = `rgba(${LANE_COL[i]},${padOn ? 0.5 : 0.22})`; rr(ctx, lx + 6, hitY, lw - 12, 56, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 20px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(isTablet() ? '탭' : KEYS[i].toUpperCase(), lx + lw / 2, hitY + 36);
    }
    // 판정선
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, hitY); ctx.lineTo(x0 + lw * LANES, hitY); ctx.stroke();

    if (state.phase === 'count') {
      const el = (nowAbs - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 90px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.45);
      if (el >= 3) { state.phase = 'play'; state.t0 = performance.now(); }
    }
    const now = state.phase === 'play' ? nowAbs - state.t0 : -1e9;

    // 음표(낙하)
    for (const b of beats) {
      if (b.judged) continue;
      const dt = b.target - now; if (dt > LEAD || dt < -W_GOOD - 100) continue;
      const lx = x0 + b.lane * lw + lw / 2;
      const y = hitY - (dt / LEAD) * (hitY - 30);
      const r = Math.min(34, lw * 0.32);
      if (ready(noteImg)) { ctx.drawImage(noteImg, lx - r, y - r, r * 2, r * 2); }
      else { ctx.save(); ctx.shadowColor = `rgba(${LANE_COL[b.lane]},0.9)`; ctx.shadowBlur = 16; ctx.fillStyle = `rgb(${LANE_COL[b.lane]})`; ctx.beginPath(); ctx.arc(lx, y, r, 0, 6.283); ctx.fill(); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♪', lx, y + 7); }
    }

    // 지휘 EDDIE (콤보 높으면 노래)
    const useImg = (state.combo >= 8 && ready(singImg)) ? singImg : (ready(eddieImg) ? eddieImg : null);
    if (useImg) { const eh = H * 0.3, ew = eh * (useImg.naturalWidth / useImg.naturalHeight); const bob = now > 0 ? Math.abs(Math.sin(now * 0.012)) * 8 : 0; ctx.drawImage(useImg, W * 0.04, H * 0.96 - eh - bob, ew, eh); }
    if (state.combo >= 2) { ctx.fillStyle = '#ffd24a'; ctx.font = '900 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`🔥 ${state.combo} COMBO`, W * 0.06, H * 0.62); }

    // 판정 텍스트
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.y -= 0.8; p.life--;
      ctx.globalAlpha = Math.max(0, p.life / 50); ctx.fillStyle = p.color || '#fff';
      ctx.font = '900 22px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.text, x0 + p.lane * lw + lw / 2, p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1);
    }
    ctx.textAlign = 'start';

    if (state.phase === 'play' && !state.ended) {
      for (const b of beats) if (!b.judged && now - b.target > W_GOOD) { b.judged = true; state.seen++; state.combo = 0; sync(); }
      if (beats.length && now > beats[beats.length - 1].target + 900) endPlay();
    }
  }
  function endPlay() { if (state.ended) return; state.ended = true; state.phase = 'result'; const acc = state.hits / beats.length; showResult(gradeOf(acc), acc >= PASS_ACC); }
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', resize); }
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawCover(ctx, img, W, H) { const ir = img.naturalWidth / img.naturalHeight, r = W / H; let dw, dh; if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; } ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
