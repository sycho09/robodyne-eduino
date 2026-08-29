/* Concept 심화 미션 로직: 모델 복잡도에 따른 과적합 및 검증 시뮬레이션. */
/* ════ 3. 고급-응용 (모델 검증) ════ */
let vlStep = 1;
/* 학생 34명의 (공부시간, 수면시간) 데이터. "적당한 공부와 수면"이 합격(c:1)인 비선형 분포입니다. 
   직선 분리의 한계, k-means의 맹점, 그리고 예외 학생(VL_EXCEPTION)을 통한 과적합 발생을 구조적으로 유도하도록 배치되었습니다. */
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
/* 과적합 판단 기준: 굴곡도 지표 대신 예외 학생 1명을 감싸기 위해 경계를 뒤틀었는지로 직접 확인합니다. */
const VL_EXCEPTION = 11;
let vlAssign = new Array(vlPts.length).fill(-1);
let vlCents = [];
let vlModel = null, vlGrid = null;
/* 마지막으로 완료한 학습 복잡도 (단계 이동 시 재학습 여부 판별용) */
let vlTrainedCx = 0;

const cvl1 = $('c-vl1');
const cvl4 = $('c-vl4');
const ctx1 = cvl1 ? cvl1.getContext('2d') : null;
const ctx4 = cvl4 ? cvl4.getContext('2d') : null;

/* 군집 번호와 합/불합격의 두 가지 매핑(정방향/역방향) 중 더 높은 일치율을 선택합니다. */
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

/* 모델 재호출 없이 격자 배열 위치만으로 해당 좌표의 예측값을 가져옵니다. */
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
/* 예외 학생 정답 처리 = 한 명을 감싸기 위한 경계 왜곡(과적합) */
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

/* 슬라이더 연속 조작 시 발생하는 학습 중첩을 막기 위해 요청 번호를 매겨 최신 결과만 반영합니다. */
let vlTrainSeq = 0;

/* 조기 종료 손실값: 예외 학생이 틀린 상태(손실 0.05 이상)에서 멈추지 않도록 보수적으로 잡습니다. */
const VL_LOSS_STOP = 0.01;

/* 복잡도 3에서 과적합(섬 형성)이 발생하지 않은 경우 최대 3회까지 가중치를 초기화하여 재학습합니다. */
const VL_MAX_TRIES = 3;

/* 학습 중에는 화면 멈춤 방지를 위해 오버레이를 띄웁니다. */
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

/* 화면 전체 격자의 예측값을 계산합니다. (배경 칠하기 및 과적합 판정에 사용) */
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

/* 무리별 인원을 셉니다. '합격/불합격' 대신 '무리 A/B'로 표기하여 비지도학습의 특성을 강조합니다. */
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

/* 실제 군집화 결과를 바탕으로 "AI가 정답을 맞힌 것이 아니라 우연히 겹친 것"이라는 결론을 동적으로 구성합니다. */
function paintVlAgreement() {
  var a = vlAgreement();
  var rate = $('vl-res-rate');
  if (rate) rate.textContent = a.pct + '%';
  var txt = $('vl-res-text');
  if (!txt) return;

  /* 어긋난 학생을 뭉뚱그리지 않고, 예외 1명(4단계 과적합의 주인공)을 여기서 미리 예고합니다. */
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
