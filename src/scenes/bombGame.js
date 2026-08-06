// bombGame.js — 폭탄 해체반 (STAGE 3 · 응용): 가변저항(입력) + LED(출력) 정밀 제어 · 3막 스토리.
//   다이얼(A0)을 돌려 '해체 주파수'를 맞춘다. 정답에 가까울수록 폭탄 LED(D13)가 빠르게 깜빡(삐삐삐)!
//   1막 신관 잠금해제(정밀 매칭) · 2막 회로 보정(초정밀) · 3막 라이브 해체(움직이는 목표 추적) → 💣 해체 스타.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const ADC = 0, LED = 13, PASS_ACC = 0.8;   // 가변저항 A0(입력) · LED D13(출력)
const ACTS = [
  { key: 'arm', no: 1, mode: 'match', name: '신관 잠금해제', icon: '🔓',
    story: '시한폭탄 발견! 다이얼을 돌려 숨겨진 <b>해체 주파수</b>를 찾아요. LED가 <b>빠르게 깜빡일수록</b> 정답에 가까워요 — 맞는 곳에서 <b>잠깐 유지</b>하면 신관이 풀려요! ⏱️',
    rounds: 6, holdNeed: 800, roundLimit: 6000, half0: 0.10, half1: 0.05 },
  { key: 'tune', no: 2, mode: 'match', name: '회로 보정', icon: '🔧',
    story: '신관이 풀렸지만 회로가 더 예민해졌어요! 목표 구간이 <b>훨씬 좁아요</b>. 더 <b>정밀하게</b> 다이얼을 맞춰 와이어를 끊어요! ✂️',
    rounds: 6, holdNeed: 900, roundLimit: 4800, half0: 0.07, half1: 0.035 },
  { key: 'live', no: 3, mode: 'track', name: '라이브 해체', icon: '🧨',
    story: '마지막 단계 — 주파수가 <b>계속 흔들려요</b>! 카운트다운이 끝나기 전에 움직이는 목표를 다이얼로 <b>계속 따라가</b> 폭탄을 완전히 해체해요! 💣',
    dur: 24000, checks: 18, tol0: 0.10, tol1: 0.07 },
];

const eddieImg = new Image(); eddieImg.onerror = () => { if (!eddieImg._p) { eddieImg._p = 1; eddieImg.src = '/brand/eddie/eddie-hero.webp'; } }; eddieImg.src = '/brand/eddie-eod.webp';
const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-bomb-bg.png'; } }; bgImg.src = '/brand/stage-bomb-bg.webp';
const ready = (im) => im.complete && im.naturalWidth > 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.8 ? 'B' : a >= 0.6 ? 'C' : 'D';

// 다이얼 게이지: 135°에서 시작해 270° 스윕(시계방향). knob 0..1 → 각도(rad).
const A_START = Math.PI * 0.75, A_SWEEP = Math.PI * 1.5;
const angOf = (v) => A_START + clamp(v, 0, 1) * A_SWEEP;

