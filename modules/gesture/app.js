const $ = (id) => document.getElementById(id);
const PALETTE = ['#f0473a','#4d8dff','#11a06f','#d98a1f','#7c6cff','#ff6ab5'];
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
const DONUT_C = 251.3;
let model = null;
let playSeen = false;             // 손을 한 번이라도 인식했는지 — 실습 ① 완료 신호

function setStatus(t, c) {
  const s = $('status');
  if (s) { s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }
  document.querySelectorAll('.stage').forEach(stage => {
    if (stage.offsetParent !== null) {
      let loader = stage.querySelector('.stage-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.className = 'stage-loader';
        loader.style.cssText = 'position:absolute; inset:0; background:#0d1016; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-size:15px; font-weight:700; z-index:20;';
        stage.appendChild(loader);
      }
      if (c === 'busy') {
        loader.style.display = 'flex';
        loader.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite; margin-bottom:12px; color:var(--primary);"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>` + t;
        if (!document.getElementById('spin-anim')) {
          const style = document.createElement('style');
          style.id = 'spin-anim';
          style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
      } else {
        loader.style.display = 'none';
      }
    }
  });
}

/* ── 손 특징(손목 기준 정규화 → 42차원) ── */
function handFeature(kp) {
  const w = kp[0];
  const rel = kp.map(k => [k.x - w.x, k.y - w.y]);
  let max = 1e-6; rel.forEach(([x, y]) => { max = Math.max(max, Math.hypot(x, y)); });
  const f = []; rel.forEach(([x, y]) => { f.push(x / max, y / max); });
  return f;
}
function fingersUp(kp) {
  const d = (a, b) => Math.hypot(kp[a].x - kp[b].x, kp[a].y - kp[b].y);
  const four = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => (d(tip, 0) > d(pip, 0) ? 1 : 0));
  const thumb = d(4, 0) > d(3, 0) * 1.15 ? 1 : 0;
  return { thumb, four, count: four.reduce((a, b) => a + b, 0) + thumb };
}
function classifyRPS(kp) {
  const f = fingersUp(kp);
  const c = f.four.reduce((a, b) => a + b, 0);
  let label, icon, conf;
  if (c === 0) { label = '바위'; icon = 'fist'; conf = f.thumb ? 0.82 : 0.95; }
  else if (c >= 4) { label = '보'; icon = 'palm'; conf = 0.95; }
  else if (c === 2 && f.four[0] && f.four[1]) { label = '가위'; icon = 'victory'; conf = 0.92; }
  else { label = '???'; icon = 'hand-raised'; conf = 0.4; }
  return { label, icon, conf, fingers: f };
}

/* ── 모델(handpose: 검증된 단일 손 모델) ── */
async function loadModel() {
  if (model) return model;
  try { await tf.setBackend('webgl'); } catch (e) {}
  await tf.ready();
  model = await handpose.load();
  // 워밍업: 더미 추론 1회로 WebGL 커널 미리 컴파일 → 첫 프레임 렉 제거
  try { const c = document.createElement('canvas'); c.width = 256; c.height = 256; await model.estimateHands(c, false); } catch (e) {}
  return model;
}

function mkCam(v, c, ph) {
  return {
    stream: null, raf: null, video: v, canvas: c, ph: ph,
    async start() {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      this.video.srcObject = this.stream;
      await new Promise((res) => { if (this.video.videoWidth) return res(); this.video.onloadedmetadata = () => res(); });
      await this.video.play();
      this.syncSize(); this.ph.style.display = 'none';
    },
    syncSize() { const w = this.video.videoWidth, h = this.video.videoHeight; if (w && (this.canvas.width !== w || this.canvas.height !== h)) { this.canvas.width = w; this.canvas.height = h; } },
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = null; this.raf = null;
      const x = this.canvas.getContext('2d'); x && x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ph.style.display = 'grid';
    },
  };
}
function drawHand(ctx, kp, color) {
  ctx.lineWidth = 3; ctx.strokeStyle = color;
  CONNECTIONS.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(kp[a].x, kp[a].y); ctx.lineTo(kp[b].x, kp[b].y); ctx.stroke(); });
  kp.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#fff' : color; ctx.fill();
    if (i === 0) { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); } });
}
async function estimate(cam) {
  if (!cam.stream || !model) return null;
  cam.syncSize();
  let preds; try { preds = await model.estimateHands(cam.video, false); } catch (e) { return null; }
  const ctx = cam.canvas.getContext('2d'); ctx.clearRect(0, 0, cam.canvas.width, cam.canvas.height);
  if (!preds || !preds.length) return null;
  const lm = preds[0].landmarks;
  if (!lm || lm.length < 21) return null;
  const kp = lm.map(p => ({ x: p[0], y: p[1] }));
  if (kp.some(p => !isFinite(p.x) || !isFinite(p.y))) return null;
  return kp;
}

