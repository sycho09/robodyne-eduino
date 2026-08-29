/* Vision 심화 미션(전이학습 4단계) 로직. MobileNet으로 특징을 추출하고 커스텀 Head 모델을 학습합니다.
   검증 데이터(Validation)로 혼동행렬을 그려 3단계 미션의 실제 평가지표(재현율/정밀도)로 연동합니다. */

const esc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const PALETTE = ['#f0473a', '#4d8dff', '#11a06f', '#d98a1f', '#7c6cff', '#ff6ab5'];
const VAL_RATIO = 0.25;      // 학습에 쓰지 않고 떼어 둘 비율
const MAX_SAMPLES = 120;     // 클래스당 상한 (임베딩 1024개 × 장수라 메모리를 먹는다)
const MIN_USABLE = 8;        // 학습에 넣을 최소 장수

const trainCam = mkCam($('v-train'), $('c-train'), $('ph-train'));
let mnet = null;             // MobileNet — 특징 추출기 (학습되지 않음)
let embDim = 0;              // infer() 가 내놓는 임베딩 차원 (v1/alpha 1.0 이면 1024)
let head = null;             // 우리가 학습시키는 작은 분류기
let classes = [], nextId = 1;
let recording = null, lastCollect = 0, lastInfer = 0, inferring = false;
let lastEval = null;         // { probs, truth, names, valCount } — ④단계가 읽는 실측 결과
let wstep = 1;

async function loadMobilenet() {
  if (mnet) return mnet;
  setStatus('MobileNet 불러오는 중…', 'busy');
  mnet = await mobilenet.load();
  return mnet;
}

/* 3단계 미션 기록용 썸네일(64px 사각형 캡처). 임베딩 숫자만으로는 원본 복원이 불가능하므로 따로 저장합니다. */
const THUMB = 64;
const thumbCv = document.createElement('canvas');
thumbCv.width = THUMB; thumbCv.height = THUMB;
function grabThumb() {
  const v = trainCam.video, W = v.videoWidth, H = v.videoHeight;
  if (!W || !H) return '';
  const side = Math.min(W, H);
  const ctx = thumbCv.getContext('2d');
  ctx.save();
  ctx.translate(THUMB, 0); ctx.scale(-1, 1);          // 화면과 같은 셀피 방향
  ctx.drawImage(v, (W - side) / 2, (H - side) / 2, side, side, 0, 0, THUMB, THUMB);
  ctx.restore();
  // 캔버스가 막힌 환경에서는 빈 값을 돌려준다 — 필름스트립이 자리표시자로 대체한다.
  try { return thumbCv.toDataURL('image/jpeg', 0.6) || ''; } catch (e) { return ''; }
}

/* 이미지를 embDim(1024) 차원 벡터로 압축(특징 추출)합니다. */
function embed(source) {
  return tf.tidy(() => {
    const t = mnet.infer(source, true);
    if (!embDim) embDim = t.shape[1];
    return Array.from(t.dataSync());
  });
}

