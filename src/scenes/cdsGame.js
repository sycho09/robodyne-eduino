// cdsGame.js — 손그림자 마술 (조도센서 · 빛 조절 게임 2종)
// 공통 조작: '가리기' 패드 꾹(또는 Space)=어둠 / 떼면=밝음. 실물 CDS(A0) 가려도 어둠 인정.
//   1단계 'react' — 떨어지는 ☀️비춰/🌑가려 신호를 판정선에서 빛 상태로 맞추기(반응)
//   2단계 'fly'   — 빛 받으면 떠오르고 가리면 가라앉는 반딧불이로 장애물 통과(생존/회피)
// 각 단계 A등급(85%↑) + 둘 다 통과 → 🔆 햇살 메달.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const ADC = 0, LEAD = 1700, PASS_ACC = 0.85;
const GAMES = [
  { key: 'easy', no: 1, mode: 'react', name: '반딧불 신호', gap: 1500, seq: ['bright', 'dark', 'bright', 'dark', 'bright', 'dark', 'bright', 'dark'] },
  { key: 'hard', no: 2, mode: 'fly', name: '반딧불이 비행', pillars: 14, gap: 1250 },
];

const bgImg = new Image(); bgImg.src = '/brand/stage-cds-bg.webp';
const eddieImg = new Image(); eddieImg.src = '/brand/eddie/eddie-hero.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';
const lerp = (a, b, t) => a + (b - a) * t;

