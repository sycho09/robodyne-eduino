/* ============================================================
   EDUINO ML Trainer v2
   - 1차본 로직 유지, UI/단계 인디케이터/학습종류 탭 재구성
   ============================================================ */

const PALETTE = ['#0066ff', '#d97706', '#06b6d4', '#059669', '#e11d48', '#7c3aed', '#db2777', '#0891b2'];
const MAX_CLASSES = 4;

const state = {
  classes: [],
  selectedId: null,
  mobilenet: null,
  head: null,
  stream: null,
  inferring: false,
  trained: false,
};
let classSeq = 0;

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'), statusText: $('status-text'),
  classList: $('class-list'), classCountMeta: $('class-count-meta'),
  addClass: $('add-class'),
  video: $('webcam'), camOverlay: $('cam-overlay'),
  camToggle: $('cam-toggle'),
  capTargetName: $('cap-target-name'), liveDot: $('live-dot'),
  epochs: $('epochs'), train: $('train'),
  trainBar: $('train-bar'), trainHint: $('train-hint'),
  mEpoch: $('m-epoch'), mLoss: $('m-loss'), mAcc: $('m-acc'),
  topPred: $('top-pred'), bars: $('bars'),
  inferToggle: $('infer-toggle'), inferMeta: $('infer-meta'),
};

function setStatus(text, kind) {
  if (!els.status) return; // 상단 상태 뱃지는 제거됨 (각 패널이 자체 STATUS 표시)
  els.statusText.textContent = text;
  els.status.className = 'status ' + (kind || '');
}


/* ── 모델 로드 ───────────────────────────────────────── */
async function init() {
  try {
    setStatus('MODEL LOADING', 'busy');
    state.mobilenet = await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json' });
    setStatus('READY', 'ready');
  } catch (e) {
    console.error(e);
    setStatus('LOAD FAILED — CHECK NETWORK', '');
  }
  addClass('클래스 1');
  addClass('클래스 2');
}

/* ── 클래스 관리 ─────────────────────────────────────── */
function addClass(name) {
  if (state.classes.length >= MAX_CLASSES) return;
  const id = ++classSeq;
  const color = PALETTE[(id - 1) % PALETTE.length];
  state.classes.push({ id, name: name || ('클래스 ' + id), color, embeddings: [], thumbs: [] });
  if (state.selectedId === null) state.selectedId = id;
  renderClasses(); renderBars(); refresh();
}
function removeClass(id) {
  state.classes = state.classes.filter(c => c.id !== id);
  if (state.selectedId === id) state.selectedId = state.classes[0]?.id ?? null;
  state.trained = false; state.head = null;
  renderClasses(); renderBars(); refresh(); resetTopPred();
}
/* 선택은 전체 재렌더 대신 하이라이트만 변경 — 입력칸(input)이 파괴되지 않아
   터치/모바일에서 클래스명 수정 중 포커스가 풀리지 않는다. */
function setSelectedItem(container, id) {
  container.querySelectorAll('.class-item').forEach((el) => el.classList.toggle('selected', +el.dataset.id === id));
}
function selectClass(id) { state.selectedId = id; setSelectedItem(els.classList, id); updateCapTarget(); }

/* 클래스 목록 렌더 공통 로직 — 이미지/동작 탭이 콜백·상수·갤러리 연동만 다르고
   DOM 구조가 동일하므로 cfg 로 주입받아 재사용한다. onThumbs 가 없으면(동작 탭)
   썸네일 클릭 갤러리를 달지 않는다. */
