/* concept 코스 3번째 탭(고급·응용 — 모델 검증 시뮬레이션) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 3. 고급-응용 (모델 검증) ════ */
let vlStep = 1;
/* 학생 50명의 (공부시간, 수면시간) → c:1 합격(O) / c:0 불합격(X).
   정답 규칙은 "공부시간도 수면시간도 적당해야 합격" 이다. 그래서 덩어리 셋이
   대각선 위에 나란히 놓이고, 합격이 한가운데 낀다:

     왼쪽 위      잠만 자고 공부는 안 함   → 불합격 (4명, 작은 덩어리)
     가운데       둘 다 적당히             → 합격
     오른쪽 아래  공부만 하고 잠은 안 잠   → 불합격 (21명, 큰 덩어리)

   이 배치가 세 가지를 한꺼번에 만든다.
   ① 직선은 가운데 띠를 잘라낼 수 없다 → 낮음(선형)이 구조적으로 실패한다(5명 틀림).
   ② k-means 는 가운데를 가까운 쪽 끝에 붙일 뿐이라 작은 덩어리 4명 + 예외 1명만
      어긋나 일치율이 90%로 높게 나온다 — 이 90%는 AI가 '적당히'를 알아낸 게 아니라
      두 덩어리가 크게 갈라져 있어 생긴 우연이고, 3단계 해설이 그 점을 짚는다.
   ③ 예외 1명(VL_EXCEPTION)은 합격 덩어리 한복판에 있어 과적합 섬이 뚜렷하게 생긴다.

   점 순서에도 뜻이 있다: k-means 초기 중심이 [0, 마지막] 이므로(goToVlStep w===2),
   왼쪽 위 끝 → 오른쪽 아래 끝 순으로 정렬해 씨앗이 양 극단에 놓이게 했다.
   좌표는 scratchpad 검산 스크립트가 황금각 나선으로 균등 배치해 뽑은 값이다
   (최소 간격 0.36 — 점 반지름 6px 에서 겹치지 않는다). */
let vlPts = [
  {x:1.92, y:8.81, c:0}, {x:2.78, y:9.06, c:0}, {x:2.6, y:8.5, c:0}, {x:2.36, y:7.91, c:0},
  {x:4.35, y:6.37, c:1}, {x:5.03, y:6.51, c:1}, {x:4.24, y:5.46, c:1}, {x:5.82, y:6.98, c:1},
  {x:4.77, y:5.82, c:1}, {x:5.64, y:6.28, c:1}, {x:6.3, y:6.56, c:1}, {x:5.07, y:5.27, c:1},
  {x:5.54, y:5.7, c:1}, {x:4.68, y:4.77, c:1},
  {x:5.9, y:5.7, c:0},                                              // ← 예외(VL_EXCEPTION): 둘 다 적당한데 불합격
  {x:6.35, y:5.93, c:1}, {x:4.75, y:4.16, c:1}, {x:6.18, y:5.4, c:1}, {x:7.14, y:6.34, c:1},
  {x:5.4, y:4.53, c:1}, {x:5.96, y:4.84, c:1}, {x:6.99, y:5.76, c:1}, {x:5.7, y:4.01, c:1},
  {x:6.69, y:4.95, c:1}, {x:6.45, y:4.35, c:1}, {x:7.73, y:5.62, c:1}, {x:7.33, y:5.12, c:1},
  {x:6.32, y:3.71, c:1}, {x:7.11, y:4.32, c:1},
  {x:7.56, y:3.05, c:0}, {x:6.8, y:2.06, c:0}, {x:8.32, y:3.49, c:0}, {x:7.31, y:2.4, c:0},
  {x:8.15, y:2.83, c:0}, {x:8.79, y:3.09, c:0}, {x:7.6, y:1.88, c:0}, {x:8.06, y:2.28, c:0},
  {x:7.23, y:1.4, c:0}, {x:8.83, y:2.5, c:0}, {x:7.29, y:0.82, c:0}, {x:8.67, y:2, c:0},
  {x:9.59, y:2.89, c:0}, {x:7.92, y:1.18, c:0}, {x:8.45, y:1.47, c:0}, {x:9.45, y:2.34, c:0},
  {x:8.21, y:0.68, c:0}, {x:9.16, y:1.57, c:0}, {x:8.92, y:1.01, c:0}, {x:9.77, y:1.73, c:0},
  {x:9.56, y:0.97, c:0}
];
/* 과적합의 정의를 대리 지표(경계 굴곡도) 없이 직접 잰다 — "이 예외 한 명까지 맞히려고
   경계를 뒤틀었는가". 보통 복잡도는 이 학생을 구조적으로 포기하고 높음만 맞히므로
   판정이 흔들리지 않는다. 굴곡도를 쓰던 예전 방식은 정답 경계가 띠 모양으로 꺾이는 순간
   못 쓰게 됐다 — 기본 경계부터 길어져서 섬이 생겨도 임계값 근처에 머물기 때문이다. */
