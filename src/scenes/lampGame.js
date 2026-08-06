// lampGame.js — 빛 마법 램프 (STAGE 3 · 응용): 조도센서(입력) + RGB LED(출력) 상호작용 · 3막 스토리.
//   손그림자(CDS) → 색조(Hue) → 화면 램프 + 실물 RGB LED 실시간 발광 → 목표 색 맞추기.
//   1막 색 깨우기(정밀 매칭) · 2막 흐르는 빛(추적) · 3막 대마법 램프(색 주문 시퀀스) → 🪔 램프 스타.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const ADC = 0, NEO = 6, HUE_MAX = 320, PASS = 0.8;   // 조도센서 A0(입력) · 네오픽셀 D6(출력)
const ACTS = [
  { key: 'wake', no: 1, mode: 'match', name: '빛 몬스터 처치', icon: '👾',
    story: '<b>어둠 몬스터</b>가 천국의 색을 훔쳐 달아나요! 몬스터의 <b>약점 색</b>을 맞춰 빛 마법으로 물리쳐요. 너무 늦으면 몬스터가 다가와요! ⚠️',
    rounds: 5, holdNeed: 800, roundLimit: 6500, tol0: 38, tol1: 18 },
  { key: 'river', no: 2, mode: 'track', name: '도망치는 무리', icon: '🌀',
    story: '색을 <b>바꾸며 도망가는</b> 몬스터 무리! 변하는 약점 색을 손그림자로 계속 맞춰 빛으로 지져요! 🌈',
    dur: 24000, checks: 18, tol0: 36, tol1: 26 },
  { key: 'grand', no: 3, mode: 'spell', name: '어둠의 보스', icon: '👹',
    story: '거대한 <b>어둠의 보스</b>가 나타났다! 보스의 <b>색 봉인</b>을 순서대로 풀어 마지막 빛 마법으로 처치하고 천국에 무지개를 되돌려요! ⏱️',
    len: 5, holdNeed: 650, tol: 22, time: 34000 },
];