/* ════════ 초급 ════════ */
const play = mkCam($('v-play'), $('c-play'), $('ph-play'));
$('fingers').innerHTML = ['엄지','검지','중지','약지','소지'].map(n => `<div class="f">${n}</div>`).join('');
const fingerEls = [...$('fingers').children];
function setPlayDonut(f) { $('play-arc').setAttribute('stroke-dasharray', (f * DONUT_C).toFixed(1) + ' ' + DONUT_C); $('play-pct').textContent = Math.round(f * 100) + '%'; }

async function playLoop() {
  if (!play.stream) return;
  const kp = await estimate(play);
  if (kp) {
    drawHand(play.canvas.getContext('2d'), kp, '#f0473a');
    const r = classifyRPS(kp);
    $('rps-emoji').innerHTML = EduinoIcons.svg(r.icon);
    $('rps-name').textContent = r.label === '???' ? '인식 중…' : r.label;
    $('rps-hint').textContent = '펴진 손가락 ' + r.fingers.count + '개';
    const st = [r.fingers.thumb, ...r.fingers.four];
    fingerEls.forEach((el, i) => el.classList.toggle('up', !!st[i]));
    setPlayDonut(r.conf); $('play-conf-label').textContent = '손 인식됨';
    if (!playSeen) { playSeen = true; window.CourseDashboard && CourseDashboard.markDone('play'); }
  } else {
    $('rps-name').textContent = '손이 안 보여요'; $('rps-hint').textContent = '손을 화면 안에 비춰주세요';
    fingerEls.forEach(el => el.classList.remove('up')); setPlayDonut(0); $('play-conf-label').textContent = '대기 중';
  }
  play.raf = requestAnimationFrame(playLoop);
}
$('play-cam').onclick = async () => {
  if (play.stream) { play.stop(); $('play-cam').textContent = '카메라 켜기'; setStatus('대기 중'); return; }
  try { setStatus('모델 로딩…', 'busy'); await loadModel(); setStatus('카메라 시작…', 'busy'); await play.start();
    $('play-cam').textContent = '카메라 끄기'; setStatus('인식 중 · LIVE', 'live'); playLoop();
  } catch (e) { setStatus('카메라 오류', 'busy'); alert('카메라를 시작할 수 없습니다: ' + e.message); }
};

/* ════════ 중급 ════════ */
const train = mkCam($('v-train'), $('c-train'), $('ph-train'));
let head = null, inferring = false, classes = [], nextId = 1, recording = null, lastCollect = 0;

/* 실시간 결과 패널 */
function donutSet(arc, pctEl, frac, color) { arc.setAttribute('stroke-dasharray', (frac * DONUT_C).toFixed(1) + ' ' + DONUT_C); if (color) arc.style.stroke = color; pctEl.textContent = Math.round(frac * 100) + '%'; }
function showIdle() { donutSet($('r-arc'), $('r-pct'), 0, 'var(--primary)'); $('r-label').textContent = '대기 중'; $('r-label').style.color = ''; $('r-sub').textContent = head ? '[추론 시작]을 누르세요' : '데이터를 모아 학습해 보세요'; }
function showCollecting(c) { donutSet($('r-arc'), $('r-pct'), Math.min(1, c.samples.length / 40), c.color); $('r-label').textContent = '수집 중 · ' + c.name; $('r-label').style.color = c.color; $('r-sub').textContent = c.samples.length + '개 모음 (권장 30+)'; }
function showInfer(name, color, conf) { donutSet($('r-arc'), $('r-pct'), conf, color); $('r-label').textContent = name; $('r-label').style.color = color; $('r-sub').textContent = '확신도 ' + Math.round(conf * 100) + '%'; }

