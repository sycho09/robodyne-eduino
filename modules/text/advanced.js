/* Text 심화 미션 로직: 고객 리뷰 자동 분류기 및 실전 100건 시뮬레이션. */
/* ════ 고급-응용: 고객 리뷰 자동 분류기 ════ */
/* 판정 SVG 아이콘 (currentColor 상속) */
const svgIcon = (inner, cls) =>
  '<svg class="' + (cls || 'rv-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const SVG_OK = svgIcon('<polyline points="20 6 9 17 4 12"/>');
const SVG_NG = svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const SVG_BOT = svgIcon('<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>');
const SVG_THINK = svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
const SVG_SAD = svgIcon('<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>');

function goToRvStep(w) {
  document.querySelectorAll('#flow-review .fstep').forEach(el => {
    const sw = +el.dataset.w;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });
  document.querySelectorAll('#panel-review .wstep').forEach(el => {
    el.hidden = (+el.dataset.w !== w);
  });
  
  if (w === 2) renderRvBase();
  if (w === 4) {
    window.CourseDashboard && CourseDashboard.markDone('review');
    renderRvReport();
  }
}

document.querySelectorAll('#flow-review .fstep').forEach(el => {
  el.onclick = () => goToRvStep(+el.dataset.w);
});

if ($('btn-mission-start')) $('btn-mission-start').onclick = () => goToRvStep(2);
if ($('btn-tuning-start')) $('btn-tuning-start').onclick = () => goToRvStep(3);

/* 샘플 리뷰 4건과 유사도(%). 단순 키워드(배송)가 아닌 의미 중심 분류를 시뮬레이션합니다. */
const RV_REVIEWS = [
  { text: '옷은 예쁜데 택배 상자가 다 구겨져서 왔어요.', sim: 62, want: true, cue: ['택배 상자'] },
  { text: '주문한 지 일주일째인데 아직도 안 왔네요.', sim: 88, want: true, cue: ['안 왔네요'] },
  { text: '빠른 배송 정말 감사합니다! 또 살게요.', sim: 41, want: false, cue: [] },
  { text: '사이즈가 생각보다 작아요. 반품할게요.', sim: 23, want: false, cue: [] }
];

/* ── 실전 100건 코퍼스 시뮬레이션 ─────────────────────────────────────
   난수(시드 고정)로 92건의 더미 데이터를 생성해 총 100건의 예측 결과를 만듭니다.
   정상 리뷰와 불만 리뷰의 유사도 분포를 의도적으로 겹치게 설계하여, 
   학습자가 설정한 임계값에 따라 재현율과 정밀도 딜레마를 체험하도록 유도합니다. */

/* 겹침 구간 엣지케이스 4건 (리포트 예시용) */
const RV_EDGE = [
  { text: '결제하고 나서 감감무소식이네요.', sim: 48, want: true },
  { text: '언제 오는지 알 수가 없어요.', sim: 44, want: true },
  { text: '배송이 하루 늦었는데 그래도 잘 받았어요.', sim: 57, want: false },
  { text: '포장이 튼튼해서 상자가 멀쩡했어요.', sim: 55, want: false }
];

const RV_CORPUS = (function () {
  /* mulberry32 — 짧고 시드가 확실히 먹는 PRNG. 암호용이 아니라 재현용이다. */
  var a = 5;
  var rnd = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  var normal = function (mu, sd) {          // Box-Muller
    var u = 0, v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  var clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(x))); };

  /* 이름 붙은 8건이 먼저 들어가고 난수는 쓰지 않는다 —
     생성 순서(불만 16건 → 정상 76건)를 바꾸면 시드가 어긋나 숫자가 달라진다. */
  var out = RV_REVIEWS.concat(RV_EDGE).map(function (r) {
    return { text: r.text, sim: r.sim, want: r.want };
  });
  for (var i = 0; i < 16; i++) out.push({ sim: clamp(normal(72, 17), 25, 98), want: true });
  for (var j = 0; j < 76; j++) out.push({ sim: clamp(normal(29, 12), 2, 78), want: false });
  return out;
})();