function renderClassList(cfg) {
  cfg.container.innerHTML = '';
  cfg.classes.forEach(c => {
    const div = document.createElement('div');
    div.className = 'class-item' + (c.id === cfg.selectedId ? ' selected' : '');
    div.dataset.id = c.id;
    div.onclick = () => cfg.onSelect(c.id);

    const row = document.createElement('div');
    row.className = 'class-row';
    row.innerHTML = `<span class="class-dot" style="background:${c.color}"></span>`;

    const input = document.createElement('input');
    input.className = 'class-name'; input.value = c.name;
    input.onclick = (e) => { e.stopPropagation(); cfg.onSelect(c.id); };
    input.oninput = () => { c.name = input.value || c.name; cfg.onRename(); };
    row.appendChild(input);

    const count = document.createElement('span');
    count.className = 'class-count'; count.textContent = c.embeddings.length;
    row.appendChild(count);

    const del = document.createElement('button');
    del.className = 'class-del'; del.textContent = '✕'; del.title = '삭제';
    del.onclick = (e) => { e.stopPropagation(); cfg.onRemove(c.id); };
    row.appendChild(del);

    div.appendChild(row);

    if (cfg.capture) {
      const cap = document.createElement('button');
      cap.className = 'cap-btn'; cap.dataset.id = c.id; cap.type = 'button';
      cap.disabled = !cfg.capEnabled();
      cap.innerHTML = `<span class="ci">📷</span><span class="cl">촬영</span><span class="cap-count">${c.embeddings.length}</span>`;
      cap.onclick = (e) => e.stopPropagation(); // 캡처는 컨테이너 위임으로 처리(롱프레스)
      div.appendChild(cap);
    }

    if (c.thumbs.length) {
      const t = document.createElement('div'); t.className = 'thumbs';
      if (cfg.onThumbs) { t.style.cursor = 'pointer'; t.title = '클릭해서 갤러리 열기'; }
      c.thumbs.slice(-6).forEach(src => {
        const im = document.createElement('img'); im.src = src; t.appendChild(im);
      });
      if (c.embeddings.length > 6) {
        const m = document.createElement('span'); m.className = 'more';
        m.textContent = '+' + (c.embeddings.length - 6); t.appendChild(m);
      }
      if (cfg.onThumbs) {
        t.addEventListener('click', (e) => {
          e.stopPropagation();
          cfg.onSelect(c.id);
          cfg.onThumbs(c.id);
        });
      }
      div.appendChild(t);
    }
    cfg.container.appendChild(div);
  });
  cfg.countMeta.textContent = cfg.classes.length + ' / ' + cfg.max;
  cfg.addBtn.disabled = cfg.classes.length >= cfg.max;
  /* 무료 구간의 클래스 수·데이터 상한을 덮어씌운다 (기준서 2장). 세 트랙이 같은 함수를 부른다. */
  if (window.Access) window.Access.capClasses({
    container: cfg.container, addBtn: cfg.addBtn, countMeta: cfg.countMeta,
    count: cfg.classes.length, max: cfg.max, kind: cfg.kind || 'shots'
  });
}

function renderClasses() {
  renderClassList({
    container: els.classList, classes: state.classes, selectedId: state.selectedId,
    max: MAX_CLASSES, countMeta: els.classCountMeta, addBtn: els.addClass,
    onSelect: selectClass, onRemove: removeClass,
    onRename: () => { renderBars(); updateCapTarget(); },
    onThumbs: openGallery,
    capture: true, capEnabled: () => !!state.stream,
  });
  updateCapTarget();
}

function updateCapTarget() {
  const sel = state.classes.find(c => c.id === state.selectedId);
  els.capTargetName.textContent = sel ? sel.name : '—';
}

/* ── 카메라 ─────────────────────────────────────────── */
async function toggleCam() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null; els.video.srcObject = null;
    els.camOverlay.style.display = 'grid';
    els.camToggle.textContent = '카메라 켜기';
    setCapEnabled(false);
    els.liveDot.classList.remove('on');
    stopInfer();
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    els.video.srcObject = state.stream;
    els.camOverlay.style.display = 'none';
    els.camToggle.textContent = '카메라 끄기';
    setCapEnabled(true);
    els.liveDot.classList.add('on');
  } catch (e) {
    console.error(e);
    els.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}

function captureSample() {
  const sel = state.classes.find(c => c.id === state.selectedId);
  if (!sel || !state.mobilenet || !state.stream) return;
  /* 버튼은 비활성이지만 길게 누르기는 컨테이너 위임이라 여기서 한 번 더 막는다. */
  if (window.Access && sel.embeddings.length >= window.Access.limit('shots')) return;
  const emb = tf.tidy(() => state.mobilenet.infer(els.video, true).flatten());
  sel.embeddings.push(Array.from(emb.dataSync()));
  emb.dispose();

  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 48;
  cv.getContext('2d').drawImage(els.video, 0, 0, 64, 48);
  sel.thumbs.push(cv.toDataURL('image/jpeg', 0.6));

  bumpClassCard(sel); refresh();
}