/* 학습 곡선 (SVG polyline) */
const cHist = { loss: [], acc: [] };
function resetCurve() { cHist.loss = []; cHist.acc = []; $('curve-loss').setAttribute('points', ''); $('curve-acc').setAttribute('points', ''); }
function pushCurve(total, loss, acc) {
  cHist.loss.push(loss); cHist.acc.push(acc != null ? acc : 0);
  const W = 300, H = 120, pad = 10, maxLoss = Math.max(0.001, ...cHist.loss);
  const xx = (i) => total <= 1 ? W / 2 : (pad + (i / (total - 1)) * (W - 2 * pad));
  const lp = cHist.loss.map((v, i) => xx(i).toFixed(1) + ',' + (pad + (1 - v / maxLoss) * (H - 2 * pad)).toFixed(1)).join(' ');
  const ap = cHist.acc.map((v, i) => xx(i).toFixed(1) + ',' + (pad + (1 - Math.max(0, Math.min(1, v))) * (H - 2 * pad)).toFixed(1)).join(' ');
  $('curve-loss').setAttribute('points', lp); $('curve-acc').setAttribute('points', ap);
}

/* 혼동행렬 (학습 데이터 기준) */
function buildConfusion(xs, ys, names) {
  const n = names.length;
  const pred = tf.tidy(() => head.predict(xs).argMax(1).dataSync());
  const truth = tf.tidy(() => ys.argMax(1).dataSync());
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < pred.length; i++) m[truth[i]][pred[i]]++;
  let correct = 0; for (let i = 0; i < n; i++) correct += m[i][i];
  let html = '<table><caption>혼동행렬 — 학습 데이터 기준 · 전체 정확도 ' + Math.round(correct / pred.length * 100) + '%</caption>';
  html += '<tr><th>실제 ＼ 예측</th>' + names.map(c => `<th>${c.name}</th>`).join('') + '</tr>';
  for (let i = 0; i < n; i++) html += '<tr><td class="rowh">' + names[i].name + '</td>' + m[i].map((v, j) => `<td class="${i === j ? 'diag' : (v > 0 ? 'miss' : '')}">${v}</td>`).join('') + '</tr>';
  $('conf').innerHTML = html + '</table>';
}

function addClass(name) { const color = PALETTE[classes.length % PALETTE.length]; classes.push({ id: nextId++, name: name || ('제스처 ' + classes.length), color, samples: [] }); renderClasses(); }
function renderClasses() {
  $('cls-list').innerHTML = classes.map((c) => `
    <div class="cls-item ${recording === c.id ? 'rec' : ''}" data-id="${c.id}">
      <div class="cls-head">
        <span class="swatch" style="background:${c.color}"></span>
        <input class="cls-name" value="${c.name}" data-id="${c.id}">
        <span class="cls-count" data-count="${c.id}">${c.samples.length}개</span>
        <button class="cls-del" data-del="${c.id}" title="삭제">×</button>
      </div>
      <div class="cls-actions">
        <button class="cap-btn ${recording === c.id ? 'rec' : ''}" data-collect="${c.id}" ${train.stream ? '' : 'disabled'}><span class="ci" data-ic="camera" style="color:inherit;"></span><span>촬영</span><span class="cap-count" data-capcount="${c.id}">${c.samples.length}</span></button>
        <button class="clear" data-clear="${c.id}">비우기</button>
      </div>
      <div class="samp-bar"><i data-fill="${c.id}" style="width:${Math.min(100, c.samples.length * 2.5)}%"></i></div>
    </div>`).join('');
  // 제스처를 추가·삭제하면 이 영역이 통째로 다시 그려진다. 자동 mount 는 최초 1회뿐이므로
  // 새로 만든 data-ic 를 여기서 직접 채운다(안 하면 촬영 버튼의 카메라 아이콘이 빈칸이 된다).
  EduinoIcons.mount($('cls-list'));
  updateTrainEnabled();
}
function updateCount(c) {
  const el = document.querySelector(`[data-count="${c.id}"]`); if (el) el.textContent = c.samples.length + '개';
  const cc = document.querySelector(`[data-capcount="${c.id}"]`); if (cc) cc.textContent = c.samples.length;
  const fill = document.querySelector(`[data-fill="${c.id}"]`); if (fill) fill.style.width = Math.min(100, c.samples.length * 2.5) + '%';
  updateTrainEnabled();
}
function updateTrainEnabled() {
  const ready = classes.filter(c => c.samples.length >= 8).length >= 2;
  $('btn-train').disabled = !ready;
  $('go-train').disabled = !ready;
  if (!recording) $('train-hint').textContent = ready ? '준비 완료! [학습하기 →]로 넘어가세요.' : '제스처 2종 이상 + 각 8개 이상 샘플이 필요합니다.';
}