export function showCdsGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade cdsgame">
      <div class="cds-stage-bg" id="cd-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="cd-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="cd-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="cd-host"></div>
      <div class="led-hud" id="cd-hud" hidden>
        <span class="lh-item" id="cd-stage">1단계</span>
        <span class="lh-item"><b id="cd-hlbl">🎯 적중</b> <b id="cd-hit">0</b>/<span id="cd-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="cd-combo">0</b></span>
        <span class="lh-item">⭐ <b id="cd-score">0</b></span>
      </div>
      <button class="cds-pad" id="cd-pad" hidden><span class="cds-pad-ico">🖐️</span><span class="cds-pad-lbl">가리기</span><span class="cds-pad-hint" id="cd-padhint">꾹 누르기 / Space</span></button>
      <div class="led-prep" id="cd-prep">
        <div class="prep-card" style="max-width:600px;text-align:center">
          <h2>🔆 손그림자 마술</h2>
          <p class="prep-sub">빛을 다루는 두 가지 미션! <b>1단계</b> 신호 맞추기 · <b>2단계</b> 반딧불이 비행 🪰</p>
          <p class="prep-sub">조작: <b>가리기 패드를 꾹</b>(또는 Space) = 어둠 / 떼면 = 밝음. CDS를 <b>A0</b>에 연결하면 진짜 손으로 가려도 돼요.</p>
          <div class="prep-wire"><b>🔌 결선</b>
            <table class="prep-table prep-wire-t"><tbody><tr><td>🔆 Grove 조도센서(CDS)</td><td><b>A0</b> 포트</td></tr></tbody></table>
            <span class="prep-wire-note">Grove 케이블을 A0(아날로그) 포트에 꽂기</span>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="cd-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="cd-start">시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#cd-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const host = root.querySelector('#cd-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#cd-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHit = root.querySelector('#cd-hit'), elTot = root.querySelector('#cd-tot'), elCombo = root.querySelector('#cd-combo'), elScore = root.querySelector('#cd-score'), elStage = root.querySelector('#cd-stage'), elHlbl = root.querySelector('#cd-hlbl'), padHint = root.querySelector('#cd-padhint');
  const hud = root.querySelector('#cd-hud'), pad = root.querySelector('#cd-pad'), skipBtn = root.querySelector('#cd-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ── 빛 상태(공통) ──
  let holding = false, sensorDark = false, light = 1;
  const isDark = () => holding || sensorDark;
  const press = (e) => { e && e.preventDefault(); holding = true; pad.classList.add('on'); };
  const release = (e) => { e && e.preventDefault(); holding = false; pad.classList.remove('on'); };
  pad.addEventListener('pointerdown', press); pad.addEventListener('pointerup', release);
  pad.addEventListener('pointerleave', release); pad.addEventListener('pointercancel', release);
  const onKeyDown = (e) => { if ((e.code === 'Space' || e.key === ' ') && state.phase === 'play') { e.preventDefault(); if (!holding) press(); } };
  const onKeyUp = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); release(); } };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);

  // 실물 센서 폴링
  let senseTimer = null, baseline = 800;
  function startSense() {
    stopSense(); if (!board.connected) { sensorDark = false; return; }
    board.analogRead(ADC).then((v) => { if (v != null) baseline = Math.max(300, v); }).catch(() => {});
    senseTimer = setInterval(async () => { const v = await board.analogRead(ADC); if (v == null) return; baseline = Math.max(baseline * 0.98, v); sensorDark = v < baseline * 0.55; }, 130);
  }
  function stopSense() { if (senseTimer) { clearInterval(senseTimer); senseTimer = null; } }
  root.querySelector('#cd-connect').onclick = async () => { const b = root.querySelector('#cd-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startSense(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startSense()).catch(() => {});
  root.querySelector('#cd-start').onclick = () => { root.querySelector('#cd-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, game = GAMES[0], beats = [], fly = null, pops = [], parts = [];
  const state = { phase: 'prep', t0: 0, countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, ended: false, lastHit: -1e9 };
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; pad.hidden = true;
    const tip = game.mode === 'react'
      ? '<b>☀️ 비춰</b>는 그대로, <b>🌑 가려</b>는 가리기 패드를 꾹! 판정선에 닿는 순간이 중요해요 ✨'
      : '빛 받으면 <b>떠오르고</b> 가리면 <b>가라앉아요</b>! 반딧불이를 조종해 빛넝쿨 사이를 통과하자 🪰 (떼면 위로, 꾹 누르면 아래로)';
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div><h2>🔆 ${game.name}</h2>
      <p class="prep-sub">${tip}</p>
      <p class="lp-cond">⭐ <b>A등급(85%↑)</b> 이상이면 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); pad.hidden = false; pops = []; parts = [];
    Object.assign(state, { phase: 'count', countT: performance.now(), t0: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, ended: false, lastHit: -1e9 });
    if (game.mode === 'react') {
      beats = game.seq.map((need, i) => ({ need, target: 1000 + i * game.gap, judged: false }));
      state.total = beats.length; elHlbl.textContent = '🎯 적중'; padHint.textContent = '🌑 가려 신호에 꾹';
    } else {
      fly = { y: H * 0.4, vy: 0, pillars: [], spawned: 0, t: 0, endT: 0 };
      state.total = game.pillars; elHlbl.textContent = '🪰 통과'; padHint.textContent = '꾹=아래 · 떼면=위';
    }
    elTot.textContent = state.total; elStage.textContent = `${game.no}단계 · ${game.name}`;
    hud.hidden = false; sync();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); pad.hidden = true; const acc = Math.round((state.hits / state.total) * 100); const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${game.name} · ${state.hits}/${state.total} (${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '두 미션 완성! 메달을 받자 🏅' : '다음 미션으로 ▶') : 'A등급(85%↑) 이상이어야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 미션 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) { progress.mark('cds'); celebrateRoom({ title: '빛의 마술사! 🔆', message: '신호 맞추기와 반딧불이 비행까지 — 🔆 햇살 메달 획득! 빛도 어둠도 네 손안에 있어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() }); }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };

  function sync() { elHit.textContent = state.hits; elCombo.textContent = state.combo; elScore.textContent = state.score; }
  function burst(x, y, color) { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 36, color }); } }
  function pop(text, color, y) { pops.push({ text, color, y: y || H * 0.6, life: 48 }); }
  function endPlay() { if (state.ended) return; state.ended = true; state.phase = 'result'; const acc = state.hits / state.total; showResult(gradeOf(acc), acc >= PASS_ACC); }

  // ── 2단계: 반딧불이 비행 물리/충돌 ──
  function updateFly(dt) {
    if (state.phase !== 'play' || state.ended) return;
    fly.t += dt * 16.67;
    fly.vy += (isDark() ? 0.62 : -0.52) * dt;            // 어둠=가라앉음 / 밝음=떠오름
    fly.vy = Math.max(-8.5, Math.min(8.5, fly.vy)) * 0.99;
    fly.y += fly.vy * dt;
    if (fly.y < 46) { fly.y = 46; fly.vy = 0; } if (fly.y > H - 46) { fly.y = H - 46; fly.vy = 0; }
    if (fly.spawned < game.pillars && fly.t > 800 + fly.spawned * game.gap) {
      const gapH = Math.max(H * 0.24, H * 0.36 - fly.spawned * (H * 0.006));
      const gy = 64 + Math.random() * (H - 128 - gapH);
      fly.pillars.push({ x: W + 50, w: 58, gapY: gy, gapH, passed: false, hit: false }); fly.spawned++;
    }
    const px = W * 0.28;
    for (const p of fly.pillars) {
      p.x -= 4.6 * dt;
      if (!p.hit && !p.passed && px + 20 > p.x && px - 20 < p.x + p.w && (fly.y - 18 < p.gapY || fly.y + 18 > p.gapY + p.gapH)) {
        p.hit = true; state.combo = 0; sfx.no(); pop('CRASH', '#ff9a9a', fly.y - 30); burst(px, fly.y, '255,150,150');
      }
      if (!p.passed && p.x + p.w < px - 20) { p.passed = true; if (!p.hit) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 100 + state.combo * 5; sfx.ok(); } sync(); }
    }
    if (fly.spawned >= game.pillars && fly.pillars.every((p) => p.passed)) { if (!fly.endT) fly.endT = fly.t; if (fly.t - fly.endT > 600) endPlay(); }
  }

  // ── 그리기 ──
  function draw(nowAbs) {
    light = lerp(light, isDark() ? 0 : 1, 0.18);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0e16'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(8,10,26,${(1 - light) * 0.62})`; ctx.fillRect(0, 0, W, H);
    if (light > 0.05) { const g = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, H * 0.7); g.addColorStop(0, `rgba(255,225,150,${0.16 * light})`); g.addColorStop(1, 'rgba(255,225,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    drawMeter();

    // 카운트다운
    if (state.phase === 'count') {
      const el = (nowAbs - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 90px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.5);
      if (el >= 3) { state.phase = 'play'; state.t0 = performance.now(); }
    }

    if (game.mode === 'react') drawReact(nowAbs); else drawFly();

    // 파티클 · 판정텍스트 · 콤보(공통)
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 36); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.y -= 0.7; p.life--; ctx.globalAlpha = Math.max(0, p.life / 48); ctx.fillStyle = p.color; ctx.font = '900 26px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, W / 2, p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1); }
    if (state.combo >= 2) { ctx.fillStyle = '#ffd24a'; ctx.font = '900 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🔥 ${state.combo} COMBO`, W / 2, H * 0.12); }
  }
  function drawReact(nowAbs) {
    const lineY = H * 0.76;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(nowAbs * 0.005)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W * 0.2, lineY); ctx.lineTo(W * 0.8, lineY); ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.9; ctx.font = '900 64px serif'; ctx.textAlign = 'center'; ctx.fillText(isDark() ? '🌑' : '☀️', W / 2, H * 0.3); ctx.restore();
    const now = state.phase === 'play' ? nowAbs - state.t0 : -1e9;
    for (const b of beats) {
      if (b.judged) continue;
      const dt = b.target - now; if (dt > LEAD || dt < -360) continue;
      const y = lineY - (dt / LEAD) * (lineY - 40), r = 34, bright = b.need === 'bright';
      ctx.save(); ctx.shadowColor = bright ? 'rgba(255,210,90,.95)' : 'rgba(120,150,255,.9)'; ctx.shadowBlur = 22; ctx.fillStyle = bright ? '#ffd24a' : '#3a4570'; ctx.beginPath(); ctx.arc(W / 2, y, r, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.fillText(bright ? '☀️' : '🌑', W / 2, y + 10);
      ctx.fillStyle = '#fff'; ctx.font = '800 14px "Space Grotesk", sans-serif'; ctx.fillText(bright ? '비춰!' : '가려!', W / 2, y + r + 18);
    }
    if (state.phase === 'play' && !state.ended) {
      for (const b of beats) { if (b.judged || now < b.target) continue; b.judged = true; const ok = (b.need === 'dark') === isDark(); if (ok) { state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.hits++; state.score += 100 + state.combo * 5; sfx.ok(); burst(W / 2, lineY, b.need === 'bright' ? '255,210,90' : '150,170,255'); pop(b.need === 'bright' ? 'BRIGHT!' : 'SHADOW!', b.need === 'bright' ? '#ffd24a' : '#9fb0ff'); } else { state.combo = 0; sfx.no(); pop('MISS', '#ff9a9a'); } sync(); }
      if (beats.length && now > beats[beats.length - 1].target + 950) endPlay();
    }
    if (ready(eddieImg)) { const eh = H * 0.26, ew = eh * (eddieImg.naturalWidth / eddieImg.naturalHeight); const bob = now > 0 ? Math.abs(Math.sin(now * 0.006)) * 7 : 0; ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * light; ctx.drawImage(eddieImg, W * 0.045, H * 0.97 - eh - bob, ew, eh); ctx.restore(); }
  }
  function drawFly() {
    if (!fly) return;
    const px = W * 0.28;
    for (const p of fly.pillars) {
      ctx.fillStyle = p.hit ? 'rgba(255,120,120,.45)' : 'rgba(120,150,255,.5)';
      rr(ctx, p.x, 0, p.w, p.gapY, 12); ctx.fill();
      rr(ctx, p.x, p.gapY + p.gapH, p.w, H - (p.gapY + p.gapH), 12); ctx.fill();
      ctx.fillStyle = p.hit ? 'rgba(255,150,150,.8)' : 'rgba(160,190,255,.85)';
      ctx.fillRect(p.x, p.gapY - 4, p.w, 4); ctx.fillRect(p.x, p.gapY + p.gapH, p.w, 4);
    }
    // 반딧불이(플레이어) — 빛 받을수록 환하게
    const glow = 0.4 + 0.7 * light;
    ctx.save(); ctx.shadowColor = `rgba(255,225,130,${glow})`; ctx.shadowBlur = 34 * glow;
    ctx.fillStyle = `rgb(255,${Math.round(195 + 40 * light)},90)`; ctx.beginPath(); ctx.arc(px, fly.y, 17, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.fillText('🪰', px, fly.y + 7);
    // 방향 힌트
    if (state.phase === 'play') { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '700 13px "Space Grotesk", sans-serif'; ctx.fillText(isDark() ? '↓ 가라앉는 중' : '↑ 떠오르는 중', px, fly.y - 28); }
  }
  function drawMeter() {
    const mx = W * 0.92, my = H * 0.18, mh = H * 0.5, mw = 22;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(ctx, mx, my, mw, mh, 11); ctx.fill();
    const fh = mh * light; ctx.fillStyle = '#ffd24a'; rr(ctx, mx, my + (mh - fh), mw, fh, 11); ctx.fill();
    ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.fillText('☀️', mx + mw / 2, my - 8); ctx.fillText('🌑', mx + mw / 2, my + mh + 22);
  }

  let lastT = performance.now();
  function loop(now) { const dt = Math.min(40, now - lastT) / 16.67; lastT = now; if (game && game.mode === 'fly') updateFly(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopSense(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', resize); }
}

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
