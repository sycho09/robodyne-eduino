/* text 코스 3번째 탭(고급·응용 — 고객 리뷰 자동 분류기) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 고급-응용: 고객 리뷰 자동 분류기 ════ */
/* 판정 아이콘 — 이모지는 OS마다 모양이 달라지므로 대시보드와 같은 규격의 인라인 SVG를 쓴다.
   색은 지정하지 않고 currentColor 로 상속받아, 감싼 요소의 상태 색을 그대로 따라간다. */
const svgIcon = (inner, cls) =>
  '<svg class="' + (cls || 'rv-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const SVG_OK = svgIcon('<polyline points="20 6 9 17 4 12"/>');
const SVG_NG = svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const SVG_WARN = svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');

let rvStep = 1;
function goToRvStep(w) {
  rvStep = w;
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
    setTimeout(() => {
      const fg = $('rv-donut-fg');
      if(fg) fg.style.strokeDashoffset = 440 - (440 * 0.18); // 18%
    }, 100);
  }
}

document.querySelectorAll('#flow-review .fstep').forEach(el => {
  el.onclick = () => goToRvStep(+el.dataset.w);
});

if ($('btn-mission-start')) $('btn-mission-start').onclick = () => goToRvStep(2);
if ($('btn-tuning-start')) $('btn-tuning-start').onclick = () => goToRvStep(3);

/* 리뷰 4건과 각 리뷰가 '배송 불만'과 얼마나 가까운지의 유사도(%).
   sim >= 임계값이면 불만으로 분류된다. want=true 가 실제 배송 불만.
   '택배 상자 구겨짐'은 글자가 다르지만 의미가 가까워 62%,
   '빠른 배송 감사'는 '배송'을 공유하지만 칭찬이라 41%로 두어
   키워드가 아니라 의미로 갈린다는 점이 임계값 조작으로 드러나게 했다. */
const RV_REVIEWS = [
  { text: '옷은 예쁜데 택배 상자가 다 구겨져서 왔어요.', sim: 62, want: true },
  { text: '주문한 지 일주일째인데 아직도 안 왔네요.', sim: 88, want: true },
  { text: '빠른 배송 정말 감사합니다! 또 살게요.', sim: 41, want: false },
  { text: '사이즈가 생각보다 작아요. 반품할게요.', sim: 23, want: false }
];

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

function rvRowHtml(text, verdictLabel, ok, scoreLabel) {
  return '<div class="rv-test-row ' + (ok ? 'ok' : 'miss') + '">' +
    '<span>"' + text + '"</span>' +
    '<span class="rv-test-badge">' + scoreLabel + ' → ' + verdictLabel + ' ' +
      (ok ? SVG_OK : SVG_NG) + '</span>' +
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
    return rvRowHtml(r.text, hit ? '배송 불만' : '정상 리뷰', ok, '겹침 ' + score + '%');
  }).join('');

  var v = $('rv-base-verdict');
  v.className = 'rv-alert ' + (miss ? 'fail' : 'success');
  v.innerHTML =
    '<span class="rv-alert-ic">' + (miss ? SVG_WARN : SVG_OK) + '</span>' +
    '<div><strong class="rv-alert-title">' +
      (miss ? '4건 중 ' + miss + '건 오분류' : '전부 맞혔습니다') + '</strong>' +
    '<span class="rv-alert-desc">' +
      (miss
        ? 'AI가 문장의 의미가 아니라 <b>\'배송\'이라는 글자가 들어 있는지</b>만 보고 있습니다. ' +
          '그래서 \'택배\'라고 쓴 진짜 불만은 놓치고, \'빠른 배송 감사합니다\'라는 칭찬은 불만으로 잡습니다.'
        : '기준 문장과 글자가 잘 겹쳤습니다.') +
    '</span></div>';
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

function rvClassify(thres) {
  let tp = 0, fp = 0, fn = 0;
  const rows = RV_REVIEWS.map(r => {
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

  const rowsEl = $('rv-result-rows');
  rowsEl.hidden = false;
  rowsEl.innerHTML = res.rows.map(r =>
    rvRowHtml(r.text, r.hit ? '배송 불만' : '정상 리뷰', r.ok, '유사도 ' + r.sim + '%')
  ).join('');

  const mEl = $('rv-metrics');
  mEl.hidden = false;
  const chip = (k, v, tone) => '<span style="font-family:var(--mono); font-size:12px; font-weight:700; padding:6px 12px; border-radius:999px; background:' + tone + ';">' + k + ' ' + v + '</span>';
  mEl.innerHTML =
    chip('정밀도', res.precision === null ? '—' : res.precision + '%', 'var(--card-2)') +
    chip('재현율', res.recall + '%', 'var(--card-2)') +
    chip('놓친 불만', res.fn + '건', res.fn ? 'var(--primary-soft)' : 'var(--green-soft)') +
    chip('잘못 잡은 정상', res.fp + '건', res.fp ? 'var(--primary-soft)' : 'var(--green-soft)');

  const card = $('tuning-success-card');
  card.hidden = false;
  const icon = $('rv-verdict-icon'), title = $('rv-verdict-title'), desc = $('rv-verdict-desc');
  const next = $('btn-report-start');
  const perfect = res.fp === 0 && res.fn === 0;
  card.className = 'rv-alert ' + (perfect ? 'success' : 'warn');
  icon.innerHTML = perfect ? SVG_OK : SVG_WARN;
  next.hidden = !perfect;
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

const slider = $('threshold-slider');
if (slider) {
  slider.oninput = () => {
    $('threshold-val').textContent = '임계값: ' + slider.value + '%';
    slider.style.setProperty('--p', slider.value + '%');
    // 값을 바꾸면 이전 판정은 지우고, [재분류 테스트]를 다시 누르게 한다.
    $('tuning-success-card').hidden = true;
    $('rv-result-rows').hidden = true;
    $('rv-metrics').hidden = true;
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