/* ── 클래스(데이터셋) 관리 ── */
function addClass(name) {
  const color = PALETTE[classes.length % PALETTE.length];
  classes.push({ id: nextId++, name: name || '클래스 ' + (classes.length + 1), color, samples: [], thumbs: [] });
  renderClasses();
}
function renderClasses() {
  $('cls-list').innerHTML = classes.map((c) => `
    <div class="cls-item${recording === c.id ? ' rec' : ''}" data-id="${c.id}">
      <div class="cls-head">
        <span class="swatch" style="background:${c.color}"></span>
        <input class="cls-name" data-id="${c.id}" value="${esc(c.name)}" />
        <span class="cls-count" id="cnt-${c.id}">${c.samples.length}장</span>
        <button class="cls-del" data-del="${c.id}" title="클래스 삭제">×</button>
      </div>
      <div class="samp-bar"><i id="bar-${c.id}" style="width:${Math.min(100, (c.samples.length / 30) * 100)}%"></i></div>
      <div class="cls-actions">
        <button class="cap-btn" data-cap="${c.id}" ${trainCam.stream ? '' : 'disabled'}>
          <span class="ci" data-ic="camera"></span> 촬영 <span class="cap-count">${c.samples.length}</span>
        </button>
        <button class="clear" data-clr="${c.id}">비우기</button>
      </div>
    </div>`).join('');
  EduinoIcons.mount($('cls-list'));
  updateTrainEnabled();
}
function updateCount(c) {
  const n = $('cnt-' + c.id), b = $('bar-' + c.id);
  if (n) n.textContent = c.samples.length + '장';
  if (b) b.style.width = Math.min(100, (c.samples.length / 30) * 100) + '%';
  const cap = document.querySelector('.cap-btn[data-cap="' + c.id + '"] .cap-count');
  if (cap) cap.textContent = c.samples.length;
  updateTrainEnabled();
}
function updateTrainEnabled() {
  const ready = classes.filter((c) => c.samples.length >= MIN_USABLE).length >= 2;
  $('go-train').disabled = !ready;
  $('btn-train').disabled = !ready;
  $('train-hint').textContent = ready
    ? '준비 완료! [학습하기]를 누르세요. 각 클래스 30장 이상이면 더 안정적입니다.'
    : '클래스 2종 이상 + 각 ' + MIN_USABLE + '장 이상 샘플이 필요합니다.';
}

$('cls-list').addEventListener('input', (e) => {
  const id = +e.target.dataset.id;
  if (!id) return;
  const c = classes.find((x) => x.id === id);
  if (c) c.name = e.target.value;
});
$('cls-list').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]'), clr = e.target.closest('[data-clr]');
  if (del) {
    const id = +del.dataset.del;
    if (recording === id) recording = null;
    classes = classes.filter((c) => c.id !== id);
    renderClasses();
  }
  if (clr) {
    const c = classes.find((x) => x.id === +clr.dataset.clr);
    if (c) { c.samples = []; c.thumbs = []; updateCount(c); }
  }
});
/* 버튼을 꾹 누르는 동안 이미지를 연속 수집하며, DOM 클래스를 토글해 시각적 피드백을 줍니다. */
/* 한 장 수집(캡처) - 버튼 클릭 및 연속 루프에서 호출됨 */
function captureOne() {
  if (!trainCam.stream || !mnet || trainCam.video.readyState < 2) return;
  const c = classes.find((x) => x.id === recording);
  if (!c || c.samples.length >= MAX_SAMPLES) return;
  lastCollect = performance.now();
  c.samples.push(embed(trainCam.video));
  c.thumbs.push(grabThumb());
  updateCount(c);
  $('r-label').textContent = '수집 중 · ' + c.name;
  $('r-label').style.color = c.color;
  $('r-sub').textContent = c.samples.length + '장 모음 (권장 30+)';
  donutSet($('r-arc'), $('r-pct'), Math.min(1, c.samples.length / 30), c.color);
}

function startRecording(cap) {
  recording = +cap.dataset.cap;
  const item = cap.closest('.cls-item');
  if (item) item.classList.add('rec');
  $('rec-dot').classList.add('on');
  setStatus('수집 중 · REC', 'live');
  captureOne();          // 탭 한 번이면 1장 — 콘솔과 같은 동작
}
function stopRecording() {
  if (recording == null) return;
  recording = null;
  document.querySelectorAll('#cls-list .cls-item.rec').forEach((el) => el.classList.remove('rec'));
  $('rec-dot').classList.remove('on');
  setStatus(trainCam.stream ? '수집 가능 · LIVE' : '대기 중', trainCam.stream ? 'live' : '');
}
$('cls-list').addEventListener('pointerdown', (e) => {
  const cap = e.target.closest('[data-cap]');
  if (!cap || cap.disabled) return;
  e.preventDefault();          // 길게 누를 때 텍스트가 드래그 선택되는 것을 막는다
  startRecording(cap);
});
// 버튼 밖에서 손을 떼도 반드시 멈추도록 window 에서 받는다.
['pointerup', 'pointercancel'].forEach((type) => window.addEventListener(type, stopRecording));
$('cls-list').addEventListener('pointerleave', stopRecording);
$('add-cls').onclick = () => { if (classes.length < PALETTE.length) addClass(); };