const VL_EXCEPTION = 14;
let vlAssign = new Array(vlPts.length).fill(-1);
let vlCents = [];
let vlModel = null, vlGrid = null;

const cvl1 = $('c-vl1');
const cvl4 = $('c-vl4');
const ctx1 = cvl1 ? cvl1.getContext('2d') : null;
const ctx4 = cvl4 ? cvl4.getContext('2d') : null;

/* 군집 번호에는 이름이 없다 — "군집 0"이 합격인지 불합격인지는 사람이 정해야 한다.
   그래서 두 대응(직접/뒤집기) 중 더 잘 맞는 쪽을 골라 일치율을 계산한다. */
function vlAgreement() {
  var direct = 0;
  vlPts.forEach(function (p, i) { if (vlAssign[i] === p.c) direct++; });
  var flipped = vlPts.length - direct;
  var match = Math.max(direct, flipped);
  var useFlip = flipped > direct;
  var missIdx = [];
  vlPts.forEach(function (p, i) {
    var mapped = useFlip ? 1 - vlAssign[i] : vlAssign[i];
    if (mapped !== p.c) missIdx.push(i);
  });
  return { match: match, total: vlPts.length, pct: Math.round(match / vlPts.length * 100), missIdx: missIdx };
}

/* 격자 칸 하나가 곧 그 위치의 예측이다. 점 하나가 어느 칸에 떨어지는지만 찾으면
   모델을 다시 부르지 않고도 그 학생의 예측을 알 수 있다(vlGridOf 의 좌표식을 되돌린 것). */
function vlPredAt(grid, p) {
  var i = Math.min(grid.gw - 1, Math.max(0, Math.floor((p.x / DOM) * grid.gw)));
  var j = Math.min(grid.gh - 1, Math.max(0, Math.floor((1 - p.y / DOM) * grid.gh)));
  return grid.pred[j * grid.gw + i];
}
function vlTrainAcc(grid) {
  var n = 0;
  vlPts.forEach(function (p) { if (vlPredAt(grid, p) === p.c) n++; });
  return n;
}
/* 예외 학생까지 맞혔다 = 그 한 명을 감싸려고 경계를 뒤틀었다 = 과적합. */
function vlCaughtException(grid) {
  var p = vlPts[VL_EXCEPTION];
  return vlPredAt(grid, p) === p.c;
}

/* 복잡도 슬라이더 값이 아니라, 방금 학습된 경계가 실제로 무엇을 맞혔는지로 판정한다. */
function updateOverfitWarning() {
  var warn = $('vl-warn');
  if (!warn || !vlGrid) return;
  var acc = vlTrainAcc(vlGrid);
  var caught = vlCaughtException(vlGrid);
  // 예외를 놓친 건 정상이지만, 다른 학생까지 여럿 놓쳤다면 그건 모델이 너무 단순한 것이다.
  var verdict = caught ? '과적합' : (acc >= vlPts.length - 3 ? '일반화' : '과소적합');
  var readout = $('vl-cx-readout');
  if (readout) {
    readout.textContent = '학습 데이터 ' + acc + '/' + vlPts.length + ' 맞힘 · 예외 학생 ' +
      (caught ? '맞힘' : '놓침') + ' → ' + verdict;
  }
  if (caught) warn.classList.add('show');
  else warn.classList.remove('show');
}

