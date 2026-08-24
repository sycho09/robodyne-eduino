/* concept 코스 3번째 탭(고급·응용 — 모델 검증 시뮬레이션) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 3. 고급-응용 (모델 검증) ════ */
let vlStep = 1;
/* 학생 10명의 (공부시간, 수면시간) → c:1 합격(O) / c:0 불합격(X).
   index 5는 공부시간이 적은데도 합격한 학생으로, 위치만 보는 군집화는 이 학생을
   불합격 무리로 묶는다. 데이터가 완전히 분리되어 있으면 "비지도학습이 정답을 맞힌다"는
   잘못된 인상을 주므로, 겹치는 사례를 일부러 하나 남겨 둔다(→ 일치율 90%). */
let vlPts = [
  {x:2, y:2, c:0}, {x:3, y:1.5, c:0}, {x:5, y:3, c:0}, {x:4, y:2, c:0}, {x:6, y:1.5, c:0},
  {x:4.5, y:2.5, c:1}, {x:8, y:7, c:1}, {x:9, y:6, c:1}, {x:8.5, y:8, c:1}, {x:7.5, y:6, c:1}
];
/* 경계 굴곡도가 이 값을 넘으면 과적합으로 판정한다(격자에서 실측).
   직선에 가까운 경계는 1.0 안팎, 점 하나하나를 감싸며 휘면 급격히 커진다. */
const OVERFIT_RATIO = 1.45;
let vlAssign = new Array(10).fill(-1);
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

/* 결정 경계가 실제로 얼마나 구불구불한지를 격자에서 직접 센다.
   인접 셀의 예측이 갈리는 지점의 수 = 경계선의 길이. 직선이면 최소, 점마다 휘면 급증. */
function boundaryLength(grid) {
  var n = 0;
  for (var j = 0; j < grid.gh; j++) {
    for (var i = 0; i < grid.gw; i++) {
      var c = grid.pred[j * grid.gw + i];
      if (i + 1 < grid.gw && grid.pred[j * grid.gw + i + 1] !== c) n++;
      if (j + 1 < grid.gh && grid.pred[(j + 1) * grid.gw + i] !== c) n++;
    }
  }
  return n;
}