/* ── 카메라 루프: 수집 + 추론 ── */
async function trainLoop() {
  if (!trainCam.stream) return;
  if (trainCam.video.readyState >= 2 && mnet) {
    const now = performance.now();
    // MobileNet 추론은 가볍지 않다. 매 프레임이 아니라 간격을 두고 뽑는다.
    if (recording != null && now - lastCollect > 120) captureOne();
    // 추론도 따로 간격을 둔다. 매 프레임 MobileNet 을 돌리면 노트북 팬이 돈다.
    if (inferring && head && now - lastInfer > 150) { lastInfer = now; await runInfer(); }
  }
  trainCam.raf = requestAnimationFrame(trainLoop);
}

function setCapEnabled(on) {
  document.querySelectorAll('#cls-list .cap-btn').forEach((b) => { b.disabled = !on; });
}
function trainCamStop() {
  recording = null; inferring = false;
  $('rec-dot').classList.remove('on');
  trainCam.stop();
  $('btn-infer').textContent = '추론 시작';
  $('train-cam').textContent = '카메라 켜기';
  $('cam-state').textContent = '대기';
  $('cam-state').classList.remove('on');
  setCapEnabled(false);
  renderClasses();
}
if (typeof window !== 'undefined') window.visionTrainStop = trainCamStop;
// 탭 3(미션)이 읽어 가는 통로 — 학습이 끝나야 값이 생긴다.
if (typeof window !== 'undefined') window.visionGetEval = () => lastEval;

$('train-cam').onclick = async () => {
  if (trainCam.stream) { trainCamStop(); setStatus('대기 중'); return; }
  try {
    await loadMobilenet();
    setStatus('카메라 시작…', 'busy');
    await trainCam.start();
    $('train-cam').textContent = '카메라 끄기';
    $('cam-state').textContent = '인식 중';
    $('cam-state').classList.add('on');
    setCapEnabled(true);
    if (wstep === 3 && head) { inferring = true; $('btn-infer').textContent = '추론 중지'; setStatus('추론 중 · LIVE', 'live'); }
    else setStatus('수집 가능 · LIVE', 'live');
    trainLoop();
  } catch (e) {
    setStatus('카메라 오류', 'busy');
    alert('카메라를 시작할 수 없습니다: ' + e.message);
  }
};

/* ── 학습 곡선 ── */
const cHist = { loss: [], acc: [] };
function resetCurve() {
  cHist.loss = []; cHist.acc = [];
  $('curve-loss').setAttribute('points', '');
  $('curve-acc').setAttribute('points', '');
}
function pushCurve(total, loss, acc) {
  cHist.loss.push(loss); cHist.acc.push(acc == null ? 0 : acc);
  const maxLoss = Math.max(1, ...cHist.loss);
  const pts = (arr, norm) => arr.map((v, i) =>
    (10 + (i / Math.max(1, total - 1)) * 280).toFixed(1) + ',' + (110 - norm(v) * 100).toFixed(1)).join(' ');
  $('curve-loss').setAttribute('points', pts(cHist.loss, (v) => v / maxLoss));
  $('curve-acc').setAttribute('points', pts(cHist.acc, (v) => v));
}
$('epochs').addEventListener('input', () => { $('epochs-val').textContent = $('epochs').value; });

/* ── 학습 ──
   학습에 쓴 데이터로 성적을 매기면 실제보다 후하게 나온다.
   클래스마다 일부를 떼어 두고(검증 세트) 그 데이터로만 ④단계 혼동행렬을 만든다. */
