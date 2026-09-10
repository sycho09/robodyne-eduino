// rgbGame.js — 무지개 물감놀이 (RGB LED 색 맞추기 퍼즐)
// 1단계(쉬운 색) → 2단계(어려운 색). 평균 A등급(85%) 이상 통과.
// R·G·B 슬라이더 조절 시 보드 연결 실제 RGB LED 연동.
import { sfx } from '../app/sfx.js';
import { roomCleared } from '../content/curriculum.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';
import { DEV_TOOLS } from '../app/flags.js';
import { icon } from '../app/icons.js';
import { results } from '../app/results.js';
import { gradeOf } from '../engine/utils.js';

const NEO = 6;                                               // 풀 컬러 RGB LED(WS2812) 데이터선
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
const accOf = (t, m) => { const d = Math.hypot(t[0] - m[0], t[1] - m[1], t[2] - m[2]); return Math.max(0, 1 - d / MAXD); };

export function showRgbGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade rgbgame">
      <div class="rgbg-bg" id="rg-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? icon('volume-off', 18) : icon('speaker', 18)}</button>
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
          <p class="prep-sub">풀 컬러 RGB LED를 <b>D6</b>에 연결하면 실제로 같은 색이 켜져요. (없어도 화면으로 플레이)</p>
          <div class="prep-wire"><b>🔌 결선</b> <span style="opacity:.7;font-weight:600">(부품: 풀 컬러 RGB LED 1개)</span>
            <table class="prep-table prep-wire-t"><tbody>
              <tr><td>🌈 Grove 풀 컬러 RGB LED</td><td><b>D6</b> 포트</td></tr>
            </tbody></table>
            <span class="prep-wire-note">3핀 케이블 하나를 D6 포트에 꽂기 — 신호선 1개로 R·G·B를 모두 제어해요</span>
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
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.innerHTML = m ? icon('volume-off', 18) : icon('speaker', 18); };
  root.querySelector('#rg-exit').onclick = () => { cleanup(); onExit?.(); };

  const play = root.querySelector('#rg-play'), hud = root.querySelector('#rg-hud');
  const tSw = root.querySelector('#rg-target'), mSw = root.querySelector('#rg-mine');
  const cr = root.querySelector('#rg-cr'), cg = root.querySelector('#rg-cg'), cb = root.querySelector('#rg-cb');
  const vr = root.querySelector('#rg-vr'), vg = root.querySelector('#rg-vg'), vb = root.querySelector('#rg-vb');
  const foot = root.querySelector('#rg-foot');
  const elStage = root.querySelector('#rg-stage'), elRound = root.querySelector('#rg-round'), elRtot = root.querySelector('#rg-rtot'), elAvg = root.querySelector('#rg-avg');
  const skipBtn = root.querySelector('#rg-skip');

  function sendRGB(r, g, b) { if (board.connected) board.neoFill(NEO, r, g, b).catch(() => {}); }
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
    try { await board.connect(); b.innerHTML = icon('usb', 17) + ' 연결됨 ✓'; paintMine(); }
    catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; }
  };
  board.connectAuto().catch(() => {});
  root.querySelector('#rg-start').onclick = () => { root.querySelector('#rg-prep').classList.add('hide'); skipBtn.hidden = !DEV_TOOLS; startFlow(); };

  // ── 플로우 ──
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
    const pct = Math.round(avg * 100);
    results.record('rgb', {
      accuracy: pct, grade, passed: pass, summary: stage.name,
      metrics: [
        { label: '평균 정확도', value: `${pct}%` },
        { label: '맞춘 색', value: `${accs.length}개` },
      ],
    });
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '통과! 🎉' : '조금만 더!'}</h2>
      <p class="prep-sub">${stage.name} · 평균 정확도 ${pct}%</p>
      <p class="lp-cond">${pass ? (last ? '두 단계 완성! 메달을 받자 🏅' : '다음 단계로 ▶') : '평균 A등급(85%↑)이면 메달! 다시 도전해도 되고, 다음으로 넘어가도 돼요.'}</p>
      <div class="lp-actions">
        <button class="cel-go ghost" id="lp-retry">다시 도전 ↻</button>
        <button class="cel-go" id="lp-next">${last ? (pass ? '메달 받기 🏅' : '마치기 ▶') : '다음 단계 ▶'}</button>
      </div>`);
    el.querySelector('#lp-retry').onclick = () => { el.remove(); beginPlay(); };
    el.querySelector('#lp-next').onclick = () => { el.remove(); gi++; nextStage(); };
  }
  function finishAll() {
    cleanup();
    if (roomCleared('rgb')) {
      progress.mark('rgb');
      celebrateRoom({ title: '색의 마법사! 🌈', message: '빛의 삼원색을 자유자재로 — 🌈 무지개 메달 획득! RGB로 세상의 모든 색을 만들 수 있어요.', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() });
    } else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); results.record('rgb', { accuracy: 85, grade: 'A', passed: true, summary: stage.name, metrics: [] });   // 스킵도 통과 기록을 남긴다 — 메달 조건이 results 기준이라 이게 없으면 스킵으로 메달이 안 나온다
    gi++; bgm.setDuck(1); nextStage(); };

  function cleanup() { bgm.setDuck(1); if (board.connected) sendRGB(0, 0, 0); window.removeEventListener('resize', onResize); }
  const onResize = () => {};
  window.addEventListener('resize', onResize);
}