function renderVl() {
  if (vlStep <= 3 && ctx1) {
    ctx1.clearRect(0, 0, CW, CH); frame(ctx1);
    if (vlStep === 1) {
      vlPts.forEach(p => dot(ctx1, p.x, p.y, 6, '#94a3b8')); // 회색 원
    } else if (vlStep === 2) {
      vlPts.forEach((p, i) => dot(ctx1, p.x, p.y, 6, CCLR[vlAssign[i]] || '#94a3b8'));
    } else if (vlStep === 3) {
      vlPts.forEach((p, i) => {
        dot(ctx1, p.x, p.y, 6, CCLR[vlAssign[i]] || '#94a3b8');
        // O/X 그리기
        const [px, py] = toPx(p.x, p.y);
        ctx1.fillStyle = '#fff';
        ctx1.font = 'bold 10px Pretendard';
        ctx1.textAlign = 'center';
        ctx1.textBaseline = 'middle';
        ctx1.fillText(p.c === 1 ? 'O' : 'X', px, py + 1);
      });
    }
  } else if (vlStep === 4 && ctx4) {
    ctx4.clearRect(0, 0, CW, CH);
    if (vlGrid) {
      const gw = vlGrid.gw, gh = vlGrid.gh, cwp = (CW - 2 * PAD) / gw, chp = (CH - 2 * PAD) / gh;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const cls = vlGrid.pred[j * gw + i];
        ctx4.fillStyle = CCLR[cls] + '2e';
        ctx4.fillRect(PAD + i * cwp, PAD + j * chp, cwp + 1, chp + 1);
      }
    }
    frame(ctx4);
    vlPts.forEach(p => {
      dot(ctx4, p.x, p.y, 6, CCLR[p.c]);
      const [px, py] = toPx(p.x, p.y);
      ctx4.fillStyle = '#fff';
      ctx4.font = 'bold 10px Pretendard';
      ctx4.textAlign = 'center';
      ctx4.textBaseline = 'middle';
      ctx4.fillText(p.c === 1 ? 'O' : 'X', px, py + 1);
    });
  }
}

/* 슬라이더를 연달아 움직이면 학습이 겹쳐 실행되고, 먼저 시작한 쪽이 나중에 끝나며
   최신 결과를 덮어쓴다. 요청마다 번호를 매겨 마지막 요청의 결과만 반영한다. */
let vlTrainSeq = 0;

/* 손실이 이 아래로 내려가면 남은 epoch 를 건너뛴다. 임계는 보수적으로 둔다 —
   예외 1명이 아직 틀린 상태면 손실이 0.05 아래로 내려가지 않으므로, 이 값에서는
   '섬이 생기기 전에 멈추는' 일이 없다. */
const VL_LOSS_STOP = 0.01;

/* 복잡도 3은 가중치 초기화가 매번 달라 같은 설정에서도 결과가 갈린다. 예외 1명을
   감싸는 섬이 안 생긴 판이 나오면 과적합 시연 자체가 성립하지 않으므로, 그런 판은
   버리고 다시 초기화해 학습한다(vlCaughtException 으로 판정). */
const VL_MAX_TRIES = 3;

/* 학습이 끝나야 경계·경고가 나온다. 그동안 화면이 멈춘 것처럼 보이던 것을 덮는다. */
function vlTrainProgress(show, pct, tryNo, tries) {
  const ov = $('vl-train-overlay');
  if (!ov) return;
  ov.hidden = !show;
  const el = $('vl-train-pct');
  if (!show || !el) return;
  // 재시도는 숨기지 않는다 — 기다리는 쪽이 왜 길어지는지 알 수 있어야 한다.
  el.textContent = pct + '%' + (tries > 1 && tryNo > 0 ? ' (' + (tryNo + 1) + '/' + tries + '회차)' : '');
}