function splitData() {
  const usable = classes.filter((c) => c.samples.length >= MIN_USABLE);
  const trX = [], trY = [], vaX = [], vaTruth = [], vaThumb = [];
  usable.forEach((c, idx) => {
    const idc = c.samples.map((_, i) => i);
    for (let i = idc.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idc[i], idc[j]] = [idc[j], idc[i]]; }
    const nVal = Math.max(2, Math.round(c.samples.length * VAL_RATIO));
    idc.forEach((si, k) => {
      const oh = new Array(usable.length).fill(0); oh[idx] = 1;
      if (k < nVal) { vaX.push(c.samples[si]); vaTruth.push(idx); vaThumb.push((c.thumbs || [])[si] || ''); }
      else { trX.push(c.samples[si]); trY.push(oh); }
    });
  });
  return { usable, trX, trY, vaX, vaTruth, vaThumb };
}

$('btn-train').onclick = async () => {
  const { usable, trX, trY, vaX, vaTruth, vaThumb } = splitData();
  if (usable.length < 2 || trX.length < 4) { setStatus('샘플 부족', 'busy'); return; }

  recording = null; inferring = false;
  $('rec-dot').classList.remove('on');
  $('btn-infer').textContent = '추론 시작';
  setStatus('학습 중…', 'busy');
  $('btn-train').disabled = true; $('btn-infer').disabled = true;

  const xs = tf.tensor2d(trX), ys = tf.tensor2d(trY);
  if (head) head.dispose();
  head = tf.sequential();
  head.add(tf.layers.dense({ inputShape: [embDim], units: 64, activation: 'relu' }));
  head.add(tf.layers.dropout({ rate: 0.2 }));
  head.add(tf.layers.dense({ units: usable.length, activation: 'softmax' }));
  head.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  head._classes = usable.map((c) => ({ name: c.name, color: c.color }));

  const epochs = +$('epochs').value;
  resetCurve();
  await head.fit(xs, ys, {
    epochs, shuffle: true, batchSize: Math.min(16, trX.length),
    callbacks: {
      onEpochEnd: (ep, logs) => {
        $('train-fill').style.width = Math.round(((ep + 1) / epochs) * 100) + '%';
        $('m-epoch').textContent = (ep + 1) + ' / ' + epochs;
        $('m-loss').textContent = logs.loss.toFixed(3);
        const acc = logs.acc == null ? logs.accuracy : logs.acc;
        $('m-acc').textContent = acc == null ? '—' : Math.round(acc * 100) + '%';
        pushCurve(epochs, logs.loss, acc);
      }
    }
  });
  xs.dispose(); ys.dispose();

  // 검증 세트로 실제 추론 — ④단계 혼동행렬의 원본 데이터
  const vxs = tf.tensor2d(vaX);
  const vout = head.predict(vxs);
  const probs = await vout.array();
  vxs.dispose(); vout.dispose();
  lastEval = { probs, truth: vaTruth, thumbs: vaThumb, names: head._classes, valCount: vaX.length, trainCount: trX.length };

  buildBars(head._classes);
  $('btn-train').disabled = false;
  $('btn-infer').disabled = false;
  $('go-analyze').disabled = false;
  $('train-hint').textContent = '학습 완료! 자동으로 ③단계로 이동합니다.';
  setStatus('학습 완료 · READY', 'ready');
  paintConfusion();
  window.CourseDashboard && CourseDashboard.markDone('train');
  setStep(3);
};

