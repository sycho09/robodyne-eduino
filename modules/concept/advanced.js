/* concept 코스 3번째 탭(고급·응용 — 모델 검증 시뮬레이션) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 3. 고급-응용 (모델 검증) ════ */
let vlStep = 1;
/* 학생 34명의 (공부시간, 수면시간) → c:1 합격(O) / c:0 불합격(X).
   정답 규칙은 "공부시간도 수면시간도 적당해야 합격" 이다. 그래서 덩어리 셋이
   대각선 위에 나란히 놓이고, 합격이 한가운데 낀다:

     왼쪽 위      잠만 자고 공부는 안 함   → 불합격 (4명, 작은 덩어리)
     가운데       둘 다 적당히             → 합격   (15명, 대각선 띠)
     오른쪽 아래  공부만 하고 잠은 안 잠   → 불합격 (15명, 큰 덩어리)

   이 배치가 세 가지를 한꺼번에 만든다.
   ① 직선은 가운데 띠를 잘라낼 수 없다 → 낮음(선형)이 구조적으로 실패한다(5명 틀림).
   ② k-means 는 가운데를 가까운 쪽 끝에 붙일 뿐이라 작은 덩어리 4명 + 예외 1명만
      어긋나 일치율이 85%로 높게 나온다 — 이 85%는 AI가 '적당히'를 알아낸 게 아니라
      두 덩어리가 크게 갈라져 있어 생긴 우연이고, 3단계 해설이 그 점을 짚는다.
   ③ 예외 1명(VL_EXCEPTION)은 합격 덩어리 한복판에 있어 과적합 섬이 뚜렷하게 생긴다.

   점 순서에도 뜻이 있다: k-means 초기 중심이 [0, 마지막] 이므로(goToVlStep w===2),
   왼쪽 위 끝 → 오른쪽 아래 끝 순으로 정렬해 씨앗이 양 극단에 놓이게 했다.
   좌표는 scratchpad 검산 스크립트가 황금각 나선으로 균등 배치해 뽑은 값이다.

   처음에는 오른쪽 아래 21명·가운데 25명이 한 자리에 몰려 빽빽해 보였다. 그래서 둘 다 15명으로
   솎아 냈다(전체 50 → 34, 세 덩어리 4·15·15). 아무 점이나 빼도 되는 게 아니다 — 덩어리가
   작아지면 k-means 중심이 끌려가 옆 덩어리 학생을 가져가 버리고, 그러면 3단계의 "어긋난 N명은
   잠만 자고 공부는 하지 않은 학생들" 이라는 문구가 거짓이 된다.

   그래서 뺄 조합을 전수로 돌리고, 남은 배치마다 ①②를 실제로 재서 통과한 것만 남겼다.
     ① 은 최적 직선을 전수로 찾아(모든 두 점을 지나는 직선) 그 정확도가 여전히 n-5 이고
        틀리는 점이 0~3번 + 예외뿐인지 — 즉 직선이 아무리 잘 그어도 띠를 못 자르는지 확인.
     ② 는 k-means 를 실제로 돌려 어긋나는 점이 0~3번 + 예외뿐인지 확인.
   통과한 것 중 간격이 가장 고르고, 새 구멍이 생기지 않고, 덩어리 윤곽이 살아 있는 것을 골랐다.
   결과: 점 사이 최소 간격 0.36 → 0.58 (점 반지름 6px 에서 겹치지 않는다).
   덩어리별 평균 간격도 0.64 · 0.69 · 0.66 으로 고르다 — 한 곳만 빽빽해 보이지 않는다.

   예외 학생 옆에 붙어 있던 (5.54, 5.7) · (6.35, 5.93) 도 이때 빠졌다. 예외를 둘러싼 합격
   학생은 그래도 반경 1.2 안에 5명 남는다 — ③의 '덩어리 한복판의 섬' 이 성립하는 최소 조건이다.
   가운데 띠는 아래 오른쪽 끝(6.32, 3.71 부근)이 짧아졌지만, ① 을 실측으로 통과했으므로
   '직선으로 못 자르는 띠' 라는 성질 자체는 그대로다. */
