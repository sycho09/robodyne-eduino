const $ = (id) => document.getElementById(id);
function setStatus(t, c) { const s = $('status'); s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }
const CW = 600, CH = 430, PAD = 42, DOM = 10;
const CLR = ['#f0473a', '#4d8dff', '#11a06f', '#d98a1f', '#7c6cff'];

function toPx(x, y) { return [PAD + (x / DOM) * (CW - 2 * PAD), CH - PAD - (y / DOM) * (CH - 2 * PAD)]; }
function toData(px, py) { return [(px - PAD) / (CW - 2 * PAD) * DOM, (CH - PAD - py) / (CH - 2 * PAD) * DOM]; }
function clamp(v) { return Math.max(0, Math.min(DOM, v)); }
function evtData(e) { const r = e.target.getBoundingClientRect(); return toData((e.clientX - r.left) / r.width * CW, (e.clientY - r.top) / r.height * CH); }

function drawAxes(ctx) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.strokeStyle = '#e9ebf2'; ctx.lineWidth = 1;
  for (let i = 0; i <= DOM; i++) {
    const [gx] = toPx(i, 0), [, gy] = toPx(0, i);
    ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, CH - PAD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(CW - PAD, gy); ctx.stroke();
  }
  ctx.strokeStyle = '#c9cedb'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, CH - PAD); ctx.lineTo(CW - PAD, CH - PAD); ctx.stroke();
}
function dot(ctx, x, y, r, fill) { const [px, py] = toPx(x, y); ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
function drawPoints(ctx, pts, color, assign, rad) { pts.forEach((p, i) => dot(ctx, p.x, p.y, rad || 5.5, assign ? CLR[assign[i] % CLR.length] : color)); }
function drawStar(ctx, x, y, color) {
  const [px, py] = toPx(x, y); const R = 11, r = 4.6;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5; const rad = i % 2 ? r : R; const sx = px + Math.cos(ang) * rad, sy = py + Math.sin(ang) * rad; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
}
function drawFn(ctx, fn, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); let s = false;
  for (let x = 0; x <= DOM; x += 0.1) { const y = fn(x); if (!isFinite(y)) continue; const [px, py] = toPx(x, Math.max(-2, Math.min(DOM + 2, y))); s ? ctx.lineTo(px, py) : ctx.moveTo(px, py); s = true; }
  ctx.stroke();
}
function linreg(pts) {
  const n = pts.length; if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  pts.forEach(p => { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
  const mx = sx / n, my = sy / n, cov = sxy / n - mx * my, vx = sxx / n - mx * mx, vy = syy / n - my * my;
  if (vx < 1e-9) return null;
  return { m: cov / vx, b: my - (cov / vx) * mx, r: (vy < 1e-9) ? 0 : cov / Math.sqrt(vx * vy) };
}
function sample(f, noise, n) {
  const a = []; n = n || 12;
  for (let i = 0; i < n; i++) { const x = clamp(0.7 + Math.random() * 8.6); const y = clamp(f(x) + (Math.random() - 0.5) * 2 * noise); a.push({ x: +x.toFixed(2), y: +y.toFixed(2) }); }
  return a;
}

/* ════ 1. 관계 살펴보기 (상관관계 검증 4단계) ════ */
let exStep = 1;
let ex2Phase = 1; // Step 2 진행: 1=기온과의 두 산점도 비교, 2=두 결과끼리 비교 공개
let selVars = [];
const VAR_LABELS = { temp: '기온', ice: '아이스크림 판매량', acc: '물놀이 사고', ac: '에어컨 판매량' };
// Step 3에서 기온을 좁은 구간으로 통제하면 표본이 크게 줄어든다.
// 표본이 작으면 우연만으로 상관이 높게 나와 "통제하면 상관이 사라진다"는 결론이 뒤집히므로,
// 통제 후에도 30개 이상 남도록 넉넉히 생성하고 산점도에는 앞의 60개만 그린다.
let baseData = [];
for(let i=0; i<300; i++) {
  const temp = clamp(1 + Math.random()*8); // 1~9
  baseData.push({
    temp: temp,
    ice: clamp(temp * 1.1 + (Math.random()-0.5)*2),
    acc: clamp(temp * 1.0 + (Math.random()-0.5)*2.5),
    ac: clamp(temp * 1.2 + (Math.random()-0.5)*3)
  });
}
const plotData = baseData.slice(0, 60); // 산점도 표시용 (점이 뭉치지 않도록)

const exCtxMain = $('c-explore-main').getContext('2d');
const exCtxSub = $('c-explore-sub').getContext('2d');
const exCtxReveal = $('c-explore-reveal').getContext('2d');
const exCtxCtrl = $('c-explore-ctrl').getContext('2d');

function updateExNav() {
  document.querySelectorAll('.fstep[data-ex-step]').forEach(b => {
    const s = +b.dataset.exStep;
    b.classList.toggle('active', s === exStep);
    b.classList.toggle('done', s < exStep);
    const fn = b.querySelector('.fn');
    if (fn) fn.textContent = s < exStep ? '✓' : s;
  });
  $('ex-view-12').style.display = (exStep === 1 || exStep === 2) ? 'grid' : 'none';
  $('ex-view-3').style.display = exStep === 3 ? 'block' : 'none';
  $('ex-view-4').style.display = exStep === 4 ? 'block' : 'none';
  
  if(exStep === 1 || exStep === 2) renderVarCharts();
  if(exStep === 3) renderCtrlStep();
}

document.querySelectorAll('.fstep[data-ex-step]').forEach(btn => {
  btn.onclick = () => {
    exStep = +btn.dataset.exStep;
    updateExNav();
  };
});

function renderVarCharts() {
  // Step 2는 준비된 시나리오라 변수 선택 없이도(서브탭 직접 이동) 볼 수 있어야 한다.
  if (exStep === 2) {
    $('ex-card-chart').style.display = 'flex';
    renderTrapStep();
    return;
  }
  if (selVars.length < 2) {
    $('ex-card-chart').style.display = 'none';
    return;
  }
  $('ex-card-chart').style.display = 'flex';
  const v1 = selVars[0], v2 = selVars[1];

  if (exStep === 1) {
    $('ex-chart-main-title').textContent = '데이터의 경향성(상관관계) 확인하기';
    $('ex-chart-desc').textContent = '두 데이터가 함께 움직이는지 확인합니다.';
    $('cbox-main').style.display = 'flex';
    $('cbox-sub').style.display = 'none';
    $('cbox-reveal').style.display = 'none';
    $('cbox-answer').style.display = 'none';
    $('btn-next-step1').style.display = 'inline-flex';
    $('btn-reveal-pair').style.display = 'none';

    $('cbox-main-title').textContent = `${VAR_LABELS[v1]} ↔ ${VAR_LABELS[v2]}`;
    $('ax-main-x').textContent = VAR_LABELS[v1];
    $('ax-main-y').textContent = VAR_LABELS[v2];

    drawAxes(exCtxMain);
    const pts = plotData.map(d => ({x: d[v1], y: d[v2]}));
    drawPoints(exCtxMain, pts, '#11a06f');
  }
}

// Step 2: 기온↔아이스크림 / 기온↔사고를 먼저 비교시킨 뒤,
// 두 결과끼리의 가짜 상관을 공개하는 순서로 진행한다.
function renderTrapStep() {
  $('ex-chart-main-title').textContent = '함정에 빠지기';
  $('cbox-main').style.display = 'flex';
  $('cbox-sub').style.display = 'flex';
  $('btn-next-step1').style.display = 'none';

  $('cbox-main-title').textContent = `기온 ↔ 아이스크림`;
  $('ax-main-x').textContent = '기온';
  $('ax-main-y').textContent = '아이스크림';
  drawAxes(exCtxMain);
  drawPoints(exCtxMain, plotData.map(d => ({x: d.temp, y: d.ice})), '#11a06f');

  $('cbox-sub-title').textContent = `기온 ↔ 물놀이 사고`;
  $('ax-sub-x').textContent = '기온';
  $('ax-sub-y').textContent = '물놀이 사고';
  drawAxes(exCtxSub);
  drawPoints(exCtxSub, plotData.map(d => ({x: d.temp, y: d.acc})), '#4d8dff');

  const picked = selVars.length === 2
    ? `방금 <b>${VAR_LABELS[selVars[0]]} ↔ ${VAR_LABELS[selVars[1]]}</b>를 살펴봤죠. 이번엔 준비된 데이터로 함정을 하나 보겠습니다.<br>`
    : '준비된 데이터로 함정을 하나 보겠습니다.<br>';

  if (ex2Phase === 1) {
    $('ex-chart-desc').innerHTML = picked + '기온이 오르면 <b>아이스크림 판매량</b>도, <b>물놀이 사고</b>도 함께 늘어납니다. 둘 다 기온과 관계가 있네요.';
    $('cbox-reveal').style.display = 'none';
    $('cbox-answer').style.display = 'none';
    $('btn-reveal-pair').style.display = 'inline-flex';
  } else {
    $('ex-chart-desc').innerHTML = picked + '그래서 <b>아이스크림 판매량</b>과 <b>물놀이 사고</b>를 직접 비교해도 <b>강한 상관관계</b>가 나타납니다.<br>그렇다면 아이스크림이 사고의 원인일까요?';
    $('cbox-reveal').style.display = 'flex';
    $('cbox-answer').style.display = 'flex';
    $('btn-reveal-pair').style.display = 'none';
    drawAxes(exCtxReveal);
    drawPoints(exCtxReveal, plotData.map(d => ({x: d.ice, y: d.acc})), '#f0473a');
  }
}

$('var-chips').addEventListener('click', (e) => {
  if (exStep !== 1) return;
  const btn = e.target.closest('button');
  if (!btn) return;
  const v = btn.dataset.var;
  if (selVars.includes(v)) { selVars = selVars.filter(x => x !== v); }
  else { if(selVars.length < 2) selVars.push(v); else { selVars.shift(); selVars.push(v); } }
  
  document.querySelectorAll('#var-chips button').forEach(b => {
    b.classList.toggle('selected', selVars.includes(b.dataset.var));
  });
  
  $('var-status').textContent = selVars.length === 2 ? `선택 완료: ${VAR_LABELS[selVars[0]]} × ${VAR_LABELS[selVars[1]]}` : `변수를 2개 선택해주세요. (현재 ${selVars.length}개 선택)`;
  
  if(selVars.length === 2) renderVarCharts();
  else $('ex-card-chart').style.display = 'none';
});

$('btn-next-step1').onclick = () => { exStep = 2; ex2Phase = 1; updateExNav(); };
$('btn-reveal-pair').onclick = () => { ex2Phase = 2; renderVarCharts(); };
$('btn-cause-infer').onclick = () => { exStep = 3; updateExNav(); };

function renderCtrlStep() {
  const tempThresh = +$('temp-slider').value; // 0 to 100
  $('temp-slider').style.setProperty('--p', tempThresh + '%'); // 공통 .ui-slider 의 채움 비율
  let filtered = baseData;
  
  if (tempThresh > 0) {
     const targetTemp = 8.5; // 폭염 구간에 고정 (슬라이더 라벨과 일치)
     let narrow = 8 - (tempThresh/100)*7; // window narrows from 8 to 1
     const inWindow = (w) => baseData.filter(d => Math.abs(d.temp - targetTemp) <= w/2);
     filtered = inWindow(narrow);
     // 표본이 너무 적으면 창을 조금씩 넓혀 채운다.
     // (원본 무작위 표본으로 대체하면 기온 통제가 풀려 상관이 되살아난다)
     while (filtered.length < 30 && narrow < 8) {
       narrow = Math.min(8, narrow + 0.5);
       filtered = inWindow(narrow);
     }
  }

  drawAxes(exCtxCtrl);
  const pts = filtered.map(d => ({x: d.ice, y: d.acc}));

  // Highlight filtered data in color, others in gray
  const allPts = baseData.map(d => ({x: d.ice, y: d.acc}));
  drawPoints(exCtxCtrl, allPts, '#aeb4c6', null, 3); // 통제 밖 표본 — 흐린 회색(--ink-4)으로 뒤로 물린다
  drawPoints(exCtxCtrl, pts, '#f0473a'); // foreground dots
  
  const r = linreg(pts);
  const score = r ? r.r : 0;
  const sEl = $('ctrl-score');
  sEl.textContent = (score >= 0 ? '+' : '') + score.toFixed(2);
  sEl.className = 'dp-val ' + (score > 0.3 ? 'pos' : '');
  
  if (tempThresh > 80) $('btn-ex-report').style.display = 'inline-flex';
}

$('temp-slider').addEventListener('input', renderCtrlStep);

$('btn-ex-report').onclick = () => { exStep = 4; updateExNav(); };
$('btn-confound-info').onclick = () => $('modal-confound').style.display = 'block';
$('btn-close-confound').onclick = () => $('modal-confound').style.display = 'none';


/* ════ 2. 예측해보기 ════ */
let prPts = [], modelType = 'linear', training = false, raf = null, W1 = null, W2 = null, B = null, trained = false;
const prCtx = $('c-predict').getContext('2d');
function predFn(x) { if (!trained) return null; const xn = x / DOM; return (modelType === 'curve' ? (W2 * xn * xn + W1 * xn + B) : (W1 * xn + B)) * DOM; }
function renderPredict() {
  drawAxes(prCtx);
  if (trained) drawFn(prCtx, (x) => predFn(x), '#f0473a');
  drawPoints(prCtx, prPts, '#4d8dff');
  if (trained) {
    const x = +$('pr-x').value, y = predFn(x);
    if (isFinite(y)) {
      const [px, py] = toPx(x, Math.max(0, Math.min(DOM, y)));
      prCtx.strokeStyle = '#11a06f'; prCtx.lineWidth = 1.5; prCtx.setLineDash([5, 4]);
      prCtx.beginPath(); prCtx.moveTo(px, CH - PAD); prCtx.lineTo(px, py); prCtx.lineTo(PAD, py); prCtx.stroke(); prCtx.setLineDash([]);
      dot(prCtx, x, Math.max(0, Math.min(DOM, y)), 6.5, '#11a06f');
    }
  }
  $('m-n').textContent = prPts.length; $('pr-train').disabled = prPts.length < 2 || training;
}
function updatePred() { const x = +$('pr-x').value; $('pr-xval').textContent = x.toFixed(1); const y = trained ? predFn(x) : null; $('pr-yhat').innerHTML = (y == null) ? '먼저 학습시켜 주세요' : `예측 Y = ${y.toFixed(2)} <small>(X=${x.toFixed(1)})</small>`; renderPredict(); updatePredProc(); updateEqn(); predSayAuto(); }
function procState(el, s) { el.className = 'p' + (s ? ' ' + s : ''); }
function updatePredProc() {
  const ps = [...$('pr-proc').children], has = prPts.length >= 2;
  const active = !has ? 0 : training ? 2 : trained ? 3 : 2;
  ps.forEach((el, i) => procState(el, i < active ? 'done' : i === active ? 'on' : ''));
}
function updateEqn() {
  const e = $('pr-eqn'); if (!trained) { e.hidden = true; return; } e.hidden = false;
  const b10 = B * 10;
  $('pr-eqn-t').textContent = (modelType === 'curve')
    ? `Y = ${(W2 / 10).toFixed(3)} × X² + ${W1.toFixed(2)} × X + ${b10.toFixed(2)}`
    : `Y = ${W1.toFixed(2)} × X + ${b10.toFixed(2)}`;
}
function predSayAuto() {
  if (training) return;
  const has = prPts.length >= 2;
  $('pr-say').innerHTML = !has ? '그래프에 점을 <b>2개 이상</b> 찍어 주세요.'
    : !trained ? '준비됐어요! <b>[AI 학습시키기]</b>를 눌러보세요.'
    : '완성! <b>X 슬라이더</b>를 움직여 새 값을 예측해 보세요.';
}
$('model-seg').addEventListener('click', (e) => { const m = e.target.dataset.model; if (!m) return; modelType = m; $('model-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.model === m)); trained = false; $('pr-x').disabled = true; updatePred(); });
$('pr-x').addEventListener('input', updatePred);
$('pr-sample').onclick = () => { prPts = sample((x) => 0.7 * x + 1.5, 1.1); trained = false; $('pr-x').disabled = true; updatePred(); };
$('pr-clear').onclick = () => { prPts = []; trained = false; training = false; if (raf) cancelAnimationFrame(raf); $('pr-x').disabled = true; $('m-epoch').textContent = '—'; $('m-loss').textContent = '—'; updatePred(); };
$('c-predict').addEventListener('pointerdown', (e) => { if (training) return; const [x, y] = evtData(e); if (x < 0 || x > DOM || y < 0 || y > DOM) return; prPts.push({ x: +x.toFixed(2), y: +y.toFixed(2) }); trained = false; $('pr-x').disabled = true; updatePred(); });
$('pr-train').onclick = () => {
  if (prPts.length < 2 || training) return;
  training = true; setStatus('AI 학습 중…', 'busy'); $('pr-train').disabled = true; $('pr-x').disabled = true;
  $('pr-say').innerHTML = 'AI가 선을 이리저리 옮기며 <b>틀린 정도</b>를 줄이는 중이에요…'; updatePredProc();
  const xs = tf.tensor1d(prPts.map(p => p.x / DOM)), ys = tf.tensor1d(prPts.map(p => p.y / DOM));
  const w1 = tf.variable(tf.scalar(Math.random() * 0.4)), b = tf.variable(tf.scalar(0.3)), w2 = tf.variable(tf.scalar(0));
  const opt = tf.train.adam(0.08), curve = modelType === 'curve';
  const pred = (xt) => curve ? w2.mul(xt.square()).add(w1.mul(xt)).add(b) : w1.mul(xt).add(b);
  const TOTAL = 240; let ep = 0;
  function stepFn() {
    let lossV = 0;
    for (let k = 0; k < 4 && ep < TOTAL; k++, ep++) { const l = opt.minimize(() => tf.losses.meanSquaredError(ys, pred(xs)), true); lossV = l.dataSync()[0]; l.dispose(); }
    W1 = w1.dataSync()[0]; W2 = w2.dataSync()[0]; B = b.dataSync()[0]; trained = true;
    $('m-epoch').textContent = ep + ' / ' + TOTAL; $('m-loss').textContent = (lossV * DOM * DOM).toFixed(2); renderPredict(); updateEqn(); updatePredProc();
    if (ep < TOTAL) raf = requestAnimationFrame(stepFn);
    else { xs.dispose(); ys.dispose(); w1.dispose(); w2.dispose(); b.dispose(); training = false; $('pr-x').disabled = false; $('pr-train').disabled = false; setStatus('학습 완료 · READY', 'ready'); updatePred(); }
  }
  stepFn();
};

/* ════ 3. 무리 짓기 (고객 세그먼트 분석 4단계) ════ */
function kmeans(pts, K, centroids, assign) {
  let changed = 0;
  pts.forEach((p, i) => { let best = 0, bd = Infinity; centroids.forEach((c, k) => { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bd) { bd = d; best = k; } }); if (assign[i] !== best) { assign[i] = best; changed++; } });
  const sum = centroids.map(() => ({ x: 0, y: 0, n: 0 }));
  pts.forEach((p, i) => { const s = sum[assign[i]]; s.x += p.x; s.y += p.y; s.n++; });
  centroids.forEach((c, k) => { if (sum[k].n) { c.x = sum[k].x / sum[k].n; c.y = sum[k].y / sum[k].n; } });
  return changed;
}

let clStep = 1;
let clPts = [], clK = 3, clAssign = [], clCents = [], clTimer = null, clustered = false;
const clCtx = $('c-cluster').getContext('2d');
const clCtxRes = $('c-cluster-res').getContext('2d');

// Generate 40 fixed customer points
function makeCustomerData() {
  const centers = [{ x: 3, y: 2 }, { x: 8, y: 8 }, { x: 7, y: 2 }];
  const a = [];
  for (let g = 0; g < 3; g++) { 
    const c = centers[g]; 
    const n = (g===0)? 15 : (g===1)? 10 : 15;
    for (let i = 0; i < n; i++) a.push({ x: +clamp(c.x + (Math.random() - 0.5) * 2).toFixed(2), y: +clamp(c.y + (Math.random() - 0.5) * 2).toFixed(2) }); 
  }
  return a;
}
clPts = makeCustomerData();

function updateClNav() {
  document.querySelectorAll('.fstep[data-cl-step]').forEach(b => {
    const s = +b.dataset.clStep;
    b.classList.toggle('active', s === clStep);
    b.classList.toggle('done', s < clStep);
    const fn = b.querySelector('.fn');
    if (fn) fn.textContent = s < clStep ? '✓' : s;
  });
  
  $('cl-view-12').style.display = (clStep === 1 || clStep === 2) ? 'grid' : 'none';
  $('cl-view-3').style.display = clStep === 3 ? 'block' : 'none';
  $('cl-view-4').style.display = clStep === 4 ? 'block' : 'none';

  if (clStep === 1) {
    $('cl-step1-ctrl').style.display = 'flex';
    $('cl-step2-res').style.display = 'none';
    renderCluster();
  } else if (clStep === 2) {
    $('cl-step1-ctrl').style.display = 'none';
    $('cl-step2-res').style.display = 'block';
  } else if (clStep === 3) {
    renderClusterRes();
    buildSegmentCards();
  } else if (clStep === 4) {
    buildDecisionButtons();
  }
}

document.querySelectorAll('.fstep[data-cl-step]').forEach(btn => {
  btn.onclick = () => {
    clStep = +btn.dataset.clStep;
    updateClNav();
  };
});

function renderCluster() {
  drawAxes(clCtx);
  drawPoints(clCtx, clPts, '#8c97a7', clustered ? clAssign : null);
  if (clustered) clCents.forEach((c, k) => drawStar(clCtx, c.x, c.y, CLR[k % CLR.length]));
}

function renderClusterRes() {
  drawAxes(clCtxRes);
  drawPoints(clCtxRes, clPts, '#8c97a7', clustered ? clAssign : null);
}

$('k-seg').addEventListener('click', (e) => { 
  if(clStep !== 1) return;
  const k = +e.target.dataset.k; 
  if (!k) return; 
  clK = k; 
  $('k-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.k === k)); 
});

function stopCluster() { if (clTimer) { clearInterval(clTimer); clTimer = null; } }

$('btn-run-cluster').onclick = () => {
  clStep = 2; updateClNav();
  stopCluster();
  
  const idx = []; while (idx.length < clK) { const r = Math.floor(Math.random() * clPts.length); if (!idx.includes(r)) idx.push(r); }
  clCents = idx.map(i => ({ x: clPts[i].x, y: clPts[i].y }));
  clAssign = new Array(clPts.length).fill(-1); clustered = true;
  
  setStatus('AI 군집화 진행 중...', 'busy'); 
  let it = 0;
  clTimer = setInterval(() => {
    const changed = kmeans(clPts, clK, clCents, clAssign);
    it++; renderCluster();
    $('cl-it').textContent = it; $('cl-changed').textContent = changed + '명';
    
    // Group count render
    const counts = clCents.map(() => 0); clAssign.forEach(a => counts[a]++);
    $('cl-groups').innerHTML = counts.map((n, k) => `<div class="group"><span class="dot" style="background:${CLR[k % CLR.length]}"></span><span class="gname">고객군 ${k + 1}</span><span class="gcount">${n}명</span></div>`).join('');
    
    if (it > 1) $('cl-groups-wrap').style.display = 'block';

    if (changed === 0 || it >= 12) {
      stopCluster(); clustered = true; renderCluster();
      setStatus('AI 군집화 완료', 'ready');
    }
  }, 480);
};

$('btn-cl-naming').onclick = () => { clStep = 3; updateClNav(); };

function buildSegmentCards() {
  const counts = clCents.map(() => 0); 
  const sumX = clCents.map(() => 0);
  const sumY = clCents.map(() => 0);
  clAssign.forEach((a, i) => { counts[a]++; sumX[a]+=clPts[i].x; sumY[a]+=clPts[i].y; });
  
  let html = '';
  clCents.forEach((_, k) => {
    if(counts[k] === 0) return;
    const avgX = (sumX[k]/counts[k]); // 0~10 scale -> map to 1~20 visits
    const avgY = (sumY[k]/counts[k]); // 0~10 scale -> map to 1~200k KRW
    
    const visits = Math.max(1, Math.round(avgX * 2));
    const amount = Math.max(1, Math.round(avgY * 2)); // in 10k won

    html += `<div class="segment-card">
      <div class="segment-color" style="background:${CLR[k % CLR.length]}"></div>
      <div class="segment-info">평균 ${visits}회 방문 · ${amount}만 원</div>
      <input type="text" id="seg-name-${k}" placeholder="이름 입력 (예: 충성 고객, 이탈 위험군)" oninput="checkSegNames()">
    </div>`;
  });
  $('segment-list').innerHTML = html;
  checkSegNames();
}

window.checkSegNames = function() {
  let allFilled = true;
  for(let k=0; k<clK; k++) {
    const el = $(`seg-name-${k}`);
    if(el && el.value.trim() === '') allFilled = false;
  }
  $('btn-next-step4').disabled = !allFilled;
}

$('btn-next-step4').onclick = () => { clStep = 4; updateClNav(); };

function buildDecisionButtons() {
  let html = '';
  clCents.forEach((_, k) => {
    const name = $(`seg-name-${k}`) ? $(`seg-name-${k}`).value : `고객군 ${k+1}`;
    html += `<div class="decision-btn" onclick="selectDecision(${k}, this)">
      <div class="segment-color" style="background:${CLR[k % CLR.length]}; margin:0 auto 8px;"></div>
      <div class="decision-btn-title">${name}</div>
    </div>`;
  });
  $('decision-options').innerHTML = html;
  checkDecisionReady();
}

let selectedDecision = -1;
window.selectDecision = function(k, el) {
  selectedDecision = k;
  document.querySelectorAll('.decision-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  checkDecisionReady();
}

$('decision-reason').addEventListener('input', checkDecisionReady);

function checkDecisionReady() {
  const reason = $('decision-reason').value.trim();
  $('btn-finish-cluster').disabled = (selectedDecision === -1 || reason.length < 5);
}

$('btn-finish-cluster').onclick = () => {
  if (typeof CourseDashboard !== 'undefined') {
    CourseDashboard.finish();
  }
};


/* ── 단계 전환 ── */
document.querySelectorAll('.step').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.step').forEach(b => b.classList.toggle('active', b === btn));
    const s = btn.dataset.step;
    $('panel-explore').hidden = s !== 'explore'; $('panel-predict').hidden = s !== 'predict'; $('panel-cluster').hidden = s !== 'cluster';
    if (s === 'explore') updateExNav(); else if (s === 'predict') updatePred(); else { stopCluster(); updateClNav(); }
    setStatus('준비됨');
  };
});

updateExNav(); updatePred(); updateClNav(); setStatus('준비됨');