/* 연습 4건이 만점을 내는 임계값 구간. 상수로 박지 않고 훑어서 구한다 —
   RV_REVIEWS 의 sim 을 손대면 이 구간도 저절로 따라와야 한다. */
function rvPracBand() {
  var lo = null, hi = null;
  for (var t = 0; t <= 100; t++) {
    var r = rvClassify(t);
    if (r.fp === 0 && r.fn === 0) { if (lo === null) lo = t; hi = t; }
  }
  return { lo: lo, hi: hi };
}

/* 학습자가 3단계에서 확정한 임계값. 흐름 탭으로 튜닝을 건너뛰고 4단계로 올 수
   있으므로 슬라이더 초기값과 같은 값으로 시작한다. */
var rvThres = 30;
var rvTuned = false;

/* ── Step 2: 의도된 실패 ──────────────────────────────────────────────
   여기서는 sim 값을 쓰지 않는다. app.js 의 cosine()(단어·글자 겹침 기반)으로
   '배송 불만'이라는 키워드와 직접 비교해, 지금 AI가 정말로 글자만 보고 있다는 것을
   실측으로 보여준다. 그 결과 4건 중 3건이 틀린다 —
   '택배 상자가 구겨져'와 '아직도 안 왔네요'는 '배송'이 없어 0%로 놓치고,
   '빠른 배송 감사합니다'는 '배송'을 공유해 오히려 불만으로 잡힌다.
   Step 3에서 의미 기반(임베딩)으로 바꾸면 이 셋이 모두 뒤집힌다. */
var RV_BASE_REF = '배송 불만';
var RV_BASE_THRES = 20;

function rvKeywordScore(text) {
  return Math.round(cosine(RV_BASE_REF, text) * 100);
}

var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

/* AI 눈에 걸린 글자 조각. RV_BASE_REF 와 실제로 겹치는 토큰만 돌려주므로
   판정(rvKeywordScore)과 어긋날 수 없다 — 하드코딩이 아니라 계산값이다. */
function rvSeen(text) {
  var ref = {}, out = {};
  tokens(RV_BASE_REF).forEach(function (t) { ref[t] = 1; });
  tokens(text).forEach(function (t) { if (ref[t]) out[t] = 1; });
  return Object.keys(out);
}

/* 문장 위에 두 가지를 칠한다 — 노랑은 "AI가 본 글자", 빨강은 "사람이 읽는 진짜 신호".
   둘이 겹치면 빨강을 살린다(학습자가 봐야 할 쪽). */
function rvMarkup(text, seen, cue) {
  var cand = [];
  var add = function (list, cls) {
    (list || []).forEach(function (needle) {
      if (!needle) return;
      var from = 0, i;
      while ((i = text.indexOf(needle, from)) >= 0) {
        cand.push({ s: i, e: i + needle.length, cls: cls });
        from = i + needle.length;
      }
    });
  };
  add(cue, 'rv-cue');
  add(seen, 'rv-seen');
  cand.sort(function (a, b) {
    return a.s - b.s || (b.e - b.s) - (a.e - a.s) || (a.cls === 'rv-cue' ? -1 : 1);
  });

  var html = '', at = 0;
  cand.forEach(function (c) {
    if (c.s < at) return; // 앞 표시와 포개지면 버린다
    html += esc(text.slice(at, c.s)) + '<span class="' + c.cls + '">' + esc(text.slice(c.s, c.e)) + '</span>';
    at = c.e;
  });
  return html + esc(text.slice(at));
}

/* seen 은 Step 2 에서만 넘긴다. Step 3 은 글자가 아니라 뜻(sim)으로 판정하므로
   거기서 노란 형광펜을 칠하면 거짓말이 된다 — 그리고 형광펜이 사라지는 것 자체가
   "이제 글자가 아니라 뜻을 본다"의 증거다. */