/* ── 3단계 위저드 ── */
let step = 1;
function setStep(n) {
  if (n === step) { return; }
  // 단계를 떠날 때 정리
  if (step === 1 && recording != null) setRecording(null); // 수집 중지
  if (step === 3 && inferring) { inferring = false; $('btn-infer').textContent = '추론 시작'; }
  step = n;
  document.querySelectorAll('.wstep').forEach(el => { el.hidden = +el.dataset.w !== n; });
  document.querySelectorAll('.flow .fstep').forEach(b => {
    const w = +b.dataset.w;
    b.classList.toggle('active', w === n);
    b.classList.toggle('done', w < n);
  });
  const learnBox = document.querySelector('.camera-card .learn.fill');
  if (learnBox) learnBox.style.display = n === 1 ? '' : 'none';

  if (n === 3 && head && train.stream && !inferring) { inferring = true; $('btn-infer').textContent = '추론 중지'; setStatus('추론 중 · LIVE', 'live'); }
  else if (n === 3) showIdle();
}
document.querySelectorAll('.flow .fstep').forEach(b => { b.onclick = () => setStep(+b.dataset.w); });
$('go-train').onclick = () => setStep(2);
$('go-collect').onclick = () => setStep(1);
// id = 수집할 클래스, null = 중지. (이미지 분류처럼 버튼을 누르고 있는 동안 수집)
function setRecording(id) {
  recording = id;
  document.querySelectorAll('[data-collect]').forEach(b => {
    const on = +b.dataset.collect === recording;
    b.classList.toggle('rec', on);
    b.closest('.cls-item').classList.toggle('rec', on);
  });
  $('rec-dot').classList.toggle('on', recording != null);
  if (recording != null) { setStatus('수집 중 · REC', 'live'); $('train-hint').textContent = '꾹 누른 채 손 각도·거리를 바꿔가며 모으세요.'; const c = classes.find(x => x.id === recording); if (c) showCollecting(c); }
  else { setStatus(train.stream ? '수집 가능 · LIVE' : '대기 중', train.stream ? 'live' : ''); updateTrainEnabled(); showIdle(); }
}

$('cls-list').addEventListener('input', (e) => { const id = +e.target.dataset.id; if (!id) return; const c = classes.find(x => x.id === id); if (c) c.name = e.target.value; });
$('cls-list').addEventListener('click', (e) => {
  const del = e.target.dataset.del, clr = e.target.dataset.clear;
  if (del) { if (recording === +del) recording = null; classes = classes.filter(c => c.id !== +del); renderClasses(); }
  if (clr) { const c = classes.find(x => x.id === +clr); if (c) { c.samples = []; updateCount(c); } }
});
// 클래스별 [촬영] — 누르고 있는 동안 수집(이미지 분류와 동일), 떼면 중지
$('cls-list').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-collect]'); if (!b || b.disabled) return;
  if (!train.stream) { setStatus('먼저 카메라를 켜주세요', 'busy'); return; }
  e.preventDefault(); setRecording(+b.dataset.collect);
});
window.addEventListener('pointerup', () => { if (recording != null) setRecording(null); });
window.addEventListener('pointercancel', () => { if (recording != null) setRecording(null); });
$('add-cls').onclick = () => addClass();
$('epochs').oninput = (e) => $('epochs-val').textContent = e.target.value;

