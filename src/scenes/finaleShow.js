// finaleShow.js — ch4 종합(챔피언 홀): '나만의 인터랙티브 쇼'.
//   배운 4부품을 한 무대에서: 🌈 컬러(다이얼 A0→네오픽셀 D6) · 🎵 멜로디(부저 D5) · 🔘 피날레 큐(버튼 D4).
//   3막 모두 통과 → 👑 천국의 왕관(졸업). 보드 없이도 화면으로 전부 플레이 가능.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { showFinale } from './finale.js';
import { allDone } from '../content/curriculum.js';
import { board } from '../app/board.js';

const ADC = 0, NEO = 6, BUZZ = 5, BTN = 4, PASS = 0.8, HUE_MAX = 320;
const NOTES = [['도', 262], ['레', 294], ['미', 330], ['파', 349], ['솔', 392], ['라', 440], ['시', 494]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.8 ? 'B' : a >= 0.6 ? 'C' : 'D';
const hueDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
function hsv2rgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60; const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c; let r, g, b;
  if (h < 1) [r, g, b] = [c, x, 0]; else if (h < 2) [r, g, b] = [x, c, 0]; else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c]; else if (h < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function showFinaleShow(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade finaleshow">
      <div class="fs-bg" id="fs-bg"></div>
      <div class="fs-stage" id="fs-stage"></div>
      <div class="fs-scrim"></div>
      <img class="fs-eddie" id="fs-eddie" alt="" hidden />
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="fs-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="fs-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="led-hud" id="fs-hud" hidden>
        <span class="lh-item" id="fs-act">1막</span>
        <span class="lh-item"><b id="fs-hlbl">🎯</b> <b id="fs-hit">0</b>/<span id="fs-tot">0</span></span>
        <span class="lh-item">⭐ <b id="fs-score">0</b></span>
      </div>
      <div class="fs-play" id="fs-play"></div>
      <div class="led-prep" id="fs-prep">
        <div class="prep-card" style="max-width:680px;text-align:center">
          <h2>🏆 나만의 인터랙티브 쇼</h2>
          <p class="prep-sub">드디어 마지막 무대! 에디가 <b>쇼 디렉터</b>가 되어 배운 부품을 모두 사용해요 — 🌈 색을 맞추고, 🎵 멜로디를 연주하고, 🔘 피날레 큐를 외쳐 <b>완벽한 쇼</b>를 완성하면 👑 <b>천국의 왕관</b>을 얻어요!</p>
          <div class="prep-wire"><b>🔌 결선</b> <span style="opacity:.7;font-weight:600">(다 꽂으면 실물로, 없으면 화면으로)</span>
            <table class="prep-table prep-wire-t"><tbody>
              <tr><td>🎚️ 가변저항(다이얼)</td><td><b>A0</b></td></tr>
              <tr><td>🌈 네오픽셀(WS2812)</td><td>DIN→<b>D6</b> · 5V · GND</td></tr>
              <tr><td>🔊 부저</td><td><b>D5</b></td></tr>
              <tr><td>🔘 택트 버튼</td><td><b>D4</b></td></tr>
            </tbody></table>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="fs-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="fs-start">쇼 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const stage = root.querySelector('#fs-stage');
  const playEl = root.querySelector('#fs-play');
  const hud = root.querySelector('#fs-hud'), skipBtn = root.querySelector('#fs-skip');
  const elHit = root.querySelector('#fs-hit'), elTot = root.querySelector('#fs-tot'), elScore = root.querySelector('#fs-score'), elAct = root.querySelector('#fs-act'), elHlbl = root.querySelector('#fs-hlbl');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { snd.textContent = sfx.toggle() ? '🔇' : '🔊'; };
  root.querySelector('#fs-exit').onclick = () => { cleanup(); onExit?.(); };

  // 무대 배경 이미지(있으면 풀블리드) + 디렉터 에디(있으면 모서리 히어로) — 없으면 CSS 폴백
  const bgp = new Image(); bgp.onload = () => { const b = root.querySelector('#fs-bg'); if (b) { b.style.backgroundImage = `url(${bgp.src})`; b.classList.add('on'); } }; bgp.src = '/brand/stage-final-bg.webp';
  const edp = new Image(); let edStep = 0; edp.onerror = () => { if (edStep++ === 0) edp.src = '/brand/eddie/eddie-hero.webp'; }; edp.onload = () => { const e = root.querySelector('#fs-eddie'); if (e) { e.src = edp.src; e.hidden = false; } }; edp.src = '/brand/eddie-director.webp';

  // ── 공용 입력/출력 ──
  let sensorKnob = null, senseTimer = null, btnPollTimer = null;
  function startSense() { stopSense(); if (!board.connected) { sensorKnob = null; return; } senseTimer = setInterval(async () => { const v = await board.analogRead(ADC); if (v != null) sensorKnob = clamp(v / 1023, 0, 1); }, 90); }
  function stopSense() { if (senseTimer) { clearInterval(senseTimer); senseTimer = null; } }
  let lastNeo = '';
  function neo(r, g, b) { if (!board.connected) return; const k = `${r},${g},${b}`; if (k === lastNeo) return; lastNeo = k; board.neoFill(NEO, r, g, b).catch(() => {}); }
  function neoOff() { lastNeo = ''; if (board.connected) board.neoFill(NEO, 0, 0, 0).catch(() => {}); }
  function tone(freq) { sfx.note(freq, 260); if (board.connected) board.tone(BUZZ, freq, 260).catch(() => {}); }

  root.querySelector('#fs-connect').onclick = async () => { const b = root.querySelector('#fs-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startSense(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => startSense()).catch(() => {});
  root.querySelector('#fs-start').onclick = () => { root.querySelector('#fs-prep').classList.add('hide'); skipBtn.hidden = false; nextAct(0); };

  // ── 플로우 ──
  const ACTS = [
    { key: 'color', no: 1, name: '컬러 스테이지', icon: '🌈' },
    { key: 'melody', no: 2, name: '멜로디 무대', icon: '🎵' },
    { key: 'finale', no: 3, name: '피날레 큐', icon: '🔘' },
  ];
  const cleared = { color: false, melody: false, finale: false };
  let ai = 0, raf = 0, actCleanup = null;
  const state = { score: 0 };

  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function stopRaf() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function stopActCleanup() { if (actCleanup) { try { actCleanup(); } catch (_) {} actCleanup = null; } stopRaf(); if (btnPollTimer) { clearInterval(btnPollTimer); btnPollTimer = null; } }

  function nextAct(i) {
    stopActCleanup(); playEl.innerHTML = ''; ai = i;
    if (i >= ACTS.length) { finishAll(); return; }
    const a = ACTS[i]; bgm.setDuck(1); hud.hidden = true;
    const tip = a.key === 'color' ? '다이얼을 돌려 <b>목표 무대색</b>에 맞추고 잠깐 유지! 🌈'
      : a.key === 'melody' ? '에디가 들려준 <b>멜로디를 똑같이</b> 음표 패드로 연주! 🎵'
      : '큐 마커가 <b>가운데 존</b>에 올 때 버튼(또는 SPACE)을 눌러! 🔘';
    const el = panel(`<div class="lp-no">${a.no} / ${ACTS.length} 막</div><h2>${a.icon} ${a.name}</h2>
      <p class="prep-sub">${tip}</p><p class="lp-cond">⭐ <b>80%↑</b> 성공하면 통과!</p>
      <button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); bgm.setDuck(0); hud.hidden = false; (a.key === 'color' ? actColor : a.key === 'melody' ? actMelody : actFinale)(); };
  }
  function actDone(key, hits, total) {
    stopActCleanup(); playEl.innerHTML = ''; hud.hidden = true; bgm.setDuck(1); neoOff();
    const acc = total ? hits / total : 0, pass = acc >= PASS, grade = gradeOf(acc), last = ai === ACTS.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '멋진 무대! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${ACTS[ai].name} · ${hits}/${total} (${Math.round(acc * 100)}%)</p>
      <p class="lp-cond">${pass ? (last ? '쇼 완성! 왕관을 받자 👑' : '다음 무대로 ▶') : '80% 이상 성공해야 통과! 다시!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '왕관 받기 👑' : '다음 무대 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[key] = true; nextAct(ai + 1); } else nextAct(ai); };
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[ACTS[ai].key] = true; stopActCleanup(); neoOff(); nextAct(ai + 1); };

  function finishAll() {
    cleanup();
    if (cleared.color && cleared.melody && cleared.finale) {
      progress.mark('final');
      celebrateRoom({ title: '천국의 왕관! 👑', message: '다이얼·RGB·부저·버튼을 모두 모아 완벽한 인터랙티브 쇼를 완성했어요 — 👑 천국의 왕관 획득! 진짜 메이커가 됐어요. 🎉', exitLabel: '전시관으로 ▶', onExit: () => { if (allDone()) showFinale({ onClose: () => onExit?.() }); else onExit?.(); } });
    } else onExit?.();
  }
  function setHud(lbl, hits, total) { elHlbl.textContent = lbl; elHit.textContent = hits; elTot.textContent = total; elScore.textContent = state.score; elAct.textContent = `${ACTS[ai].no}막 · ${ACTS[ai].name}`; }
  function bumpScore(n) { state.score += n; elScore.textContent = state.score; }

  // ── 슬라이더/키 입력(다이얼) ──
  let manual = 0.5;
  const knobTarget = () => (sensorKnob != null ? sensorKnob : manual);

  // ════════ 1막 — 컬러 스테이지(다이얼 → 색, 유지) ════════
  function actColor() {
    const ROUNDS = 5, HOLD = 750, LIMIT = 7000, TOL = 26;
    let idx = 0, hits = 0, hold = 0, roundStart = 0, knob = manual, target = 40;
    playEl.innerHTML = `
      <div class="fs-color">
        <div class="fs-sw-row">
          <div class="fs-sw"><span>목표</span><div class="fs-sw-box" id="fs-tgt"></div></div>
          <div class="fs-sw"><span>지금</span><div class="fs-sw-box" id="fs-cur"></div></div>
        </div>
        <div class="fs-hold"><i id="fs-holdfill"></i></div>
        <div class="pot-fader" style="position:static;transform:none;margin-top:14px">
          <span class="pot-fader-lbl">🎚️ 색 다이얼</span>
          <input type="range" id="fs-range" min="0" max="1000" value="500">
          <span class="pot-fader-hint">드래그 / ← → 키 · 실물 가변저항(A0)</span>
        </div>
      </div>`;
    const tgtBox = playEl.querySelector('#fs-tgt'), curBox = playEl.querySelector('#fs-cur'), holdFill = playEl.querySelector('#fs-holdfill'), range = playEl.querySelector('#fs-range');
    range.oninput = () => { manual = clamp(+range.value / 1000, 0, 1); };
    const onKey = (e) => { let d = 0; if (e.code === 'ArrowRight' || e.code === 'ArrowUp') d = 0.04; else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') d = -0.04; if (d) { e.preventDefault(); manual = clamp(manual + d, 0, 1); range.value = Math.round(manual * 1000); } };
    window.addEventListener('keydown', onKey);
    function newRound() { let t; do { t = Math.floor(Math.random() * HUE_MAX); } while (Math.abs(t - target) < 60); target = t; hold = 0; roundStart = performance.now(); const [r, g, b] = hsv2rgb(target, 1, 1); tgtBox.style.background = `rgb(${r},${g},${b})`; }
    newRound(); setHud('🌈 무대', 0, ROUNDS);
    const t0 = performance.now(); let last = t0;
    function loop(now) {
      const ms = Math.min(40, now - last); last = now;
      if (board.connected && sensorKnob != null) { range.value = Math.round(sensorKnob * 1000); range.disabled = true; range.style.opacity = '.45'; }
      knob = lerp(knob, knobTarget(), 0.3);
      const hue = knob * HUE_MAX, [r, g, b] = hsv2rgb(hue, 1, 1);
      curBox.style.background = `rgb(${r},${g},${b})`; stage.style.background = `radial-gradient(circle at 50% 40%, rgba(${r},${g},${b},.5), rgba(10,7,18,0) 72%)`; neo(r, g, b);
      const near = hueDiff(hue, target) <= TOL;
      if (near) hold += ms; else hold = Math.max(0, hold - ms * 0.8);
      holdFill.style.width = clamp(hold / HOLD * 100, 0, 100) + '%';
      if (hold >= HOLD) { hits++; bumpScore(120); sfx.ok(); setHud('🌈 무대', hits, ROUNDS); idx++; if (idx >= ROUNDS) { stage.style.background = ''; actDone('color', hits, ROUNDS); return; } newRound(); }
      else if (now - roundStart > LIMIT) { sfx.no(); idx++; if (idx >= ROUNDS) { stage.style.background = ''; actDone('color', hits, ROUNDS); return; } newRound(); }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    actCleanup = () => { window.removeEventListener('keydown', onKey); stage.style.background = ''; };
  }

  // ════════ 2막 — 멜로디 무대(부저, Simon 따라치기) ════════
  function actMelody() {
    const TARGET = 5, LIVES = 2;        // 길이 5 도달 = 성공, 실수 2회 허용
    let seq = [], inIdx = 0, lives = LIVES, phase = 'show', best = 0;
    playEl.innerHTML = `
      <div class="fs-melody">
        <div class="fs-mel-info" id="fs-mel-info">잘 들어봐… 🎧</div>
        <div class="kb-keys sq fs-pads" id="fs-pads">${NOTES.map((n, i) => `<button class="kb-key" data-i="${i}"><b>${n[0]}</b><span>${n[1]}Hz</span></button>`).join('')}</div>
      </div>`;
    const info = playEl.querySelector('#fs-mel-info'), pads = [...playEl.querySelectorAll('.kb-key')];
    const flash = (i) => { const p = pads[i]; if (!p) return; p.classList.add('hit'); setTimeout(() => p.classList.remove('hit'), 230); };
    setHud('🎵 길이', 0, TARGET);
    let timers = [];
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function playback() {
      phase = 'show'; info.textContent = `잘 들어봐… (길이 ${seq.length}) 🎧`; pads.forEach((p) => p.classList.add('locked'));
      seq.forEach((n, k) => { timers.push(setTimeout(() => { flash(n); tone(NOTES[n][1]); }, 600 + k * 620)); });
      timers.push(setTimeout(() => { phase = 'input'; inIdx = 0; info.textContent = '이제 따라 쳐봐! 🎹'; pads.forEach((p) => p.classList.remove('locked')); }, 600 + seq.length * 620 + 150));
    }
    function grow() { seq.push(Math.floor(Math.random() * NOTES.length)); best = Math.max(best, seq.length - 1); setHud('🎵 길이', Math.max(0, seq.length - 1), TARGET); playback(); }
    function fail() { lives--; if (lives < 0) { actDone('melody', best, TARGET); return; } info.textContent = `앗! 다시 들어봐 (남은 기회 ${lives + 1}) 💪`; clearTimers(); timers.push(setTimeout(playback, 800)); }
    pads.forEach((p) => p.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (phase !== 'input') return;
      const i = +p.dataset.i; flash(i); tone(NOTES[i][1]);
      if (i === seq[inIdx]) { inIdx++; if (inIdx >= seq.length) { bumpScore(80 * seq.length); sfx.ok(); best = Math.max(best, seq.length); setHud('🎵 길이', best, TARGET); if (seq.length >= TARGET) { actDone('melody', best, TARGET); return; } phase = 'show'; info.textContent = '좋아! 다음 🎶'; clearTimers(); timers.push(setTimeout(grow, 700)); } }
      else { sfx.no(); fail(); }
    }));
    timers.push(setTimeout(grow, 500));
    actCleanup = () => { clearTimers(); };
  }

  // ════════ 3막 — 피날레 큐(버튼/타이밍) ════════
  function actFinale() {
    const CUES = 8, SPEED = 1 / 1500, LOW = 0.78, HIGH = 0.96;   // 마커 0→1, 0.78~0.96 존
    let idx = 0, hits = 0, pos = 0, judged = false, lastEdge = 1;
    playEl.innerHTML = `
      <div class="fs-finale">
        <div class="fs-track"><div class="fs-zone"></div><div class="fs-marker" id="fs-marker"></div></div>
        <div class="fs-cue" id="fs-cue">큐 마커가 빛나는 존에 올 때 눌러!</div>
        <button class="cel-go fs-btn" id="fs-btn">🔘 큐! (버튼 / SPACE)</button>
      </div>`;
    const marker = playEl.querySelector('#fs-marker'), cueEl = playEl.querySelector('#fs-cue'), hitBtn = playEl.querySelector('#fs-btn');
    setHud('🔘 큐', 0, CUES);
    function next() { idx++; if (idx >= CUES) { actDone('finale', hits, CUES); return false; } pos = 0; judged = false; return true; }
    function press() {
      if (judged) return; judged = true;
      const ok = pos >= LOW && pos <= HIGH;
      if (ok) { hits++; bumpScore(110); sfx.ok(); cueEl.textContent = 'PERFECT! ✨'; }
      else { sfx.no(); cueEl.textContent = pos < LOW ? '너무 빨라요! ⏪' : '너무 늦었어요! ⏩'; }
      setHud('🔘 큐', hits, CUES);
      setTimeout(() => { if (next()) cueEl.textContent = '큐 마커가 빛나는 존에 올 때 눌러!'; }, 520);
    }
    const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); press(); } };
    window.addEventListener('keydown', onKey);
    hitBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
    // 실물 버튼(D4) 폴링 — 눌림 엣지에서 press()
    if (board.connected) btnPollTimer = setInterval(async () => { const v = await board.digitalRead(BTN); if (v == null) return; if (lastEdge === 0 && v === 1) press(); lastEdge = v; }, 55);
    let last = performance.now();
    function loop(now) {
      const ms = Math.min(40, now - last); last = now;
      if (!judged) { pos += ms * SPEED; if (pos >= 1) { judged = true; sfx.no(); cueEl.textContent = '놓쳤어요! 💨'; setHud('🔘 큐', hits, CUES); setTimeout(() => { if (next()) cueEl.textContent = '큐 마커가 빛나는 존에 올 때 눌러!'; }, 420); } }
      marker.style.left = clamp(pos, 0, 1) * 100 + '%';
      marker.classList.toggle('in', pos >= LOW && pos <= HIGH && !judged);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    actCleanup = () => { window.removeEventListener('keydown', onKey); };
  }

  function cleanup() { bgm.setDuck(1); stopActCleanup(); stopSense(); neoOff(); }
}
