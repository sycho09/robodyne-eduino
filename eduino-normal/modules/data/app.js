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
// 축 순서를 고정해 쌍이 바뀌어도 일관된 레이아웃(가로/세로)을 유지합니다.
const VAR_ORDER = ['temp', 'ice', 'acc', 'ac'];
const orderPair = (vs) => [...vs].sort((a, b) => VAR_ORDER.indexOf(a) - VAR_ORDER.indexOf(b));
// 축 이름은 플롯 오른쪽 위 태그 하나로 적는다 (모듈 공통 형식).
const axisTag = (x, y) => `X축: ${x} / Y축: ${y}`;
/* 변수명 마지막 글자의 종성(받침) 유무에 따라 조사를 선택합니다. */
function particle(word, withBatchim, withoutBatchim) {
  const c = word.charCodeAt(word.length - 1) - 0xAC00;
  const has = c >= 0 && c <= 11171 && c % 28 !== 0;
  return has ? withBatchim : withoutBatchim;
}
let revealAnim = false; // 함정 공개 연출은 버튼을 누른 그 순간에만
// 폭염이 각 결과를 밀어 올리는 경로 — 4단계 리포트의 "결과 N · …" 에 쓴다.
const VAR_WHY = { ice: '더위 회피 소비', acc: '피서객 증가', ac: '냉방 수요 증가' };

/* '기온'이 포함된 진짜 인과관계 쌍은 제3변수 통제(함정 실습) 시 성립하지 않으므로, 이때는 임의의 가짜 인과 쌍으로 교체하여 진행합니다. */
function trapPair() {
  const [a, b] = orderPair(selVars);
  const own = selVars.length === 2 && a !== 'temp';
  return { v1: own ? a : 'ice', v2: own ? b : 'acc', own };
}
/* 제3변수(기온) 통제 시 표본 수가 줄어들어 상관관계가 우연히 높게 나오는 현상을 막기 위해, 초기 데이터를 4000개 생성해 통제 후에도 충분한 표본을 남깁니다. (값 상한 10 초과 방지) */
let baseData = [];
for(let i=0; i<4000; i++) {
  const temp = clamp(1 + Math.random()*8); // 1~9
  baseData.push({
    temp: temp,
    ice: clamp(temp * 0.95 + (Math.random()-0.5)*2),   // 최대 9.55
    acc: clamp(temp * 0.90 + (Math.random()-0.5)*2.4), // 최대 9.30
    ac:  clamp(temp * 0.98 + (Math.random()-0.5)*2)    // 최대 9.82
  });
}
const plotData = baseData.slice(0, 60);   // 산점도 표시용 (점이 뭉치지 않도록)
const ctrlBgData = baseData.slice(0, 260); // 통제 차트의 회색 배경 — 전부 그리면 화면이 뭉갠다

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
  /* 완료 신호는 단계 버튼을 통한 4단계 진입 시에도 정상 처리되도록 '리포트에 도달'할 때 보냅니다. */
  if (exStep === 4) { renderCausalReport(); window.CourseDashboard && CourseDashboard.markDone('explore'); }
  
  if(exStep === 1 || exStep === 2) renderVarCharts();
  if(exStep === 3) renderCtrlStep();
}

document.querySelectorAll('.fstep[data-ex-step]').forEach(btn => {
  btn.onclick = () => {
    exStep = +btn.dataset.exStep;
    updateExNav();
  };
});

/* 단계(p1~p3)에 따라 카드의 레이아웃과 노출 차트 수를 변경합니다. */
function setExLayout(phase) {
  $('ex-card-explore').classList.toggle('solo', phase !== 'p1');
  $('ex-side').hidden = phase !== 'p1';
  $('ex-var-summary').hidden = phase === 'p1';
  $('ex-head').hidden = phase === 'p1';
  $('ex-charts-container').className = 'ex-charts ' + phase;
}

