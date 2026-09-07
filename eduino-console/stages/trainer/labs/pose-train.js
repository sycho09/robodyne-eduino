/* ============================================================
   ▌ 포즈 인식 (지도학습)
   ─ MoveNet keypoint extraction + Dense classifier
   ─ 직접학습과 동일한 워크플로우, MobileNet 대신 17 keypoints
   ============================================================ */
const POSE_PALETTE = ['#0066ff', '#d97706', '#06b6d4', '#059669', '#e11d48', '#7c3aed'];
const POSE_MAX_CLASSES = 4;
const POSE_FEAT_DIM = 34; // 17 keypoints × (x, y) normalized

const pose = {
  classes: [], selectedId: null,
  detector: null, head: null,
  stream: null, inferring: false, trained: false,
  rafLoop: null,
};
let poseSeq = 0;

const pEls = {
  classList: $('p-class-list'), classCountMeta: $('p-class-count-meta'),
  addClass: $('p-add-class'),
  video: $('p-webcam'), camOverlay: $('p-cam-overlay'),
  canvas: $('p-pose-overlay'),
  capTargetName: $('p-cap-target-name'), liveDot: $('p-live-dot'),
  camToggle: $('p-cam-toggle'),
  epochs: $('p-epochs'), train: $('p-train'),
  trainBar: $('p-train-bar'), trainHint: $('p-train-hint'),
  mEpoch: $('p-m-epoch'), mLoss: $('p-m-loss'), mAcc: $('p-m-acc'),
  topPred: $('p-top-pred'), bars: $('p-bars'),
  inferToggle: $('p-infer-toggle'), inferMeta: $('p-infer-meta'),
  chartBox: $('p-train-chart-box'), chartAcc: $('p-chart-acc'), chartLoss: $('p-chart-loss'),
  confBox: $('p-confusion-box'), confWrap: $('p-confusion-table-wrap'),
};

async function poseInit() {
  pEls.addClass.addEventListener('click', () => poseAddClass());
  pEls.camToggle.addEventListener('click', poseToggleCam);
  pEls.train.addEventListener('click', poseTrain);
  pEls.inferToggle.addEventListener('click', () => pose.inferring ? poseStopInfer() : poseStartInfer());
  pEls.classList.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.cap-btn'); if (!b || b.disabled) return;
    e.preventDefault(); startPoseClassCapture(+b.dataset.id);
  });
  window.addEventListener('pointerup', endPoseClassCapture);
  window.addEventListener('pointercancel', endPoseClassCapture);
  poseAddClass('클래스 1'); poseAddClass('클래스 2');

  if (!window.poseDetection) { console.error('[pose] poseDetection library missing'); return; }
  try {
    await tf.ready();
    try { await tf.setBackend('webgl'); } catch (_) {}
    /* 저장소에 번들한 모델을 같은 출처에서 불러온다 — 기본값(tfhub.dev)은 데스크톱 앱의
       app:// 출처에서 403 으로 거부돼 동작 분류가 통째로 멈춘다 (근거: docs/result-studio.md) */
    pose.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        modelUrl: AppBase.resolve('models/movenet/singlepose-lightning/model.json') }
    );
    console.log('[pose] MoveNet ready, backend=', tf.getBackend());
  } catch (e) { console.error('[pose] MoveNet load fail:', e); }
}

function poseAddClass(name) {
  if (pose.classes.length >= POSE_MAX_CLASSES) return;
  const id = ++poseSeq;
  const color = POSE_PALETTE[(id - 1) % POSE_PALETTE.length];
  pose.classes.push({ id, name: name || ('클래스 ' + id), color, embeddings: [], thumbs: [] });
  if (pose.selectedId == null) pose.selectedId = id;
  poseRenderClasses(); poseRefresh();
}
function poseRemoveClass(id) {
  pose.classes = pose.classes.filter(c => c.id !== id);
  if (pose.selectedId === id) pose.selectedId = pose.classes[0]?.id || null;
  poseRenderClasses(); poseRefresh();
}
function poseSelectClass(id) { pose.selectedId = id; setSelectedItem(pEls.classList, id); poseUpdateCapTarget(); }

function poseRenderClasses() {
  renderClassList({
    container: pEls.classList, classes: pose.classes, selectedId: pose.selectedId,
    max: POSE_MAX_CLASSES, countMeta: pEls.classCountMeta, addBtn: pEls.addClass, kind: 'shots',
    onSelect: poseSelectClass, onRemove: poseRemoveClass,
    onRename: () => { poseRenderBars(); poseUpdateCapTarget(); },
    onThumbs: null,  // 동작 탭은 갤러리 없음
    capture: true, capEnabled: () => !!pose.stream,
  });
  poseUpdateCapTarget();
}