function rvRowHtml(r, hit, scoreLabel) {
  var ok = (hit === r.want);
  var chipText = '';
  var iconHtml = ok ? SVG_OK : '';
  
  if (hit && r.want) { 
    chipText = '배송 불만으로 분류'; 
  } else if (!hit && r.want) { 
    chipText = 'AI의 실수: 텍스트는 다르지만 뜻은 불만인데 놓쳤어요.'; 
    iconHtml = SVG_SAD; 
  } else if (hit && !r.want) { 
    chipText = 'AI의 실수: "빠른 배송"이란 단어만 보고 오해했어요!'; 
    iconHtml = SVG_THINK; 
  } else { 
    chipText = '정상 리뷰로 분류'; 
  }

  return '<div class="rv-test-row ' + (ok ? 'ok' : 'miss') + '">' +
    '<span class="rv-test-text">"' + esc(r.text) + '"</span>' +
    '<span class="rv-test-meta">' +
      '<span class="rv-test-score">' + scoreLabel + ' → </span>' +
      '<span class="rv-chip rv-verdict" style="display:inline-flex; align-items:center; gap:4px; line-height:1.4;">' + 
      iconHtml + '<span style="white-space:normal; text-align:left;">' + chipText + '</span></span>' +
    '</span>' +
  '</div>';
}

function renderRvBase() {
  var host = $('rv-base-rows');
  if (!host) return;
  var miss = 0;
  host.innerHTML = RV_REVIEWS.map(function (r) {
    var score = rvKeywordScore(r.text);
    var hit = score >= RV_BASE_THRES;
    var ok = hit === r.want;
    if (!ok) miss++;
    return rvRowHtml(r, hit, '겹침 ' + score + '%');
  }).join('');

  var v = $('rv-base-verdict');
  v.className = 'rv-alert warn';
  v.style.display = 'flex';
  v.style.flexDirection = 'column';
  v.style.alignItems = 'center';
  v.style.padding = '32px 24px 20px';
  v.style.gap = '12px';
  v.style.background = 'var(--surface-1)';
  v.style.border = '1px solid var(--primary-soft)';
  v.innerHTML =
    '<div style="font-size:18px; font-weight:700; color:var(--ink-1); text-align:center;">' +
    '앗! AI가 \'배송\'이라는 글자만 보고 칭찬을 불만으로 착각했어요.</div>' +
    '<button class="btn primary" onclick="goToRvStep(3)" style="padding:12px 32px; font-size:16px;">문맥을 이해하는 AI로 튜닝하기</button>';
}

function renderRvTry() {
  var input = $('rv-try-input');
  var out = $('rv-try-result');
  if (!input || !out) return;
  var text = input.value.trim();
  if (!text) { out.hidden = true; return; }

  var score = rvKeywordScore(text);
  var hit = score >= RV_BASE_THRES;
  out.hidden = false;
  out.className = 'rv-try-out';
  out.innerHTML =
    '<div class="rv-try-verdict ' + (hit ? 'hit' : 'pass') + '">' +
      '<span class="rv-try-score">' + score + '%</span>' +
      '<span class="rv-try-label">' + (hit ? '배송 불만으로 분류' : '정상 리뷰로 분류') + '</span>' +
    '</div>' +
    '<p class="rv-try-note">\'' + RV_BASE_REF + '\'와 글자가 ' + score + '% 겹쳐 임계값 ' + RV_BASE_THRES + '%를 ' +
      (hit ? '넘었습니다' : '넘지 못했습니다') + '. ' +
      (score === 0
        ? '겹치는 글자가 하나도 없으면 뜻이 아무리 가까워도 0%입니다.'
        : '뜻이 아니라 글자 겹침만 센 결과입니다.') + '</p>';
}

/* 목록을 인자로 받는다 — 연습 4건(RV_REVIEWS)과 실전 100건(RV_CORPUS)이
   같은 판정 규칙을 쓴다는 것이 4단계의 논지이므로 함수도 하나여야 한다. */
function rvClassify(thres, list) {
  let tp = 0, fp = 0, fn = 0;
  const rows = (list || RV_REVIEWS).map(r => {
    const hit = r.sim >= thres;
    if (hit && r.want) tp++;
    else if (hit && !r.want) fp++;
    else if (!hit && r.want) fn++;
    return { ...r, hit, ok: hit === r.want };
  });
  const precision = tp + fp ? Math.round(tp / (tp + fp) * 100) : null;
  const recall = tp + fn ? Math.round(tp / (tp + fn) * 100) : 0;
  return { rows, tp, fp, fn, precision, recall };
}

