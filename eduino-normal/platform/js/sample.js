const $ = (id) => document.getElementById(id);
const FW = 32, FH = 24;
const COLORS = ['#f0473a', '#4d8dff'];
let classes = [{ name: '클래스 1', samples: [], thumbs: [] }, { name: '클래스 2', samples: [], thumbs: [] }];
let centroids = null, trained = false, guessing = false, recId = null, lastCap = 0, raf = null;
let stream = null;
const v = $('v'), pc = document.createElement('canvas'); pc.width = FW; pc.height = FH;
const pctx = pc.getContext('2d', { willReadFrequently: true });
const tc = document.createElement('canvas'); tc.width = 64; tc.height = 48;
const tctx = tc.getContext('2d');
function thumb() { tctx.save(); tctx.scale(-1, 1); tctx.drawImage(v, -64, 0, 64, 48); tctx.restore(); return tc.toDataURL('image/jpeg', 0.6); }
const MAXTHUMB = 40;

function feat() {
  pctx.drawImage(v, 0, 0, FW, FH);
  const d = pctx.getImageData(0, 0, FW, FH).data, n = FW * FH, x = new Float32Array(n);
  let m = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { x[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; m += x[j]; }
  m /= n; for (let j = 0; j < n; j++) x[j] -= m; // 평균 제거(밝기 보정)
  return x;
}
function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function meanVec(samps) { const n = samps[0].length, m = new Float32Array(n); samps.forEach(s => { for (let i = 0; i < n; i++) m[i] += s[i]; }); for (let i = 0; i < n; i++) m[i] /= samps.length; return m; }
function esc(s) { return (s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
let curveTimer = null;
function drawCurve(a) { const W = 240, H = 96, pad = 10; const pts = a.map((v, i) => { const x = pad + (a.length <= 1 ? 0 : (i / (a.length - 1)) * (W - 2 * pad)); const y = H - pad - Math.max(0, Math.min(1, v)) * (H - 2 * pad); return x.toFixed(1) + ',' + y.toFixed(1); }); $('tg-line').setAttribute('points', pts.join(' ')); }
if (typeof module !== 'undefined') { module.exports = { dist }; }

function renderCls() {
  $('cls').innerHTML = classes.map((c, i) => `
    <div class="cls-item" data-i="${i}">
      <div class="cls-head"><span class="swatch" style="background:${COLORS[i]}"></span>
        <input class="cls-name" value="${c.name.replace(/"/g, '&quot;')}" data-i="${i}">
        <span class="cls-count" data-count="${i}">${c.samples.length}장</span>
        <button class="cls-clear" data-clear="${i}" title="비우기">비우기</button></div>
      <button class="collect" data-collect="${i}">📸 데이터 수집하기</button>
      <div class="thumbs" id="thumbs-${i}">${c.thumbs.map(u => `<img src="${u}" alt="">`).join('')}</div>
    </div>`).join('');
  updateCounts();
}
function updateCounts() {
  classes.forEach((c, k) => { const el = document.querySelector(`[data-count="${k}"]`); if (el) el.textContent = c.samples.length + '장'; });
  const ready = classes[0].samples.length >= 3 && classes[1].samples.length >= 3;
  $('train').disabled = !ready;
  if (!trained) $('train-status').textContent = ready ? '준비됐어요! [학습하기]를 누르세요' : '두 가지를 각각 3장 이상 모아주세요';
}
function captureOne(i) {
  if (!stream) return; const c = classes[i]; if (c.samples.length >= 300) return;
  c.samples.push(feat());
  const url = thumb(); c.thumbs.push(url);
  const strip = document.getElementById('thumbs-' + i);
  if (strip) { const im = new Image(); im.src = url; strip.appendChild(im); while (strip.children.length > MAXTHUMB) strip.removeChild(strip.firstChild); strip.scrollTop = strip.scrollHeight; }
  if (c.thumbs.length > MAXTHUMB) c.thumbs.shift();
  updateCounts();
}
function setHoldVisual(i) {
  document.querySelectorAll('[data-collect]').forEach(b => {
    const on = +b.dataset.collect === i;
    b.classList.toggle('rec', on); b.textContent = on ? '● 수집 중… (놓으면 멈춤)' : '📸 데이터 수집하기';
    b.closest('.cls-item').classList.toggle('rec', on);
  });
  $('rec').classList.toggle('on', i != null);
  $('cam-state').textContent = i != null ? '수집 중' : (stream ? '준비됨' : '대기');
  $('cam-state').classList.toggle('on', i != null);
}
function startHold(i) { if (!stream) return; recId = i; lastCap = performance.now(); captureOne(i); setHoldVisual(i); }
function endHold() { if (recId == null) return; recId = null; setHoldVisual(null); }
$('cls').addEventListener('input', (e) => { const i = +e.target.dataset.i; if (e.target.classList.contains('cls-name')) classes[i].name = e.target.value; });
$('cls').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-collect]'); if (!b) return; e.preventDefault(); startHold(+b.dataset.collect); });
$('cls').addEventListener('click', (e) => { const b = e.target.closest('[data-clear]'); if (!b) return; const i = +b.dataset.clear; classes[i].samples = []; classes[i].thumbs = []; const s = document.getElementById('thumbs-' + i); if (s) s.innerHTML = ''; updateCounts(); });
window.addEventListener('pointerup', endHold);
window.addEventListener('pointercancel', endHold);

async function start() {
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
  v.srcObject = stream;
  await new Promise(res => { if (v.videoWidth) return res(); v.onloadedmetadata = () => res(); });
  await v.play(); $('ph').style.display = 'none';
}
function loop() {
  if (!stream) return;
  if (recId != null) { const now = performance.now(); if (now - lastCap > 90) { lastCap = now; captureOne(recId); } }
  if (guessing && trained) classify();
  raf = requestAnimationFrame(loop);
}
$('cam').onclick = async () => {
  try { $('cam').disabled = true; await start(); $('stop').disabled = false; $('cam-state').textContent = '준비됨'; $('cam-state').classList.add('on'); loop(); }
  catch (e) { $('cam').disabled = false; alert('카메라를 시작할 수 없습니다: ' + e.message); }
};
$('stop').onclick = () => {
  if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; raf = null; guessing = false; recId = null;
  $('ph').style.display = 'grid'; $('cam').disabled = false; $('stop').disabled = true;
  $('guess').textContent = '맞혀보기 시작'; setHoldVisual(null);
};
$('train').onclick = () => {
  if (!(classes[0].samples.length >= 3 && classes[1].samples.length >= 3)) return;
  centroids = classes.map(c => meanVec(c.samples));
  trained = true;
  $('bars').innerHTML = classes.map((c, i) => `<div class="bar"><div class="top"><span style="color:${COLORS[i]}">${esc(c.name)}</span><span id="pc${i}">0%</span></div><div class="track"><div class="fill" id="bf${i}" style="background:${COLORS[i]}"></div></div></div>`).join('');
  $('guess').disabled = false; $('r-name').textContent = '학습 완료!'; $('r-name').style.color = ''; $('r-sub').textContent = '③에서 [맞혀보기 시작]을 눌러보세요';
  $('train-status').textContent = '✓ 학습 완료! 우측에서 맞혀보세요';

  // 학습 곡선: 클래스별 1..k개로 중심을 만들 때의 정확도
  const minN = Math.min(classes[0].samples.length, classes[1].samples.length);
  const accs = [];
  for (let k = 1; k <= minN; k++) {
    const cen = classes.map(c => meanVec(c.samples.slice(0, k)));
    let ok = 0, tot = 0;
    classes.forEach((c, ci) => c.samples.forEach(s => { tot++; if ((dist(s, cen[0]) <= dist(s, cen[1]) ? 0 : 1) === ci) ok++; }));
    accs.push(ok / tot);
  }
  // 혼동행렬 (최종 중심, 학습 데이터 기준)
  const m = [[0, 0], [0, 0]];
  classes.forEach((c, ci) => c.samples.forEach(s => { m[ci][dist(s, centroids[0]) <= dist(s, centroids[1]) ? 0 : 1]++; }));
  $('tg-accv').textContent = Math.round((accs.length ? accs[accs.length - 1] : 0) * 100) + '%';
  $('tconf').innerHTML = '<table><caption>학습 데이터 점검 (대각선 = 정답)</caption><tr><th>실제＼예측</th><th>' + esc(classes[0].name) + '</th><th>' + esc(classes[1].name) + '</th></tr>' +
    [0, 1].map(i => '<tr><td class="rowh">' + esc(classes[i].name) + '</td>' + [0, 1].map(j => '<td class="' + (i === j ? 'diag' : '') + '">' + m[i][j] + '</td>').join('') + '</tr>').join('') + '</table>';
  $('tcurve').hidden = false;
  if (curveTimer) clearInterval(curveTimer);
  let step = 1; curveTimer = setInterval(() => { drawCurve(accs.slice(0, step)); step++; if (step > accs.length) clearInterval(curveTimer); }, 35);
};
const RDC = 201.06;
function setRDonut(frac, color) { $('r-arc').setAttribute('stroke-dasharray', (frac * RDC).toFixed(1) + ' ' + RDC); if (color) $('r-arc').style.stroke = color; $('r-pct').textContent = Math.round(frac * 100) + '%'; }
function classify() {
  const x = feat(), ds = centroids.map(c => dist(x, c));
  const inv = ds.map(d => 1 / (d + 1e-3)); const sum = inv.reduce((a, b) => a + b, 0);
  const probs = inv.map(p => p / sum);
  let top = probs[0] >= probs[1] ? 0 : 1;
  classes.forEach((c, i) => { const pct = Math.round(probs[i] * 100); const f = $('bf' + i), p = $('pc' + i); if (f) f.style.width = pct + '%'; if (p) p.textContent = pct + '%'; });
  $('r-name').textContent = classes[top].name; $('r-name').style.color = COLORS[top];
  $('r-sub').textContent = '확신도 ' + Math.round(probs[top] * 100) + '%';
  setRDonut(probs[top], COLORS[top]);
}
$('guess').onclick = () => {
  if (!trained) return; guessing = !guessing; $('guess').textContent = guessing ? '맞혀보기 중지' : '맞혀보기 시작';
  if (!guessing) { $('r-name').textContent = '일시정지'; $('r-name').style.color = ''; $('r-sub').textContent = '[맞혀보기 시작]을 누르면 다시 인식해요'; setRDonut(0, 'var(--primary)'); }
};

const FILTERS = { none: '', gray: 'grayscale(1) contrast(1.05)', invert: 'invert(1)' };
$('fx').addEventListener('click', (e) => { const f = e.target.dataset.fx; if (!f) return; v.style.filter = FILTERS[f]; $('fx').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.fx === f)); });

