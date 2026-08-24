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
    let tick = 0;
    dmAnimTimer = setInterval(() => {
      tick++;
      const val = Math.sin(tick * 0.4) * 20 + 75; // 55% ~ 95%
      const thres = +$('dm-slider').value;
      if (bar) bar.style.width = val + '%';
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
  
  if (w === 3) paintConfusion();

  if (w === 4) {
    const resFunc = $('dm-res-func');
    if (resFunc) resFunc.textContent = dmFuncNames[dmFunc];
    const resThres = $('dm-res-thres');
    if (resThres) resThres.textContent = $('dm-slider').value + '%';
  }
}

/* 혼동행렬을 Step 2의 임계값과 연동한다.
   가위·보 각 100회 시도에서, 확신도가 임계값을 넘지 못하면 '미반응'으로 빠지고,
   넘더라도 각도에 따라 접은 손가락이 가려지면 서로 오인된다.
   임계값을 올리면 오인은 줄지만 미반응이 늘어나는 트레이드오프가 숫자로 드러난다. */
function confusionAt(thres) {
  // 확신도 분포를 단순화한 모델: 임계값이 높을수록 통과하지 못하는 시도가 늘어난다.
  const pass = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, thres - 80) * 2.5)));
  // 통과한 시도 중 서로 오인되는 비율은 임계값이 낮을수록 높다(애매한 것까지 통과하므로).
  const confuseRate = Math.max(0.02, (100 - thres) / 100 * 0.42);
  const sci = { miss: 100 - pass };
  sci.wrong = Math.round(pass * confuseRate);
  sci.right = pass - sci.wrong;
  const pap = { miss: 100 - pass };
  pap.wrong = Math.round(pass * confuseRate * 1.25); // 보는 접은 손가락 가려짐이 더 잦다
  pap.right = pass - pap.wrong;
  const wrong = sci.wrong + pap.wrong, miss = sci.miss + pap.miss;
  // 임계값 구간을 따로 두지 않고, 이 숫자에서 바로 판정을 끌어낸다(Step 2·3 문구의 단일 출처).
  const verdict = miss > wrong * 1.8 ? 'miss' : wrong > miss * 1.8 ? 'wrong' : 'balanced';
  return { sci, pap, pass, wrong, miss, verdict };
}

function paintConfusion() {
  const slider = $('dm-slider');
  if (!slider) return;
  const thres = +slider.value;
  const c = confusionAt(thres);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('dm-cm-thres', thres + '%');
  set('dm-cm-00', c.sci.right + ' (성공)');
  set('dm-cm-01', c.sci.wrong + ' (오인)');
  set('dm-cm-0n', c.sci.miss + ' (무시)');
  set('dm-cm-10', c.pap.wrong + ' (오인)');
  set('dm-cm-11', c.pap.right + ' (성공)');
  set('dm-cm-1n', c.pap.miss + ' (무시)');

  const note = $('dm-cm-note');
  if (!note) return;
  if (c.verdict === 'miss') {
    note.innerHTML = '임계값이 높아 <b>오인은 거의 없지만</b> 200번 중 ' + c.miss + '번이 아예 무시됐습니다. 안전하지만 답답한 설정입니다.';
  } else if (c.verdict === 'wrong') {
    note.innerHTML = '임계값이 낮아 <b>반응은 잘 하지만</b> 200번 중 ' + c.wrong + '번을 엉뚱한 동작으로 실행했습니다. 오작동이 잦은 설정입니다.';
  } else {
    note.innerHTML = '오인 ' + c.wrong + '번, 무시 ' + c.miss + '번으로 균형이 잡힌 설정입니다. 어느 쪽 실수가 더 치명적인지에 따라 임계값을 옮기면 됩니다.';
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
  if (c.verdict === 'miss') {
    warn.innerHTML = EduinoIcons.svg('alert') + ' 동작을 완벽하게 해야만 넘어갑니다 — 200번 중 ' + c.miss + '번 미반응';
    warn.style.color = '#92400e'; warn.style.border = '1px solid #fde68a'; warn.style.background = '#fef3c7';
  } else if (c.verdict === 'wrong') {
    warn.innerHTML = EduinoIcons.svg('alert') + ' 엉뚱한 동작에도 반응합니다 — 200번 중 ' + c.wrong + '번 오작동';
    warn.style.color = '#991b1b'; warn.style.border = '1px solid #fecaca'; warn.style.background = '#fee2e2';
  } else {
    warn.innerHTML = EduinoIcons.svg('check-circle') + ' 균형 잡힌 임계값입니다 — 오작동 ' + c.wrong + '번 / 미반응 ' + c.miss + '번';
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
