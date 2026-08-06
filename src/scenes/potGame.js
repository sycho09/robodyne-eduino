// potGame.js — 볼륨 다이얼쇼 (가변저항 · 아날로그 입력 게임 2종)
// 공통 조작: 화면 슬라이더 드래그 / ← → (또는 ↑ ↓) 로 볼륨 다이얼 돌리기. 실물 가변저항(A0) 돌리면 그대로 반영.
//   1단계 'match' — 목표 볼륨 존에 바늘을 맞추고 잠깐 유지(정밀 조준)
//   2단계 'track' — 위아래로 움직이는 목표를 다이얼로 계속 따라가기(추적)
// 각 단계 80%↑ 통과 + 둘 다 통과 → 🎚️ 다이얼 메달.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const ADC = 0, PASS_ACC = 0.8;
const GAMES = [
  { key: 'easy', no: 1, mode: 'match', name: '볼륨 맞추기', rounds: 6, holdNeed: 850, roundLimit: 5200, half0: 0.11, half1: 0.052 },
  { key: 'hard', no: 2, mode: 'track', name: '페이더 쇼', dur: 26000, checks: 20, tol0: 0.12, tol1: 0.085 },
];

const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-pot-bg.png'; } }; bgImg.src = '/brand/stage-pot-bg.webp';
const djImg = new Image(); djImg.src = '/brand/eddie/eddie-hero.webp';   // 메인 캐릭터(에디)로 통일
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.8 ? 'B' : a >= 0.6 ? 'C' : 'D';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function showPotGame(root, { onExit, onComplete } = {}) {
  root.innerHTML = `
    <div class="led scene-fade potgame">
      <div class="pot-stage-bg" id="pt-bg" style="position:absolute;inset:0;z-index:0;background:#211a3a center/cover no-repeat;"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="pt-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="pt-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="pt-host"></div>
      <div class="led-hud" id="pt-hud" hidden>
        <span class="lh-item" id="pt-stage">1단계</span>
        <span class="lh-item"><b id="pt-hlbl">🎯 적중</b> <b id="pt-hit">0</b>/<span id="pt-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="pt-combo">0</b></span>
        <span class="lh-item">⭐ <b id="pt-score">0</b></span>
      </div>
      <div class="pot-fader" id="pt-fader" hidden>
        <span class="pot-fader-lbl" id="pt-faderlbl">🎚️ 볼륨 다이얼</span>
        <input type="range" id="pt-range" min="0" max="1000" value="500" step="1">
        <span class="pot-fader-hint" id="pt-faderhint">드래그 / ← → 키로 돌리기</span>
      </div>
      <div class="led-prep" id="pt-prep">
        <div class="prep-card" style="max-width:620px;text-align:center">
          <h2>🎚️ 볼륨 다이얼쇼</h2>
          <p class="prep-sub">다이얼을 돌려 볼륨을 조종하는 두 미션! <b>1단계</b> 볼륨 맞추기 · <b>2단계</b> 페이더 쇼 🎶</p>
          <p class="prep-sub">조작: <b>아래 슬라이더 드래그</b>(또는 ← → / ↑ ↓ 키). 가변저항을 <b>A0</b>에 꽂으면 진짜 다이얼을 돌려도 돼요.</p>
          <div class="prep-wire"><b>🔌 결선</b>
            <table class="prep-table prep-wire-t"><tbody><tr><td>🎚️ Grove 가변저항(회전형)</td><td><b>A0</b> 포트</td></tr></tbody></table>
            <span class="prep-wire-note">Grove 케이블을 A0(아날로그) 포트에 꽂고 다이얼을 돌리기 — 0~1023 값</span>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="pt-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="pt-start">시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#pt-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const host = root.querySelector('#pt-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#pt-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHit = root.querySelector('#pt-hit'), elTot = root.querySelector('#pt-tot'), elCombo = root.querySelector('#pt-combo'), elScore = root.querySelector('#pt-score'), elStage = root.querySelector('#pt-stage'), elHlbl = root.querySelector('#pt-hlbl');
  const hud = root.querySelector('#pt-hud'), fader = root.querySelector('#pt-fader'), faderLbl = root.querySelector('#pt-faderlbl'), faderHint = root.querySelector('#pt-faderhint'), range = root.querySelector('#pt-range'), skipBtn = root.querySelector('#pt-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ── 볼륨 값(0..1) 입력: 슬라이더/키보드(수동) + 실물 가변저항(A0) ──
  let manual = 0.5, sensorKnob = null, knob = 0.5;
  const target = () => (sensorKnob != null ? sensorKnob : manual);
  range.addEventListener('input', () => { manual = clamp(+range.value / 1000, 0, 1); });
  const onKeyDown = (e) => {
    let d = 0;
    if (e.code === 'ArrowRight' || e.code === 'ArrowUp') d = 0.045;
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') d = -0.045;
    if (d) { e.preventDefault(); manual = clamp(manual + d, 0, 1); range.value = Math.round(manual * 1000); }
  };
  window.addEventListener('keydown', onKeyDown);

  // 실물 센서 폴링(A0 → 0~1023)
  let senseTimer = null;
  function startSense() {
    stopSense(); if (!board.connected) { sensorKnob = null; return; }
    senseTimer = setInterval(async () => {
      const v = await board.analogRead(ADC); if (v == null) return;
      sensorKnob = clamp(v / 1023, 0, 1);
      range.value = Math.round(sensorKnob * 1000); range.disabled = true; range.style.opacity = '.45';
      faderLbl.textContent = '🎚️ 실물 다이얼 ✓'; faderHint.textContent = '가변저항을 돌리세요';
    }, 90);
  }
  function stopSense() { if (senseTimer) { clearInterval(senseTimer); senseTimer = null; } }
  root.querySelector('#pt-connect').onclick = async () => { const b = root.querySelector('#pt-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startSense(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startSense()).catch(() => {});
  root.querySelector('#pt-start').onclick = () => { root.querySelector('#pt-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, game = GAMES[0], parts = [], pops = [], heroFx = 0;
  let m = null, tk = null;   // match / track 상태
  const state = { phase: 'prep', countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, ended: false };
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; fader.hidden = true;
    const tip = game.mode === 'match'
      ? '깜빡이는 <b>목표 볼륨 존</b>에 바늘을 맞추고 <b>잠깐 유지</b>하면 적중! 라운드가 갈수록 존이 좁아져요 🎯'
      : '위아래로 움직이는 <b>목표 불빛</b>을 다이얼로 <b>계속 따라가요</b>! 겹친 순간이 점수가 돼요 🎶';
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div><h2>🎚️ ${game.name}</h2>
      <p class="prep-sub">${tip}</p>
      <p class="lp-cond">⭐ <b>80%↑</b> 적중하면 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); fader.hidden = false; parts = []; pops = []; heroFx = 0;
    Object.assign(state, { phase: 'count', countT: performance.now(), score: 0, combo: 0, maxCombo: 0, hits: 0, ended: false });
    if (game.mode === 'match') {
      m = { idx: 0, center: 0.5, half: game.half0, holdT: 0, roundStart: 0 };
      nextRound(true); state.total = game.rounds; elHlbl.textContent = '🎯 적중';
    } else {
      tk = { t: 0, checkIdx: 0, nextCheck: game.dur / game.checks, inT: 0 };
      state.total = game.checks; elHlbl.textContent = '🎶 적중';
    }
    elTot.textContent = state.total; elStage.textContent = `${game.no}단계 · ${game.name}`;
    hud.hidden = false; sync();
  }
  function nextRound(first) {
    const i = first ? 0 : m.idx + 1; m.idx = i;
    if (i >= game.rounds) { endPlay(); return; }
    let c; do { c = 0.12 + Math.random() * 0.76; } while (Math.abs(c - m.center) < 0.22);
    m.center = c; m.half = lerp(game.half0, game.half1, i / (game.rounds - 1)); m.holdT = 0; m.roundStart = performance.now();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); fader.hidden = true; const acc = Math.round((state.hits / state.total) * 100); const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${game.name} · ${state.hits}/${state.total} (${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '두 미션 완성! 메달을 받자 🏅' : '다음 미션으로 ▶') : '80% 이상 적중해야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 미션 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) {
      if (onComplete) { onComplete(); return; }
      progress.mark('pot'); celebrateRoom({ title: '볼륨 마스터! 🎚️', message: '목표 볼륨 맞추기와 페이더 쇼까지 — 🎚️ 다이얼 메달 획득! 아날로그 값을 자유자재로 다뤘어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };

  function sync() { elHit.textContent = state.hits; elCombo.textContent = state.combo; elScore.textContent = state.score; }
  function burst(x, y, color) { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 36, color }); } }
  function pop(text, color, y) { pops.push({ text, color, y: y || H * 0.5, life: 46 }); }
  function endPlay() { if (state.ended) return; state.ended = true; state.phase = 'result'; const acc = state.hits / state.total; showResult(gradeOf(acc), acc >= PASS_ACC); }

  // ── 목표 곡선(2단계) ──
  function trackTarget(t) { const s = t / 1000; const ramp = clamp(t / game.dur, 0, 1); const amp = 0.30 + 0.06 * ramp; return clamp(0.5 + amp * Math.sin(s * (1.1 + ramp * 0.7)) + 0.1 * Math.sin(s * 2.3 + 1.0), 0.07, 0.93); }

  // ── 업데이트 ──
  function update(dt) {
    knob = lerp(knob, target(), 0.32);
    if (state.phase !== 'play' || state.ended) return;
    const ms = dt * 16.67;
    if (game.mode === 'match') {
      const inZone = Math.abs(knob - m.center) <= m.half;
      if (inZone) m.holdT += ms; else m.holdT = Math.max(0, m.holdT - ms * 0.85);
      if (m.holdT >= game.holdNeed) {
        state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.score += 100 + state.combo * 8; sfx.ok(); heroFx = 1;
        burst(W * 0.42, yOfKnob(m.center), '120,230,140'); pop('PERFECT!', '#7bf0a0'); sync(); nextRound(false);
      } else if (performance.now() - m.roundStart > game.roundLimit) {
        state.combo = 0; sfx.no(); pop('너무 느려요!', '#ff9a9a'); sync(); nextRound(false);
      }
    } else {
      tk.t += ms;
      const tgt = trackTarget(tk.t), tol = lerp(game.tol0, game.tol1, clamp(tk.t / game.dur, 0, 1));
      const inZone = Math.abs(knob - tgt) <= tol;
      if (inZone) { tk.inT += ms; state.score += Math.round(dt * 2); }
      if (tk.t >= tk.nextCheck && tk.checkIdx < game.checks) {
        tk.checkIdx++; tk.nextCheck = (tk.checkIdx + 1) * (game.dur / game.checks);
        if (inZone) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 60 + state.combo * 6; sfx.ok(); heroFx = 1; burst(W * 0.42, yOfKnob(tgt), '255,210,90'); pop('GOOD!', '#ffd24a'); }
        else { state.combo = 0; sfx.no(); }
        sync();
      }
      if (tk.t >= game.dur && tk.checkIdx >= game.checks) endPlay();
    }
    heroFx = Math.max(0, heroFx - ms * 0.0016);
  }

  // 볼륨(0..1)→화면 Y. 미터는 화면 좌중앙 세로 막대.
  const meterGeo = () => ({ x: W * 0.34, w: W * 0.16, top: H * 0.14, h: H * 0.66 });
  function yOfKnob(v) { const g = meterGeo(); return g.top + (1 - v) * g.h; }

  // ── 그리기 ──
  function draw(nowAbs) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,8,26,0.42)'; ctx.fillRect(0, 0, W, H);
    drawMeter(nowAbs);
    drawDJ(nowAbs);

    if (state.phase === 'count') {
      const el = (nowAbs - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 90px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.5);
      if (el >= 3) { state.phase = 'play'; if (game.mode === 'match') m.roundStart = performance.now(); }
    }

    // 파티클 · 판정 텍스트 · 콤보
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 36); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.y -= 0.7; p.life--; ctx.globalAlpha = Math.max(0, p.life / 46); ctx.fillStyle = p.color; ctx.font = '900 26px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, W / 2, p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1); }
    if (state.combo >= 2) { ctx.fillStyle = '#ffd24a'; ctx.font = '900 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🔥 ${state.combo} COMBO`, W / 2, H * 0.12); }
  }

  function drawMeter(nowAbs) {
    const g = meterGeo(), { x, w, top, h } = g, bot = top + h;
    // 케이스
    ctx.fillStyle = 'rgba(20,16,40,0.85)'; rr(ctx, x - 14, top - 14, w + 28, h + 28, 18); ctx.fill();
    // 세그먼트 바
    const segs = 18, gap = 4, segH = (h - gap * (segs - 1)) / segs;
    const level = clamp(knob, 0, 1);
    for (let i = 0; i < segs; i++) {
      const frac = (i + 0.5) / segs, sy = bot - (i + 1) * segH - i * gap;
      const on = frac <= level;
      const col = frac > 0.8 ? '255,90,90' : frac > 0.55 ? '255,210,90' : '120,230,140';
      // shadowBlur(프레임당 18회)은 렉의 주범 → 켜진 칸은 밝은 본체+옅은 외곽선으로 글로우 흉내(저비용)
      ctx.fillStyle = on ? `rgb(${col})` : 'rgba(255,255,255,0.08)';
      rr(ctx, x, sy, w, segH, 5); ctx.fill();
      if (on) { ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // 목표 표시
    if (game.mode === 'match' && m) {
      const blink = 0.5 + 0.5 * Math.sin(nowAbs * 0.008);
      const yTop = top + (1 - (m.center + m.half)) * h, yBot = top + (1 - (m.center - m.half)) * h;
      ctx.save(); ctx.globalAlpha = 0.35 + 0.35 * blink; ctx.fillStyle = '#7bf0a0';
      ctx.fillRect(x - 14, yTop, w + 28, yBot - yTop); ctx.restore();
      ctx.strokeStyle = `rgba(123,240,160,${0.7 + 0.3 * blink})`; ctx.lineWidth = 3;
      ctx.strokeRect(x - 14, yTop, w + 28, yBot - yTop);
      ctx.fillStyle = '#dfffe9'; ctx.font = '800 14px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎯 여기 맞춰서 유지!', x + w / 2, yTop - 14);
      // 유지 게이지
      if (state.phase === 'play') { const pr = clamp(m.holdT / game.holdNeed, 0, 1); ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, x - 14, bot + 16, w + 28, 12, 6); ctx.fill(); ctx.fillStyle = '#7bf0a0'; rr(ctx, x - 14, bot + 16, (w + 28) * pr, 12, 6); ctx.fill(); }
    } else if (game.mode === 'track' && tk) {
      const tgt = trackTarget(tk.t), ty = top + (1 - tgt) * h;
      ctx.save(); ctx.shadowColor = 'rgba(255,210,90,0.95)'; ctx.shadowBlur = 26; ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(x + w / 2, ty, 16, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#3a2e10'; ctx.font = '900 16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🎵', x + w / 2, ty + 1);
      // 미래 곡선 미리보기(오른쪽으로)
      ctx.strokeStyle = 'rgba(255,210,90,0.4)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let px = 0; px <= 90; px += 6) { const fv = trackTarget(tk.t + px * 14); const fy = top + (1 - fv) * h; const sx = x + w / 2 + px * ((W * 0.16) / 90); px === 0 ? ctx.moveTo(sx, fy) : ctx.lineTo(sx, fy); }
      ctx.stroke();
    }
    // 바늘(현재 볼륨)
    const ky = top + (1 - level) * h;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 20, ky); ctx.lineTo(x - 34, ky - 9); ctx.lineTo(x - 34, ky + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w + 20, ky); ctx.lineTo(x + w + 34, ky - 9); ctx.lineTo(x + w + 34, ky + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 라벨
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '700 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('🔊 MAX', x + w / 2, top - 22); ctx.fillText('🔈 0', x + w / 2, bot + (game.mode === 'match' ? 50 : 34));
  }

  function drawDJ(nowAbs) {
    if (!ready(djImg)) return;
    const dw = W * 0.2, dh = dw * (djImg.naturalHeight / djImg.naturalWidth);
    const cx = W * 0.7, foot = H * 0.9;
    const bob = Math.sin(nowAbs / 360) * dh * 0.02 + knob * dh * 0.05;   // 볼륨 클수록 살짝 들썩
    const jump = Math.sin(Math.min(1, heroFx) * Math.PI) * dh * 0.12;
    const sx = 1 + heroFx * 0.05, sy = 1 - heroFx * 0.04;
    ctx.save(); ctx.translate(cx, foot - bob - jump); ctx.scale(sx, sy); ctx.drawImage(djImg, -dw / 2, -dh, dw, dh); ctx.restore();
  }

  let lastT = performance.now();
  function loop(now) { const dt = Math.min(40, now - lastT) / 16.67; lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopSense(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize); }
}

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