async function trainLoop() {
  if (!train.stream) return;
  const kp = await estimate(train);
  if (kp) {
    const col = recording ? (classes.find(c => c.id === recording) || {}).color || '#4d8dff' : '#4d8dff';
    drawHand(train.canvas.getContext('2d'), kp, col);
    if (recording != null) {
      const now = performance.now();
      const c = classes.find(x => x.id === recording);
      if (c && now - lastCollect > 60) { lastCollect = now; if (c.samples.length < 200) { c.samples.push(handFeature(kp)); updateCount(c); } showCollecting(c); }
    }
  }
  if (inferring && head) await runInfer(kp);
  train.raf = requestAnimationFrame(trainLoop);
}
function gestureSetCapEnabled(on) { document.querySelectorAll('#cls-list .cap-btn').forEach(b => b.disabled = !on); }
function trainCamStop() {
  recording = null; renderClasses(); $('rec-dot').classList.remove('on'); train.stop();
  inferring = false; $('btn-infer').textContent = '추론 시작';
  $('train-cam').textContent = '카메라 켜기';
  $('cam-state').textContent = '대기'; $('cam-state').classList.remove('on'); setStatus('대기 중'); showIdle();
  gestureSetCapEnabled(false);
}
$('train-cam').onclick = async () => {
  if (train.stream) { trainCamStop(); return; }
  try { setStatus('모델 로딩…', 'busy'); await loadModel(); setStatus('카메라 시작…', 'busy'); await train.start();
    $('train-cam').textContent = '카메라 끄기';
    $('cam-state').textContent = '인식 중'; $('cam-state').classList.add('on');
    gestureSetCapEnabled(true);
    if (step === 3 && head) { inferring = true; $('btn-infer').textContent = '추론 중지'; setStatus('추론 중 · LIVE', 'live'); }
    else setStatus('수집 가능 · LIVE', 'live');
    trainLoop();
  } catch (e) { setStatus('카메라 오류', 'busy'); alert('카메라를 시작할 수 없습니다: ' + e.message); }
};

$('btn-train').onclick = async () => {
  const usable = classes.filter(c => c.samples.length >= 8);
  if (usable.length < 2) return;
  recording = null; renderClasses(); $('rec-dot').classList.remove('on');
  inferring = false; $('btn-infer').textContent = '추론 시작';
  setStatus('학습 중…', 'busy'); $('btn-train').disabled = true; $('btn-infer').disabled = true;

  /* 제스처마다 일부를 학습에서 빼 둔다(홀드아웃).
     [3. 심화]의 커트라인 조절은 "처음 보는 손에서 얼마나 흔들리나"를 재는 화면인데,
     학습에 쓴 데이터로 재면 확신도가 전부 높게 나와 커트라인을 내려도 오인이 생기지 않는다.
     그러면 슬라이더가 대부분 구간에서 아무 일도 하지 않는 죽은 손잡이가 된다. */
  const HOLDOUT_RATIO = 0.25, MIN_TRAIN_PER_CLASS = 6;
  const xsArr = [], ysArr = [], holdRows = [];
  usable.forEach((c, idx) => {
    const valid = c.samples.filter(s => s.length === 42 && s.every(v => isFinite(v)));
    const pool = valid.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    /* 학습 쪽이 MIN_TRAIN_PER_CLASS 밑으로 내려가지 않는 선에서만 뗀다 */
    const nHold = Math.max(0, Math.min(Math.round(valid.length * HOLDOUT_RATIO), pool.length - MIN_TRAIN_PER_CLASS));
    pool.slice(0, nHold).forEach(s => holdRows.push({ truth: idx, feat: s }));
    pool.slice(nHold).forEach(s => { xsArr.push(s); const oh = new Array(usable.length).fill(0); oh[idx] = 1; ysArr.push(oh); });
  });
  if (xsArr.length < 8) { setStatus('샘플 부족', 'busy'); $('btn-train').disabled = false; return; }
  /* 뗀 게 너무 적으면 통계가 무의미하니 아예 넘기지 않는다 — advanced.js 가 알아서 되돌아간다. */
  window.gestureHoldout = holdRows.length >= 4 ? { names: usable.map(c => c.name), rows: holdRows } : null;
  const xs = tf.tensor2d(xsArr), ys = tf.tensor2d(ysArr);

  if (head) head.dispose();
  head = tf.sequential();
  head.add(tf.layers.dense({ inputShape: [42], units: 64, activation: 'relu' }));
  head.add(tf.layers.dropout({ rate: 0.2 }));
  head.add(tf.layers.dense({ units: usable.length, activation: 'softmax' }));
  head.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  head._classes = usable.map(c => ({ name: c.name, color: c.color }));

  const epochs = +$('epochs').value;
  resetCurve();
  await head.fit(xs, ys, { epochs, shuffle: true, batchSize: Math.min(16, xsArr.length), callbacks: { onEpochEnd: (ep, logs) => {
    $('train-fill').style.width = Math.round(((ep + 1) / epochs) * 100) + '%';
    $('m-epoch').textContent = (ep + 1) + ' / ' + epochs; $('m-loss').textContent = logs.loss.toFixed(3);
    const acc = logs.acc ?? logs.accuracy; $('m-acc').textContent = acc != null ? Math.round(acc * 100) + '%' : '—';
    pushCurve(epochs, logs.loss, acc);
  } } });
  buildConfusion(xs, ys, head._classes);
  xs.dispose(); ys.dispose();
  buildBars(head._classes);
  $('btn-train').disabled = false; $('btn-infer').disabled = false;
  $('train-hint').textContent = '학습 완료! 자동으로 ③단계로 이동합니다.';
  setStatus('학습 완료 · READY', 'ready');
  window.CourseDashboard && CourseDashboard.markDone('train');
  setStep(3); // 학습 끝나면 바로 사용해보기로
};
function buildBars(names) {
  $('bars').innerHTML = names.map((c, i) => `<div class="pbar"><div class="pb-top"><span class="pb-name" style="color:${c.color}">${c.name}</span><span class="pb-pct" id="pb-pct-${i}">0%</span></div><div class="pb-track"><div class="pb-fill" id="pb-fill-${i}" style="background:${c.color}"></div></div></div>`).join('');
}
async function runInfer(kp) {
  const names = head._classes;
  let probs = kp ? tf.tidy(() => head.predict(tf.tensor2d([handFeature(kp)])).dataSync()) : new Array(names.length).fill(0);
  let topI = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topI]) topI = i;
  names.forEach((c, i) => { const pct = Math.round((probs[i] || 0) * 100); const f = $('pb-fill-' + i), p = $('pb-pct-' + i); if (f) f.style.width = pct + '%'; if (p) p.textContent = pct + '%'; });
  if (kp) showInfer(names[topI].name, names[topI].color, probs[topI] || 0);
  else { $('r-label').textContent = '손이 안 보여요'; $('r-label').style.color = ''; $('r-sub').textContent = '손을 화면 안에 비춰주세요'; donutSet($('r-arc'), $('r-pct'), 0, 'var(--primary)'); }
}
$('btn-infer').onclick = () => { if (!head) return; inferring = !inferring; $('btn-infer').textContent = inferring ? '추론 중지' : '추론 시작'; if (!inferring) showIdle(); setStatus(inferring ? '추론 중 · LIVE' : '학습 완료 · READY', inferring ? 'live' : 'ready'); };

