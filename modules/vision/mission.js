/* vision 코스 3번째 탭(심화 · 응용 — 자동 판정 시스템 도입 미션) 로직.
   app.js · advanced.js 뒤에 로드되며, 그들이 정의한 전역($ · setStatus)을 쓴다.

   이 탭이 앞의 두 탭과 다른 점: 새 기능을 배우지 않는다.
   ②단계에서 학생이 직접 학습시킨 분류기를 그대로 가져와, "현장에 내보낼 수 있는가"를
   실무 지표로 따진다. text·gesture·life 코스의 심화 미션과 같은 4단계 규격이다.

   ②단계 혼동행렬과 렌즈가 다르다는 점이 핵심이다.
     ②단계 : 확신이 부족하면 [보류] — 답을 미루는 모델
     ③단계 : 기준선을 넘으면 그 클래스로 판정 — 실제 운영 규칙 (보류 없음)
   그래서 여기서는 정밀도·재현율이 서로 반대로 움직이는 것이 그대로 드러난다. */

const MS_TARGET_RECALL = 0.90;   // 미션 목표 — 놓치지 않는 비율
const msEsc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let msStep = 1;
let msKey = null;      // 놓치면 안 되는 클래스 인덱스
let msCut = 0.80;      // 판정 기준선 — ②단계에서 학습한 모델에 적용
let msEval = null;     // advanced.js 가 넘겨준 검증 세트 실측 결과

function msNames() { return msEval ? msEval.names : []; }
function msOtherLabel() {
  const rest = msNames().filter((_, i) => i !== msKey).map((c) => msEsc(c.name));
  return rest.length ? rest.join(' / ') : '나머지';
}

/* 중요 클래스 k 기준으로 TP/FP/FN/TN 을 센다. 학습에 쓰지 않은 검증 데이터라 실측이다. */
function prfAt(cut, k) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  msEval.probs.forEach((row, i) => {
    const flagged = row[k] >= cut;
    const actual = msEval.truth[i] === k;
    if (flagged && actual) tp++;
    else if (flagged) fp++;
    else if (actual) fn++;
    else tn++;
  });
  return {
    tp, fp, fn, tn,
    prec: (tp + fp) ? tp / (tp + fp) : null,   // 골라낸 것 중 진짜
    rec: (tp + fn) ? tp / (tp + fn) : null,    // 실제 중 잡아낸 것
    total: msEval.probs.length
  };
}

/* 판정 필름스트립 — 채점에 쓴 내 사진 한 장 한 장에 도장을 찍는다.
   기준선을 끌면 도장이 그 자리에서 뒤집히므로, 숫자로만 보던 저울질이
   "어떤 사진이 넘어가고 어떤 사진이 걸리는가"로 보인다. */
const MS_MARK = {
  ok:    { t: '잡음', s: '✓' },
  miss:  { t: '놓침', s: '✕' },
  wrong: { t: '헛짚음', s: '!' },
  pass:  { t: '통과', s: '·' }
};
function msFilm(cut) {
  const k = msKey;
  return '<div class="ms-film">' + msEval.probs.map((row, i) => {
    const p = row[k];
    const flagged = p >= cut;
    const actual = msEval.truth[i] === k;
    const kind = flagged ? (actual ? 'ok' : 'wrong') : (actual ? 'miss' : 'pass');
    const m = MS_MARK[kind];
    const th = (msEval.thumbs || [])[i];
    return '<figure class="ms-shot ' + kind + '">' +
      (th ? '<img src="' + th + '" alt="">' : '<span class="ms-noimg">?</span>') +
      '<figcaption><b>' + m.s + ' ' + m.t + '</b><span>' + Math.round(p * 100) + '%</span></figcaption>' +
      '</figure>';
  }).join('') + '</div>';
}
const pctText = (v) => (v == null ? '—' : Math.round(v * 100) + '%');