function renderRvTuning() {
  const slider = $('threshold-slider');
  if (!slider) return;
  const thres = +slider.value;
  const res = rvClassify(thres);
  /* 4단계 리포트는 여기서 확정한 값을 그대로 100건에 돌린다. */
  rvThres = thres;
  rvTuned = true;

  const rowsEl = $('rv-result-rows');
  rowsEl.hidden = false;
  rowsEl.innerHTML = res.rows.map(r =>
    /* 2단계는 '겹침 %', 여기는 '뜻 %' — 같은 자리 같은 서식이라 라벨만 갈린다.
       무엇을 재는지가 바뀌었다는 신호를 판정 바로 옆에서 준다. */
    rvRowHtml(r, r.hit, '뜻 ' + r.sim + '%')
  ).join('');

  const mEl = $('rv-metrics');
  if (mEl) {
    mEl.hidden = false;
    const hint = $('rv-metrics-hint');
    if (hint) hint.hidden = true;
    const chip = (k, v, tone) => '<span class="rv-chip" style="background:' + tone + ';">' + k + ' ' + v + '</span>';
    mEl.innerHTML =
      chip('정밀도', res.precision === null ? '—' : res.precision + '%', 'var(--card-2)') +
      chip('재현율', res.recall + '%', 'var(--card-2)') +
      chip('누락된 불만', res.fn + '건', res.fn ? 'var(--primary-soft)' : 'var(--green-soft)') +
      chip('오분류된 정상', res.fp + '건', res.fp ? 'var(--primary-soft)' : 'var(--green-soft)');
  }

  const card = $('tuning-success-card');
  card.hidden = false;
  const icon = $('rv-verdict-icon'), title = $('rv-verdict-title'), desc = $('rv-verdict-desc');
  const perfect = res.fp === 0 && res.fn === 0;
  card.className = 'rv-alert ' + (perfect ? 'success' : 'warn');
  // 같은 마스코트를 쓰되 말풍선은 쓰지 않는다 — 여기는 변명이 아니라 성적표이고, 상자 안에 CTA 가 있다.
  icon.innerHTML = SVG_BOT;
  const nextWrap = $('btn-report-wrap');
  if (nextWrap) nextWrap.hidden = !perfect;
  if (perfect) {
    title.textContent = '튜닝 성공!';
    desc.textContent = '"택배 상자 구겨짐"은 글자가 달라도 배송 불만으로 잡아냈고, "빠른 배송 감사"는 \'배송\'이 들어 있지만 칭찬으로 걸러냈습니다. 의미로 판단하고 있다는 증거입니다.';
  } else if (res.fp > 0 && res.fn === 0) {
    title.textContent = '너무 느슨합니다 (정밀도 손해)';
    desc.textContent = '불만은 다 잡았지만 칭찬 리뷰까지 불만으로 분류됐습니다. 임계값을 올려 보세요.';
  } else if (res.fn > 0 && res.fp === 0) {
    title.textContent = '너무 엄격합니다 (재현율 손해)';
    desc.textContent = '오분류는 없지만 진짜 배송 불만 ' + res.fn + '건을 놓쳤습니다. 임계값을 내려 보세요.';
  } else {
    title.textContent = '양쪽 모두 어긋납니다';
    desc.textContent = '놓친 불만 ' + res.fn + '건, 잘못 잡은 정상 ' + res.fp + '건입니다. 임계값을 다시 조정해 보세요.';
  }
}

/* ── Step 4: 실전 100건 리포트 ────────────────────────────────────
   숫자를 하나도 적지 않는다 — 전부 학습자가 3단계에서 정한 임계값을
   RV_CORPUS 에 돌린 결과다. 임계값을 바꿔 다시 오면 리포트도 바뀐다. */