/* ── 단계 전환 ── */
document.querySelectorAll('.step').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.step').forEach(b => b.classList.toggle('active', b === btn));
    const s = btn.dataset.step;
    $('panel-play').style.display = s === 'play' ? 'grid' : 'none';
    $('panel-train').style.display = s === 'train' ? 'block' : 'none';
    const pd = $('panel-demo'); if (pd) pd.hidden = s !== 'demo';
    if (s === 'demo' && typeof window.gestureDemoEnter === 'function') window.gestureDemoEnter();
    if (s === 'play') { recording = null; train.stop(); inferring = false; $('rec-dot').classList.remove('on'); $('train-cam').textContent = '카메라 켜기'; $('cam-state').textContent = '대기'; $('cam-state').classList.remove('on'); gestureSetCapEnabled(false); }
    else { play.stop(); $('play-cam').textContent = '카메라 켜기'; }
    setStatus('대기 중');
  };
});

/* 심화 탭의 가위바위보 대결이 클래스 3개를 순서대로 가위·바위·보에 잇는다. */
addClass('가위'); addClass('바위'); addClass('보');
setStatus('대기 중'); showIdle();
if (!window.isSecureContext) { const b = $('banner'); b.classList.add('on'); b.innerHTML = EduinoIcons.svg('alert') + ' 카메라는 <b>localhost</b> 또는 <b>https</b> 에서만 켜집니다. 배포된 https 주소로 접속해 주세요.'; }
/* 실습 단계를 떠날 때 켜 둔 카메라를 끈다. 등록한 동작과 수집한 샘플은 건드리지 않는다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(() => {
  if (play.stream) { play.stop(); $('play-cam').textContent = '카메라 켜기'; }
  if (train.stream) trainCamStop();
  setStatus('대기 중');
});