/* 촬영 중에는 전체 재렌더(깜빡임·롱프레스 끊김)를 피하고 해당 카드만 갱신 */
function bumpClassCard(c) {
  const item = els.classList.querySelector('.class-item[data-id="' + c.id + '"]');
  if (!item) { renderClasses(); return; }
  const n = c.embeddings.length;
  item.querySelectorAll('.class-count').forEach(e => e.textContent = n);
  const cb = item.querySelector('.cap-count'); if (cb) cb.textContent = n;
  let t = item.querySelector('.thumbs');
  if (!t) {
    t = document.createElement('div'); t.className = 'thumbs';
    t.style.cursor = 'pointer'; t.title = '클릭해서 갤러리 열기';
    t.addEventListener('click', (e) => { e.stopPropagation(); selectClass(c.id); openGallery(c.id); });
    item.appendChild(t);
  }
  t.innerHTML = '';
  c.thumbs.slice(-6).forEach(src => { const im = document.createElement('img'); im.src = src; t.appendChild(im); });
  if (n > 6) { const m = document.createElement('span'); m.className = 'more'; m.textContent = '+' + (n - 6); t.appendChild(m); }
}

function setCapEnabled(on) {
  els.classList.querySelectorAll('.cap-btn').forEach(b => b.disabled = !on);
}

/* ── 학습 ───────────────────────────────────────────── */
/* 분류 헤드 학습 공통 코어 — 이미지/동작 탭이 아키텍처·기본 epochs·UI 요소·
   상태 메시지만 다르고 학습 절차(원핫 인코딩 → 헤드 구성 → fit → 혼동행렬)는
   동일하다. 탭별 차이는 cfg 콜백으로 주입한다. */
async function trainHead(cfg) {
  const usable = cfg.classes.filter(c => c.embeddings.length > 0);
  if (usable.length < 2) return;
  cfg.onStart();
  cfg.ui.train.disabled = true; cfg.ui.inferToggle.disabled = true;

  const xsArr = [], ysArr = [];
  usable.forEach((c, idx) => {
    c.embeddings.forEach(e => {
      xsArr.push(e);
      const oh = new Array(usable.length).fill(0); oh[idx] = 1; ysArr.push(oh);
    });
  });
  const xs = tf.tensor2d(xsArr);
  const ys = tf.tensor2d(ysArr);

  cfg.disposeHead();
  const head = tf.sequential();
  head.add(tf.layers.dense({ inputShape: [cfg.featDim ?? xsArr[0].length], units: cfg.hiddenUnits, activation: 'relu' }));
  head.add(tf.layers.dropout({ rate: 0.2 }));
  head.add(tf.layers.dense({ units: usable.length, activation: 'softmax' }));
  head.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  head._classNames = usable.map(c => ({ name: c.name, color: c.color }));
  cfg.setHead(head);

  const epochs = Math.max(5, Math.min(100, +cfg.ui.epochs.value || cfg.defaultEpochs));
  cfg.resetChart();
  cfg.ui.chartBox.classList.add('on');
  cfg.ui.confBox.classList.remove('on');

  await head.fit(xs, ys, {
    epochs, shuffle: true, batchSize: Math.min(16, xsArr.length),
    callbacks: {
      onEpochEnd: (ep, logs) => {
        cfg.ui.trainBar.style.width = Math.round(((ep + 1) / epochs) * 100) + '%';
        cfg.ui.mEpoch.textContent = (ep + 1) + ' / ' + epochs;
        cfg.ui.mLoss.textContent = logs.loss.toFixed(3);
        const acc = logs.acc ?? logs.accuracy;
        cfg.ui.mAcc.textContent = acc != null ? Math.round(acc * 100) + '%' : '—';
        cfg.pushPoint(ep + 1, epochs, logs.loss, acc);
      },
    },
  });

  await cfg.buildConf(xs, ys, usable);
  xs.dispose(); ys.dispose();

  cfg.ui.train.disabled = false;
  cfg.ui.trainHint.textContent = '학습 완료. 우측 [추론 시작]을 누르세요.';
  cfg.onDone();
}

async function train() {
  await trainHead({
    classes: state.classes,
    ui: {
      train: els.train, inferToggle: els.inferToggle, epochs: els.epochs,
      trainBar: els.trainBar, mEpoch: els.mEpoch, mLoss: els.mLoss, mAcc: els.mAcc,
      chartBox: $('train-chart-box'), confBox: $('confusion-box'), trainHint: els.trainHint,
    },
    hiddenUnits: 100, defaultEpochs: 30,
    onStart: () => { setStatus('TRAINING', 'busy'); stopInfer(); },
    disposeHead: () => { if (state.head) state.head.dispose(); },
    setHead: (h) => { state.head = h; },
    resetChart, pushPoint: pushChartPoint, buildConf: buildConfusionMatrix,
    onDone: () => {
      state.trained = true;
      setStatus('TRAINED · READY', 'ready');
      els.inferToggle.disabled = !state.stream;
      renderBars(); refresh();
    },
  });
}