/* ── 추론 ── */
function buildBars(names) {
  $('bars').innerHTML = names.map((c, i) =>
    `<div class="pbar"><div class="pb-top"><span class="pb-name" style="color:${c.color}">${esc(c.name)}</span>` +
    `<span class="pb-pct" id="pb-pct-${i}">0%</span></div>` +
    `<div class="pb-track"><div class="pb-fill" id="pb-fill-${i}" style="background:${c.color}"></div></div></div>`).join('');
}
async function runInfer() {
  const names = head._classes;
  const probs = tf.tidy(() => head.predict(tf.tensor2d([embed(trainCam.video)])).dataSync());
  let topI = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topI]) topI = i;
  names.forEach((c, i) => {
    const pct = Math.round((probs[i] || 0) * 100);
    const f = $('pb-fill-' + i), p = $('pb-pct-' + i);
    if (f) f.style.width = pct + '%';
    if (p) p.textContent = pct + '%';
  });
  $('r-label').textContent = names[topI].name;
  $('r-label').style.color = names[topI].color;
  $('r-sub').textContent = '확신도 ' + Math.round(probs[topI] * 100) + '%';
  donutSet($('r-arc'), $('r-pct'), probs[topI], names[topI].color);
}
$('btn-infer').onclick = () => {
  if (!head) return;
  inferring = !inferring;
  $('btn-infer').textContent = inferring ? '추론 중지' : '추론 시작';
  if (!inferring) {
    $('r-label').textContent = '대기 중'; $('r-label').style.color = '';
    $('r-sub').textContent = '[추론 시작]을 누르세요';
    donutSet($('r-arc'), $('r-pct'), 0, 'var(--primary)');
  }
  setStatus(inferring ? '추론 중 · LIVE' : '학습 완료 · READY', inferring ? 'live' : 'ready');
};

/* ══════════════════════════════════════════════════════════
   ④ 결과 분석 — 검증 세트의 실제 예측으로 혼동행렬을 만든다.
   확신도가 임계값에 못 미치면 [보류]로 뺀다. 임계값을 올리면 틀린 답은 줄지만
   보류가 늘어나는 저울질이 탭 2 와 똑같이 나타난다(같은 개념, 내 모델).
   ══════════════════════════════════════════════════════════ */
function confusionAt(cutoff) {
  const n = lastEval.names.length;
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  const held = new Array(n).fill(0);
  let right = 0, wrong = 0, abstain = 0;
  lastEval.probs.forEach((row, i) => {
    let k = 0;
    for (let j = 1; j < row.length; j++) if (row[j] > row[k]) k = j;
    const t = lastEval.truth[i];
    if (row[k] < cutoff) { held[t]++; abstain++; return; }
    grid[t][k]++;
    if (t === k) right++; else wrong++;
  });
  return { grid, held, right, wrong, abstain, total: lastEval.probs.length };
}

