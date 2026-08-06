// rgbGame.js — 무지개 물감놀이 (RGB LED · 색 맞추기 퍼즐)
// 목표 색을 보고 R·G·B 슬라이더(0~255)를 섞어 똑같이 맞춘다. 색 거리로 정확도 채점.
// 1차 쉬운 색(단순) · 2차 어려운 색(3채널 혼합). 각 단계 평균 A등급(85%↑) + 둘 다 통과해야 메달.
// 슬라이더를 움직이면 화면 미리보기 + 보드 연결 시 실제 RGB LED(PWM, R9/G10/B11)가 같은 색.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const PINS = { r: 9, g: 10, b: 11 };
const PASS_ACC = 0.85;
const MAXD = Math.sqrt(3 * 255 * 255);                       // 색 최대 거리

const STAGES = [
  { key: 'easy', no: 1, name: '쉬운 색', targets: [
    { c: [230, 35, 35], name: '빨강' }, { c: [40, 200, 90], name: '초록' }, { c: [45, 120, 235], name: '파랑' },
  ] },
  { key: 'hard', no: 2, name: '어려운 색', targets: [
    { c: [240, 150, 40], name: '주황' }, { c: [150, 80, 205], name: '보라' }, { c: [90, 200, 200], name: '청록' },
  ] },
];

const bgImg = new Image(); bgImg.src = '/brand/stage-rgb-bg.webp';
const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';
const accOf = (t, m) => { const d = Math.hypot(t[0] - m[0], t[1] - m[1], t[2] - m[2]); return Math.max(0, 1 - d / MAXD); };