let vlPts = [
  {x:1.92, y:8.81, c:0}, {x:2.78, y:9.06, c:0}, {x:2.6, y:8.5, c:0}, {x:2.36, y:7.91, c:0},
  {x:4.35, y:6.37, c:1}, {x:4.24, y:5.46, c:1}, {x:5.82, y:6.98, c:1}, {x:5.64, y:6.28, c:1},
  {x:6.3, y:6.56, c:1}, {x:5.07, y:5.27, c:1}, {x:4.68, y:4.77, c:1},
  {x:5.9, y:5.7, c:0},                                              // ← 예외(VL_EXCEPTION): 둘 다 적당한데 불합격
  {x:7.14, y:6.34, c:1}, {x:5.4, y:4.53, c:1}, {x:5.96, y:4.84, c:1}, {x:6.69, y:4.95, c:1},
  {x:6.45, y:4.35, c:1}, {x:7.73, y:5.62, c:1}, {x:7.33, y:5.12, c:1},
  {x:7.56, y:3.05, c:0}, {x:6.8, y:2.06, c:0}, {x:8.32, y:3.49, c:0}, {x:8.79, y:3.09, c:0},
  {x:7.6, y:1.88, c:0}, {x:8.06, y:2.28, c:0}, {x:7.29, y:0.82, c:0}, {x:9.59, y:2.89, c:0},
  {x:7.92, y:1.18, c:0}, {x:8.45, y:1.47, c:0}, {x:8.21, y:0.68, c:0}, {x:9.16, y:1.57, c:0},
  {x:8.92, y:1.01, c:0}, {x:9.77, y:1.73, c:0}, {x:9.56, y:0.97, c:0}
];
/* 과적합의 정의를 대리 지표(경계 굴곡도) 없이 직접 잰다 — "이 예외 한 명까지 맞히려고
   경계를 뒤틀었는가". 보통 복잡도는 이 학생을 구조적으로 포기하고 높음만 맞히므로
   판정이 흔들리지 않는다. 굴곡도를 쓰던 예전 방식은 정답 경계가 띠 모양으로 꺾이는 순간
   못 쓰게 됐다 — 기본 경계부터 길어져서 섬이 생겨도 임계값 근처에 머물기 때문이다. */
const VL_EXCEPTION = 11;
let vlAssign = new Array(vlPts.length).fill(-1);
let vlCents = [];
let vlModel = null, vlGrid = null;
/* 마지막으로 학습을 끝낸 복잡도. 단계를 오갈 때 재학습이 필요한지 판단하는 유일한 근거다. */
let vlTrainedCx = 0;

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
  paintVlQuizStem(caught);
}

/* 섬이 안 생긴 판에서도 "섬처럼 휘었습니다"라고 단정하면 바로 위 판정 문구
   ("예외 학생 놓침 → 일반화")와 정면으로 어긋난다. 복잡도 3은 초기화에 따라 갈려서
   VL_MAX_TRIES 로 재시도해도 실패할 수 있으므로, 문제 문장도 실측을 따라간다 —
   경고 배너를 지어내지 않는 것과 같은 규칙이다. 보기·정답·해설은 그대로다. */
function paintVlQuizStem(caught) {
  var stem = $('vl-quiz-stem');
  if (!stem) return;
  var who = '<b>공부시간·수면시간이 모두 적당한데도 불합격한 학생 1명</b>';
  stem.innerHTML = caught
    ? '지금 위 그래프에서 경계가 ' + who + '을 감싸며 섬처럼 휘었습니다. ' +
      '이 상태를 가장 정확히 설명한 것은?'
    : '복잡도를 <b>높음</b>으로 올리면, 경계가 ' + who + '까지 감싸며 섬처럼 휘는 일이 생깁니다 ' +
      '— 초기값에 따라 갈려서 안 나오는 판도 있습니다. 그런 섬이 생겼다면, ' +
      '그 상태를 가장 정확히 설명한 것은?';
}

/* app.js 의 frame() 은 세 탭이 함께 쓴다 — 1번 탭 캔버스는 사용자가 아무 데나 점을 찍는
   자유 좌표라 눈금에 뜻이 없다. 축이 실제 값(공부시간·수면시간)을 가리키는 건 이 탭뿐이라
   여기에만 따로 그린다. 축 이름은 여백(PAD 28px)에 안 들어가서 index.html 이 맡는다. */
const VL_TICKS = [0, 2, 4, 6, 8, 10];
function vlFrame(ctx, grid) {
  const x0 = PAD, y0 = PAD, x1 = CW - PAD, y1 = CH - PAD;
  ctx.save();
  if (grid) {
    // 0·10 은 테두리와 겹치므로 건너뛴다.
    ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = 1;
    VL_TICKS.forEach(function (v) {
      if (v === 0 || v === DOM) return;
      const px = toPx(v, 0)[0], py = toPx(0, v)[1];
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
    });
  }
  frame(ctx);
  ctx.fillStyle = '#98a1b3';
  ctx.font = '10px Pretendard, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  VL_TICKS.forEach(function (v) { ctx.fillText(v, toPx(v, 0)[0], y1 + 7); });
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  VL_TICKS.forEach(function (v) { ctx.fillText(v, x0 - 6, toPx(0, v)[1]); });
  ctx.restore();
}

