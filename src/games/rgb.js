// rgb.js — 색 암호등(RGB LED). 목표 색에 맞춰 R/G/B 슬라이더를 조절해 봉인 패널을 해제.
// 화면 시뮬 우선 + 보드 연결 시 3채널 PWM best-effort.
const RGB_PINS = [3, 5, 6];      // R,G,B (best-effort)
const TOL = 22;                  // 채널별 허용 오차

export function mountRgb(root, ctx) {
  const target = randColor();
  const cur = { r: 128, g: 128, b: 128 };
  let solved = false;

  root.innerHTML = `
    <div class="game rgbgame">
      <p class="game-lead">🔒 이 문은 <b>특정 색</b>에서만 열려요. 슬라이더로 색을 맞춰 봉인을 해제하세요.</p>
      <div class="rgb-panels">
        <div class="rgb-col"><div class="rgb-sw" id="rgb-target"></div><span>목표 색</span></div>
        <div class="rgb-arrow">→</div>
        <div class="rgb-col"><div class="rgb-sw" id="rgb-cur"></div><span>현재 색</span></div>
      </div>
      <div class="rgb-sliders">
        ${slider('R', 'r', cur.r, '#ff5a5a')}
        ${slider('G', 'g', cur.g, '#5ad17a')}
        ${slider('B', 'b', cur.b, '#5a9bff')}
      </div>
      <div class="rgb-status" id="rgb-status">색 차이를 줄여보세요…</div>
      <div class="game-hint">
        <button class="hint-btn" id="rgb-hint">💡 힌트(코칭) 켜기</button>
        <span class="hint-text" id="rgb-htext"></span>
      </div>
    </div>`;

  const tEl = root.querySelector('#rgb-target');
  const cEl = root.querySelector('#rgb-cur');
  const stat = root.querySelector('#rgb-status');
  const htext = root.querySelector('#rgb-htext');
  const hintBtn = root.querySelector('#rgb-hint');
  let hintOn = false;
  tEl.style.background = css(target);
  hintBtn.onclick = () => { hintOn = !hintOn; hintBtn.textContent = hintOn ? '💡 코칭 끄기' : '💡 힌트(코칭) 켜기'; onInput(); };

  const arrow = (cur, tgt) => { const d = tgt - cur; if (Math.abs(d) <= TOL) return '✅'; return d > 0 ? '↑ 더 높이기' : '↓ 더 낮추기'; };
  const inputs = [...root.querySelectorAll('input[type=range]')];
  const onInput = () => {
    for (const inp of inputs) { cur[inp.dataset.ch] = +inp.value; const v = inp.parentElement.querySelector('.rgb-val'); if (v) v.textContent = inp.value; }
    cEl.style.background = css(cur);
    if (ctx.board?.connected) { try { ctx.board.pwm(RGB_PINS[0], cur.r); ctx.board.pwm(RGB_PINS[1], cur.g); ctx.board.pwm(RGB_PINS[2], cur.b); } catch (_) {} }
    const dr = Math.abs(cur.r - target.r), dg = Math.abs(cur.g - target.g), db = Math.abs(cur.b - target.b);
    const near = dr <= TOL && dg <= TOL && db <= TOL;
    const dist = dr + dg + db;
    stat.textContent = near ? '거의 다 맞았어요! ✨' : dist < 160 ? '가까워지고 있어요…' : '색 차이를 줄여보세요…';
    stat.classList.toggle('near', near);
    htext.innerHTML = hintOn ? `🔴 ${arrow(cur.r, target.r)} · 🟢 ${arrow(cur.g, target.g)} · 🔵 ${arrow(cur.b, target.b)}` : '';
    if (near && !solved) { solved = true; win(); }
  };
  inputs.forEach((i) => i.addEventListener('input', onInput));
  cEl.style.background = css(cur);
  onInput();
  setTimeout(() => ctx.say?.('R·G·B를 섞어 목표 색을 만들면 문이 열려! 막히면 💡힌트(코칭)을 켜봐.'), 300);

  function win() {
    stat.textContent = '🔓 색 일치 — 봉인 해제!'; stat.classList.add('ok');
    inputs.forEach((i) => (i.disabled = true));
    ctx.onComplete?.();
  }
  function slider(label, ch, val, color) {
    return `<label class="rgb-slider"><span style="color:${color}">${label}</span>
      <input type="range" min="0" max="255" value="${val}" data-ch="${ch}" /><span class="rgb-val">${val}</span></label>`;
  }
  return { destroy() { inputs.forEach((i) => i.removeEventListener('input', onInput)); } };
}

const rnd = (n) => (Math.random() * n) | 0;
function randColor() { const pick = () => 40 + rnd(176); return { r: pick(), g: pick(), b: pick() }; }
const css = (c) => `rgb(${c.r|0},${c.g|0},${c.b|0})`;
