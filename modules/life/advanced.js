/* life 코스 3번째 탭(고급·응용 — 인식 한계와 자동화) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · setStatus 등)을 그대로 쓴다. */
/* ════ 3. 고급-응용: 인식 한계 테스트 ════ */
let lmStep = 1;
let lmEnv = 'orig';

/* Step 1에서 고른 조건이 Step 2의 원인 분석으로 그대로 이어지게 한다.
   (예전에는 무엇을 테스트했든 '구겨짐+그림자'로만 설명해 앞뒤가 맞지 않았다) */
const LM_ENVS = {
  orig: {
    msg: '✓ 인식 성공 (정확도 98%)', cls: 'succ', sub: '결과: ICE AMERICANO 4,500원',
    mock: '4,500', cap: 'AI 시점: 획이 또렷해 형태가 그대로 살아 있음',
    title: '이 조건에서는 왜 잘 읽혔을까?',
    desc: '<p>글자의 획이 또렷하고 기울지 않아, 형태 정보가 손상 없이 남아 있기 때문입니다.</p><p>OCR은 잘라낸 줄 전체를 <b>순서가 있는 시퀀스로</b> 읽으면서 앞뒤 문맥을 함께 씁니다. 형태가 선명하면 문맥의 도움 없이도 판별이 끝나므로 가장 안정적인 조건입니다.</p>'
  },
  dark: {
    msg: '✕ 인식 실패 (노이즈 발생)', cls: 'fail', sub: '결과: 1C# AMFRICAMO 4,5G0@',
    mock: '1C#', cap: 'AI 시점: 밝기 차이가 줄어 획 경계가 흐려짐',
    title: '왜 글자가 통째로 뭉개졌을까?',
    desc: '<p>어두운 곳에서는 글자와 배경의 <b>밝기 차이(대비)</b>가 줄어듭니다. 검출 단계에서 글자 영역을 잡는 것부터 흔들리고, 인식 단계에서는 획의 경계가 뭉개져 전혀 다른 글자로 읽힙니다.</p><p>M이 CM으로, O가 G로 바뀌는 것처럼 <b>여러 글자가 동시에</b> 무너지는 것이 이 조건의 특징입니다. 문맥으로도 복구가 안 되는 이유입니다.</p>'
  },
  hide: {
    msg: '✕ 인식 실패 (텍스트 소실)', cls: 'fail', sub: '결과: ... FEE 4,500원',
    mock: '…FEE', cap: 'AI 시점: 가려진 영역은 애초에 검출되지 않음',
    title: '가려진 글자는 왜 복원되지 않을까?',
    desc: '<p>QR 코드와 결정적으로 다른 지점입니다. QR은 <b>오류정정용 여유분</b>을 미리 담아 두기 때문에 일부가 가려져도 계산으로 복원됩니다.</p><p>하지만 종이에 인쇄된 글자에는 그런 여유분이 없습니다. 가려진 부분은 정보가 <b>그냥 사라진 것</b>이라 되살릴 방법이 없고, AI는 남은 글자만 읽어 냅니다.</p>'
  },
  crumple: {
    msg: '✕ 인식 실패 (형태 왜곡)', cls: 'fail', sub: '결과: ICE AMERICAND 4,50O권',
    mock: '4,50O', cap: 'AI 시점: 획 두께·비율이 미세하게 뒤틀림',
    title: '왜 하필 숫자 0을 알파벳 O로 읽었을까?',
    desc: '<p>0과 O는 원래 형태가 거의 같습니다. 평소에는 폭 비율이나 획 두께 같은 <b>미세한 차이</b>와 "주변이 숫자인지"라는 문맥으로 구분합니다.</p><p>종이가 구겨지면 그 미세한 차이가 뒤틀려 사라집니다. 다른 글자는 멀쩡한데 <b>모양이 닮은 글자만 골라</b> 틀리는 것이 이 조건의 특징입니다. 실무에서는 "금액 칸에는 숫자만 온다"는 후처리 규칙으로 마지막에 잡아냅니다.</p>'
  }
};
function goToLmStep(w) {
  lmStep = w;
  document.querySelectorAll('#flow-limit .fstep').forEach(el => {
    const sw = +el.dataset.lw;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });
  
  document.querySelectorAll('#panel-limit .lstep').forEach(el => {
    el.hidden = (+el.dataset.lw !== w);
  });

  if (w === 2) {
    paintLmReason();
  } else if (w === 3) {
    // 프로그레스 및 영수증 상태 초기화
    document.querySelectorAll('.lm-receipt').forEach(r => r.classList.remove('done'));
    $('lm-prog-bar').style.width = '0%';
    $('lm-prog-text').textContent = '대기 중...';
    $('lm-batch-btn').disabled = false;
    $('lm-batch-btn').textContent = '일괄 스캔 시작';
    $('lm-batch-btn').onclick = startLmBatch;
  }
}
if (typeof window !== 'undefined') window.goToLmStep = goToLmStep;

// Step 2: 마지막으로 테스트한 조건의 원인 분석을 그린다.
function paintLmReason() {
  const cfg = LM_ENVS[lmEnv] || LM_ENVS.crumple;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('lm-reason-title', cfg.title);
  set('lm-img-cap', cfg.cap);
  const mock = document.getElementById('lm-img-mock');
  if (mock) mock.innerHTML = cfg.mock + '<div class="lm-bbox"></div>';
  const desc = document.getElementById('lm-reason-desc');
  if (desc) desc.innerHTML = cfg.desc;
}
if (typeof window !== 'undefined') window.paintLmReason = paintLmReason;

const lmTabs = document.getElementById('lm-tabs');
if (lmTabs) {
  lmTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.lm-tab');
    if (!tab) return;

    document.querySelectorAll('.lm-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    lmEnv = tab.dataset.env;
    const cfg = LM_ENVS[lmEnv];
    const msg = document.querySelector('.lm-res-msg');
    const sub = document.querySelector('.lm-res-sub');
    msg.classList.remove('succ', 'fail');
    msg.textContent = cfg.msg;
    msg.classList.add(cfg.cls);
    sub.textContent = cfg.sub;
  });
}

function startLmBatch() {
  const btn = $('lm-batch-btn');
  btn.disabled = true;
  btn.textContent = '처리 중...';
  
  const bar = $('lm-prog-bar');
  const txt = $('lm-prog-text');
  const receipts = document.querySelectorAll('.lm-receipt');
  
  let prog = 0;
  const interval = setInterval(() => {
    prog += 2;
    bar.style.width = prog + '%';
    txt.textContent = '데이터 정제 및 추출 중... ' + prog + '%';
    
    if (prog === 33) receipts[0].classList.add('done');
    if (prog === 66) receipts[1].classList.add('done');
    if (prog === 100) {
      clearInterval(interval);
      receipts[2].classList.add('done');
      txt.textContent = '추출 완료!';
      setTimeout(() => goToLmStep(4), 800);
    }
  }, 30);
}
if (typeof window !== 'undefined') window.startLmBatch = startLmBatch;
document.querySelectorAll('#flow-limit .fstep').forEach(el => {
  el.onclick = () => { if (typeof goToLmStep === 'function') goToLmStep(+el.dataset.lw); };
});