export function showRgbGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade rgbgame">
      <div class="rgbg-bg" id="rg-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="rg-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="rg-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="led-hud" id="rg-hud" hidden>
        <span class="lh-item" id="rg-stage">1단계</span>
        <span class="lh-item">🎨 <b id="rg-round">1</b>/<span id="rg-rtot">3</span></span>
        <span class="lh-item">⭐ 평균 <b id="rg-avg">—</b></span>
      </div>

      <div class="led-prep" id="rg-prep">
        <div class="prep-card" style="max-width:580px;text-align:center">
          <h2>🌈 무지개 물감놀이</h2>
          <p class="prep-sub"><b>목표 색</b>을 보고 <b>R·G·B</b> 슬라이더를 섞어 똑같이 만들어봐! 빛은 섞을수록 밝아져 ✨</p>
          <p class="prep-sub">RGB LED를 <b>R→D9 · G→D10 · B→D11</b>에 연결하면 실제로 같은 색이 켜져요. (없어도 화면으로 플레이)</p>
          <div class="prep-wire"><b>🔌 결선</b>
            <table class="prep-table prep-wire-t"><tbody>
              <tr><td>🔴 빨강(R)</td><td><b>D9</b></td></tr>
              <tr><td>🟢 초록(G)</td><td><b>D10</b></td></tr>
              <tr><td>🔵 파랑(B)</td><td><b>D11</b></td></tr>
            </tbody></table>
            <span class="prep-wire-note">공통 캐소드 RGB LED · 공통 핀 → GND</span>
          </div>
          <p class="prep-sub">1차·2차 모두 <b>평균 A등급(85%↑)</b>이면 🌈 무지개 메달!</p>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="rg-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="rg-start">시작 ▶</button>
          </div>
        </div>
      </div>

      <div class="rgbg-play" id="rg-play" hidden>
        <div class="rgbg-swatches">
          <div class="rgbg-col"><span class="rgbg-lbl">🎯 목표 색</span><div class="rgbg-sw" id="rg-target"></div></div>
          <div class="rgbg-vs">→</div>
          <div class="rgbg-col"><span class="rgbg-lbl">🖌️ 내 색</span><div class="rgbg-sw" id="rg-mine"></div></div>
        </div>
        <div class="rt-sliders rgbg-sliders">
          <label class="rs r">R <input type="range" id="rg-cr" min="0" max="255" value="128"><b id="rg-vr">128</b></label>
          <label class="rs g">G <input type="range" id="rg-cg" min="0" max="255" value="128"><b id="rg-vg">128</b></label>
          <label class="rs b">B <input type="range" id="rg-cb" min="0" max="255" value="128"><b id="rg-vb">128</b></label>
        </div>
        <div class="rgbg-foot" id="rg-foot"><button class="cel-go" id="rg-submit">제출 ✓</button></div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#rg-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; bg.classList.add('has-img'); };
  if (bgImg.complete && bgImg.naturalWidth) bgImg.onload();
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#rg-exit').onclick = () => { cleanup(); onExit?.(); };

  const play = root.querySelector('#rg-play'), hud = root.querySelector('#rg-hud');
  const tSw = root.querySelector('#rg-target'), mSw = root.querySelector('#rg-mine');
  const cr = root.querySelector('#rg-cr'), cg = root.querySelector('#rg-cg'), cb = root.querySelector('#rg-cb');
  const vr = root.querySelector('#rg-vr'), vg = root.querySelector('#rg-vg'), vb = root.querySelector('#rg-vb');
  const foot = root.querySelector('#rg-foot');
  const elStage = root.querySelector('#rg-stage'), elRound = root.querySelector('#rg-round'), elRtot = root.querySelector('#rg-rtot'), elAvg = root.querySelector('#rg-avg');
  const skipBtn = root.querySelector('#rg-skip');

  function sendRGB(r, g, b) { if (board.connected) { board.pwm(PINS.r, r).catch(() => {}); board.pwm(PINS.g, g).catch(() => {}); board.pwm(PINS.b, b).catch(() => {}); } }
  function mine() { return [+cr.value, +cg.value, +cb.value]; }
  function paintMine() {
    const [r, g, b] = mine();
    mSw.style.background = `rgb(${r},${g},${b})`;
    vr.textContent = r; vg.textContent = g; vb.textContent = b;
    sendRGB(r, g, b);
  }
  [cr, cg, cb].forEach((s) => s.oninput = paintMine);

  root.querySelector('#rg-connect').onclick = async () => {
    const b = root.querySelector('#rg-connect');
    try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; paintMine(); }
    catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; }
  };
  board.connectAuto().catch(() => {});
  root.querySelector('#rg-start').onclick = () => { root.querySelector('#rg-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, stage = STAGES[0], ri = 0, accs = [];
  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextStage(); }
  function nextStage() { if (gi >= STAGES.length) { finishAll(); return; } stage = STAGES[gi]; showIntro(); }

  function showIntro() {
    bgm.setDuck(1); hud.hidden = true; play.hidden = true;
    const el = panel(`<div class="lp-no">${stage.no} / ${STAGES.length} 단계</div><h2>🌈 ${stage.name}</h2>
      <p class="prep-sub">목표 색을 보고 <b>R·G·B</b>를 섞어 맞춰봐! 색이 비슷할수록 정확도가 올라가 🎨</p>
      <p class="lp-cond">⭐ <b>평균 A등급(85%↑)</b>이면 통과!</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); ri = 0; accs = [];
    elStage.textContent = `${stage.no}단계 · ${stage.name}`; elRtot.textContent = stage.targets.length; elAvg.textContent = '—';
    hud.hidden = false; play.hidden = false; loadRound();
  }
  function loadRound() {
    const t = stage.targets[ri].c;
    tSw.style.background = `rgb(${t[0]},${t[1]},${t[2]})`;
    elRound.textContent = ri + 1;
    cr.value = 128; cg.value = 128; cb.value = 128; paintMine();
    foot.innerHTML = `<button class="cel-go" id="rg-submit">제출 ✓</button>`;
    foot.querySelector('#rg-submit').onclick = submit;
  }
  function submit() {
    const t = stage.targets[ri], acc = accOf(t.c, mine());
    accs.push(acc); const pct = Math.round(acc * 100);
    const good = acc >= PASS_ACC; good ? sfx.ok() : sfx.no();
    const avg = Math.round((accs.reduce((a, b) => a + b, 0) / accs.length) * 100);
    elAvg.textContent = avg + '%';
    const last = ri >= stage.targets.length - 1;
    foot.innerHTML = `<div class="rgbg-fb ${good ? 'ok' : 'no'}">정확도 <b>${pct}%</b> · 정답은 <b>${t.name}</b> rgb(${t.c.join(', ')}) ${good ? '🎉' : '💪'}</div>
      <button class="cel-go" id="rg-next">${last ? '결과 보기 ▶' : '다음 색 ▶'}</button>`;
    foot.querySelector('#rg-next').onclick = () => { ri++; (ri >= stage.targets.length) ? stageResult() : loadRound(); };
  }
  function stageResult() {
    bgm.setDuck(1); play.hidden = true;
    const avg = accs.reduce((a, b) => a + b, 0) / accs.length, grade = gradeOf(avg), pass = avg >= PASS_ACC, last = gi === STAGES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${stage.name} · 평균 정확도 ${Math.round(avg * 100)}%</p>
      <p class="lp-cond">${pass ? (last ? '두 단계 완성! 메달을 받자 🏅' : '다음 단계로 ▶') : '평균 A등급(85%↑)이어야 통과! 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 단계 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[stage.key] = true; gi++; nextStage(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) {
      progress.mark('rgb');
      celebrateRoom({ title: '색의 마법사! 🌈', message: '빛의 삼원색을 자유자재로 — 🌈 무지개 메달 획득! RGB로 세상의 모든 색을 만들 수 있어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[stage.key] = true; gi++; bgm.setDuck(1); nextStage(); };

  function cleanup() { bgm.setDuck(1); if (board.connected) sendRGB(0, 0, 0); window.removeEventListener('resize', onResize); }
  const onResize = () => {};
  window.addEventListener('resize', onResize);
}