function renderRvReport() {
  var total = RV_CORPUS.length;
  var real = RV_CORPUS.filter(function (r) { return r.want; }).length;
  var res = rvClassify(rvThres, RV_CORPUS);
  var ext = res.tp + res.fp;

  var pctEl = $('rv-donut-pct');
  if (pctEl) pctEl.textContent = Math.round(ext / total * 100) + '%';
  // 원 둘레(2πr, r=60)는 약 377 이지만 기존 마크업이 440 기준으로 그려져 있어 그대로 쓴다.
  setTimeout(function () {
    var fg = $('rv-donut-fg');
    if (fg) fg.style.strokeDashoffset = 440 - (440 * ext / total);
  }, 100);

  var prac = rvClassify(rvThres);       // 같은 임계값을 연습 4건에 돌리면?
  var band = rvPracBand();
  var bridge = $('rv-report-bridge');
  if (bridge) {
    if (!rvTuned) {
      bridge.innerHTML = '튜닝을 건너뛰어 임계값은 기본값 <b>' + rvThres + '%</b>입니다. ' +
        '3단계에서 조절하면 이 리포트도 바뀝니다.';
    } else if (prac.fp === 0 && prac.fn === 0) {
      /* 이 코스의 결론. 연습에서 만점인 임계값이 여러 개인데 실전 성적은 그 안에서
         갈린다는 것이 4건짜리 연습 데이터의 한계를 보여주는 유일한 증거다. */
      bridge.innerHTML = '연습 4건은 <b>' + band.lo + '~' + band.hi + '%</b> 어디를 골라도 만점입니다. ' +
        '그중 <b>' + rvThres + '%</b>로 실제 ' + total + '건을 돌린 결과 — ' +
        '<b>연습 만점이 실전 성적을 보장하지 않습니다.</b>';
    } else {
      bridge.innerHTML = '임계값 <b>' + rvThres + '%</b>는 연습 4건에서도 ' + (prac.fp + prac.fn) + '건이 어긋났습니다. ' +
        '실제 ' + total + '건 결과입니다.';
    }
  }

  var nums = $('rv-report-nums');
  if (nums) {
    nums.innerHTML =
      (ext === 0
        ? '<b>정밀도 —</b> — 한 건도 뽑지 않아 잴 수 없습니다<br>'
        : '<b>정밀도 ' + res.precision + '%</b> — 뽑은 ' + ext + '건 중 ' + res.tp + '건이 진짜 불만<br>') +
      '<b>재현율 ' + res.recall + '%</b> — 실제 불만 ' + real + '건 중 ' + res.tp + '건을 잡음';
  }



}

const slider = $('threshold-slider');
if (slider) {
  slider.oninput = () => {
    $('threshold-val').textContent = '임계값: ' + slider.value + '%';
    slider.style.setProperty('--p', slider.value + '%');
    // 값을 바꾸면 이전 판정은 지우고, [재분류 테스트]를 다시 누르게 한다.
    $('tuning-success-card').hidden = true;
    $('rv-result-rows').hidden = true;
    if ($('rv-metrics')) $('rv-metrics').hidden = true;
  };
}

if ($('btn-reclassify')) $('btn-reclassify').onclick = renderRvTuning;

if ($('btn-rv-try')) $('btn-rv-try').onclick = renderRvTry;
// 입력을 고치면 이전 판정은 지운다 — 화면의 결과가 항상 지금 입력과 일치하도록.
if ($('rv-try-input')) $('rv-try-input').oninput = () => { $('rv-try-result').hidden = true; };

if ($('btn-report-start')) $('btn-report-start').onclick = () => goToRvStep(4);

if ($('btn-embedding-hint')) $('btn-embedding-hint').onclick = () => $('rv-hint-modal').classList.add('show');
if ($('rv-hint-close')) $('rv-hint-close').onclick = () => $('rv-hint-modal').classList.remove('show');
if ($('rv-hint-modal')) {
  $('rv-hint-modal').onclick = (e) => {
    if (e.target === $('rv-hint-modal')) $('rv-hint-modal').classList.remove('show');
  };
}