function poseUpdateCapTarget() {
  const sel = pose.classes.find(c => c.id === pose.selectedId);
  pEls.capTargetName.textContent = sel ? sel.name : '—';
}

async function poseToggleCam() {
  if (pose.stream) {
    pose.stream.getTracks().forEach(t => t.stop());
    pose.stream = null; pEls.video.srcObject = null;
    pEls.camOverlay.style.display = 'grid';
    pEls.camToggle.textContent = '카메라 켜기';
    poseSetCapEnabled(false);
    pEls.liveDot.classList.remove('on');
    poseStopInfer();
    poseStopOverlayLoop();
    return;
  }
  try {
    pose.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    pEls.video.srcObject = pose.stream;
    pEls.camOverlay.style.display = 'none';
    pEls.camToggle.textContent = '카메라 끄기';
    poseSetCapEnabled(true);
    pEls.liveDot.classList.add('on');
    poseStartOverlayLoop();
  } catch (e) {
    pEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}

/* 키포인트 추출 + 정규화 (root-relative: 어깨 중심점 기준) */
async function extractKeypoints() {
  if (!pose.detector || !pose.stream) return null;
  const poses = await pose.detector.estimatePoses(pEls.video);
  if (!poses || poses.length === 0) return null;
  const kp = poses[0].keypoints;
  if (kp.length < 17) return null;

  const ls = kp[5], rs = kp[6];
  const cx = (ls.x + rs.x) / 2;
  const cy = (ls.y + rs.y) / 2;
  const scale = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1;

  const feat = [];
  for (let i = 0; i < 17; i++) {
    feat.push((kp[i].x - cx) / scale);
    feat.push((kp[i].y - cy) / scale);
  }
  return { feat, kp };
}

/* 키포인트를 캔버스에 그리기 (시각 피드백) */
const POSE_EDGES = [
  [5,7],[7,9],[6,8],[8,10],[5,6],[5,11],[6,12],
  [11,12],[11,13],[13,15],[12,14],[14,16],[0,5],[0,6],
];
function drawKeypoints(kp) {
  const cv = pEls.canvas;
  const vw = pEls.video.videoWidth, vh = pEls.video.videoHeight;
  if (!vw || !vh) return;
  cv.width = vw; cv.height = vh;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, vw, vh);

  ctx.strokeStyle = '#0066ff'; ctx.lineWidth = 3;
  POSE_EDGES.forEach(([a, b]) => {
    if (kp[a].score > 0.3 && kp[b].score > 0.3) {
      ctx.beginPath(); ctx.moveTo(kp[a].x, kp[a].y); ctx.lineTo(kp[b].x, kp[b].y); ctx.stroke();
    }
  });
  ctx.fillStyle = '#06b6d4';
  kp.forEach(p => {
    if (p.score > 0.3) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

async function poseOverlayLoop() {
  if (!pose.stream) { pose.rafLoop = null; return; }
  if (pEls.video.readyState >= 2 && pose.detector) {
    try {
      const r = await extractKeypoints();
      if (r) drawKeypoints(r.kp);
    } catch (e) { /* skip frame */ }
  }
  pose.rafLoop = requestAnimationFrame(poseOverlayLoop);
}
function poseStartOverlayLoop() {
  if (pose.rafLoop) return;
  poseOverlayLoop();
}
function poseStopOverlayLoop() {
  if (pose.rafLoop) cancelAnimationFrame(pose.rafLoop);
  pose.rafLoop = null;
  const ctx = pEls.canvas.getContext('2d');
  ctx.clearRect(0, 0, pEls.canvas.width, pEls.canvas.height);
}

async function poseCaptureSample() {
  const sel = pose.classes.find(c => c.id === pose.selectedId);
  if (!sel || !pose.detector || !pose.stream) return;
  const r = await extractKeypoints();
  if (!r) return;
  sel.embeddings.push(r.feat);
  poseBumpClassCard(sel); poseRefresh();
}
function poseBumpClassCard(c) {
  const item = pEls.classList.querySelector('.class-item[data-id="' + c.id + '"]');
  if (!item) { poseRenderClasses(); return; }
  const n = c.embeddings.length;
  item.querySelectorAll('.class-count').forEach(e => e.textContent = n);
  const cb = item.querySelector('.cap-count'); if (cb) cb.textContent = n;
}
function poseSetCapEnabled(on) {
  pEls.classList.querySelectorAll('.cap-btn').forEach(b => b.disabled = !on);
}

/* 클래스별 촬영 — 카드의 [📷 촬영] 버튼(탭=1장, 길게=연속), 컨테이너 위임 */
let poseHoldTimer = null;
function startPoseClassCapture(id) {
  if (!pose.stream) return;
  poseSelectClass(id);
  poseCaptureSample();
  clearInterval(poseHoldTimer);
  poseHoldTimer = setInterval(poseCaptureSample, 200);
}
function endPoseClassCapture() { clearInterval(poseHoldTimer); poseHoldTimer = null; }

async function poseTrain() {
  await trainHead({
    classes: pose.classes,
    ui: {
      train: pEls.train, inferToggle: pEls.inferToggle, epochs: pEls.epochs,
      trainBar: pEls.trainBar, mEpoch: pEls.mEpoch, mLoss: pEls.mLoss, mAcc: pEls.mAcc,
      chartBox: pEls.chartBox, confBox: pEls.confBox, trainHint: pEls.trainHint,
    },
    featDim: POSE_FEAT_DIM, hiddenUnits: 64, defaultEpochs: 40,
    onStart: () => { poseStopInfer(); },
    disposeHead: () => { if (pose.head) pose.head.dispose(); },
    setHead: (h) => { pose.head = h; },
    resetChart: poseResetChart, pushPoint: posePushChartPoint, buildConf: poseBuildConfusion,
    onDone: () => {
      pose.trained = true;
      pEls.inferToggle.disabled = !pose.stream;
      poseRenderBars(); poseRefresh();
    },
  });
}

const poseChartHist = { loss: [], acc: [] };
function poseResetChart() {
  poseChartHist.loss = []; poseChartHist.acc = [];
  pEls.chartAcc.setAttribute('points', '');
  pEls.chartLoss.setAttribute('points', '');
}
function posePushChartPoint(ep, totalEp, loss, acc) {
  drawChart(poseChartHist, pEls.chartAcc, pEls.chartLoss, totalEp, loss, acc);
}

function poseBuildConfusion(xs, ys, usable) {
  return buildConfusion(pose.head, xs, ys, usable, pEls.confWrap, pEls.confBox);
}

function poseRenderBars() {
  const names = pose.head?._classNames || pose.classes.map(c => ({ name: c.name, color: c.color }));
  renderProbBars(pEls.bars, names, (i) => `p-pct-${i}`, (i) => `p-fill-${i}`);
}

function poseResetTopPred() {
  pEls.topPred.className = 'top-pred idle';
  pEls.topPred.querySelector('.tp-name').textContent = pose.trained ? '대기 중' : '아직 학습 전';
  pEls.topPred.querySelector('.tp-conf').textContent = '';
  setDonut('p-top-donut', 0, 'var(--accent)');
}

async function poseInferLoop() {
  if (!pose.inferring || !pose.stream || !pose.head) return;
  const r = await extractKeypoints();
  if (r) {
    const x = tf.tensor2d([r.feat]);
    const yhat = pose.head.predict(x);
    const out = await yhat.data();
    x.dispose(); yhat.dispose(); // 추론 텐서 누수 방지(장시간 수업 안정성)
    const names = pose.head._classNames;
    const topI = renderProbResults(out, names, (i) => `p-pct-${i}`, (i) => `p-fill-${i}`);
    pEls.topPred.className = 'top-pred active';
    pEls.topPred.querySelector('.tp-name').textContent = names[topI].name;
    pEls.topPred.querySelector('.tp-conf').textContent = '확신도 ' + Math.round(out[topI]*100) + '%';
    setDonut('p-top-donut', out[topI], names[topI].color);
  }
  requestAnimationFrame(poseInferLoop);
}

function poseStartInfer() {
  if (!pose.trained || !pose.stream) return;
  pose.inferring = true;
  pEls.inferToggle.textContent = '추론 중지';
  pEls.inferMeta.textContent = 'LIVE';
  syncStepNav();
  poseInferLoop();
}
function poseStopInfer() {
  pose.inferring = false;
  pEls.inferToggle.textContent = '추론 시작';
  pEls.inferMeta.textContent = 'IDLE';
  syncStepNav();
  poseResetTopPred();
}

function poseRefresh() {
  const usable = pose.classes.filter(c => c.embeddings.length > 0);
  pEls.train.disabled = usable.length < 2;
  poseRenderBars();
  if (!pose.trained) poseResetTopPred();
  syncStepNav();
}

