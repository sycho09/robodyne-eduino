/* gesture 코스 3번째 탭(고급·응용 — 제스처 제어 데모) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 고급-응용: 제스처 제어 데모 ════ */
let dmStep = 1;
let dmFunc = 'vol';
const dmFuncNames = { ppt: '[다음 슬라이드]', vol: '[시스템 볼륨 조절]', zoom: '[화면 확대/축소]' };

function selectDemoFunc(el, func) {
  document.querySelectorAll('.dm-func-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  dmFunc = func;
}
if (typeof window !== 'undefined') window.selectDemoFunc = selectDemoFunc;

let dmAnimTimer = null;
function goToDmStep(w) {
  dmStep = w;
  document.querySelectorAll('#flow-demo .fstep').forEach(el => {
    const sw = +el.dataset.dw;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });
  document.querySelectorAll('#panel-demo .dstep').forEach(el => {
    el.hidden = (+el.dataset.dw !== w);
  });
  
  if (dmAnimTimer) { clearInterval(dmAnimTimer); dmAnimTimer = null; }
  
  if (w === 2) {
    const hand = $('dm-cam-hand');
    const bar = $('dm-cam-bar');
    const txt = $('dm-cam-text');
    const m = dmMeasure(true);
    if (!m) {
      if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--amber)'; }
      if (hand) hand.classList.remove('pulse');
      if (txt) { txt.style.color = 'var(--amber)'; txt.textContent = '②단계에서 학습을 먼저 마쳐 주세요'; }
    } else {
      /* 지어낸 sin 파형 대신, ②단계에서 모은 샘플의 실제 확신도를 차례로 재생한다.
         자기 데이터가 애매하면 막대도 실제로 낮게 흔들린다. */
      const conf = m.rows.map(r => Math.max.apply(null, r.p) * 100);
      let i = 0;
      dmAnimTimer = setInterval(() => {
        const val = conf[i++ % conf.length];
        const thres = +$('dm-slider').value;
        if (bar) bar.style.width = val.toFixed(1) + '%';
        if (val >= thres) {
          if (bar) bar.style.background = 'var(--green)';
          if (txt) { txt.style.color = 'var(--green)'; txt.textContent = 'AI 확신도: ' + Math.round(val) + '% (작동)'; }
          if (hand) hand.classList.add('pulse');
        } else {
          if (bar) bar.style.background = 'var(--amber)';
          if (txt) { txt.style.color = 'var(--amber)'; txt.textContent = 'AI 확신도: ' + Math.round(val) + '% (미반응)'; }
          if (hand) hand.classList.remove('pulse');
        }
      }, 150);
    }
  }

  if (w === 3) { dmMeasure(true); paintConfusion(); }

  if (w === 4) {
    window.CourseDashboard && CourseDashboard.markDone('demo');
    const resFunc = $('dm-res-func');
    if (resFunc) resFunc.textContent = dmFuncNames[dmFunc];
    const resThres = $('dm-res-thres');
    if (resThres) resThres.textContent = $('dm-slider').value + '%';
  }
}

/* ②단계에서 학생이 직접 모은 샘플을, 그 데이터로 학습한 head 에 되돌려 넣어
   실제 확신도를 잰다.

   예전에는 임계값에서 숫자를 만들어 내는 공식을 썼다(지어낸 값). 학습 결과와
   아무 관계가 없어서, 데이터를 아무리 더 모아도 혼동행렬이 늘 똑같았다.
   이제는 자기 데이터가 나쁘면 숫자도 나쁘게 나온다.

   한계: 학습에 쓴 데이터를 그대로 되재는 self-prediction 이다(②단계 혼동행렬과
   같은 방식). 따로 떼어 둔 검증 세트가 없으므로 실제 현장 성능보다 후하게 나온다. */
let dmRows = null;   // { names, rows:[{ truth, p }] } — 임계값과 무관하므로 단계 진입 때 한 번만 잰다
function dmMeasure(force) {
  if (dmRows && !force) return dmRows;
  dmRows = null;
  if (typeof tf === 'undefined' || typeof head === 'undefined' || typeof classes === 'undefined') return null;
  if (!head) return null;
  const usable = classes.filter(c => c.samples.length >= 8);
  if (usable.length < 2) return null;
  const rows = [];
  usable.forEach((c, idx) => {
    const valid = c.samples.filter(s => s.length === 42 && s.every(v => isFinite(v)));
    if (!valid.length) return;
    const probs = tf.tidy(() => head.predict(tf.tensor2d(valid)).arraySync());
    probs.forEach(p => rows.push({ truth: idx, p }));
  });
  if (rows.length < 2) return null;
  dmRows = { names: usable.map(c => c.name), rows };
  return dmRows;
}
/* 다시 학습하면 앞서 잰 값은 버린다(새 head 로 다시 재야 한다). */
(function () {
  const bt = $('btn-train');
  if (bt) bt.addEventListener('click', () => { dmRows = null; });
})();