// Step 2 진입 시, 1단계에서 고른 내용을 과거형으로 요약해 상단에 남깁니다.
function renderVarSummary() {
  const [v1, v2] = orderPair(selVars);
  $('ex-var-summary-txt').innerHTML = selVars.length === 2
    ? `1단계에서 고른 조합: <b>${VAR_LABELS[v1]}</b> × <b>${VAR_LABELS[v2]}</b>`
    : '준비된 데이터로 함정을 살펴봅니다.';
}

/* 4단계 리포트: 공통 원인(폭염)은 고정하고, 두 결과 상자의 텍스트만 쌍에 맞게 교체합니다. */
function renderCausalReport() {
  const { v1, v2 } = trapPair();
  $('node-r1').textContent = `${VAR_LABELS[v1]} 증가`;
  $('node-r1-why').textContent = `결과 1 · ${VAR_WHY[v1]}`;
  $('node-r2').textContent = `${VAR_LABELS[v2]} 증가`;
  $('node-r2-why').textContent = `결과 2 · ${VAR_WHY[v2]}`;
}

function renderVarCharts() {
  // Step 2는 준비된 시나리오라 변수 선택 없이도(서브탭 직접 이동) 볼 수 있어야 한다.
  if (exStep === 2) {
    renderVarSummary();
    renderTrapStep();
    return;
  }

  const ready = selVars.length === 2;
  setExLayout('p1');
  ['cbox-reveal', 'cbox-answer'].forEach(id => $(id).classList.remove('reveal-in'));
  $('ex-chart-empty').hidden = ready;
  $('ex-charts-container').hidden = !ready;
  $('ex-actions').hidden = !ready;
  $('btn-next-step1').hidden = !ready;
  $('btn-reveal-pair').hidden = true;
  $('cbox-main').hidden = false;
  $('cbox-sub').hidden = true;
  $('cbox-reveal').hidden = true;
  $('cbox-answer').hidden = true;
  if (!ready) return;

  // 축은 클릭 순서가 아니라 고정 차례로 정한다 — 같은 쌍이 매번 같은 모양으로 나오게.
  const [v1, v2] = orderPair(selVars);
  $('ax-main').textContent = axisTag(VAR_LABELS[v1], VAR_LABELS[v2]);

  drawAxes(exCtxMain);
  drawPoints(exCtxMain, plotData.map(d => ({x: d[v1], y: d[v2]})), '#11a06f');
}

