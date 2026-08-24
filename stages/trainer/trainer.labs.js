/* ── 음성 녹음 관리 (스펙트로그램 썸네일 + 삭제) ─────────── */
/* speech-commands 녹음은 오디오가 아닌 스펙트로그램이라 재생은 불가하고,
   썸네일로 확인 + uid 기반 개별 삭제만 제공한다. */
function drawSpectrogram(canvas, spec) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H);
  if (!spec || !spec.data || !spec.frameSize) return;
  const data = spec.data, fs = spec.frameSize;
  const frames = Math.floor(data.length / fs);
  if (frames <= 0) return;
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < data.length; k++) { const v = data[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = (mx - mn) || 1;
  const img = ctx.createImageData(W, H);
  for (let px = 0; px < W; px++) {
    const f = Math.min(frames - 1, Math.floor(px / W * frames));
    for (let py = 0; py < H; py++) {
      const bin = Math.min(fs - 1, Math.floor((1 - py / H) * fs)); // 낮은 주파수를 아래로
      const v = (data[f * fs + bin] - mn) / range; // 0..1
      const idx = (py * W + px) * 4;
      img.data[idx] = 20; img.data[idx + 1] = Math.round(v * 200); img.data[idx + 2] = Math.round(60 + v * 195); img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function openAudioRec(classId) {
  const c = audio.classes.find(x => x.id === classId);
  if (!c) return;
  $('audio-rec-dot').style.background = c.color;
  $('audio-rec-name').textContent = c.name;
  const exs = audio.transfer ? audio.transfer.getExamples(String(c.id)) : [];
  $('audio-rec-count').textContent = exs.length + ' 개';
  const grid = $('audio-rec-grid');
  if (exs.length === 0) {
    grid.innerHTML = '<div class="gallery-empty" style="grid-column:1/-1">아직 녹음이 없습니다. 마이크를 켜고 [녹음]을 눌러 수집하세요.</div>';
  } else {
    grid.innerHTML = exs.map((ex, i) =>
      `<div class="gallery-item" data-uid="${ex.uid}" title="녹음 ${i + 1}">
        <canvas class="rec-spec" width="120" height="72"></canvas>
        <div class="del-mark">삭제</div>
      </div>`
    ).join('');
    grid.querySelectorAll('.rec-spec').forEach((cv, i) => drawSpectrogram(cv, exs[i].example.spectrogram));
    grid.querySelectorAll('.gallery-item').forEach(el => {
      el.addEventListener('click', () => {
        audio.transfer.removeExample(el.dataset.uid);
        c.count = audio.transfer.countExamples()[String(c.id)] || 0;
        openAudioRec(classId);
        audioRenderClasses(); audioRefresh();
      });
    });
  }
  $('audio-rec-overlay').classList.add('on');
}
function closeAudioRec() {
  document.getElementById('audio-rec-overlay').classList.remove('on');
}

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
        modelUrl: '/models/movenet/singlepose-lightning/model.json' }
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
  /* 버튼은 비활성이지만 길게 누르기는 컨테이너 위임이라 여기서 한 번 더 막는다. */
  if (window.Access && sel.embeddings.length >= window.Access.limit('shots')) return;
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

/* ============================================================
   ▌ 음성 학습 (Speech Commands · Transfer Learning)
   ============================================================ */
const AUDIO_PALETTE = ['#0066ff', '#d97706', '#06b6d4', '#059669'];
const AUDIO_MAX = 4;
const audio = {
  classes: [], selectedId: null,
  base: null, transfer: null,
  micStream: null, audioCtx: null, analyser: null,
  recording: false, inferring: false, trained: false,
  wfRaf: null,
};
let audioSeq = 0;

const aEls = {
  classList: $('a-class-list'), classCountMeta: $('a-class-count-meta'),
  addClass: $('a-add-class'),
  waveform: $('a-waveform'), micOverlay: $('a-mic-overlay'),
  capTargetName: $('a-cap-target-name'), liveDot: $('a-live-dot'),
  micToggle: $('a-mic-toggle'),
  epochs: $('a-epochs'), train: $('a-train'),
  trainBar: $('a-train-bar'), trainHint: $('a-train-hint'),
  mEpoch: $('a-m-epoch'), mLoss: $('a-m-loss'), mAcc: $('a-m-acc'),
  topPred: $('a-top-pred'), bars: $('a-bars'),
  inferToggle: $('a-infer-toggle'), inferMeta: $('a-infer-meta'),
};

async function audioInit() {
  aEls.addClass.addEventListener('click', () => audioAddClass());
  aEls.micToggle.addEventListener('click', audioToggleMic);
  aEls.train.addEventListener('click', audioTrain);
  aEls.inferToggle.addEventListener('click', () => audio.inferring ? audioStopInfer() : audioStartInfer());
  audioAddClass('클래스 1'); audioAddClass('클래스 2');

  if (!window.speechCommands) { console.error('[audio] speech-commands missing'); return; }
  try {
    audio.base = speechCommands.create('BROWSER_FFT');
    await audio.base.ensureModelLoaded();
    console.log('[audio] Speech Commands ready');
  } catch (e) { console.error('[audio] load fail:', e); }
}

function audioAddClass(name) {
  if (audio.classes.length >= AUDIO_MAX) return;
  const id = ++audioSeq;
  const color = AUDIO_PALETTE[(id - 1) % AUDIO_PALETTE.length];
  audio.classes.push({ id, name: name || ('클래스 ' + id), color, count: 0 });
  if (audio.selectedId == null) audio.selectedId = id;
  audioRenderClasses(); audioRefresh();
}
function audioRemoveClass(id) {
  audio.classes = audio.classes.filter(c => c.id !== id);
  if (audio.selectedId === id) audio.selectedId = audio.classes[0]?.id || null;
  audioRenderClasses(); audioRefresh();
}
function audioSelectClass(id) { audio.selectedId = id; setSelectedItem(aEls.classList, id); audioUpdateCapTarget(); }
function audioSetCapEnabled(on) {
  aEls.classList.querySelectorAll('.cap-btn').forEach(b => b.disabled = !on || audio.recording);
}

function audioRenderClasses() {
  aEls.classList.innerHTML = '';
  audio.classes.forEach(c => {
    const div = document.createElement('div');
    div.className = 'class-item' + (c.id === audio.selectedId ? ' selected' : '');
    div.dataset.id = c.id;
    div.onclick = () => audioSelectClass(c.id);
    const row = document.createElement('div');
    row.className = 'class-row';
    row.innerHTML = `<span class="class-dot" style="background:${c.color}"></span>`;
    const input = document.createElement('input');
    input.className = 'class-name'; input.value = c.name;
    input.onclick = (e) => { e.stopPropagation(); audioSelectClass(c.id); };
    input.oninput = () => { c.name = input.value || c.name; audioRenderBars(); audioUpdateCapTarget(); };
    row.appendChild(input);
    const count = document.createElement('span');
    count.className = 'class-count'; count.textContent = c.count;
    count.style.cursor = 'pointer';
    count.title = '녹음 보기·삭제';
    count.onclick = (e) => { e.stopPropagation(); audioSelectClass(c.id); openAudioRec(c.id); };
    row.appendChild(count);
    const del = document.createElement('button');
    del.className = 'class-del'; del.textContent = '✕'; del.title = '삭제';
    del.onclick = (e) => { e.stopPropagation(); audioRemoveClass(c.id); };
    row.appendChild(del);
    div.appendChild(row);

    const rec = document.createElement('button');
    rec.className = 'cap-btn'; rec.type = 'button';
    const isRec = audio.recording && audio.recordingId === c.id;
    rec.disabled = !audio.micStream || audio.recording;
    rec.innerHTML = isRec
      ? `<span class="ci">●</span><span class="cl">녹음 중…</span>`
      : `<span class="ci">🎤</span><span class="cl">녹음</span><span class="cap-count">${c.count}</span>`;
    rec.onclick = (e) => { e.stopPropagation(); audioCaptureFor(c.id); };
    div.appendChild(rec);

    aEls.classList.appendChild(div);
  });
  aEls.classCountMeta.textContent = audio.classes.length + ' / ' + AUDIO_MAX;
  aEls.addClass.disabled = audio.classes.length >= AUDIO_MAX;
  /* 무료 구간의 클래스 수·녹음 상한 — 이미지·동작 트랙과 같은 함수를 쓴다 (기준서 2장). */
  if (window.Access) window.Access.capClasses({
    container: aEls.classList, addBtn: aEls.addClass, countMeta: aEls.classCountMeta,
    count: audio.classes.length, max: AUDIO_MAX, kind: 'records'
  });
  audioUpdateCapTarget();
}
function audioUpdateCapTarget() {
  const sel = audio.classes.find(c => c.id === audio.selectedId);
  aEls.capTargetName.textContent = sel ? sel.name : '—';
}

async function audioToggleMic() {
  if (audio.micStream) {
    audio.micStream.getTracks().forEach(t => t.stop());
    audio.micStream = null;
    if (audio.audioCtx) { audio.audioCtx.close(); audio.audioCtx = null; }
    if (audio.wfRaf) { cancelAnimationFrame(audio.wfRaf); audio.wfRaf = null; }
    aEls.micOverlay.style.display = 'grid';
    aEls.micToggle.textContent = '마이크 켜기';
    audioSetCapEnabled(false);
    aEls.liveDot.classList.remove('on');
    audioStopInfer();
    return;
  }
  try {
    audio.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audio.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audio.audioCtx.createMediaStreamSource(audio.micStream);
    audio.analyser = audio.audioCtx.createAnalyser();
    audio.analyser.fftSize = 2048;
    src.connect(audio.analyser);
    aEls.micOverlay.style.display = 'none';
    aEls.micToggle.textContent = '마이크 끄기';
    audioSetCapEnabled(true);
    aEls.liveDot.classList.add('on');
    audioWaveformLoop();
  } catch (e) {
    aEls.micOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">MIC DENIED</div><div class="ph-msg">마이크 권한을 확인하세요</div></div>';
  }
}

function audioWaveformLoop() {
  if (!audio.analyser) return;
  const cv = aEls.waveform;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const buf = new Uint8Array(audio.analyser.fftSize);
  audio.analyser.getByteTimeDomainData(buf);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2; ctx.strokeStyle = '#06b6d4'; ctx.beginPath();
  const slice = w / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128.0; const y = (v * h) / 2;
    if (i === 0) ctx.moveTo(i * slice, y); else ctx.lineTo(i * slice, y);
  }
  ctx.stroke();
  audio.wfRaf = requestAnimationFrame(audioWaveformLoop);
}

async function audioCaptureFor(id) {
  const sel = audio.classes.find(c => c.id === id);
  if (!sel || !audio.base || !audio.micStream || audio.recording) return;
  if (window.Access && sel.count >= window.Access.limit('records')) return;
  if (!audio.transfer) audio.transfer = audio.base.createTransfer('eddie-audio');
  audioSelectClass(id);
  audio.recording = true; audio.recordingId = id;
  audioRenderClasses(); // 버튼 비활성 + '녹음 중…' 표시
  try {
    await audio.transfer.collectExample(String(sel.id));
    sel.count++;
  } catch (e) { console.error('[audio] collect fail:', e); }
  audio.recording = false; audio.recordingId = null;
  audioRenderClasses(); audioRefresh();
}

async function audioTrain() {
  if (!audio.transfer) return;
  const counts = audio.classes.filter(c => c.count > 0);
  if (counts.length < 2) return;
  aEls.train.disabled = true; aEls.inferToggle.disabled = true;
  const epochs = Math.max(5, Math.min(100, +aEls.epochs.value || 25));
  try {
    await audio.transfer.train({
      epochs,
      callback: {
        onEpochEnd: async (ep, logs) => {
          const p = Math.round(((ep + 1) / epochs) * 100);
          aEls.trainBar.style.width = p + '%';
          aEls.mEpoch.textContent = (ep + 1) + ' / ' + epochs;
          aEls.mLoss.textContent = logs.loss.toFixed(3);
          const acc = logs.acc ?? logs.accuracy;
          aEls.mAcc.textContent = acc != null ? Math.round(acc * 100) + '%' : '—';
        },
      },
    });
    audio.trained = true;
    aEls.train.disabled = false;
    aEls.inferToggle.disabled = !audio.micStream;
    aEls.trainHint.textContent = '학습 완료. 우측 [추론 시작]을 누르세요.';
    audioRenderBars();
  } catch (e) {
    console.error('[audio] train fail:', e);
    aEls.trainHint.textContent = '학습 실패: 각 단어당 최소 8회 녹음이 필요합니다.';
    aEls.train.disabled = false;
  }
}

function audioRenderBars() {
  renderProbBars(aEls.bars, audio.classes, (i) => `a-pct-${i}`, (i) => `a-fill-${i}`);
}

async function audioStartInfer() {
  if (!audio.trained || !audio.transfer) return;
  audio.inferring = true;
  aEls.inferToggle.textContent = '추론 중지';
  aEls.inferMeta.textContent = 'LIVE';
  const labels = audio.transfer.wordLabels();
  await audio.transfer.listen(result => {
    const scores = Array.from(result.scores);
    const idToIdx = {};
    audio.classes.forEach((c, i) => { idToIdx[String(c.id)] = i; });
    audio.classes.forEach((c, i) => {
      const li = labels.indexOf(String(c.id));
      const pct = li >= 0 ? Math.round(scores[li] * 100) : 0;
      const pctEl = $('a-pct-'+i); const fillEl = $('a-fill-'+i);
      if (pctEl) pctEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
    });
    let topI = 0, topV = 0;
    audio.classes.forEach((c, i) => {
      const li = labels.indexOf(String(c.id));
      if (li >= 0 && scores[li] > topV) { topV = scores[li]; topI = i; }
    });
    if (topV > 0.5) {
      aEls.topPred.className = 'top-pred active';
      aEls.topPred.querySelector('.tp-name').textContent = audio.classes[topI].name;
      aEls.topPred.querySelector('.tp-conf').textContent = Math.round(topV*100) + '%';
    }
  }, { probabilityThreshold: 0.5, overlapFactor: 0.5 });
}
async function audioStopInfer() {
  audio.inferring = false;
  aEls.inferToggle.textContent = '추론 시작';
  aEls.inferMeta.textContent = 'IDLE';
  if (audio.transfer && audio.transfer.isListening()) {
    try { await audio.transfer.stopListening(); } catch {}
  }
  aEls.topPred.className = 'top-pred idle';
  aEls.topPred.querySelector('.tp-name').textContent = audio.trained ? '대기 중' : '아직 학습 전';
  aEls.topPred.querySelector('.tp-conf').textContent = '';
}

function audioRefresh() {
  const counts = audio.classes.filter(c => c.count > 0);
  aEls.train.disabled = counts.length < 2 || counts.some(c => c.count < 3);
  audioRenderBars();
  syncStepNav();
}

/* ============================================================
   ▌ 사전학습 추론 — 객체 탐지 (COCO-SSD)
   ============================================================ */
const detect = { model: null, stream: null, raf: null, lastT: 0, threshold: 0.5 };
const dEls = {
  video: $('d-webcam'), overlay: $('d-overlay'), camOverlay: $('d-cam-overlay'),
  camToggle: $('d-cam-toggle'), list: $('d-list'),
  status: $('d-status'), fps: $('d-fps'), count: $('d-count'),
};

async function detectInit() {
  dEls.camToggle.addEventListener('click', detectToggle);
  const thr = document.getElementById('d-thr');
  if (thr) thr.addEventListener('input', () => {
    detect.threshold = (+thr.value) / 100;
    const v = document.getElementById('d-thr-val'); if (v) v.textContent = thr.value + '%';
  });
}
async function detectToggle() {
  if (detect.stream) {
    detect.stream.getTracks().forEach(t => t.stop());
    detect.stream = null; dEls.video.srcObject = null;
    if (detect.raf) cancelAnimationFrame(detect.raf);
    dEls.camOverlay.style.display = 'grid';
    dEls.camToggle.textContent = '카메라 켜기 · 탐지 시작';
    dEls.status.textContent = 'IDLE'; dEls.fps.textContent = '—';
    dEls.list.innerHTML = ''; dEls.count.textContent = '0';
    const ctx = dEls.overlay.getContext('2d');
    ctx.clearRect(0, 0, dEls.overlay.width, dEls.overlay.height);
    return;
  }
  if (!window.cocoSsd) { console.error('[detect] cocoSsd missing'); return; }
  dEls.status.textContent = 'LOADING';
  try {
    if (!detect.model) detect.model = await cocoSsd.load();
    detect.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    dEls.video.srcObject = detect.stream;
    dEls.camOverlay.style.display = 'none';
    dEls.camToggle.textContent = '카메라 끄기';
    dEls.status.textContent = 'LIVE';
    detect.lastT = performance.now();
    detectLoop();
  } catch (e) { console.error('[detect] fail:', e); dEls.status.textContent = 'ERROR'; }
}
async function detectLoop() {
  if (!detect.stream || !detect.model) return;
  if (dEls.video.readyState >= 2) {
    const vw = dEls.video.videoWidth, vh = dEls.video.videoHeight;
    dEls.overlay.width = vw; dEls.overlay.height = vh;
    try {
      const preds = (await detect.model.detect(dEls.video)).filter((p) => p.score >= detect.threshold);
      const ctx = dEls.overlay.getContext('2d');
      ctx.clearRect(0, 0, vw, vh);
      ctx.font = 'bold 16px JetBrains Mono';
      preds.forEach(p => {
        const [x, y, w, h] = p.bbox;
        const mx = vw - x - w; // 비디오가 좌우 반전 표시되므로 박스 X 좌표만 반전(텍스트는 정상 유지)
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 3;
        ctx.strokeRect(mx, y, w, h);
        const label = `${p.class} ${Math.round(p.score*100)}%`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(mx, y - 20, tw + 10, 20);
        ctx.fillStyle = '#000'; ctx.fillText(label, mx + 5, y - 5);
      });
      dEls.count.textContent = preds.length;
      dEls.list.innerHTML = preds.slice(0, 8).map(p => {
        const pct = Math.round(p.score * 100);
        return `<div class="det-row">
          <div class="det-head"><span>${p.class}</span><span class="det-pct">${pct}%</span></div>
          <div class="gauge"><div class="gauge-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
      const now = performance.now();
      const fps = 1000 / (now - detect.lastT); detect.lastT = now;
      dEls.fps.textContent = fps.toFixed(1);
    } catch (e) { /* skip frame */ }
  }
  detect.raf = requestAnimationFrame(detectLoop);
}

/* ============================================================
   ▌ 사전학습 추론 — 인물 분리 (BodyPix)
   ============================================================ */
const seg = { net: null, stream: null, raf: null, mode: 'remove', lastT: 0 };
const sEls = {
  video: $('s-webcam'), canvas: $('s-canvas'), camOverlay: $('s-cam-overlay'),
  camToggle: $('s-cam-toggle'), modeToggle: $('s-mode-toggle'),
  status: $('s-status'), fps: $('s-fps'),
  personPx: $('s-person-px'), ratio: $('s-ratio'), ratioBar: $('s-ratio-bar'),
};
async function segmentInit() {
  sEls.camToggle.addEventListener('click', segmentToggle);
  sEls.modeToggle.addEventListener('click', () => {
    seg.mode = seg.mode === 'remove' ? 'highlight' : 'remove';
    // 버튼은 '전환하면 될 모드'를 표시 (현재 모드와 반대)
    sEls.modeToggle.textContent = seg.mode === 'remove' ? '인물 강조로 전환' : '배경 제거로 전환';
  });
}
async function segmentToggle() {
  if (seg.stream) {
    seg.stream.getTracks().forEach(t => t.stop());
    seg.stream = null; sEls.video.srcObject = null;
    if (seg.raf) cancelAnimationFrame(seg.raf);
    sEls.camOverlay.style.display = 'grid';
    sEls.camToggle.textContent = '카메라 켜기 · 분리 시작';
    sEls.status.textContent = 'IDLE';
    const ctx = sEls.canvas.getContext('2d');
    ctx.clearRect(0, 0, sEls.canvas.width, sEls.canvas.height);
    return;
  }
  if (!window.bodyPix) { console.error('[seg] bodyPix missing'); return; }
  sEls.status.textContent = 'LOADING';
  try {
    if (!seg.net) seg.net = await bodyPix.load({ architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75 });
    seg.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    sEls.video.srcObject = seg.stream;
    await sEls.video.play().catch(() => {});
    sEls.camOverlay.style.display = 'none';
    sEls.camToggle.textContent = '카메라 끄기';
    sEls.status.textContent = 'LIVE';
    seg.lastT = performance.now();
    segmentLoop();
  } catch (e) { console.error('[seg] fail:', e); sEls.status.textContent = 'ERROR'; }
}
async function segmentLoop() {
  if (!seg.stream || !seg.net) return;
  if (sEls.video.readyState >= 2) {
    const vw = sEls.video.videoWidth, vh = sEls.video.videoHeight;
    sEls.canvas.width = vw; sEls.canvas.height = vh;
    try {
      const segmentation = await seg.net.segmentPerson(sEls.video, { internalResolution: 'medium', segmentationThreshold: 0.6 });
      const ctx = sEls.canvas.getContext('2d');
      const mask = segmentation.data;
      // 비디오를 배경 레이어로 그대로 노출하고 캔버스는 투명 오버레이로만 사용한다.
      // (가려진 비디오를 drawImage 하면 일부 브라우저에서 검은 프레임이 나오는 문제 회피)
      const img = ctx.createImageData(vw, vh);
      const data = img.data;
      let personPx = 0;
      for (let i = 0; i < mask.length; i++) {
        const o = i * 4;
        if (mask[i] === 1) {
          personPx++;
          if (seg.mode === 'highlight') {
            // 인물에 진한 시안 틴트 (배경은 투명 → 원본 영상 노출)
            data[o] = 0; data[o+1] = 220; data[o+2] = 255; data[o+3] = 205;
          }
          // remove 모드: 인물은 투명 → 뒤 비디오가 그대로 보임
        } else if (seg.mode === 'remove') {
          // 배경을 선명한 그린(크로마키 느낌)으로 완전히 덮어 분리를 명확히 표시
          data[o] = 16; data[o+1] = 185; data[o+2] = 129; data[o+3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const total = mask.length;
      const ratioPct = personPx * 100 / total;
      sEls.personPx.textContent = personPx.toLocaleString();
      sEls.ratio.textContent = ratioPct.toFixed(1) + '%';
      if (sEls.ratioBar) sEls.ratioBar.style.width = ratioPct.toFixed(1) + '%';
      const now = performance.now();
      const fps = 1000 / (now - seg.lastT); seg.lastT = now;
      sEls.fps.textContent = fps.toFixed(1);
    } catch (e) { /* skip */ }
  }
  seg.raf = requestAnimationFrame(segmentLoop);
}

/* ============================================================
   ▌ 영상처리 — 영상 필터 (CSS 필터) + 모션 감지 (프레임 차분)
   ============================================================ */
const ff = { stream: null, raf: null, mode: 'none', prev: null, lastT: 0, params: { bright: 100, contrast: 100, blur: 0 } };
const ffEls = {
  video: $('ff-webcam'), canvas: $('ff-canvas'), camOverlay: $('ff-cam-overlay'),
  camToggle: $('ff-cam-toggle'), status: $('ff-status'), fps: $('ff-fps'),
  motion: $('ff-motion'), motionBar: $('ff-motion-bar'), modeName: $('ff-mode-name'),
};
const FF_CSS = { none: '', gray: 'grayscale(1)', invert: 'invert(1)', contrast: 'grayscale(1) contrast(4) brightness(1.1)', blur: 'blur(6px)' };
const FF_LABEL = { none: '원본', gray: '흑백', invert: '색 반전', contrast: '고대비', blur: '블러', motion: '모션 감지' };

/* 모드 프리셋 + 사용자 파라미터(밝기/대비/블러)를 합성한 CSS 필터 문자열 */
function ffBuildCSS() {
  const p = ff.params;
  const preset = ff.mode === 'motion' ? '' : (FF_CSS[ff.mode] || '');
  return `${preset} brightness(${p.bright}%) contrast(${p.contrast}%) blur(${p.blur}px)`.trim();
}
function ffApply() {
  if (ff.mode !== 'motion') ffEls.video.style.filter = ffBuildCSS();
}
function ffClearCanvas() {
  const ctx = ffEls.canvas.getContext('2d');
  ctx.clearRect(0, 0, ffEls.canvas.width, ffEls.canvas.height);
}
function ffResetMotion() {
  ff.prev = null;
  if (ffEls.motion) ffEls.motion.textContent = '—';
  if (ffEls.motionBar) ffEls.motionBar.style.width = '0%';
}

function setFilterMode(mode) {
  if (!FF_LABEL[mode]) return;
  ff.mode = mode;
  document.querySelectorAll('.ff-mode').forEach((b) => b.classList.toggle('active', b.dataset.fmode === mode));
  ffEls.modeName.textContent = FF_LABEL[mode];
  const mr = document.getElementById('ff-motion-row'); if (mr) mr.style.display = (mode === 'motion') ? '' : 'none';
  if (mode === 'motion') {
    ffEls.video.style.filter = '';
    ffClearCanvas();
    if (ff.stream) { if (ff.raf) cancelAnimationFrame(ff.raf); motionLoop(); }
  } else {
    if (ff.raf) cancelAnimationFrame(ff.raf);
    ff.raf = null;
    ffEls.video.style.filter = ffBuildCSS();
    ffClearCanvas();
    ffResetMotion();
  }
}

async function filterToggle() {
  if (ff.stream) {
    ff.stream.getTracks().forEach((t) => t.stop());
    ff.stream = null; ffEls.video.srcObject = null;
    if (ff.raf) cancelAnimationFrame(ff.raf); ff.raf = null;
    ffEls.video.style.filter = '';
    ffClearCanvas(); ffResetMotion();
    ffEls.camOverlay.style.display = 'grid';
    ffEls.camToggle.textContent = '카메라 켜기';
    ffEls.status.textContent = 'IDLE'; ffEls.fps.textContent = '—';
    return;
  }
  try {
    ff.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    ffEls.video.srcObject = ff.stream;
    await ffEls.video.play().catch(() => {});
    ffEls.camOverlay.style.display = 'none';
    ffEls.camToggle.textContent = '카메라 끄기';
    ffEls.status.textContent = 'LIVE';
    setFilterMode(ff.mode); // 현재 모드 적용 (CSS 필터 or 모션 루프 시작)
  } catch (e) {
    ffEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}

/* 모션 감지: tf.browser.fromPixels 로 프레임을 읽어(가려진 비디오에서도 안전한 WebGL 경로)
   이전 프레임과의 밝기 차이가 큰 픽셀을 빨갛게 오버레이로 표시한다. */
async function motionLoop() {
  if (ff.mode !== 'motion' || !ff.stream) return;
  if (ffEls.video.readyState >= 2 && window.tf) {
    const W = 160, H = 120;
    try {
      const gray = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(ffEls.video), [H, W]).mean(2));
      const cur = await gray.data(); gray.dispose();
      if (ff.prev && ff.prev.length === cur.length) {
        ffEls.canvas.width = W; ffEls.canvas.height = H;
        const ctx = ffEls.canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        let moved = 0;
        for (let i = 0; i < cur.length; i++) {
          const o = i * 4;
          if (Math.abs(cur[i] - ff.prev[i]) > 22) {
            moved++;
            img.data[o] = 255; img.data[o + 1] = 40; img.data[o + 2] = 70; img.data[o + 3] = 160;
          }
        }
        ctx.putImageData(img, 0, 0);
        const pct = moved * 100 / cur.length;
        ffEls.motion.textContent = pct.toFixed(1) + '%';
        ffEls.motionBar.style.width = Math.min(100, pct * 3).toFixed(0) + '%';
      }
      ff.prev = cur;
      const now = performance.now();
      ffEls.fps.textContent = (1000 / (now - ff.lastT)).toFixed(1); ff.lastT = now;
    } catch (e) { /* skip frame */ }
  }
  ff.raf = requestAnimationFrame(motionLoop);
}

function filterInit() {
  ffEls.camToggle.addEventListener('click', filterToggle);
  document.querySelectorAll('.ff-mode').forEach((b) => {
    b.addEventListener('click', () => setFilterMode(b.dataset.fmode));
  });
  // 파라미터 슬라이더 — 실시간으로 효과 합성
  const bind = (id, key, unit) => {
    const el = document.getElementById(id), val = document.getElementById(id + '-val');
    if (!el) return;
    el.addEventListener('input', () => {
      ff.params[key] = +el.value;
      if (val) val.textContent = el.value + unit;
      ffApply();
    });
  };
  bind('ff-bright', 'bright', '%');
  bind('ff-contrast', 'contrast', '%');
  bind('ff-blur', 'blur', 'px');
  // 원본 비교 — 누르는 동안 필터 해제
  const cmp = document.getElementById('ff-compare');
  if (cmp) {
    const showOrig = () => { if (ff.mode !== 'motion') ffEls.video.style.filter = ''; };
    const restore = () => ffApply();
    cmp.addEventListener('mousedown', showOrig);
    cmp.addEventListener('touchstart', (e) => { e.preventDefault(); showOrig(); });
    cmp.addEventListener('mouseup', restore);
    cmp.addEventListener('mouseleave', restore);
    cmp.addEventListener('touchend', restore);
  }
}

/* ============================================================
   ▌ 영상처리 — 뼈대(포즈) 검출 (MoveNet 재사용, 학습 없음)
   ============================================================ */
const skel = { stream: null, raf: null, lastT: 0, minScore: 0.3 };
const skEls = {
  video: $('sk-webcam'), canvas: $('sk-canvas'), camOverlay: $('sk-cam-overlay'),
  camToggle: $('sk-cam-toggle'), status: $('sk-status'), fps: $('sk-fps'),
  count: $('sk-count'), confBar: $('sk-conf-bar'),
};
function skelInit() {
  skEls.camToggle.addEventListener('click', skelToggle);
  const m = document.getElementById('sk-min');
  if (m) m.addEventListener('input', () => { skel.minScore = (+m.value) / 100; const v = document.getElementById('sk-min-val'); if (v) v.textContent = m.value + '%'; });
}
async function skelToggle() {
  if (skel.stream) {
    skel.stream.getTracks().forEach((t) => t.stop());
    skel.stream = null; skEls.video.srcObject = null;
    if (skel.raf) cancelAnimationFrame(skel.raf); skel.raf = null;
    skEls.canvas.getContext('2d').clearRect(0, 0, skEls.canvas.width, skEls.canvas.height);
    skEls.camOverlay.style.display = 'grid';
    skEls.camToggle.textContent = '카메라 켜기 · 뼈대 시작';
    skEls.status.textContent = 'IDLE'; skEls.fps.textContent = '—'; skEls.count.textContent = '—';
    return;
  }
  try {
    skel.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    skEls.video.srcObject = skel.stream;
    await skEls.video.play().catch(() => {});
    skEls.camOverlay.style.display = 'none';
    skEls.camToggle.textContent = '카메라 끄기';
    skEls.status.textContent = pose.detector ? 'LIVE' : 'MODEL LOADING'; skel.lastT = performance.now();
    skelLoop();
  } catch (e) {
    skEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}
async function skelLoop() {
  if (!skel.stream) return;
  if (skEls.video.readyState >= 2 && pose.detector) {
    const vw = skEls.video.videoWidth, vh = skEls.video.videoHeight;
    skEls.canvas.width = vw; skEls.canvas.height = vh;
    try {
      const poses = await pose.detector.estimatePoses(skEls.video);
      const ctx = skEls.canvas.getContext('2d');
      ctx.clearRect(0, 0, vw, vh);
      let good = 0;
      if (poses[0]) {
        const kp = poses[0].keypoints;
        ctx.strokeStyle = '#0066ff'; ctx.lineWidth = 3;
        POSE_EDGES.forEach(([a, b]) => {
          if (kp[a].score > skel.minScore && kp[b].score > skel.minScore) {
            ctx.beginPath(); ctx.moveTo(kp[a].x, kp[a].y); ctx.lineTo(kp[b].x, kp[b].y); ctx.stroke();
          }
        });
        ctx.fillStyle = '#06b6d4';
        kp.forEach((p) => { if (p.score > skel.minScore) { good++; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); } });
      }
      skEls.status.textContent = 'LIVE';
      skEls.count.textContent = good + ' / 17';
      if (skEls.confBar) skEls.confBar.style.width = Math.round(good / 17 * 100) + '%';
      const now = performance.now();
      skEls.fps.textContent = (1000 / (now - skel.lastT)).toFixed(1); skel.lastT = now;
    } catch (e) { /* skip */ }
  }
  skel.raf = requestAnimationFrame(skelLoop);
}

/* ============================================================
   ▌ 영상처리 — 얼굴 검출 (BlazeFace)
   ============================================================ */
const face = { model: null, stream: null, raf: null, lastT: 0 };
const fcEls = {
  video: $('fc-webcam'), boxes: $('fc-boxes'), camOverlay: $('fc-cam-overlay'),
  camToggle: $('fc-cam-toggle'), status: $('fc-status'), fps: $('fc-fps'),
  count: $('fc-count'), countBar: $('fc-count-bar'),
};
function faceInit() { fcEls.camToggle.addEventListener('click', faceToggle); }
async function faceToggle() {
  if (face.stream) {
    face.stream.getTracks().forEach((t) => t.stop());
    face.stream = null; fcEls.video.srcObject = null;
    if (face.raf) cancelAnimationFrame(face.raf); face.raf = null;
    fcEls.boxes.innerHTML = '';
    fcEls.camOverlay.style.display = 'grid';
    fcEls.camToggle.textContent = '카메라 켜기 · 검출 시작';
    fcEls.status.textContent = 'IDLE'; fcEls.fps.textContent = '—'; fcEls.count.textContent = '0';
    return;
  }
  // 카메라를 먼저 켜고(모델 로드 실패와 무관하게 화면 표시), 모델은 이후 로드
  try {
    face.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    fcEls.video.srcObject = face.stream;
    await fcEls.video.play().catch(() => {});
    fcEls.camOverlay.style.display = 'none';
    fcEls.camToggle.textContent = '카메라 끄기';
    fcEls.status.textContent = 'LOADING'; face.lastT = performance.now();
    faceLoop();
  } catch (e) {
    fcEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
    return;
  }
  try {
    if (!window.blazeface) { fcEls.status.textContent = '모델 없음'; return; }
    if (!face.model) face.model = await blazeface.load();
    fcEls.status.textContent = 'LIVE';
  } catch (e) { console.error('[face] model:', e); fcEls.status.textContent = 'MODEL ERROR'; }
}
// BlazeFace 반환 형태가 버전/차원에 따라 제각각(텐서/[x,y]/[[x1,y1,x2,y2]]/빈배열)이라
// topLeft+bottomRight를 깊게 평탄화해 앞 4개를 [x1,y1,x2,y2]로 사용. 실패 시 landmarks로 박스 생성.
function faceBox(p) {
  const flat = (v) => {
    if (v == null) return [];
    if (typeof v.arraySync === 'function') { try { v = v.arraySync(); } catch (e) { return []; } }
    const out = [];
    (function rec(a) { if (Array.isArray(a)) a.forEach(rec); else if (typeof a === 'number' && Number.isFinite(a)) out.push(a); })(v);
    return out;
  };
  const nums = flat(p.topLeft).concat(flat(p.bottomRight));
  if (nums.length >= 4) {
    const [x1, y1, x2, y2] = nums;
    const w = x2 - x1, h = y2 - y1;
    if (w > 0 && h > 0) return { x: x1, y: y1, w, h };
  }
  let lm = p.landmarks;
  if (lm && typeof lm.arraySync === 'function') { try { lm = lm.arraySync(); } catch (e) { lm = null; } }
  if (Array.isArray(lm) && lm.length) {
    const xs = lm.map(q => q[0]).filter(Number.isFinite), ys = lm.map(q => q[1]).filter(Number.isFinite);
    if (xs.length && ys.length) {
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      return { x: x0 - 25, y: y0 - 45, w: (x1 - x0) + 50, h: (y1 - y0) + 75 };
    }
  }
  return null;
}
async function faceLoop() {
  if (!face.stream || !face.model) { face.raf = requestAnimationFrame(faceLoop); return; }
  if (fcEls.video.readyState >= 2) {
    const vw = fcEls.video.videoWidth, vh = fcEls.video.videoHeight;
    // 표시 영역(컨테이너) 크기 기준으로 object-fit:cover 매핑 → HTML div 박스로 영상 위에 그림
    const W = fcEls.boxes.clientWidth || vw, H = fcEls.boxes.clientHeight || vh;
    try {
      const preds = await face.model.estimateFaces(fcEls.video, false, false, true);
      const scale = Math.max(W / vw, H / vh);
      const offX = (W - vw * scale) / 2, offY = (H - vh * scale) / 2;
      let html = '';
      preds.forEach((p) => {
        const box = faceBox(p);
        if (!box || !Number.isFinite(box.w) || box.w <= 0) return;
        const dw = box.w * scale, dh = box.h * scale;
        const dx = box.x * scale + offX, dy = box.y * scale + offY;
        const left = W - dx - dw; // 영상이 좌우 반전(scaleX(-1))이므로 X 반전
        const prob = Array.isArray(p.probability) ? p.probability[0] : (typeof p.probability === 'number' ? p.probability : 1);
        html += `<div class="det-box" style="left:${left.toFixed(1)}px;top:${dy.toFixed(1)}px;width:${dw.toFixed(1)}px;height:${dh.toFixed(1)}px"><span>FACE ${Math.round(prob * 100)}%</span></div>`;
      });
      fcEls.boxes.innerHTML = html;
      fcEls.count.textContent = preds.length;
      if (fcEls.countBar) fcEls.countBar.style.width = Math.min(100, preds.length * 25) + '%';
      const now = performance.now();
      fcEls.fps.textContent = (1000 / (now - face.lastT)).toFixed(1); face.lastT = now;
    } catch (e) { /* skip */ }
  }
  face.raf = requestAnimationFrame(faceLoop);
}

/* ============================================================
   ▌ 영상처리 — 색상 추적 (RGB 임계값, tf.fromPixels 읽기 + 투명 오버레이)
   ============================================================ */
const ct = { stream: null, raf: null, lastT: 0, target: { r: 220, g: 50, b: 50 }, tol: 140 };
const ctEls = {
  video: $('ct-webcam'), canvas: $('ct-canvas'), camOverlay: $('ct-cam-overlay'),
  camToggle: $('ct-cam-toggle'), status: $('ct-status'), fps: $('ct-fps'),
  meta: $('ct-meta'), matchBar: $('ct-match-bar'),
};
function ctInit() {
  ctEls.camToggle.addEventListener('click', ctToggle);
  document.querySelectorAll('.ct-color').forEach((b) => b.addEventListener('click', () => {
    ct.target = { r: +b.dataset.r, g: +b.dataset.g, b: +b.dataset.b };
    document.querySelectorAll('.ct-color').forEach((x) => x.classList.toggle('active', x === b));
  }));
  const tol = document.getElementById('ct-tol');
  if (tol) tol.addEventListener('input', () => { ct.tol = +tol.value; const v = document.getElementById('ct-tol-val'); if (v) v.textContent = tol.value; });
  // 직접 색 입력 → 입력한 색을 추적 대상으로 (프리셋 선택 해제)
  const pick = document.getElementById('ct-pick');
  if (pick) pick.addEventListener('input', () => {
    const h = pick.value;
    ct.target = { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
    document.querySelectorAll('.ct-color').forEach((x) => x.classList.remove('active'));
  });
}
async function ctToggle() {
  if (ct.stream) {
    ct.stream.getTracks().forEach((t) => t.stop());
    ct.stream = null; ctEls.video.srcObject = null;
    if (ct.raf) cancelAnimationFrame(ct.raf); ct.raf = null;
    ctEls.canvas.getContext('2d').clearRect(0, 0, ctEls.canvas.width, ctEls.canvas.height);
    ctEls.camOverlay.style.display = 'grid';
    ctEls.camToggle.textContent = '카메라 켜기 · 추적 시작';
    ctEls.status.textContent = 'IDLE'; ctEls.fps.textContent = '—'; ctEls.meta.textContent = '—';
    return;
  }
  try {
    ct.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    ctEls.video.srcObject = ct.stream;
    await ctEls.video.play().catch(() => {});
    ctEls.camOverlay.style.display = 'none';
    ctEls.camToggle.textContent = '카메라 끄기';
    ctEls.status.textContent = 'LIVE'; ct.lastT = performance.now();
    ctLoop();
  } catch (e) {
    ctEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}
async function ctLoop() {
  if (!ct.stream) return;
  if (ctEls.video.readyState >= 2 && window.tf) {
    const W = 160, H = 120;
    try {
      const t = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(ctEls.video), [H, W]));
      const d = await t.data(); t.dispose();
      ctEls.canvas.width = W; ctEls.canvas.height = H;
      const ctx = ctEls.canvas.getContext('2d');
      const img = ctx.createImageData(W, H);
      const tg = ct.target; let matched = 0;
      for (let i = 0; i < W * H; i++) {
        const dist = Math.abs(d[i * 3] - tg.r) + Math.abs(d[i * 3 + 1] - tg.g) + Math.abs(d[i * 3 + 2] - tg.b);
        const o = i * 4;
        if (dist < ct.tol) { matched++; /* 매칭 → 투명(뒤 비디오 노출) */ }
        else { img.data[o] = 8; img.data[o + 1] = 10; img.data[o + 2] = 16; img.data[o + 3] = 195; }
      }
      ctx.putImageData(img, 0, 0);
      const pct = matched * 100 / (W * H);
      ctEls.meta.textContent = pct.toFixed(1) + '%';
      if (ctEls.matchBar) ctEls.matchBar.style.width = Math.min(100, pct * 4).toFixed(0) + '%';
      const now = performance.now();
      ctEls.fps.textContent = (1000 / (now - ct.lastT)).toFixed(1); ct.lastT = now;
    } catch (e) { /* skip */ }
  }
  ct.raf = requestAnimationFrame(ctLoop);
}

/* ============================================================
   ▌ 사전학습 추론 — 깊이 추정 (AR Portrait Depth)
   ============================================================ */
const depth = { estimator: null, stream: null, raf: null, lastT: 0 };
const zEls = {
  video: $('z-webcam'), canvas: $('z-canvas'), camOverlay: $('z-cam-overlay'),
  camToggle: $('z-cam-toggle'),
  status: $('z-status'), fps: $('z-fps'), min: $('z-min'), max: $('z-max'),
};
async function depthInit() {
  zEls.camToggle.addEventListener('click', depthToggle);
}
async function depthToggle() {
  if (depth.stream) {
    depth.stream.getTracks().forEach(t => t.stop());
    depth.stream = null; zEls.video.srcObject = null;
    if (depth.raf) cancelAnimationFrame(depth.raf);
    zEls.camOverlay.style.display = 'grid';
    zEls.camToggle.textContent = '카메라 켜기 · 깊이 시작';
    zEls.status.textContent = 'IDLE';
    const ctx = zEls.canvas.getContext('2d');
    ctx.clearRect(0, 0, zEls.canvas.width, zEls.canvas.height);
    return;
  }
  if (!window.depthEstimation) { console.error('[depth] depthEstimation missing'); zEls.status.textContent = 'NOT AVAILABLE'; return; }
  zEls.status.textContent = 'LOADING';
  try {
    if (!depth.estimator) {
      depth.estimator = await depthEstimation.createEstimator(
        depthEstimation.SupportedModels.ARPortraitDepth,
        { minDepth: 0, maxDepth: 1 }
      );
    }
    depth.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    zEls.video.srcObject = depth.stream;
    zEls.camOverlay.style.display = 'none';
    zEls.camToggle.textContent = '카메라 끄기';
    zEls.status.textContent = 'LIVE';
    depth.lastT = performance.now();
    depthLoop();
  } catch (e) { console.error('[depth] fail:', e); zEls.status.textContent = 'ERROR'; }
}
async function depthLoop() {
  if (!depth.stream || !depth.estimator) return;
  if (zEls.video.readyState >= 2) {
    const vw = zEls.video.videoWidth, vh = zEls.video.videoHeight;
    zEls.canvas.width = vw; zEls.canvas.height = vh;
    try {
      const d = await depth.estimator.estimateDepth(zEls.video, { minDepth: 0, maxDepth: 1 });
      const depthCanvas = await d.toCanvasImageSource();
      const ctx = zEls.canvas.getContext('2d');
      ctx.drawImage(depthCanvas, 0, 0, vw, vh);
      const now = performance.now();
      const fps = 1000 / (now - depth.lastT); depth.lastT = now;
      zEls.fps.textContent = fps.toFixed(1);
      zEls.min.textContent = '0.0 (가까움)';
      zEls.max.textContent = '1.0 (멈)';
    } catch (e) { /* skip */ }
  }
  depth.raf = requestAnimationFrame(depthLoop);
}