export function showBombGame(root, { onExit, onComplete } = {}) {
  root.innerHTML = `
    <div class="led scene-fade bombgame">
      <div class="pot-stage-bg" id="bm-bg" style="position:absolute;inset:0;z-index:0;background:#1a0e0e center/cover no-repeat;"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="bm-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="bm-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="bm-host"></div>
      <div class="led-hud" id="bm-hud" hidden>
        <span class="lh-item" id="bm-act">1막</span>
        <span class="lh-item"><b id="bm-hlbl">✂️ 해체</b> <b id="bm-hit">0</b>/<span id="bm-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="bm-combo">0</b></span>
        <span class="lh-item">⭐ <b id="bm-score">0</b></span>
      </div>
      <div class="pot-fader" id="bm-fader" hidden>
        <span class="pot-fader-lbl" id="bm-faderlbl">🎚️ 해체 다이얼</span>
        <input type="range" id="bm-range" min="0" max="1000" value="500" step="1">
        <span class="pot-fader-hint" id="bm-faderhint">드래그 / ← → 키로 돌리기</span>
      </div>
      <div class="led-prep" id="bm-prep">
        <div class="prep-card" style="max-width:640px;text-align:center">
          <h2>💣 폭탄 해체반</h2>
          <p class="prep-sub">에디는 <b>폭탄처리반(EOD)</b> 요원! 다이얼(가변저항)을 돌려 <b>해체 주파수</b>를 정밀하게 맞춰요. 정답에 가까울수록 <b>LED가 빠르게 깜빡</b>여요(삐삐삐) — 맞는 곳에서 유지하면 해체! ⏱️</p>
          <p class="prep-sub">조작: <b>아래 슬라이더</b>(또는 ← → / ↑ ↓ 키). 가변저항을 <b>A0</b>, LED를 <b>D13</b>에 연결하면 진짜 다이얼·LED로 즐겨요.</p>
          <div class="prep-wire"><b>🔌 결선</b> <span style="opacity:.7;font-weight:600">(부품: 가변저항 1 · LED 1개)</span>
            <table class="prep-table prep-wire-t"><tbody>
              <tr><td>🎚️ 가변저항(회전형)</td><td><b>A0</b> 포트</td></tr>
              <tr><td>💡 LED</td><td><b>D13</b> (보드 내장 LED 있어 결선 없이도 OK)</td></tr>
            </tbody></table>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="bm-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="bm-start">해체 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#bm-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const host = root.querySelector('#bm-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { snd.textContent = sfx.toggle() ? '🔇' : '🔊'; };
  root.querySelector('#bm-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHit = root.querySelector('#bm-hit'), elTot = root.querySelector('#bm-tot'), elCombo = root.querySelector('#bm-combo'), elScore = root.querySelector('#bm-score'), elAct = root.querySelector('#bm-act'), elHlbl = root.querySelector('#bm-hlbl');
  const hud = root.querySelector('#bm-hud'), fader = root.querySelector('#bm-fader'), faderLbl = root.querySelector('#bm-faderlbl'), faderHint = root.querySelector('#bm-faderhint'), range = root.querySelector('#bm-range'), skipBtn = root.querySelector('#bm-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ── 다이얼 값(0..1): 슬라이더/키(수동) + 실물 가변저항(A0) ──
  let manual = 0.5, sensorKnob = null, knob = 0.5;
  const target01 = () => (sensorKnob != null ? sensorKnob : manual);
  range.addEventListener('input', () => { manual = clamp(+range.value / 1000, 0, 1); });
  const onKeyDown = (e) => {
    let d = 0;
    if (e.code === 'ArrowRight' || e.code === 'ArrowUp') d = 0.04;
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') d = -0.04;
    if (d) { e.preventDefault(); manual = clamp(manual + d, 0, 1); range.value = Math.round(manual * 1000); }
  };
  window.addEventListener('keydown', onKeyDown);

  // 실물 가변저항 폴링(A0 → 0~1023)
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

  // 실물 LED(D13) 출력: 정답 근접도에 따라 깜빡임 주파수. 같은 상태면 전송 생략(시리얼 절약).
  let lastLedSent = null;
  function sendLed(o) { if (o === lastLedSent) return; lastLedSent = o; if (board.connected) board.digital(LED, o).catch(() => {}); }
  function ledOff() { lastLedSent = null; if (board.connected) board.digital(LED, false).catch(() => {}); }

  root.querySelector('#bm-connect').onclick = async () => { const b = root.querySelector('#bm-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startSense(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startSense()).catch(() => {});
  root.querySelector('#bm-start').onclick = () => { root.querySelector('#bm-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { arm: false, tune: false, live: false };
  let ai = 0, act = ACTS[0], parts = [], pops = [], heroFx = 0, shake = 0;
  let m = null, tk = null;                 // match / track 상태
  let ledOn = false, ledPhase = 0, beepPhase = 0;
  const state = { phase: 'prep', countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, ended: false };
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { ai = 0; nextAct(); }
  function nextAct() { if (ai >= ACTS.length) { finishAll(); return; } act = ACTS[ai]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; fader.hidden = true;
    const el = panel(`<div class="lp-no">${act.no} / ${ACTS.length} 막</div><h2>${act.icon} ${act.name}</h2>
      <p class="prep-sub">${act.story}</p>
      <p class="lp-cond">⭐ <b>80%↑</b> 해체하면 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); fader.hidden = false; parts = []; pops = []; heroFx = 0; shake = 0; ledOn = false; ledPhase = 0;
    Object.assign(state, { phase: 'count', countT: performance.now(), score: 0, combo: 0, maxCombo: 0, hits: 0, ended: false });
    if (act.mode === 'match') {
      m = { idx: 0, center: 0.5, half: act.half0, holdT: 0, roundStart: 0 };
      nextRound(true); state.total = act.rounds; elHlbl.textContent = '✂️ 해체';
    } else {
      tk = { t: 0, checkIdx: 0, nextCheck: act.dur / act.checks, inT: 0 };
      state.total = act.checks; elHlbl.textContent = '🧨 안정';
    }
    elTot.textContent = state.total; elAct.textContent = `${act.no}막 · ${act.name}`;
    hud.hidden = false; sync();
  }
  function nextRound(first) {
    const i = first ? 0 : m.idx + 1; m.idx = i;
    if (i >= act.rounds) { endPlay(); return; }
    let c; do { c = 0.12 + Math.random() * 0.76; } while (Math.abs(c - m.center) < 0.24);
    m.center = c; m.half = lerp(act.half0, act.half1, i / (act.rounds - 1)); m.holdT = 0; m.roundStart = performance.now();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); fader.hidden = true; ledOff(); const acc = Math.round((state.hits / state.total) * 100); const last = ai === ACTS.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '해체 성공! 🎉' : '실패…'}</h2>
      <p class="prep-sub">${act.name} · ${state.hits}/${state.total} (${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '폭탄 완전 해체! 메달을 받자 🏅' : '다음 단계로 ▶') : '80% 이상 해체해야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 단계 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[act.key] = true; ai++; nextAct(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.arm && cleared.tune && cleared.live) {
      if (onComplete) { onComplete(); return; }
      progress.mark('bomb'); celebrateRoom({ title: '해체 스타! 💣', message: '다이얼을 정밀하게 돌려 세 단계의 폭탄을 모두 해체했어요 — 💣 해체 스타 획득! 가변저항(입력)으로 LED(출력)를 자유자재로 제어했어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[act.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); ledOff(); ai++; nextAct(); };

  function sync() { elHit.textContent = state.hits; elCombo.textContent = state.combo; elScore.textContent = state.score; }
  function burst(x, y, color) { for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 4.5; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 38, color }); } }
  function pop(text, color, y) { pops.push({ text, color, y: y || H * 0.5, life: 48 }); }
  function endPlay() { if (state.ended) return; state.ended = true; state.phase = 'result'; ledOff(); const acc = state.hits / state.total; showResult(gradeOf(acc), acc >= PASS_ACC); }

  // ── 목표 곡선(3막 추적) ──
  function trackTarget(t) { const s = t / 1000; const ramp = clamp(t / act.dur, 0, 1); return clamp(0.5 + (0.30 + 0.06 * ramp) * Math.sin(s * (1.0 + ramp * 0.7)) + 0.1 * Math.sin(s * 2.1 + 0.8), 0.07, 0.93); }

  // ── 업데이트 ──
  function update(dt) {
    knob = lerp(knob, target01(), 0.3);
    const ms = dt * 16.67;
    // LED 깜빡임: 정답 근접도(dist)로 주기 결정 → 가까울수록 빠르게, 존 안이면 상시 ON
    let dist = 1, inZone = false;
    if (state.phase === 'play' && !state.ended) {
      if (act.mode === 'match') { dist = Math.abs(knob - m.center); inZone = dist <= m.half; }
      else { const tgt = trackTarget(tk.t), tol = lerp(act.tol0, act.tol1, clamp(tk.t / act.dur, 0, 1)); dist = Math.abs(knob - tgt); inZone = dist <= tol; }
    }
    if (state.phase === 'play' && !state.ended) {
      if (inZone) { ledOn = true; }
      else { const per = lerp(90, 720, clamp(dist / 0.42, 0, 1)); ledPhase += ms; if (ledPhase >= per) { ledPhase = 0; ledOn = !ledOn; if (ledOn) { beepPhase = 1; sfx.note(inZone ? 880 : lerp(330, 760, 1 - clamp(dist / 0.42, 0, 1)), 60); } } }
      sendLed(ledOn);
    } else { ledOn = false; }
    beepPhase = Math.max(0, beepPhase - ms * 0.006);

    if (state.phase !== 'play' || state.ended) { heroFx = Math.max(0, heroFx - ms * 0.0016); shake = Math.max(0, shake - ms * 0.004); return; }
    if (act.mode === 'match') {
      if (inZone) m.holdT += ms; else m.holdT = Math.max(0, m.holdT - ms * 0.85);
      if (m.holdT >= act.holdNeed) {
        state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo);
        state.score += 100 + state.combo * 8; sfx.ok(); heroFx = 1; ledOn = true; sendLed(true);
        burst(W * 0.42, H * 0.5, '120,230,140'); pop('해체! ✂️', '#7bf0a0'); sync(); nextRound(false);
      } else if (performance.now() - m.roundStart > act.roundLimit) {
        state.combo = 0; sfx.no(); shake = 1; pop('너무 느려요!', '#ff9a9a'); sync(); nextRound(false);
      }
    } else {
      tk.t += ms;
      const tgt = trackTarget(tk.t), tol = lerp(act.tol0, act.tol1, clamp(tk.t / act.dur, 0, 1));
      const within = Math.abs(knob - tgt) <= tol;
      if (within) { tk.inT += ms; state.score += Math.round(dt * 2); }
      if (tk.t >= tk.nextCheck && tk.checkIdx < act.checks) {
        tk.checkIdx++; tk.nextCheck = (tk.checkIdx + 1) * (act.dur / act.checks);
        if (within) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 60 + state.combo * 6; sfx.ok(); heroFx = 1; burst(W * 0.42, H * 0.5, '255,210,90'); pop('안정!', '#ffd24a'); }
        else { state.combo = 0; sfx.no(); shake = 0.7; }
        sync();
      }
      if (tk.t >= act.dur && tk.checkIdx >= act.checks) endPlay();
    }
    heroFx = Math.max(0, heroFx - ms * 0.0016); shake = Math.max(0, shake - ms * 0.004);
  }

  // 다이얼 게이지 위치(화면 좌중앙)
  const dialGeo = () => ({ x: W * 0.42, y: H * 0.5, r: Math.min(W, H) * 0.2 });

  // ── 그리기 ──
  function draw(nowAbs) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(14,6,8,0.5)'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    drawDial(nowAbs);
    drawHero(nowAbs);
    ctx.restore();

    if (state.phase === 'count') {
      const el = (nowAbs - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 90px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(n > 0 ? String(n) : '해체!', W / 2, H * 0.5);
      if (el >= 3) { state.phase = 'play'; if (act.mode === 'match') m.roundStart = performance.now(); }
    }

    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 38); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.y -= 0.7; p.life--; ctx.globalAlpha = Math.max(0, p.life / 48); ctx.fillStyle = p.color; ctx.font = '900 28px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, W / 2, p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1); }
    if (state.combo >= 2) { ctx.fillStyle = '#ffd24a'; ctx.font = '900 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🔥 ${state.combo} COMBO`, W / 2, H * 0.12); }
  }

  function drawDial(nowAbs) {
    const g = dialGeo(), { x, y, r } = g;
    // 폭탄 본체(원형 케이스)
    ctx.fillStyle = 'rgba(24,14,16,0.92)'; ctx.beginPath(); ctx.arc(x, y, r + 26, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke();
    // 게이지 트랙
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, A_START, A_START + A_SWEEP); ctx.stroke();
    // 눈금
    for (let i = 0; i <= 10; i++) { const a = angOf(i / 10); const c = Math.cos(a), s = Math.sin(a); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + c * (r - 10), y + s * (r - 10)); ctx.lineTo(x + c * (r + 10), y + s * (r + 10)); ctx.stroke(); }

    // 목표 표시
    if (act.mode === 'match' && m) {
      const blink = 0.5 + 0.5 * Math.sin(nowAbs * 0.008);
      ctx.strokeStyle = `rgba(123,240,160,${0.55 + 0.4 * blink})`; ctx.lineWidth = 16; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(x, y, r, angOf(m.center - m.half), angOf(m.center + m.half)); ctx.stroke();
      // 유지 게이지(원형)
      if (state.phase === 'play') { const pr = clamp(m.holdT / act.holdNeed, 0, 1); ctx.strokeStyle = '#7bf0a0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r + 16, A_START, A_START + A_SWEEP * pr); ctx.stroke(); }
    } else if (act.mode === 'track' && tk) {
      const tgt = trackTarget(tk.t), tol = lerp(act.tol0, act.tol1, clamp(tk.t / act.dur, 0, 1));
      ctx.strokeStyle = 'rgba(255,210,90,0.85)'; ctx.lineWidth = 16; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(x, y, r, angOf(tgt - tol), angOf(tgt + tol)); ctx.stroke();
    }

    // 바늘(현재 다이얼)
    const ka = angOf(knob);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ka) * (r - 4), y + Math.sin(ka) * (r - 4)); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();

    // 폭탄 LED(깜빡임) — 정답 근접도 표시
    const lx = x, ly = y - r - 50, on = ledOn || beepPhase > 0.05;
    ctx.save();
    if (on) { ctx.shadowColor = 'rgba(255,70,60,0.95)'; ctx.shadowBlur = 22; }   // 글로우는 원을 그리는 동안 유지
    ctx.fillStyle = on ? '#ff4030' : 'rgba(120,40,40,0.7)'; ctx.beginPath(); ctx.arc(lx, ly, 12, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, 12, 0, 6.283); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '700 12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💡 D13', lx + 46, ly);

    // 카운트다운(3막) / 라운드 표시
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (act.mode === 'track' && tk && state.phase === 'play') {
      const left = Math.max(0, Math.ceil((act.dur - tk.t) / 1000));
      ctx.fillStyle = left <= 5 ? '#ff7a7a' : '#ffd24a'; ctx.font = '900 30px "Space Grotesk", sans-serif';
      ctx.fillText('⏱ ' + left, x, y + 4);
    } else if (act.mode === 'match' && m && state.phase === 'play') {
      ctx.fillStyle = '#ffd24a'; ctx.font = '900 26px "Space Grotesk", sans-serif';
      ctx.fillText(`신관 ${m.idx + 1}/${act.rounds}`, x, y + 4);
    }
  }

  function drawHero(nowAbs) {
    if (!ready(eddieImg)) return;
    const dw = W * 0.2, dh = dw * (eddieImg.naturalHeight / eddieImg.naturalWidth);
    const cx = W * 0.74, foot = H * 0.92;
    const bob = Math.sin(nowAbs / 360) * dh * 0.02;
    const jump = Math.sin(Math.min(1, heroFx) * Math.PI) * dh * 0.1;
    const sx = 1 + heroFx * 0.05, sy = 1 - heroFx * 0.04;
    ctx.save(); ctx.translate(cx, foot - bob - jump); ctx.scale(sx, sy); ctx.drawImage(eddieImg, -dw / 2, -dh, dw, dh); ctx.restore();
  }

  let lastT = performance.now();
  function loop(now) { const dt = Math.min(40, now - lastT) / 16.67; lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopSense(); ledOff(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize); }
}