// Step 2: 두 값과 기온의 관계를 각각 보여준 뒤,
// 두 결과끼리의 가짜 상관을 공개하는 순서로 진행한다.
function renderTrapStep() {
  const { v1, v2, own } = trapPair();
  const L1 = VAR_LABELS[v1], L2 = VAR_LABELS[v2];

  setExLayout(ex2Phase === 1 ? 'p2' : 'p3');
  $('ex-chart-main-title').textContent = '함정에 빠지기';
  $('ex-chart-empty').hidden = true;
  $('ex-charts-container').hidden = false;
  $('cbox-main').hidden = false;
  $('cbox-sub').hidden = false;
  $('btn-next-step1').hidden = true;

  // 제목이 쌍 이름을 말해도 축 이름은 항상 함께 적는다 — 어느 값이 어느 축인지는 제목이 알려주지 못한다.
  $('cbox-main-title').textContent = `기온 ↔ ${L1}`;
  $('ax-main').textContent = axisTag('기온', L1);
  drawAxes(exCtxMain);
  drawPoints(exCtxMain, plotData.map(d => ({x: d.temp, y: d[v1]})), '#11a06f');

  $('cbox-sub-title').textContent = `기온 ↔ ${L2}`;
  $('ax-sub').textContent = axisTag('기온', L2);
  drawAxes(exCtxSub);
  drawPoints(exCtxSub, plotData.map(d => ({x: d.temp, y: d[v2]})), '#4d8dff');

  /* 1단계에서 기온이 낀 쌍을 골랐다면 그것은 '진짜 인과'였음을 안내해 줍니다. */
  const [s1, s2] = orderPair(selVars);
  let picked;
  if (own) {
    picked = `방금 고른 <b>${L1} ↔ ${L2}</b>, 둘 다 기온과도 관계가 있습니다.<br>`;
  } else if (selVars.length === 2) {
    picked = `방금 고른 <b>${VAR_LABELS[s1]} ↔ ${VAR_LABELS[s2]}</b>${particle(VAR_LABELS[s2], '은', '는')} <b>진짜 관계</b>입니다 — 기온이 원인이니까요.<br>그럼 어느 쪽도 원인이 아닌 쌍은 어떨까요?<br>`;
  } else {
    picked = '준비된 데이터로 함정을 하나 보겠습니다.<br>';
  }

  if (ex2Phase === 1) {
    $('ex-chart-desc').innerHTML = picked + `기온이 오르면 <b>${L1}</b>도, <b>${L2}</b>도 함께 늘어납니다. 둘 다 기온과 관계가 있네요.`;
    $('cbox-reveal').hidden = true;
    $('cbox-answer').hidden = true;
    $('ex-actions').hidden = false;
    $('btn-reveal-pair').hidden = false;
  } else {
    $('ex-chart-desc').innerHTML = picked
      + `그래서 <b>${L1}</b>${particle(L1, '과', '와')} <b>${L2}</b>${particle(L2, '을', '를')} 직접 비교해도 <b>강한 상관관계</b>가 나타납니다.`
      + `<br>그렇다면 ${L1}${particle(L1, '이', '가')} ${L2}의 원인일까요?`;
    $('cbox-reveal-title').textContent = `${L1} ↔ ${L2}`;
    $('ax-reveal').textContent = axisTag(L1, L2);
    $('cbox-reveal').hidden = false;
    $('cbox-answer').hidden = false;
    // 징검다리였던 버튼은 사라진다 — 새로 나타난 두 칸까지의 스크롤을 그만큼 줄인다.
    $('ex-actions').hidden = true;
    $('btn-reveal-pair').hidden = true;
    drawAxes(exCtxReveal);
    drawPoints(exCtxReveal, plotData.map(d => ({x: d[v1], y: d[v2]})), '#f0473a');
    // 연출은 버튼을 눌러 공개한 그 순간에만. 단계를 되짚어 다시 그릴 때는 조용히 나타나야 한다.
    ['cbox-reveal', 'cbox-answer'].forEach(id => {
      const el = $(id);
      el.classList.remove('reveal-in');
      if (revealAnim) { void el.offsetWidth; el.classList.add('reveal-in'); }
    });
    revealAnim = false;
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
  
  const [s1, s2] = orderPair(selVars);
  $('var-status').textContent = selVars.length === 2 ? `선택 완료: ${VAR_LABELS[s1]} × ${VAR_LABELS[s2]}` : `변수를 2개 선택해주세요. (현재 ${selVars.length}개 선택)`;
  
  renderVarCharts();
});

$('btn-next-step1').onclick = () => { exStep = 2; ex2Phase = 1; updateExNav(); };
$('btn-reveal-pair').onclick = () => { ex2Phase = 2; revealAnim = true; renderVarCharts(); };
// 요약 바에서 1단계로 돌아가기
$('btn-cause-infer').onclick = () => { exStep = 3; updateExNav(); };