/* 기준선을 못 넘으면 '무시', 넘었는데 다른 클래스면 '오인'.
   임계값만 바꿔 다시 세는 것이므로 예측은 다시 돌리지 않는다. */
function confusionAt(thres) {
  const m = dmMeasure();
  if (!m) return null;
  const cut = thres / 100;
  const per = m.names.map(() => ({ right: 0, wrong: 0, miss: 0 }));
  m.rows.forEach(r => {
    let top = 0;
    for (let i = 1; i < r.p.length; i++) if (r.p[i] > r.p[top]) top = i;
    if (r.p[top] < cut) per[r.truth].miss++;
    else if (top === r.truth) per[r.truth].right++;
    else per[r.truth].wrong++;
  });
  const wrong = per.reduce((s, x) => s + x.wrong, 0);
  const miss = per.reduce((s, x) => s + x.miss, 0);
  const verdict = miss > wrong * 1.8 ? 'miss' : wrong > miss * 1.8 ? 'wrong' : 'balanced';
  return { per, names: m.names, wrong, miss, total: m.rows.length, verdict };
}

/* 표의 라벨을 학생이 실제로 만든 클래스 이름에 맞춘다.
   (HTML 기본값은 '가위/보' 인데 이 코스의 기본 클래스는 '주먹/손바닥' 이라 어긋나 있었다)
   이미 그려진 아이콘 노드는 지우지 않고 되돌려 놓아 표 모양은 그대로 둔다. */
function dmSetLabel(el, name) {
  if (!el || !name) return;
  const ic = el.querySelector('.ic-inline');
  el.textContent = '';
  if (ic) { el.appendChild(ic); el.appendChild(document.createTextNode(' ' + name)); }
  else el.appendChild(document.createTextNode(name));
}

function paintConfusion() {
  const slider = $('dm-slider');
  if (!slider) return;
  const thres = +slider.value;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const cells = ['dm-cm-00', 'dm-cm-01', 'dm-cm-0n', 'dm-cm-10', 'dm-cm-11', 'dm-cm-1n'];
  const note = $('dm-cm-note');
  /* 표 위 안내문에는 id 가 없다 — 임계값 <b> 의 부모가 그 문단이다. */
  const lead = $('dm-cm-thres') ? $('dm-cm-thres').parentElement : null;
  const c = confusionAt(thres);

  if (!c) {
    cells.forEach(id => set(id, '—'));
    if (lead) lead.innerHTML = '임계값 <b id="dm-cm-thres">' + thres + '%</b> — 아직 잴 것이 없습니다.';
    if (note) note.innerHTML = '이 표는 <b>②단계에서 직접 모은 데이터</b>로 채워집니다. 제스처 2가지를 각각 <b>8개 이상</b> 모아 학습을 마친 뒤 다시 오세요.';
    return;
  }

  const a = c.per[0], b = c.per[1];
  if (lead) {
    lead.innerHTML = '임계값 <b id="dm-cm-thres">' + thres + '%</b> 로, ②단계에서 모은 샘플 <b>' + c.total +
      '개</b>를 학습한 모델에 되돌려 넣어 실제로 센 결과입니다. 임계값을 바꾸면 아래 숫자도 함께 달라집니다.';
  }
  set('dm-cm-00', a.right + ' (성공)');
  set('dm-cm-01', a.wrong + ' (오인)');
  set('dm-cm-0n', a.miss + ' (무시)');
  set('dm-cm-10', b.wrong + ' (오인)');
  set('dm-cm-11', b.right + ' (성공)');
  set('dm-cm-1n', b.miss + ' (무시)');

  const tbl = document.querySelector('.dm-cm-table');
  if (tbl) {
    const hs = tbl.querySelectorAll('thead th');
    dmSetLabel(hs[1], c.names[0]); dmSetLabel(hs[2], c.names[1]);
    const rs = tbl.querySelectorAll('tbody tr');
    if (rs[0]) dmSetLabel(rs[0].querySelector('th'), c.names[0]);
    if (rs[1]) dmSetLabel(rs[1].querySelector('th'), c.names[1]);
  }

  if (!note) return;
  const extra = c.names.length > 2 ? ' (클래스 ' + c.names.length + '개 중 앞의 2개만 표에 나옵니다)' : '';
  if (c.verdict === 'miss') {
    note.innerHTML = '임계값이 높아 <b>오인은 거의 없지만</b> ' + c.total + '개 중 ' + c.miss + '개가 아예 무시됐습니다. 안전하지만 답답한 설정입니다.' + extra;
  } else if (c.verdict === 'wrong') {
    note.innerHTML = '임계값이 낮아 <b>반응은 잘 하지만</b> ' + c.total + '개 중 ' + c.wrong + '개를 엉뚱한 동작으로 실행했습니다. 오작동이 잦은 설정입니다.' + extra;
  } else {
    note.innerHTML = '오인 ' + c.wrong + '개, 무시 ' + c.miss + '개로 균형이 잡힌 설정입니다. 어느 쪽 실수가 더 치명적인지에 따라 임계값을 옮기면 됩니다.' + extra;
  }
}
if (typeof window !== 'undefined') window.paintConfusion = paintConfusion;
if (typeof window !== 'undefined') window.goToDmStep = goToDmStep;