/* ── 학습 곡선 (SVG) ─────────────────────────────────── */
const chartHistory = { loss: [], acc: [] };
function resetChart() {
  chartHistory.loss = []; chartHistory.acc = [];
  document.getElementById('chart-loss').setAttribute('points', '');
  document.getElementById('chart-acc').setAttribute('points', '');
}
/* 학습 곡선(정확도/손실) SVG polyline 좌표 계산 공통 로직.
   hist 누적 배열과 대상 polyline 엘리먼트만 탭별로 다르다. */
function drawChart(hist, accEl, lossEl, totalEp, loss, acc) {
  hist.loss.push(loss);
  hist.acc.push(acc != null ? acc : 0);
  const W = 400, H = 110, padL = 24, padR = 6, padT = 8, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = hist.loss.length;
  const maxLoss = Math.max(0.1, ...hist.loss);
  const xOf = (i) => padL + (n === 1 ? plotW / 2 : (i / (totalEp - 1)) * plotW);
  const yAcc = (v) => padT + plotH * (1 - Math.max(0, Math.min(1, v)));
  const yLoss = (v) => padT + plotH * (1 - v / maxLoss);
  accEl.setAttribute('points', hist.acc.map((v, i) => xOf(i) + ',' + yAcc(v)).join(' '));
  lossEl.setAttribute('points', hist.loss.map((v, i) => xOf(i) + ',' + yLoss(v)).join(' '));
}

function pushChartPoint(ep, totalEp, loss, acc) {
  drawChart(chartHistory, $('chart-acc'), $('chart-loss'), totalEp, loss, acc);
}

/* ── 혼동 행렬 (학습 데이터 self-prediction) ──────────── */
/* 공통 로직 — head 와 대상 엘리먼트만 탭별로 다르다. xs/ys 가 dispose 되기 전에
   호출부에서 반드시 await 해야 한다(예측·정답 텐서를 비동기로 읽으므로). */
async function buildConfusion(head, xs, ys, usable, wrapEl, boxEl) {
  const n = usable.length;
  const mat = Array.from({ length: n }, () => new Array(n).fill(0));

  const preds = head.predict(xs);
  const predArr = await preds.array();
  const trueArr = await ys.array();
  preds.dispose();

  for (let i = 0; i < predArr.length; i++) {
    const pred = predArr[i].indexOf(Math.max(...predArr[i]));
    const truth = trueArr[i].indexOf(1);
    mat[truth][pred]++;
  }

  let html = '<table class="confusion-table"><thead><tr><th></th>';
  usable.forEach(c => {
    html += `<th title="${c.name}">${c.name.slice(0, 6)}</th>`;
  });
  html += '</tr></thead><tbody>';
  for (let r = 0; r < n; r++) {
    html += `<tr><th class="row-label" title="${usable[r].name}">${usable[r].name.slice(0, 8)}</th>`;
    for (let c = 0; c < n; c++) {
      const v = mat[r][c];
      const cls = v === 0 ? 'cell zero' : (r === c ? 'cell diag' : 'cell');
      html += `<td class="${cls}">${v}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrapEl.innerHTML = html;
  boxEl.classList.add('on');
}

function buildConfusionMatrix(xs, ys, usable) {
  return buildConfusion(state.head, xs, ys, usable, $('confusion-table-wrap'), $('confusion-box'));
}

/* ── 갤러리 (클래스 썸네일 큰 화면) ───────────────────── */
function openGallery(classId) {
  const c = state.classes.find(x => x.id === classId);
  if (!c) return;
  document.getElementById('gallery-dot').style.background = c.color;
  document.getElementById('gallery-name').textContent = c.name;
  document.getElementById('gallery-count').textContent = c.thumbs.length + ' 장';
  const grid = document.getElementById('gallery-grid');
  if (c.thumbs.length === 0) {
    grid.innerHTML = '<div class="gallery-empty" style="grid-column:1/-1">아직 수집된 이미지가 없습니다</div>';
  } else {
    grid.innerHTML = c.thumbs.map((src, i) =>
      `<div class="gallery-item" data-idx="${i}">
        <img src="${src}" alt="sample ${i}">
        <div class="del-mark">삭제</div>
      </div>`
    ).join('');
    grid.querySelectorAll('.gallery-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = +el.dataset.idx;
        c.embeddings.splice(idx, 1);
        c.thumbs.splice(idx, 1);
        openGallery(classId);
        renderClasses(); refresh();
      });
    });
  }
  document.getElementById('gallery-overlay').classList.add('on');
}
function closeGallery() {
  document.getElementById('gallery-overlay').classList.remove('on');
}