renderCls();
if (!window.isSecureContext) { const b = $('banner'); b.classList.add('on'); b.innerHTML = '⚠ 카메라는 <b>localhost</b> 또는 <b>https</b> 에서만 켜집니다.'; }

(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'eduino_sample_quest_v1';
  const hole = $('quest-hole'), card = $('quest-card'), modal = $('quest-modal'), replay = $('quest-replay');

  // 진행 상태는 DOM에서 읽어 앱 내부와 분리(결합도 0)
  const count = (i) => { const e = document.querySelector('[data-count="' + i + '"]'); return e ? (parseInt(e.textContent, 10) || 0) : 0; };
  const camOn = () => { const s = $('stop'); return !!s && !s.disabled; };
  const trained = () => document.querySelectorAll('#bars .bar').length > 0;
  const guessing = () => /중지/.test(($('guess') || {}).textContent || '');

  const STEPS = [
    { modal: 'intro' },
    { sel: '#cam', k: 'STEP 1 / 5', h: '카메라를 켜요', p: '오른쪽 <b>[카메라 켜기]</b>를 직접 눌러 시작해요. 켜면 다음 단계로 넘어가요.', done: camOn },
    { sel: '[data-collect="0"]', k: 'STEP 2 / 5', h: '첫 번째를 직접 가르쳐요', p: '이 버튼을 눌러(탭=1장·길게=연속) 첫 번째 대상을 <b>3장 이상</b> 찍어보세요. 예: ✋ 손바닥', goal: 3, prog: () => count(0), done: () => count(0) >= 3 },
    { sel: '[data-collect="1"]', k: 'STEP 3 / 5', h: '두 번째도 직접 가르쳐요', p: '두 번째 대상도 <b>3장 이상</b> 모아요. 둘이 서로 달라야 AI가 구분할 수 있어요. 예: ✊ 주먹', goal: 3, prog: () => count(1), done: () => count(1) >= 3 },
    { sel: '#train', k: 'STEP 4 / 5', h: 'AI를 학습시켜요', p: '<b>[학습하기]</b>를 직접 눌러보세요. AI가 두 가지의 <b>공통 특징</b>을 찾아 구분 기준을 만들어요.', done: trained },
    { sel: '#guess', k: 'STEP 5 / 5', h: '맞혀보기로 확인!', p: '<b>[맞혀보기 시작]</b>을 누르고 카메라에 비춰보세요. AI가 실시간으로 둘을 구분합니다!', done: guessing },
    { modal: 'done' },
  ];

  let cur = 0, timer = null;

  function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function hideStep() { hole.hidden = true; card.hidden = true; }

  function end(done) {
    clearTimer(); hideStep(); modal.classList.remove('on');
    if (done) localStorage.setItem(KEY, '1');
    replay.classList.add('on');
  }

  function showModal(kind) {
    hideStep(); clearTimer();
    if (kind === 'intro') {
      $('q-icon').textContent = '🤖';
      $('q-title').textContent = 'AI는 어떻게 배울까요?';
      $('q-desc').innerHTML = '사람이 <b>예시</b>를 보여주면, AI는 그 안의 <b>공통된 특징</b>을 찾아 구분하는 법을 스스로 익혀요.<br>지금 직접 가르쳐 볼까요? <b>1분</b>이면 첫 AI를 만들 수 있어요.';
      $('q-mbtns').innerHTML = '<button class="btn-go" id="q-go">가이드 시작하기 →</button><button class="btn-skip" id="q-skip2">그냥 둘러볼게요</button>';
      modal.classList.add('on');
      $('q-go').onclick = () => { modal.classList.remove('on'); go(1); };
      $('q-skip2').onclick = () => end(true);
    } else {
      $('q-icon').textContent = '🎉';
      $('q-title').textContent = '첫 AI를 직접 만들었어요!';
      $('q-desc').innerHTML = '데이터 수집 → 학습 → 추론까지, 방금 그 흐름이 바로 <b>머신러닝의 핵심</b>이에요.<br><br>이건 <b>맛보기 한 조각</b>일 뿐 — 정식 코스에선 <b>음성·동작·텍스트·실시간 추론</b>까지 직접 만들어요.';
      $('q-mbtns').innerHTML = '<button class="btn-go" id="q-more">🚀 전체 코스 보러가기</button><button class="btn-skip" id="q-close">더 체험할래요</button>';
      modal.classList.add('on');
      confetti();
      $('q-more').onclick = () => location.href = '../modules/index.html';
      $('q-close').onclick = () => end(true);
    }
  }

  function renderProg(step) {
    if (step.goal) {
      const c = Math.min(step.prog(), step.goal);
      $('q-fill').style.width = (c / step.goal * 100) + '%';
      $('q-pinfo').textContent = c + ' / ' + step.goal + '장';
    } else {
      const done = card.classList.contains('done');
      $('q-fill').style.width = done ? '100%' : '40%';
      $('q-pinfo').textContent = done ? '완료' : '직접 눌러보세요';
    }
  }
  function complete(next) {
    card.classList.add('done'); hole.classList.add('done');
    $('q-badge').textContent = '✓ 완료!'; $('q-fill').style.width = '100%'; $('q-pinfo').textContent = '완료';
    setTimeout(next, 950);
  }
  function confetti() {
    const box = $('quest-confetti'), cols = ['#f0473a', '#ff6a52', '#11a06f', '#4d8dff', '#ffb15c', '#7c6cff'];
    box.innerHTML = '';
    for (let n = 0; n < 80; n++) {
      const s = document.createElement('i');
      s.style.left = Math.random() * 100 + 'vw';
      s.style.background = cols[n % cols.length];
      s.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
      s.style.animationDelay = (Math.random() * 0.5) + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 4800);
  }

  function place(step) {
    const t = document.querySelector(step.sel);
    if (!t) return;
    const r = t.getBoundingClientRect();
    hole.style.left = (r.left - 6) + 'px'; hole.style.top = (r.top - 6) + 'px';
    hole.style.width = (r.width + 12) + 'px'; hole.style.height = (r.height + 12) + 'px';
    hole.hidden = false;
    card.hidden = false;
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + gap, left = r.left + r.width / 2 - cw / 2;
    if (top + ch > vh - 10) top = Math.max(10, r.top - ch - gap); // 아래 공간 없으면 위로
    left = Math.min(Math.max(10, left), vw - cw - 10);
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }

  function go(i) {
    cur = i; clearTimer();
    const step = STEPS[i];
    if (!step) return end(true);
    if (step.modal) return showModal(step.modal);
    card.classList.remove('done'); hole.classList.remove('done');
    $('q-k').textContent = step.k; $('q-h').textContent = step.h; $('q-p').innerHTML = step.p;
    $('q-badge').textContent = '직접 해보세요';
    renderProg(step);
    const t = document.querySelector(step.sel);
    if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => place(step), 320);
    let completing = false;
    timer = setInterval(() => {
      renderProg(step);
      if (!completing && step.done && step.done()) {
        completing = true; clearTimer();
        complete(() => go(i + 1)); // ✓ 완료를 잠깐 보여준 뒤 다음 단계
      }
    }, 300);
  }

  function start() { replay.classList.remove('on'); go(0); }

  $('q-skip').onclick = () => end(true);
  replay.onclick = start;
  addEventListener('resize', () => { if (!card.hidden) place(STEPS[cur]); });
  addEventListener('scroll', () => { if (!card.hidden) place(STEPS[cur]); }, true);

  // 첫 방문이면 자동 시작, 아니면 다시보기 버튼만
  if (!localStorage.getItem(KEY)) setTimeout(start, 600);
  else replay.classList.add('on');
})();