function buildVlModel(cx) {
  const model = tf.sequential();
  if (cx === 1) {
    // 낮음은 은닉층이 아예 없는 선형 모델이다 — 직선 하나만 그을 수 있어 모서리로 꺾인
    // 정답 경계를 구조적으로 못 따라간다(과소적합). 은닉층을 두면 유닛 4개만으로도
    // 모서리가 만들어져 '보통'과 구별되지 않는다. 그래서 유닛 수가 아니라 층을 뺀다.
    model.add(tf.layers.dense({ inputShape: [2], units: 2, activation: 'softmax' }));
  } else {
    model.add(tf.layers.dense({ inputShape: [2], units: cx === 2 ? 12 : 64, activation: 'relu' }));
    if (cx === 3) {
      model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
      model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    }
    model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));
  }
  const lr = cx === 3 ? 0.1 : 0.05;
  model.compile({ optimizer: tf.train.adam(lr), loss: 'categoricalCrossentropy' });
  return model;
}

/* 화면 전체를 격자로 훑어 각 칸의 예측을 받아 둔다. 배경 칠과 굴곡도 측정이 모두 이걸 쓴다. */
function vlGridOf(model) {
  const gw = 60, gh = 43, cells = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = (i + 0.5) / gw, y = 1 - (j + 0.5) / gh; cells.push([x, y]); }
  return { gw, gh, pred: tf.tidy(() => model.predict(tf.tensor2d(cells)).argMax(1).dataSync()) };
}

async function trainVlModel() {
  const my = ++vlTrainSeq;
  const cx = +$('vl-cx').value;
  const xs = tf.tensor2d(vlPts.map(p => [p.x / DOM, p.y / DOM]));
  const ys = tf.tensor2d(vlPts.map(p => { const o = [0, 0]; o[p.c] = 1; return o; }));

  // 복잡도 3은 예외 1명까지 감싸는 섬이 실제로 만들어져야 과적합 시연이 성립한다.
  // 300 epoch에서는 수렴이 들쭉날쭉해 경고가 뜨다 말다 했으므로 충분히 돌린다.
  const epochs = cx === 3 ? 1200 : 500;

  setStatus('경계 학습 중…', 'busy');
  // 새 결과를 기다리는 동안 이전 복잡도의 경고가 남아 있으면 오해를 부른다. 먼저 내린다.
  const warn = $('vl-warn');
  if (warn) warn.classList.remove('show');

  // 과적합을 보여 주는 게 목적인 복잡도 3에서만 재시도한다. 1·2는 매끈한 경계가 정상이다.
  const tries = cx === 3 ? VL_MAX_TRIES : 1;
  let best = null, bestScore = -1;

  for (let t = 0; t < tries; t++) {
    vlTrainProgress(true, 0, t, tries);
    const model = buildVlModel(cx);
    let shownPct = -1;
    await model.fit(xs, ys, {
      epochs, shuffle: true, batchSize: vlPts.length,
      callbacks: {
        onEpochEnd: (ep, logs) => {
          // 더 최신 요청이 들어왔으면 결과를 버리는 데 그치지 않고 학습 자체를 끊는다.
          if (my !== vlTrainSeq) { model.stopTraining = true; return; }
          // DOM 은 2% 단위로만 건드린다 — 매 epoch 갱신은 학습 스텝보다 비싸다.
          const p = Math.floor((ep + 1) / epochs * 50) * 2;
          if (p !== shownPct) { shownPct = p; vlTrainProgress(true, p, t, tries); }
          if (logs && logs.loss < VL_LOSS_STOP) model.stopTraining = true;
        }
      }
    });

    // 더 최신 요청이 있으면 이 판은 통째로 버린다. 오버레이는 그 최신 요청이 걷는다.
    if (my !== vlTrainSeq) {
      model.dispose();
      if (best) best.model.dispose();
      xs.dispose(); ys.dispose();
      return;
    }

    const grid = vlGridOf(model);
    // 예외를 잡은 판이 무조건 우선, 그 다음이 정확도. 전부 실패해도 경고를 지어내지 않고
    // 가장 나은 판을 보여 준다(= 그 복잡도로는 과적합이 안 나왔다는 사실을 그대로 보여 준다).
    const score = (vlCaughtException(grid) ? 1000 : 0) + vlTrainAcc(grid);
    if (score > bestScore) { if (best) best.model.dispose(); best = { model, grid }; bestScore = score; }
    else model.dispose();
    if (score >= 1000) break;
  }

  xs.dispose(); ys.dispose();

  if (vlModel) vlModel.dispose();
  vlModel = best.model;
  vlGrid = best.grid;

  renderVl();
  updateOverfitWarning();
  vlTrainProgress(false);
  setStatus('준비됨');
}