function renderCtrlStep() {
  const tempThresh = +$('temp-slider').value; // 0 to 100
  $('temp-slider').style.setProperty('--p', tempThresh + '%'); // 공통 .ui-slider 의 채움 비율
  let filtered = baseData;
  const targetTemp = 8.5; // 폭염 구간에 고정
  let narrow = 8;         // 남은 기온 창의 폭 — 아래 판독값이 이 최종값을 쓴다

  if (tempThresh > 0) {
     // 창을 ±0.3 까지 좁힌다 — 기온이 거의 고정돼야 남은 상관이 0 근처로 떨어진다.
     narrow = 8 - (tempThresh/100)*7.4; // 8 → 0.6
     const inWindow = (w) => baseData.filter(d => Math.abs(d.temp - targetTemp) <= w/2);
     filtered = inWindow(narrow);
     // 표본이 너무 적으면 창을 조금씩 넓혀 채운다.
     // (원본 무작위 표본으로 대체하면 기온 통제가 풀려 상관이 되살아난다)
     while (filtered.length < 60 && narrow < 8) {
       narrow = Math.min(8, narrow + 0.5);
       filtered = inWindow(narrow);
     }
  }

  /* 기온 구간(1~9)을 화면 표시용 섭씨(20~35°C)로 변환합니다. 데이터에 없는 범위 노출을 막기 위해 1~9로 제한합니다. */
  const inTempRange = (t) => Math.max(1, Math.min(9, t));
  const toCelsius = (t) => 20 + (t - 1) / 8 * 15;
  const lo = tempThresh > 0 ? inTempRange(targetTemp - narrow/2) : 1;
  const hi = tempThresh > 0 ? inTempRange(targetTemp + narrow/2) : 9;
  $('temp-range').textContent = `${Math.round(toCelsius(lo))} ~ ${Math.round(toCelsius(hi))}°C`;
  $('temp-kept').textContent = tempThresh > 0
    ? `전체의 ${Math.max(1, Math.round(filtered.length / baseData.length * 100))}%`
    : '전체 데이터';

  const { v1, v2 } = trapPair();
  const L1 = VAR_LABELS[v1], L2 = VAR_LABELS[v2];
  $('ax-ctrl').textContent = axisTag(L1, L2);
  $('ctrl-score-title').textContent = `${L1} ↔ ${L2} 상관 점수`;
  $('mc-confound-body').textContent =
    `두 변수(${L1}·${L2}) 양쪽 모두에 영향을 주어, 마치 둘 사이에 인과관계가 있는 것처럼 착각하게 만드는 숨은 공통 원인(더위)을 뜻합니다.`;

  drawAxes(exCtxCtrl);
  // 상관은 남은 표본 전체로 계산하고, 그리는 점만 줄인다 — 통계는 정확하게, 화면은 읽히게.
  const pts = filtered.map(d => ({x: d[v1], y: d[v2]}));
  const bgPts = ctrlBgData.map(d => ({x: d[v1], y: d[v2]}));
  drawPoints(exCtxCtrl, bgPts, '#aeb4c6', null, 3); // 통제 밖 표본 — 흐린 회색(--ink-4)으로 뒤로 물린다
  drawPoints(exCtxCtrl, pts.slice(0, 110), '#f0473a'); // foreground dots

  const r = linreg(pts);
  const score = r ? r.r : 0;
  const sEl = $('ctrl-score');
  sEl.textContent = (score >= 0 ? '+' : '') + score.toFixed(2);
  sEl.className = 'dp-val ' + (score > 0.3 ? 'pos' : '');

  /* 안내 문구는 슬라이더 위치가 아닌 실제 상관 점수 기준으로 정직하게 출력합니다. */
  const done = score < 0.35;
  const cEl = $('ctrl-caption');
  cEl.textContent = score >= 0.7 ? '기온이 제각각이라 둘이 함께 움직입니다'
                  : done         ? '기온을 붙잡으니 관계가 거의 사라졌습니다'
                                 : '기온 폭을 좁힐수록 관계가 흐려집니다';
  cEl.className = 'dp-cap' + (done ? ' done' : '');

  
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
    else { xs.dispose(); ys.dispose(); w1.dispose(); w2.dispose(); b.dispose(); training = false; $('pr-x').disabled = false; $('pr-train').disabled = false; setStatus('학습 완료 · READY', 'ready'); updatePred(); window.CourseDashboard && CourseDashboard.markDone('predict'); }
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
    $('cl-step1-ctrl').style.display = 'flex';  // .card 가 flex 세로 쌓기다
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

/* '실습 완료' 조건: 군집화뿐만 아니라 판단 근거까지 5자 이상 작성해야 완료로 인정됩니다. */
function checkDecisionReady() {
  const reason = $('decision-reason').value.trim();
  if (selectedDecision !== -1 && reason.length >= 5) {
    window.CourseDashboard && CourseDashboard.markDone('cluster');
  }
}


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