/* ── ① 미션 수령 ── */
function paintBrief() {
  $('ms-brief').innerHTML =
    '<p>②단계에서 만든 분류기를 <b>실제 판정 업무</b>에 투입합니다. 현장에서 실수는 두 종류로 갈리고, ' +
    '<b>둘은 값이 다릅니다.</b></p>' +
    '<ul class="ms-err">' +
      '<li><span class="ms-e-tag miss">놓침</span> 진짜인데 <b>그냥 통과시킴</b> — 문제가 그대로 흘러갑니다</li>' +
      '<li><span class="ms-e-tag wrong">헛짚음</span> 아닌데 <b>걸러냄</b> — 사람이 일일이 다시 확인해야 합니다</li>' +
    '</ul>';

  $('ms-pick').innerHTML = msNames().map((c, i) =>
    '<button class="ms-pick-btn' + (msKey === i ? ' on' : '') + '" data-k="' + i + '">' +
      '<span class="ms-pick-sw" style="background:' + c.color + '"></span>' +
      '<b>' + msEsc(c.name) + '</b>' +
      '<em>이 쪽을 놓치면 곤란하다</em>' +
    '</button>').join('');

  if (msKey != null) paintGoal();
}
function paintGoal() {
  const K = msEsc(msNames()[msKey].name);
  $('ms-goal').hidden = false;
  $('ms-goal').innerHTML =
    '<b>목표</b> — <b>' + K + '</b> 을(를) 놓치지 않는 비율(<b>재현율</b>)을 ' +
    Math.round(MS_TARGET_RECALL * 100) + '% 이상으로 지키면서, 헛짚는 일을 최대한 줄이세요.';
  $('ms-go2').disabled = false;
}
$('ms-pick').addEventListener('click', (e) => {
  const btn = e.target.closest('.ms-pick-btn');
  if (!btn) return;
  msKey = +btn.dataset.k;
  $('ms-pick').querySelectorAll('.ms-pick-btn').forEach((b) => b.classList.toggle('on', b === btn));
  paintGoal();
});

/* ── ② 일단 돌려보기 (기본 기준선 80%) ── */
function paintRun() {
  msCut = 0.80;
  const r = prfAt(msCut, msKey);
  $('ms-film-2').innerHTML = msFilm(msCut);

  const K = msEsc(msNames()[msKey].name);
  const el = $('ms-alert-2');
  if (r.rec != null && r.rec < MS_TARGET_RECALL) {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>목표 미달 — 재현율 ' + pctText(r.rec) + '</b>' +
      '위에서 <b>✕ 놓침</b> 도장이 찍힌 사진들입니다. 기준선 80% 를 넘길 만큼 확신하지 못해 그냥 통과시켰어요.';
  } else if (r.rec != null) {
    el.className = 'ms-alert pass';
    el.innerHTML = '<b>목표 달성 — 재현율 ' + pctText(r.rec) + '</b>' +
      '기본 설정만으로 목표를 넘겼습니다. 기준선을 <b>더 올려도</b> 지킬 수 있을까요?';
  } else {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>판정 불가</b>검증 데이터에 <b>' + K + '</b> 가 한 장도 없습니다. ②단계로 돌아가 데이터를 더 모아 주세요.';
  }
}

/* ── ③ 기준선 조정 ── */
function paintTune() {
  const r = prfAt(msCut, msKey);
  const recPct = r.rec == null ? 0 : r.rec * 100;
  const precPct = r.prec == null ? 0 : r.prec * 100;

  $('ms-rec-bar').style.width = recPct + '%';
  $('ms-rec-bar').className = r.rec != null && r.rec >= MS_TARGET_RECALL ? 'pass' : '';
  $('ms-rec-val').textContent = pctText(r.rec);
  $('ms-prec-bar').style.width = precPct + '%';
  $('ms-prec-val').textContent = pctText(r.prec);
  $('ms-film-3').innerHTML = msFilm(msCut);

  const K = msEsc(msNames()[msKey].name);
  const el = $('ms-alert-3');
  if (r.rec == null || r.prec == null) {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>기준선이 너무 높습니다</b>한 장도 <b>' + K + '</b> 로 판정하지 못했어요. 슬라이더를 내려 보세요.';
  } else if (r.rec >= MS_TARGET_RECALL) {
    el.className = 'ms-alert pass';
    el.innerHTML = '<b>목표 충족 — 재현율 ' + pctText(r.rec) + ' · 정밀도 ' + pctText(r.prec) + '</b>' +
      '기준선을 <b>조금씩 올려</b> 재현율이 목표 아래로 떨어지기 직전까지 가면 헛짚음을 가장 많이 줄일 수 있어요.';
  } else {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>재현율 ' + pctText(r.rec) + ' — 목표 ' + Math.round(MS_TARGET_RECALL * 100) + '% 미달</b>' +
      '기준선을 <b>더 내리면</b> ✕ 가 ✓ 로 바뀝니다. 대신 <b>!</b> 헛짚음도 함께 늘어나는 걸 같이 보세요.';
  }
}
$('ms-thres').addEventListener('input', () => {
  msCut = +$('ms-thres').value / 100;
  $('ms-thres-val').textContent = $('ms-thres').value + '%';
  paintTune();
});