/* 무리별 인원 — 방금 돌린 군집화의 실제 배정을 센다.
   이름은 반드시 '무리 A/B' 다. 여기서 '합격/불합격'이라 쓰면 군집에는 이름이 없다는
   이 단계의 핵심 메시지가 무너진다(이름 붙이기는 3단계에서 사람이 하는 일로 다룬다). */
const VL_CLUSTER_NAME = ['무리 A', '무리 B', '무리 C'];
function paintVlClusters() {
  var box = $('vl-clusters');
  if (!box) return;
  var counts = vlCents.map(function () { return 0; });
  vlAssign.forEach(function (k) { if (k >= 0 && k < counts.length) counts[k]++; });
  box.innerHTML = counts.map(function (n, k) {
    return '<span class="c"><span class="d" style="background:' + CCLR[k] + '"></span>' +
      VL_CLUSTER_NAME[k] + ' <b>' + n + '명</b></span>';
  }).join('');
}

/* 하드코딩된 문구 대신 방금 돌린 군집화의 실제 결과를 쓴다.
   "AI가 정답을 맞혔다"가 아니라 "겹쳤을 뿐이고 해석은 사람 몫"으로 서술한다. */
function paintVlAgreement() {
  var a = vlAgreement();
  var rate = $('vl-res-rate');
  if (rate) rate.textContent = a.pct + '%';
  var txt = $('vl-res-text');
  if (!txt) return;
  var missNote = a.missIdx.length
    ? '어긋난 ' + a.missIdx.length + '명은 <b>잠만 자고 공부는 하지 않은 학생들</b>입니다. 수가 적다 보니 ' +
      'AI가 가운데 덩어리에 그냥 붙여 버렸습니다. '
    : '';
  txt.innerHTML =
    'AI는 <b>합격·불합격이라는 말을 들은 적이 없습니다.</b> 가까운 것끼리 두 덩어리로 나눴을 뿐인데, 그 결과가 실제 결과와 ' +
    a.match + '/' + a.total + '명(' + a.pct + '%)에서 겹쳤습니다. ' + missNote +
    '<b>하지만 이 ' + a.pct + '%는 실력이 아니라 우연입니다.</b> 실제 합격 기준은 \'공부시간도 수면시간도 적당할 것\' ' +
    '— 그래프 <b>한가운데를 가로지르는 띠</b> 모양입니다. 거리로만 나누는 군집화는 이런 띠를 만들 수 없고, ' +
    '그저 멀찍이 떨어진 두 덩어리를 갈랐을 뿐인데 마침 그 선이 정답 근처를 지나간 것입니다. ' +
    '숫자가 높다고 <b>AI가 기준을 이해했다고 믿으면 안 되는</b> 이유입니다. ' +
    '다음 단계에서 같은 학생들에게 정답을 알려주고 지도학습으로 경계를 그려 보면, 그 띠가 실제로 드러납니다.';
}

function goToVlStep(w) {
  vlStep = w;
  document.querySelectorAll('#flow-valid .fstep').forEach(el => {
    const sw = +el.dataset.vw;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });
  
  document.querySelectorAll('#panel-valid .vstep').forEach(el => {
    el.hidden = (+el.dataset.vw !== w);
  });
  
  const step123 = $('vl-step-123');
  if (step123) step123.style.display = w <= 3 ? 'block' : 'none';

  if (w === 1) {
    // 되돌아왔을 때 이전 단계의 배지가 남지 않도록 초기 상태로 복원한다.
    $('vl-badge').textContent = '정답 숨김 상태 (비지도 학습용)';
    $('vl-badge').className = 'vl-badge';
  } else if (w === 2) {
    // 색은 인라인으로 박지 않고 클래스로 넘긴다(토큰을 벗어난 색이 스며드는 통로였다).
    $('vl-badge').textContent = '패턴 기반 군집화';
    $('vl-badge').className = 'vl-badge unsup';
    // K-means (k=2)
    const idx = [0, vlPts.length - 1]; 
    vlCents = idx.map(i => ({ x: vlPts[i].x, y: vlPts[i].y })); 
    vlAssign = new Array(vlPts.length).fill(-1);
    for (let it = 0; it < 10; it++) if (kmeans2(vlPts, 2, vlCents, vlAssign) === 0) break;
    paintVlClusters();
  } else if (w === 3) {
    $('vl-badge').textContent = '정답(O/X) 공개 (오버레이)';
    $('vl-badge').className = 'vl-badge reveal';
    paintVlAgreement();
  } else if (w === 4) {
    window.CourseDashboard && CourseDashboard.markDone('valid');
    trainVlModel();
  }
  
  renderVl();
}
if (typeof window !== 'undefined') window.goToVlStep = goToVlStep;