/* 복잡도 슬라이더 값이 아니라, 방금 학습된 경계의 실측 굴곡도로 과적합을 판정한다. */
function updateOverfitWarning() {
  var warn = $('vl-warn-overlay');
  if (!warn || !vlGrid) return;
  var ratio = boundaryLength(vlGrid) / (vlGrid.gw + vlGrid.gh);
  var readout = $('vl-cx-readout');
  if (readout) {
    // 굴곡도 0 = 경계가 아예 없음 = 모델이 한쪽으로만 예측하는 과소적합.
    // 화면이 통째로 한 색이 되는 상황을 버그가 아니라 개념으로 설명해 준다.
    readout.textContent = ratio === 0
      ? '경계 없음 — 모델이 너무 단순해 한쪽으로만 예측합니다 (과소적합)'
      : '경계 굴곡도 ' + ratio.toFixed(2) + ' / 과적합 판정 기준 ' + OVERFIT_RATIO;
  }
  if (ratio >= OVERFIT_RATIO) warn.classList.add('show');
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
        dot(ctx1, p.x, p.y, 8, CCLR[vlAssign[i]] || '#94a3b8');
        // O/X 그리기
        const [px, py] = toPx(p.x, p.y);
        ctx1.fillStyle = '#fff';
        ctx1.font = 'bold 12px Pretendard';
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

async function trainVlModel() {
  const my = ++vlTrainSeq;
  const cx = +$('vl-cx').value;
  const xs = tf.tensor2d(vlPts.map(p => [p.x / DOM, p.y / DOM]));
  const ys = tf.tensor2d(vlPts.map(p => { const o = [0, 0]; o[p.c] = 1; return o; }));

  const model = tf.sequential();
  const units = cx === 1 ? 4 : cx === 2 ? 12 : 64;
  model.add(tf.layers.dense({ inputShape: [2], units, activation: 'relu' }));
  if (cx === 3) {
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  }
  model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));

  const lr = cx === 3 ? 0.1 : 0.05;
  model.compile({ optimizer: tf.train.adam(lr), loss: 'categoricalCrossentropy' });
  // 복잡도 3은 예외 1명까지 감싸는 섬이 실제로 만들어져야 과적합 시연이 성립한다.
  // 300 epoch에서는 수렴이 들쭉날쭉해 경고가 뜨다 말다 했으므로 충분히 돌린다.
  const epochs = cx === 3 ? 1200 : 500;

  setStatus('경계 학습 중…', 'busy');
  await model.fit(xs, ys, { epochs, shuffle: true, batchSize: 10 });
  xs.dispose(); ys.dispose();

  if (my !== vlTrainSeq) { model.dispose(); return; } // 더 최신 요청이 있으면 이 결과는 버린다

  if (vlModel) vlModel.dispose();
  vlModel = model;

  const gw = 60, gh = 43, cells = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = (i + 0.5) / gw, y = 1 - (j + 0.5) / gh; cells.push([x, y]); }
  vlGrid = { gw, gh, pred: tf.tidy(() => vlModel.predict(tf.tensor2d(cells)).argMax(1).dataSync()) };

  renderVl();
  updateOverfitWarning();
  setStatus('준비됨');
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
    ? '나머지 ' + a.missIdx.length + '명은 공부시간이 적은데도 합격해, 위치만 보면 불합격 무리에 더 가까웠던 학생입니다. '
    : '';
  txt.innerHTML =
    'AI는 <b>합격·불합격이라는 말을 들은 적이 없습니다.</b> 가까운 것끼리 두 덩어리로 나눴을 뿐인데, 그 결과가 실제 결과와 ' +
    a.match + '/' + a.total + '명에서 겹쳤습니다. ' + missNote +
    '겹쳤다는 건 AI가 정답을 알아냈다는 뜻이 아니라, <b>공부시간·수면시간 안에 원래 그런 구조가 있었다</b>는 뜻입니다. ' +
    '군집에는 이름이 없으므로 어느 덩어리를 \'합격\'으로 부를지는 사람이 정해야 합니다.';
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
  } else if (w === 3) {
    $('vl-badge').textContent = '정답(O/X) 공개 (오버레이)';
    $('vl-badge').className = 'vl-badge reveal';
    paintVlAgreement();
  } else if (w === 4) {
    trainVlModel();
  }
  
  renderVl();
}
if (typeof window !== 'undefined') window.goToVlStep = goToVlStep;

const vlSlider = $('vl-cx');
if (vlSlider) {
  vlSlider.oninput = (e) => {
    const v = +e.target.value;
    $('vl-cxv').textContent = CXLABEL[v];
    // 경고는 슬라이더 값이 아니라 학습 후 실측 굴곡도로 결정한다(trainVlModel 끝에서 호출).
    trainVlModel();
  };
}

/* 개념 정리 퀴즈 — 고른 보기에 정오답을 표시하고, 틀리면 정답 보기도 함께 밝힌다.
   해설까지 카드 안에서 끝내므로 별도의 완료 화면을 두지 않는다. */
const VL_QUIZ_ANSWER = 1;
const VL_QUIZ_EXPLAIN =
  '학습 데이터를 100% 맞히는 것은 좋은 모델의 증거가 아닙니다. 예외 1명까지 감싸느라 경계가 뒤틀리면, ' +
  '앞으로 들어올 새 학생에게는 오히려 더 자주 틀립니다. 경계가 아예 없는 반대쪽 극단이 과소적합이고, ' +
  '여기서는 정답 라벨을 주고 학습했으므로 비지도학습도 아닙니다.';

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