/* ── ④ 도입 리포트 ── */
function paintReport() {
  const r = prfAt(msCut, msKey);
  const K = msEsc(msNames()[msKey].name);
  const pass = r.rec != null && r.rec >= MS_TARGET_RECALL;

  $('ms-report').innerHTML =
    '<div class="ms-verdict ' + (pass ? 'pass' : 'fail') + '">' +
      '<span class="ms-v-ic">' + (pass ? '✓' : '!') + '</span>' +
      '<div><b>' + (pass ? '도입 권고' : '도입 보류') + '</b>' +
      '<span>' + (pass
        ? '목표 재현율을 지켰습니다. 헛짚은 ' + r.fp + '장은 사람이 재확인하는 절차로 흡수할 수 있습니다.'
        : '재현율이 목표에 미달합니다. 기준선을 더 내리거나, ②단계로 돌아가 데이터를 보강해야 합니다.') +
      '</span></div>' +
    '</div>' +
    '<div class="ms-kpis">' +
      '<div class="ms-kpi"><span>지킨 대상</span><b>' + K + '</b></div>' +
      '<div class="ms-kpi"><span>판정 기준선</span><b>' + Math.round(msCut * 100) + '%</b></div>' +
      '<div class="ms-kpi ' + (pass ? 'good' : 'bad') + '"><span>재현율 · 놓치지 않은 비율</span><b>' + pctText(r.rec) + '</b></div>' +
      '<div class="ms-kpi"><span>정밀도 · 골라낸 것 중 진짜</span><b>' + pctText(r.prec) + '</b></div>' +
    '</div>' +
    '<div class="ms-summary">검증 <b>' + r.total + '장</b> 기준 — 제대로 잡음 <b>' + r.tp +
      '</b> · 놓침 <b>' + r.fn + '</b> · 헛짚음 <b>' + r.fp + '</b> · 정상 통과 <b>' + r.tn + '</b></div>';
}

/* ── 단계 이동 ── */
function msSetStep(n) {
  msStep = n;
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
    const sw = +el.dataset.m;
    el.classList.toggle('active', sw === n);
    el.classList.toggle('done', sw < n);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < n ? '✓' : sw;
  });
  document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = +el.dataset.m !== n; });

  if (n === 1) paintBrief();
  if (n === 2) paintRun();
  if (n === 3) {
    $('ms-thres').value = String(Math.round(msCut * 100));
    $('ms-thres-val').textContent = Math.round(msCut * 100) + '%';
    paintTune();
  }
  if (n === 4) paintReport();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 탭에 들어올 때마다 학습 여부를 다시 확인한다.
   ②단계에서 다시 학습하면 검증 결과가 바뀌므로 미션도 처음부터 시작한다. */
function missionEnter() {
  const ev = typeof window.visionGetEval === 'function' ? window.visionGetEval() : null;
  const ready = ev && ev.probs && ev.probs.length && ev.names && ev.names.length >= 2;

  $('ms-gate').hidden = !!ready;
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => { el.disabled = !ready; });

  if (!ready) {
    msEval = null;
    document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = true; });
    return;
  }
  if (msEval !== ev) {     // 새로 학습했다 → 미션 초기화
    msEval = ev;
    msKey = null; msCut = 0.80;
    $('ms-go2').disabled = true;
    $('ms-goal').hidden = true;
    msSetStep(1);
  } else {
    msSetStep(msStep);
  }
}
if (typeof window !== 'undefined') window.visionMissionEnter = missionEnter;

document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
  el.onclick = () => { if (msEval && msKey != null) msSetStep(+el.dataset.m); };
});
$('ms-to-train').onclick = () => window.visionShowTab('train');
$('ms-go2').onclick = () => msSetStep(2);
$('ms-go3').onclick = () => msSetStep(3);
$('ms-go4').onclick = () => msSetStep(4);
$('ms-back3').onclick = () => msSetStep(3);
$('ms-finish').onclick = () => CourseDashboard.finish();