function paintConfusion() {
  const box = $('conf');
  if (!lastEval) {
    box.innerHTML = '<div class="empty">②단계에서 학습을 완료하면 혼동행렬이 나타납니다.</div>';
    $('cm-verdict').innerHTML = '';
    return;
  }
  const cutoff = +$('conf-thres').value / 100;
  const c = confusionAt(cutoff);
  const names = lastEval.names;

  // "왜 내가 찍은 장수보다 적지?" — 학습분과 채점분을 나눈 이유를 여기서 답한다.
  // 행·열이 무엇인지는 표 머리(실제 \ 예측)가 이미 말해 주므로 여기서 또 쓰지 않는다.
  let html = '<table><caption>모은 <b>' + (lastEval.trainCount + lastEval.valCount) +
    '장</b> 중 <b>' + lastEval.trainCount + '장</b>으로 학습하고, 남은 <b>' + lastEval.valCount +
    '장</b>으로 채점했어요 — 학습에 쓴 사진으로 채점하면 후하게 나오거든요.</caption><thead><tr>' +
    '<th>실제 \\ 예측</th>' + names.map((x) => '<th>' + esc(x.name) + '</th>').join('') +
    (cutoff > 0 ? '<th>보류</th>' : '') + '</tr></thead><tbody>';
  names.forEach((rowName, i) => {
    html += '<tr><td class="rowh">' + esc(rowName.name) + '</td>' +
      names.map((_, j) => '<td class="' + (i === j ? 'diag' : (c.grid[i][j] ? 'miss' : '')) + '">' + c.grid[i][j] + '</td>').join('') +
      (cutoff > 0 ? '<td class="held">' + c.held[i] + '</td>' : '') + '</tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;

  /* 맞힘·틀림·보류 건수는 위의 표가 이미 보여 준다. 여기서는 표에 없는 것만 —
     계산해야 나오는 정확도, 새는 방향, 표본 크기 세 가지만 말한다. */
  const answered = c.right + c.wrong;
  const acc = answered ? Math.round((c.right / answered) * 100) : 0;
  let note;
  if (!answered) {
    note = '<b>한 장도 답하지 못했습니다.</b> 임계값을 내려 보세요.';
  } else {
    note = '<b>정확도 ' + acc + '%</b>' +
      (c.abstain ? ' · 확신이 모자라 <b>보류 ' + c.abstain + '장</b>' : '');
  }
  /* 가장 크게 새는 방향을 찾아 다음에 할 일을 짚어 준다.
     가상의 상황을 묻는 객관식보다, 학생이 방금 만든 표에서 실제로 새는 곳을
     지목해 주는 편이 "혼동행렬을 읽는다"는 목적에 곧바로 닿는다. */
  let leak = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i !== j && c.grid[i][j] > 0 && (!leak || c.grid[i][j] > leak.n)) leak = { i, j, n: c.grid[i][j] };
    }
  }
  if (leak) {
    note += '<span class="cm-fix"><b>' + esc(names[leak.i].name) + '</b> → <b>' +
      esc(names[leak.j].name) + '</b> 로 ' + leak.n + '번 샜습니다. 그 경계(비슷한 배경·각도·거리)의 <b>' +
      esc(names[leak.i].name) + '</b> 데이터를 더 모아 보세요.</span>';
  } else if (answered) {
    note += '<span class="cm-fix">새는 방향이 없습니다. 배경·각도를 크게 바꿔 더 모아 보세요.</span>';
  }
  if (lastEval.valCount < 12) {
    note += '<span class="cm-caveat">채점 표본 ' + lastEval.valCount + '장 — 숫자가 크게 출렁입니다.</span>';
  }
  $('cm-verdict').innerHTML = note;
}
$('conf-thres').addEventListener('input', () => {
  $('conf-thres-val').textContent = $('conf-thres').value + '%';
  paintConfusion();
});

/* ── 위저드 단계 이동 ── */
function setStep(n) {
  wstep = n;
  document.querySelectorAll('#flow .fstep').forEach((el) => {
    const sw = +el.dataset.w;
    el.classList.toggle('active', sw === n);
    el.classList.toggle('done', sw < n);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < n ? '✓' : sw;
  });
  document.querySelectorAll('#panel-train .wstep').forEach((el) => { el.hidden = +el.dataset.w !== n; });
  const learnBox = document.querySelector('.camera-card .learn.fill');
  if (learnBox) learnBox.style.display = n === 1 ? '' : 'none';


  // 추론은 ③단계에서만 돈다 — 다른 단계에서 MobileNet 을 계속 돌릴 이유가 없다.
  if (n === 3 && head && trainCam.stream) {
    inferring = true; $('btn-infer').textContent = '추론 중지'; setStatus('추론 중 · LIVE', 'live');
  } else if (inferring) {
    inferring = false; $('btn-infer').textContent = '추론 시작';
  }
  if (n === 4) paintConfusion();
}
document.querySelectorAll('#flow .fstep').forEach((el) => {
  el.onclick = () => setStep(+el.dataset.w);
});
$('go-train').onclick = () => setStep(2);
$('go-collect').onclick = () => setStep(1);
$('go-analyze').onclick = () => setStep(4);
$('go-back-infer').onclick = () => setStep(3);
$('go-mission').onclick = () => window.visionShowTab('mission');

/* 시작 상태 — 클래스 두 개를 미리 깔아 둔다(무엇을 해야 하는지 바로 보이게). */
addClass('물체 1 (예: 컵)');
addClass('물체 2 (예: 볼펜)');
setCapEnabled(false);
donutSet($('r-arc'), $('r-pct'), 0, 'var(--primary)');