document.querySelectorAll('#flow-demo .fstep').forEach(el => {
  el.onclick = () => goToDmStep(+el.dataset.dw);
});

const dSlider = $('dm-slider');
// Step 2의 경고도 Step 3 혼동행렬과 같은 모델(confusionAt)에서 뽑아, 두 화면이 어긋나지 않게 한다.
function paintThresWarn() {
  if (!dSlider) return;
  const v = +dSlider.value;
  const valEl = $('dm-slider-val');
  if (valEl) valEl.textContent = v + '%';
  dSlider.style.setProperty('--p', v + '%');
  const warn = $('dm-alert-warn');
  if (!warn) return;
  const c = confusionAt(v);
  if (!c) {
    warn.innerHTML = EduinoIcons.svg('alert') + ' ②단계에서 학습을 마치면 이 임계값의 실제 결과가 표시됩니다';
    warn.style.color = '#92400e'; warn.style.border = '1px solid #fde68a'; warn.style.background = '#fef3c7';
  } else if (c.verdict === 'miss') {
    warn.innerHTML = EduinoIcons.svg('alert') + ' 동작을 완벽하게 해야만 넘어갑니다 — ' + c.total + '개 중 ' + c.miss + '개 미반응';
    warn.style.color = '#92400e'; warn.style.border = '1px solid #fde68a'; warn.style.background = '#fef3c7';
  } else if (c.verdict === 'wrong') {
    warn.innerHTML = EduinoIcons.svg('alert') + ' 엉뚱한 동작에도 반응합니다 — ' + c.total + '개 중 ' + c.wrong + '개 오작동';
    warn.style.color = '#991b1b'; warn.style.border = '1px solid #fecaca'; warn.style.background = '#fee2e2';
  } else {
    warn.innerHTML = EduinoIcons.svg('check-circle') + ' 균형 잡힌 임계값입니다 — 오작동 ' + c.wrong + '개 / 미반응 ' + c.miss + '개';
    warn.style.color = '#065f46'; warn.style.border = '1px solid #a7f3d0'; warn.style.background = '#d1fae5';
  }
}
if (dSlider) {
  dSlider.oninput = paintThresWarn;
  paintThresWarn(); // 초기 표시가 슬라이더 기본값과 어긋나지 않도록 한 번 그려 둔다
}
/* 분석 퀴즈 — 고른 보기에 정오답을 표시하고, 틀리면 정답 보기도 함께 밝힌다.
   (concept 코스의 개념 정리 퀴즈와 같은 규칙) */
const DM_QUIZ_ANSWER = 2;
const DM_QUIZ_EXPLAIN =
  '가위(2개)와 보(5개)는 <b>펴진 손가락 수가 다르므로</b> 규칙만으로도 원래는 구분됩니다. ' +
  '문제는 그 앞 단계입니다 — 손을 기울이면 접은 손가락이 편 손가락 뒤에 가려져 ' +
  '<b>21개 관절 좌표 자체가 잘못 잡히고</b>, 그러면 손가락을 세는 규칙도 함께 틀립니다. ' +
  '컴퓨터 속도나 학습 데이터 양의 문제가 아니라 <b>입력 좌표의 품질</b> 문제입니다.';

const dmQuiz = $('dm-quiz');
if (dmQuiz) {
  const opts = dmQuiz.querySelectorAll('.qz-btn');
  opts.forEach(btn => {
    btn.addEventListener('click', () => {
      const right = +btn.dataset.i === DM_QUIZ_ANSWER;
      opts.forEach(b => { b.disabled = true; });
      btn.classList.add(right ? 'correct' : 'wrong');
      if (!right) opts[DM_QUIZ_ANSWER].classList.add('correct');

      const fb = $('dm-quiz-feedback');
      fb.hidden = false;
      fb.className = 'qz-feedback ' + (right ? 'right' : 'miss');
      fb.innerHTML = '<b>' + (right ? '정답입니다' : '오답입니다') + '</b><span>' + DM_QUIZ_EXPLAIN + '</span>';

      // 해설을 보여주므로 정답 여부와 무관하게 다음 단계를 연다(4단계 자유 이동과 같은 맥락).
      const next = $('btn-dm-final');
      if (next) next.hidden = false;
    });
  });
}
/* goToDmStep 으로 넘어갈 때 말고는 스스로 멈추지 않는 데모 타이머 — 실습을 떠날 때 끈다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(() => {
  if (dmAnimTimer) { clearInterval(dmAnimTimer); dmAnimTimer = null; }
});