const eddieImg = new Image(); eddieImg.onerror = () => { if (!eddieImg._p) { eddieImg._p = 1; eddieImg.src = '/brand/eddie/eddie-hero.webp'; } }; eddieImg.src = '/brand/eddie-mage.webp';
const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-lamp-bg.png'; } }; bgImg.src = '/brand/stage-lamp-bg.webp';
const monImg = new Image(); monImg.src = '/brand/monster-dark.webp';   // 몬스터 1장(보스는 같은 이미지를 크게)
const ready = (im) => im.complete && im.naturalWidth > 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.8 ? 'B' : a >= 0.6 ? 'C' : 'D';
function hueDiff(a, b) { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); }
function hsv2rgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60; const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c; let r, g, b;
  if (h < 1) [r, g, b] = [c, x, 0]; else if (h < 2) [r, g, b] = [x, c, 0]; else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c]; else if (h < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function showLampGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade lampgame">
      <div class="pot-stage-bg" id="lp-bg" style="position:absolute;inset:0;z-index:0;background:#150d28 center/cover no-repeat;"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="lp-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="lp-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="lp-host"></div>
      <div class="led-hud" id="lp-hud" hidden>
        <span class="lh-item" id="lp-act">1막</span>
        <span class="lh-item"><b id="lp-hlbl">✨ 깨움</b> <b id="lp-hit">0</b>/<span id="lp-tot">0</span></span>
        <span class="lh-item">🔥 콤보 <b id="lp-combo">0</b></span>
        <span class="lh-item">⭐ <b id="lp-score">0</b></span>
      </div>
      <div class="pot-fader" id="lp-fader" hidden>
        <span class="pot-fader-lbl" id="lp-faderlbl">🖐️ 손그림자(빛 가리기)</span>
        <input type="range" id="pt-range" min="0" max="1000" value="120" step="1">
        <span class="pot-fader-hint" id="lp-faderhint">드래그 / ↑ ↓ 키로 빛 조절</span>
      </div>
      <div class="led-prep" id="lp-prep">
        <div class="prep-card" style="max-width:640px;text-align:center">
          <h2>🪔 빛 마법 램프</h2>
          <p class="prep-sub">에디는 <b>빛의 마법사</b>! 어둠 몬스터가 색을 훔쳐갔어요. <b>손그림자(조도센서)</b>로 램프 색(<b>네오픽셀</b>)을 바꿔 <b>몬스터 약점 색</b>에 맞추고 빛 마법으로 처치해요! 👾🌈</p>
          <p class="prep-sub">조작: <b>아래 슬라이더</b>(또는 ↑ ↓ 키). 조도센서를 <b>A0</b>, <b>네오픽셀(WS2812)</b>의 데이터선을 <b>D6</b>에 연결하면 진짜 손그림자·실물 LED로 즐겨요.</p>
          <div class="prep-wire"><b>🔌 결선</b> <span style="opacity:.7;font-weight:600">(부품: 조도센서 1 · 네오픽셀 풀컬러 LED 1개)</span>
            <table class="prep-table prep-wire-t"><tbody>
              <tr><td>🔆 조도센서(CDS)</td><td><b>A0</b> 포트</td></tr>
              <tr><td>🌈 네오픽셀(WS2812)</td><td>DIN→<b>D6</b> · VCC→<b>5V</b> · GND→<b>GND</b></td></tr>
            </tbody></table>
            <img id="lp-wire" alt="결선 회로도" hidden style="display:block;max-width:100%;border-radius:12px;margin-top:10px" />
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="lp-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="lp-start">모험 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#lp-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const host = root.querySelector('#lp-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { snd.textContent = sfx.toggle() ? '🔇' : '🔊'; };
  root.querySelector('#lp-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHit = root.querySelector('#lp-hit'), elTot = root.querySelector('#lp-tot'), elCombo = root.querySelector('#lp-combo'), elScore = root.querySelector('#lp-score'), elAct = root.querySelector('#lp-act'), elHlbl = root.querySelector('#lp-hlbl');
  const hud = root.querySelector('#lp-hud'), fader = root.querySelector('#lp-fader'), faderLbl = root.querySelector('#lp-faderlbl'), faderHint = root.querySelector('#lp-faderhint'), range = root.querySelector('#pt-range'), skipBtn = root.querySelector('#lp-skip');

  let W = 0, H = 0;
  function resize() { W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600; }
  resize(); window.addEventListener('resize', resize);

  // ── 입력: 손그림자(0..1). 슬라이더/키(수동) + 실물 조도센서(A0) ──
  let manual = 0.12, sensorCover = null, cover = 0.12;
  const target01 = () => (sensorCover != null ? sensorCover : manual);
  range.addEventListener('input', () => { manual = clamp(+range.value / 1000, 0, 1); });
  const onKeyDown = (e) => {
    let d = 0;
    if (e.code === 'ArrowUp' || e.code === 'ArrowRight') d = 0.05;
    else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') d = -0.05;
    if (d) { e.preventDefault(); manual = clamp(manual + d, 0, 1); range.value = Math.round(manual * 1000); }
  };
  window.addEventListener('keydown', onKeyDown);

  // 실물 조도센서 폴링(가릴수록 cover↑) + RGB 출력
  let senseTimer = null, baseline = 800;
  function startSense() {
    stopSense(); if (!board.connected) { sensorCover = null; return; }
    board.analogRead(ADC).then((v) => { if (v != null) baseline = Math.max(400, v); }).catch(() => {});
    senseTimer = setInterval(async () => {
      const v = await board.analogRead(ADC); if (v == null) return;
      baseline = Math.max(baseline * 0.99, v);
      sensorCover = clamp(1 - v / baseline, 0, 1);
      range.value = Math.round(sensorCover * 1000); range.disabled = true; range.style.opacity = '.45';
      faderLbl.textContent = '🖐️ 실물 손그림자 ✓'; faderHint.textContent = '센서 위에서 손을 움직여요';
    }, 110);
  }
  function stopSense() { if (senseTimer) { clearInterval(senseTimer); senseTimer = null; } }
  let rgbTimer = null, lastSent = '';
  // 네오픽셀(D6) 출력: 현재 색을 전체 픽셀에 채워 반영. 같은 색이면 전송 생략(시리얼 절약)
  function startNeo() { stopNeo(); rgbTimer = setInterval(() => { if (!board.connected) return; const c = `${curRGB[0]},${curRGB[1]},${curRGB[2]}`; if (c === lastSent) return; lastSent = c; board.neoFill(NEO, curRGB[0], curRGB[1], curRGB[2]).catch(() => {}); }, 120); }
  function stopNeo() { if (rgbTimer) { clearInterval(rgbTimer); rgbTimer = null; } if (board.connected) { board.neoFill(NEO, 0, 0, 0).catch(() => {}); } lastSent = ''; }
  root.querySelector('#lp-connect').onclick = async () => { const b = root.querySelector('#lp-connect'); try { await board.connect(); b.textContent = board.fwOutdated ? `⚠ 펌웨어 v${board.version}→업데이트 필요` : '🔌 연결됨 ✓'; startSense(); startNeo(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => { startSense(); startNeo(); }).catch(() => {});
  root.querySelector('#lp-start').onclick = () => { root.querySelector('#lp-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };
  // 결선 회로도 이미지(있으면 표시)
  const wireProbe = new Image(); wireProbe.onload = () => { const el = root.querySelector('#lp-wire'); if (el) { el.src = wireProbe.src; el.hidden = false; } }; wireProbe.src = '/brand/wiring-lamp.webp';

  // ── 플로우 ──
  const cleared = { wake: false, river: false, grand: false };
  let ai = 0, act = ACTS[0], parts = [], pops = [], curRGB = [0, 0, 0], curHue = 0, fx = 0, matching = false, motes = [], flash = 0, hintT = 0, hintTarget = null;
  let m = null, tk = null, sp = null;
  const state = { phase: 'prep', countT: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, total: 0, ended: false };
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { ai = 0; nextAct(); }
  function nextAct() { if (ai >= ACTS.length) { finishAll(); return; } act = ACTS[ai]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; fader.hidden = true;
    const el = panel(`<div class="lp-no">${act.no}막 / ${ACTS.length}</div><h2>${act.icon} ${act.name}</h2>
      <p class="prep-sub">${act.story}</p>
      <p class="lp-cond">⭐ <b>80%↑</b> 성공하면 다음으로!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function randHue(prev) { let h; do { h = Math.random() * HUE_MAX; } while (prev != null && hueDiff(h, prev) < 70); return h; }
  function beginPlay() {
    bgm.setDuck(0); fader.hidden = false; parts = []; pops = []; fx = 0;
    Object.assign(state, { phase: 'count', countT: performance.now(), score: 0, combo: 0, maxCombo: 0, hits: 0, ended: false });
    if (act.mode === 'match') { m = { idx: 0, target: randHue(null), holdT: 0, roundStart: 0 }; nextRound(true); state.total = act.rounds; elHlbl.textContent = '👾 처치'; }
    else if (act.mode === 'track') { tk = { t: 0, checkIdx: 0, nextCheck: act.dur / act.checks, inT: 0 }; state.total = act.checks; elHlbl.textContent = '🌀 적중'; }
    else { sp = { seq: Array.from({ length: act.len }, (_, i) => randHue(i ? null : 30 + Math.random() * 40)), idx: 0, holdT: 0, t: 0 }; state.total = act.len; elHlbl.textContent = '👹 봉인'; }
    elTot.textContent = state.total; elAct.textContent = `${act.no}막 · ${act.name}`;
    hud.hidden = false; sync();
  }
  function nextRound(first) {
    const i = first ? 0 : m.idx + 1; m.idx = i;
    if (i >= act.rounds) { endPlay(); return; }
    m.target = randHue(m.target); m.holdT = 0; m.roundStart = performance.now();
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); fader.hidden = true; const acc = Math.round((state.hits / state.total) * 100); const last = ai === ACTS.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '주문 성공! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${act.name} · ${state.hits}/${state.total} (${acc}%) · 최고 콤보 ${state.maxCombo}</p>
      <p class="lp-cond">${pass ? (last ? '천국에 무지개가 돌아왔어요! 메달을 받자 🏅' : '다음 막으로 ▶') : '80% 이상 성공해야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 막 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[act.key] = true; ai++; nextAct(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.wake && cleared.river && cleared.grand) { progress.mark('lamp'); celebrateRoom({ title: '빛의 마법사! 🪔', message: '손그림자로 빛을 다뤄 잃어버린 색을 모두 되살렸어요 — 🪔 램프 스타 획득! 조도센서(입력)와 RGB(출력)를 자유자재로 다뤘어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() }); }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[act.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); ai++; nextAct(); };

  function sync() { elHit.textContent = state.hits; elCombo.textContent = state.combo; elScore.textContent = state.score; }
  function burst(x, y, rgb, n = 16) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 4.5; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 40, rgb }); } }
  function pop(text, color, y) { pops.push({ text, color, y: y || H * 0.42, life: 46 }); }
  function endPlay() { if (state.ended) return; state.ended = true; state.phase = 'result'; const acc = state.hits / state.total; showResult(gradeOf(acc), acc >= PASS); }

  function trackTarget(t) { const ramp = clamp(t / act.dur, 0, 1); return (40 + t / 1000 * (24 + ramp * 16) + 30 * Math.sin(t / 1400)) % HUE_MAX; }

  // ── 업데이트 ──
  function update(dt) {
    cover = lerp(cover, target01(), 0.3);
    curHue = cover * HUE_MAX;
    curRGB = hsv2rgb(curHue, 0.95, 1);
    matching = false;
    if (state.phase !== 'play' || state.ended) return;
    const ms = dt * 16.67;
    if (act.mode === 'match') {
      const tol = lerp(act.tol0, act.tol1, act.rounds > 1 ? m.idx / (act.rounds - 1) : 0);
      const inZone = hueDiff(curHue, m.target) <= tol; matching = inZone;
      if (inZone) m.holdT += ms; else m.holdT = Math.max(0, m.holdT - ms * 0.85);
      if (m.holdT >= act.holdNeed) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 120 + state.combo * 10; sfx.ok(); fx = 1; flash = 0.5; burst(W * 0.5, H * 0.46, hsv2rgb(m.target, 1, 1)); pop('색 깨움! ✨', '#fff'); sync(); nextRound(false); }
      else if (performance.now() - m.roundStart > act.roundLimit) { state.combo = 0; sfx.no(); pop('너무 느려요!', '#ff9a9a'); sync(); nextRound(false); }
    } else if (act.mode === 'track') {
      tk.t += ms; const tgt = trackTarget(tk.t), tol = lerp(act.tol0, act.tol1, clamp(tk.t / act.dur, 0, 1));
      const inZone = hueDiff(curHue, tgt) <= tol; matching = inZone; if (inZone) { tk.inT += ms; state.score += Math.round(dt * 2); }
      if (tk.t >= tk.nextCheck && tk.checkIdx < act.checks) {
        tk.checkIdx++; tk.nextCheck = (tk.checkIdx + 1) * (act.dur / act.checks);
        if (inZone) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 70 + state.combo * 6; sfx.ok(); fx = 1; flash = 0.5; burst(W * 0.5, H * 0.46, hsv2rgb(tgt, 1, 1)); pop('GOOD!', '#ffe28a'); } else { state.combo = 0; sfx.no(); } sync();
      }
      if (tk.t >= act.dur && tk.checkIdx >= act.checks) endPlay();
    } else { // spell
      sp.t += ms; const tgt = sp.seq[sp.idx], inZone = hueDiff(curHue, tgt) <= act.tol; matching = inZone;
      if (inZone) sp.holdT += ms; else sp.holdT = Math.max(0, sp.holdT - ms * 0.8);
      if (sp.holdT >= act.holdNeed) { state.hits++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 150 + state.combo * 12; sfx.ok(); fx = 1; flash = 0.5; burst(W * 0.5, H * 0.46, hsv2rgb(tgt, 1, 1)); pop(`주문 ${sp.idx + 1} 완성!`, '#fff'); sp.idx++; sp.holdT = 0; sync(); if (sp.idx >= act.len) endPlay(); }
      if (sp.t >= act.time) endPlay();
    }
    // 색 못 맞추고 헤매면 힌트 타이머 누적 → 일정 시간 넘으면 에디가 말풍선으로 방향 알려줌
    hintTarget = act.mode === 'match' ? (m && m.target) : act.mode === 'track' ? trackTarget(tk.t) : (sp && sp.seq[sp.idx]);
    if (matching) hintT = 0; else hintT += ms;
    fx = Math.max(0, fx - ms * 0.0016); flash = Math.max(0, flash - ms * 0.004);
  }

  const lampGeo = () => ({ x: W * 0.5, y: H * 0.46, r: Math.min(W, H) * 0.16 });

  // ── 그리기 ──
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,8,26,0.34)'; ctx.fillRect(0, 0, W, H);   // 배경(마법 무대) 살짝만 가라앉힘
    drawMotes(now); drawBeam(now);
    drawLamp(now); drawTargets(now); drawMage(now); drawHint(now);

    if (state.phase === 'count') {
      const el = (now - state.countT) / 1000, n = 3 - Math.floor(el);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '900 90px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(n > 0 ? String(n) : 'GO!', W / 2, H * 0.52);
      if (el >= 3) { state.phase = 'play'; if (act.mode === 'match') m.roundStart = performance.now(); }
    }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--; ctx.globalAlpha = Math.max(0, p.life / 40); ctx.fillStyle = `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.y -= 0.7; p.life--; ctx.globalAlpha = Math.max(0, p.life / 46); ctx.fillStyle = p.color; ctx.font = '900 26px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, W / 2, p.y); ctx.globalAlpha = 1; if (p.life <= 0) pops.splice(i, 1); }
    if (state.combo >= 2 && state.phase === 'play') { ctx.fillStyle = '#ffd24a'; ctx.font = '900 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🔥 ${state.combo} COMBO`, W / 2, H * 0.13); }
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }   // 처치 순간 번쩍
  }

  function drawLamp(now) {
    const g = lampGeo(), glow = 0.55 + 0.25 * Math.sin(now / 380) + fx * 0.4;
    // 받침
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(g.x, g.y + g.r * 1.15, g.r * 0.9, g.r * 0.24, 0, 0, 6.283); ctx.fill();
    // 외곽 글로우
    const rg = ctx.createRadialGradient(g.x, g.y, g.r * 0.2, g.x, g.y, g.r * 2.2);
    rg.addColorStop(0, `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},${0.5 * glow})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(g.x - g.r * 2.4, g.y - g.r * 2.4, g.r * 4.8, g.r * 4.8);
    // 램프 본체
    ctx.save(); ctx.shadowColor = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},0.95)`; ctx.shadowBlur = 40 * glow;
    const lg = ctx.createRadialGradient(g.x - g.r * 0.3, g.y - g.r * 0.35, g.r * 0.15, g.x, g.y, g.r);
    lg.addColorStop(0, '#fff'); lg.addColorStop(0.35, `rgb(${curRGB[0]},${curRGB[1]},${curRGB[2]})`); lg.addColorStop(1, `rgb(${Math.round(curRGB[0] * 0.6)},${Math.round(curRGB[1] * 0.6)},${Math.round(curRGB[2] * 0.6)})`);
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.283); ctx.stroke();
    // 공명 링(목표 색에 맞추는 중일 때 확장 — 역동감)
    if (matching && state.phase === 'play') {
      for (let k = 0; k < 3; k++) { const p = (now / 680 + k / 3) % 1; ctx.strokeStyle = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},${(1 - p) * 0.55})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (1 + p * 1.05), 0, 6.283); ctx.stroke(); }
    }
    // 현재 손그림자(빛 가림) 표시 — 램프 위 작은 미터
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '700 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🖐️ 빛 가림', g.x, g.y - g.r - 18);
    const bw = g.r * 1.6, bx = g.x - bw / 2, byy = g.y - g.r - 12; ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, bx, byy, bw, 8, 4); ctx.fill();
    ctx.fillStyle = `rgb(${curRGB[0]},${curRGB[1]},${curRGB[2]})`; rr(ctx, bx, byy, bw * cover, 8, 4); ctx.fill();
  }

  function orb(x, y, r, hue, label, glow) {
    const rgb = hsv2rgb(hue, 1, 1);
    ctx.save(); if (glow) { ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.95)`; ctx.shadowBlur = 22; }
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    if (label) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = '800 12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + r + 16); }
  }

  // 어둠 몬스터 — 약점 색(목표)을 코어로 글로우. 위험할수록 다가오고 붉게 떨림.
  // 이미지(monster-dark/monster-boss) 있으면 그걸 몸으로, 약점색 코어는 코드가 위에 얹는다.
  function drawMonster(x, y, r, hue, danger, now, label, boss) {
    const rgb = hsv2rgb(hue, 1, 1);
    x += danger > 0.5 ? Math.sin(now / 38) * (danger - 0.5) * 8 : 0; y += Math.sin(now / 260) * 3;
    if (danger > 0.5) { ctx.strokeStyle = `rgba(255,80,80,${(danger - 0.5) * 1.5})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 9 + Math.sin(now / 110) * 3, 0, 6.283); ctx.stroke(); }
    if (ready(monImg)) {   // 보스는 r이 커서 같은 이미지가 자동으로 더 크게 그려짐
      const iw = r * 2.7, ih = iw * (monImg.naturalHeight / monImg.naturalWidth);
      ctx.save(); ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`; ctx.shadowBlur = 18; ctx.drawImage(monImg, x - iw / 2, y - ih / 2, iw, ih); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.shadowBlur = 22; ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.92)`; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.34, 0, 6.283); ctx.fill(); ctx.restore();
    } else {
      // 캔버스 폴백(울렁이는 어둠 블롭 + 뿔 + 약점색 코어 + 눈)
      ctx.save(); ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`; ctx.shadowBlur = 22; ctx.fillStyle = '#241a36';
      ctx.beginPath(); for (let a = 0; a <= 6.2832; a += 0.28) { const rr2 = r * (1 + 0.09 * Math.sin(a * 3 + now / 180)); const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2 * 1.05; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#241a36';
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.7); ctx.lineTo(x - r * 0.62, y - r * 1.05); ctx.lineTo(x - r * 0.3, y - r * 0.82); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + r * 0.5, y - r * 0.7); ctx.lineTo(x + r * 0.62, y - r * 1.05); ctx.lineTo(x + r * 0.3, y - r * 0.82); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.shadowColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.shadowBlur = 16; ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.beginPath(); ctx.arc(x, y + r * 0.12, r * 0.4, 0, 6.283); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.2, 0, 6.283); ctx.arc(x + r * 0.34, y - r * 0.4, r * 0.2, 0, 6.283); ctx.fill();
      ctx.fillStyle = danger > 0.6 ? '#ff5b5b' : '#23182f'; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.36, r * 0.1, 0, 6.283); ctx.arc(x + r * 0.34, y - r * 0.36, r * 0.1, 0, 6.283); ctx.fill();
    }
    if (label) { ctx.fillStyle = danger > 0.6 ? '#ffd2d2' : 'rgba(255,255,255,0.92)'; ctx.font = '800 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + r + 22); }
  }

  function drawTargets(now) {
    if (state.phase === 'prep') return;
    const g = lampGeo();
    if (act.mode === 'match' && m) {
      const danger = clamp((performance.now() - m.roundStart) / act.roundLimit, 0, 1);
      // 위험할수록 위(0.13)에서 램프 가까이(0.30)로 다가옴 + 다가올수록 약간 커짐(압박감)
      drawMonster(W * 0.5, lerp(H * 0.13, H * 0.30, danger), 48 + danger * 10, m.target, danger, now, danger > 0.7 ? '⚠️ 다가온다!' : '약점 색 맞춰 처치!');
      if (state.phase === 'play') { const pr = clamp(m.holdT / act.holdNeed, 0, 1); const bw = 200, bx = W / 2 - bw / 2, by = g.y + g.r * 1.5; ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, bx, by, bw, 13, 6); ctx.fill(); ctx.fillStyle = '#7bf0a0'; rr(ctx, bx, by, bw * pr, 13, 6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 12px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪄 빛 마법 충전!', W / 2, by - 6); }
    } else if (act.mode === 'track' && tk) {
      drawMonster(W * 0.5, H * 0.15, 46, trackTarget(tk.t), 0.3, now, '도망치는 색!');
    } else if (act.mode === 'spell' && sp) {
      // 3막 보스 — 훨씬 크게(긴장감↑). 시전 시퀀스 오브는 더 아래로 내려 겹침 방지.
      drawMonster(W * 0.5, H * 0.17, 78, sp.seq[sp.idx], 0.5 + 0.28 * Math.sin(now / 240), now, '');
      const n = act.len, gap = 56, sx = W / 2 - (n - 1) * gap / 2, ry = H * 0.36;
      for (let i = 0; i < n; i++) { const done = i < sp.idx, cur = i === sp.idx; orb(sx + i * gap, ry, cur ? 22 : 15, sp.seq[i], done ? '✓' : (cur ? '지금!' : ''), cur); if (done) { ctx.fillStyle = '#7bf0a0'; ctx.font = '900 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', sx + i * gap, ry + 5); } }
      if (state.phase === 'play') { const left = Math.max(0, act.time - sp.t) / 1000; ctx.fillStyle = left < 8 ? '#ff7a5a' : 'rgba(255,255,255,0.85)'; ctx.font = '800 15px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`⏱ ${left.toFixed(0)}초`, W / 2, ry + 40); }
    }
  }

  // 떠다니는 마법 입자(앰비언트)
  function drawMotes(now) {
    if (motes.length < 38) motes.push({ x: Math.random() * W, y: H + 8, vy: 0.3 + Math.random() * 0.9, r: 1 + Math.random() * 2.2, h: Math.random() * 360, ph: Math.random() * 6.28 });
    for (let i = motes.length - 1; i >= 0; i--) {
      const p = motes[i]; p.y -= p.vy; p.x += Math.sin(now / 900 + p.ph) * 0.3;
      if (p.y < -12) { motes.splice(i, 1); continue; }
      const rgb = hsv2rgb(p.h, 0.5, 1);
      ctx.globalAlpha = 0.22 + 0.22 * Math.sin(now / 500 + p.ph); ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  // 캐스팅 빔(에디 손 → 램프) — 흐르는 빛 입자
  function drawBeam(now) {
    if (state.phase === 'prep') return;
    const g = lampGeo(), hx = W * 0.76, hy = H * 0.64, inten = matching ? 1 : 0.45;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},${0.22 * inten})`; ctx.lineWidth = matching ? 9 : 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + g.x) / 2, hy - 70, g.x, g.y); ctx.stroke();
    const n = matching ? 5 : 3;
    for (let i = 0; i < n; i++) { const t = (now / 800 + i / n) % 1, mx = lerp(hx, g.x, t), my = lerp(hy, g.y, t) - Math.sin(t * Math.PI) * 60; ctx.fillStyle = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},${0.85 * inten})`; ctx.beginPath(); ctx.arc(mx, my, matching ? 5 : 3.5, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  function drawMage(now) {
    if (!ready(eddieImg)) return;
    const dw = W * 0.16, dh = dw * (eddieImg.naturalHeight / eddieImg.naturalWidth);
    const cx = W * 0.82, foot = H * 0.92;
    const bob = Math.sin(now / 340) * dh * 0.03;
    const lean = -0.06 + (matching ? Math.sin(now / 110) * 0.035 : 0);     // 램프 쪽으로 기울 + 맞출 때 떨림(시전감)
    const sc = 1 + (matching ? 0.035 + 0.02 * Math.sin(now / 90) : 0);
    ctx.save();
    ctx.translate(cx, foot - bob); ctx.rotate(lean); ctx.scale(sc, sc);
    ctx.drawImage(eddieImg, -dw / 2, -dh, dw, dh);
    // 손끝 마법 글로우(현재 색)
    ctx.save(); ctx.shadowColor = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},0.95)`; ctx.shadowBlur = matching ? 30 : 14;
    ctx.fillStyle = `rgba(${curRGB[0]},${curRGB[1]},${curRGB[2]},${matching ? 0.95 : 0.65})`;
    ctx.beginPath(); ctx.arc(-dw * 0.3, -dh * 0.46, matching ? 9 : 6, 0, 6.283); ctx.fill(); ctx.restore();
    ctx.restore();
  }

  // 색을 한동안 못 맞추면 에디가 말풍선으로 방향 힌트(빛을 더 가려/덜 가려)
  function drawHint(now) {
    if (state.phase !== 'play' || hintT < 1500 || hintTarget == null) return;
    // 슬라이더/손그림자는 선형(가림↑ → hue↑)이라 목표와의 선형 차이 부호로 방향 안내
    const d = hintTarget - curHue;                        // +면 더 가려야(hue↑), -면 덜 가려야
    const near = hueDiff(curHue, hintTarget) <= 26;
    const text = near ? '✨ 거의 다 왔어! 유지해!' : d > 0 ? '🖐️ 손으로 더 가려요!' : '☀️ 손을 살짝 치워요!';
    const bx = W * 0.82, by = H * 0.50;                  // 에디 머리 위쪽
    ctx.save();
    ctx.font = '800 15px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.max(150, ctx.measureText(text).width + 34), h = 40, x = bx - w / 2, y = by - h;
    const pulse = 0.85 + 0.15 * Math.sin(now / 200);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`; rr(ctx, x, y, w, h, 14); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx - 12, y + h - 2); ctx.lineTo(bx + 2, y + h + 16); ctx.lineTo(bx + 12, y + h - 2); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = near ? '#1d9a55' : '#c4452a';
    ctx.fillText(text, bx, y + h / 2);
    ctx.restore();
  }

  let lastT = performance.now();
  function loop(now) { const dt = Math.min(40, now - lastT) / 16.67; lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopSense(); stopNeo(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize); }
}

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