function renderVl() {
  if (vlStep <= 3 && ctx1) {
    ctx1.clearRect(0, 0, CW, CH); vlFrame(ctx1, true);
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
    vlFrame(ctx4, false);
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
  // 여기까지 왔다는 건 이 판이 최신 요청이라는 뜻이다(위에서 my !== vlTrainSeq 를 이미 걸렀다).
  vlTrainedCx = cx;

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
   "AI가 정답을 맞혔다"가 아니라 "겹쳤을 뿐이고 해석은 사람 몫"으로 서술한다.

   결론(우연이다)은 제목으로 올리고 근거는 라벨 붙은 불릿으로 내린다 — 원인·결과·결론이
   같은 층위로 나열돼 있으면 "그래서 왜 다음 단계가 필요한가"를 학습자가 스스로 이어붙여야
   한다. 결론이 제목으로 빠지는 만큼 불릿이 하나 줄어 전체 길이는 늘지 않는다. */
function paintVlAgreement() {
  var a = vlAgreement();
  var rate = $('vl-res-rate');
  if (rate) rate.textContent = a.pct + '%';
  var txt = $('vl-res-text');
  if (!txt) return;

  /* 어긋난 학생을 "모두 잠만 잔 학생"으로 뭉뚱그리지 않는다. 좌상 덩어리와 예외 학생은
     어긋난 이유가 서로 다르고, 그 예외 1명이 곧 4단계 과적합 시연의 주인공이다.
     여기서 예고해 둬야 4단계에서 "예외 1명"이 난데없이 등장하지 않는다. */
  var sleepy = a.missIdx.filter(function (i) { return i !== VL_EXCEPTION; }).length;
  var excMissed = a.missIdx.indexOf(VL_EXCEPTION) >= 0;
  var missLi = '';
  if (a.missIdx.length) {
    var who = [];
    if (sleepy) who.push(sleepy + '명은 잠만 잔 학생');
    if (excMissed) who.push('1명은 둘 다 적당했는데 불합격한 예외');
    missLi = '<li><b>어긋난 ' + a.missIdx.length + '명</b> — ' + who.join(', ') + '입니다.</li>';
  }

  txt.innerHTML =
    '<p class="vl-res-title">AI가 맞힌 ' + a.pct + '%는 실력이 아니라 <b>우연</b>입니다.</p>' +
    '<p class="vl-res-lead">AI는 합격·불합격을 들은 적이 없습니다. ' +
    '거리가 가까운 학생끼리 두 덩어리로 묶었을 뿐입니다.</p>' +
    '<ul class="vl-res-list">' +
      '<li><b>진짜 기준</b> — 합격은 공부·수면이 둘 다 적당한 학생, 즉 한가운데를 ' +
        '가로지르는 <b>띠</b>입니다.</li>' +
      '<li><b>군집화의 한계</b> — 거리로만 나누면 이런 띠를 만들 수 없습니다. ' +
        '마침 그 선이 정답 근처를 지났을 뿐입니다.</li>' +
      missLi +
    '</ul>' +
    '<p class="vl-res-next">그래서 다음 단계에선 정답을 알려주고 경계를 그려 봅니다.</p>';
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
    // 단계를 오갔다고 다시 학습시키지 않는다 — 복잡도 3은 초기화마다 결과가 갈려서,
    // 재학습하면 방금 본 경계·판정·퀴즈 문장이 통째로 바뀐다. 다시 도는 건 복잡도가
    // 바뀌었을 때뿐이다(슬라이더 oninput 이 직접 부른다).
    if (!vlGrid || vlTrainedCx !== +$('vl-cx').value) trainVlModel();
    else updateOverfitWarning();   // 캔버스는 아래 renderVl() 이 다시 그린다
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
/* 해설은 두 덩어리로 나눈다 — 앞은 정답(B)이 왜 맞는지와 보기 A 반박을 잇는 줄글,
   뒤는 나머지 오답(C·D)의 오답 노트. 예전에는 네 갈래가 연결어 없이 한 문단에 섞여 있었다.
   길게 쓰지 않는다 — 퀴즈를 푼 직후에 읽는 글이라 한 번에 눈에 들어와야 한다.
   "지금 100% 맞혔으니" 같은 단정도 쓰지 않는다 — 섬이 안 생긴 판에서는 거짓이 되어,
   실측을 따라가는 문제 문장(paintVlQuizStem)과 어긋난다. */
const VL_QUIZ_EXPLAIN =
  '<span class="qz-lead">예외 1명까지 맞히려고 경계가 뒤틀리면 학습 데이터는 100% 맞지만, ' +
  '그건 실력이 아니라 <b>외운 것</b>입니다. 학습 점수가 오르는 동안 새 학생에게는 더 자주 ' +
  '틀리게 되는 이 상태가 <b>과적합</b>이고, 그래서 보기 A처럼 100%를 좋은 모델의 증거로 ' +
  '읽으면 안 됩니다.</span>' +
  '<span class="qz-why">' +
    '<span><b>C. 과소적합</b> — 반대쪽 극단입니다. 복잡도가 모자라 학습 데이터에서조차 ' +
      '성적이 나쁜 상태를 말합니다.</span>' +
    '<span><b>D. 비지도학습</b> — 이 단계는 정답 라벨을 주고 학습시켰으니 지도학습입니다.</span>' +
  '</span>';

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
      fb.innerHTML = '<b>' + (right ? '정답입니다' : '오답입니다') + '</b>' + VL_QUIZ_EXPLAIN;
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