const vlSlider = $('vl-cx');
let vlCxTimer = 0;
if (vlSlider) {
  vlSlider.oninput = (e) => {
    const v = +e.target.value;
    $('vl-cxv').textContent = CXLABEL[v];
    // 경고는 슬라이더 값이 아니라 학습 후 실측 굴곡도로 결정한다(trainVlModel 끝에서 호출).
    // 슬라이더를 끌면 값이 여러 번 바뀐다. 마지막 값 하나만 학습해 중첩 학습을 막는다.
    clearTimeout(vlCxTimer);
    vlCxTimer = setTimeout(trainVlModel, 250);
  };
}

/* 개념 정리 퀴즈 — 고른 보기에 정오답을 표시하고, 틀리면 정답 보기도 함께 밝힌다.
   해설까지 카드 안에서 끝내므로 별도의 완료 화면을 두지 않는다. */
const VL_QUIZ_ANSWER = 1;
const VL_QUIZ_EXPLAIN =
  '학습 데이터를 100% 맞히는 것은 좋은 모델의 증거가 아닙니다. 예외 1명까지 감싸느라 경계가 뒤틀리면, ' +
  '앞으로 들어올 새 학생에게는 오히려 더 자주 틀립니다. 반대쪽 극단이 과소적합입니다 — 복잡도 \'낮음\'은 ' +
  '직선 하나만 그을 수 있어 꺾인 정답 경계를 아예 따라가지 못했습니다. 그리고 여기서는 정답 라벨을 주고 ' +
  '학습했으므로 비지도학습도 아닙니다.';

const vlQuiz = $('vl-quiz');
if (vlQuiz) {
  const opts = vlQuiz.querySelectorAll('.qz-btn');
  opts.forEach(btn => {
    btn.addEventListener('click', () => {
      const my = +btn.dataset.i;
      const right = my === VL_QUIZ_ANSWER;
      opts.forEach(b => { b.disabled = true; });
      btn.classList.add(right ? 'correct' : 'wrong');
      if (!right) opts[VL_QUIZ_ANSWER].classList.add('correct');
      // 탭 완료 신호(markDone)와 별개로, 학습자에게 여기서 끝났음을 알린다.
      const doneBadge = $('vl-done-badge');
      if (right && doneBadge) doneBadge.hidden = false;

      const fb = $('vl-quiz-feedback');
      fb.hidden = false;
      fb.className = 'qz-feedback ' + (right ? 'right' : 'miss');
      fb.innerHTML = '<b>' + (right ? '정답입니다' : '오답입니다') + '</b><span>' + VL_QUIZ_EXPLAIN + '</span>';
    });
  });
}

setStatus('준비됨');
document.querySelectorAll('#flow-valid .fstep').forEach(el => {
  el.onclick = () => goToVlStep(+el.dataset.vw);
});
// 각 단계의 "다음으로" 버튼 — 예전에는 마크업에 onclick 으로 박혀 있었다.
document.querySelectorAll('#panel-valid [data-go-vl]').forEach(el => {
  el.onclick = () => goToVlStep(+el.dataset.goVl);
});
// 과적합 경고 안의 "복잡도 낮추기" — 슬라이더를 '보통'으로 되돌리고 재학습시킨다.
const vlWarnFix = $('vl-warn-fix');
if (vlWarnFix && vlSlider) {
  vlWarnFix.onclick = () => {
    vlSlider.value = 2;
    vlSlider.dispatchEvent(new Event('input'));
  };
}
