/* ── 추론 ───────────────────────────────────────────── */
/* 신뢰도 막대 렌더 공통 로직 — 탭마다 컨테이너와 DOM id 접두사만 다르다.
   pctId/fillId 는 인덱스를 받아 추론 루프가 참조하는 id 문자열을 만든다. */
function renderProbBars(container, names, pctId, fillId) {
  container.innerHTML = '';
  names.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'bar-row';
    row.innerHTML =
      `<div class="bar-head">
         <span class="bar-name"><span class="dot" style="background:${c.color}"></span>${c.name}</span>
         <span class="bar-pct" id="${pctId(i)}">0%</span>
       </div>
       <div class="bar-track"><div class="bar-fill" id="${fillId(i)}" style="background:${c.color}"></div></div>`;
    container.appendChild(row);
  });
}

function renderBars() {
  const names = state.head?._classNames || state.classes.map(c => ({ name: c.name, color: c.color }));
  renderProbBars(els.bars, names, (i) => `pct-${i}`, (i) => `bar-${i}`);
}
/* 추론 결과 도넛 게이지 갱신 (frac 0~1) */
function setDonut(prefix, frac, color) {
  const C = 314.16;
  const arc = document.getElementById(prefix + '-arc');
  const pct = document.getElementById(prefix + '-pct');
  if (arc) { arc.style.strokeDasharray = (frac * C).toFixed(1) + ' ' + C; if (color) arc.style.stroke = color; }
  if (pct) pct.textContent = Math.round(frac * 100) + '%';
}

function resetTopPred() {
  els.topPred.className = 'top-pred idle';
  els.topPred.querySelector('.tp-name').textContent = '아직 학습 전';
  els.topPred.querySelector('.tp-conf').textContent = '';
  els.topPred.querySelector('.tp-name').style.color = '';
  setDonut('top-donut', 0, 'var(--accent)');
}
/* 추론 결과를 신뢰도 막대에 반영하고 최상위 클래스 인덱스를 돌려준다.
   특징 추출은 탭마다 다르지만 막대 갱신 로직은 공통이다. */
function renderProbResults(probs, names, pctId, fillId) {
  let topI = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topI]) topI = i;
  names.forEach((c, i) => {
    const pct = Math.round(probs[i] * 100);
    const fill = $(fillId(i)), lab = $(pctId(i));
    if (fill) fill.style.width = pct + '%';
    if (lab) lab.textContent = pct + '%';
  });
  return topI;
}

async function inferLoop() {
  if (!state.inferring || !state.head || !state.stream) return;
  const probs = tf.tidy(() => {
    const feat = state.mobilenet.infer(els.video, true);
    return state.head.predict(feat).dataSync();
  });
  const names = state.head._classNames;
  const topI = renderProbResults(probs, names, (i) => `pct-${i}`, (i) => `bar-${i}`);

  els.topPred.className = 'top-pred';
  els.topPred.querySelector('.tp-name').textContent = names[topI].name;
  els.topPred.querySelector('.tp-name').style.color = names[topI].color;
  els.topPred.querySelector('.tp-conf').textContent = '확신도 ' + Math.round(probs[topI] * 100) + '%';
  setDonut('top-donut', probs[topI], names[topI].color);

  requestAnimationFrame(inferLoop);
}
function startInfer() {
  if (!state.trained || !state.stream) return;
  state.inferring = true;
  els.inferToggle.textContent = '추론 멈춤';
  els.inferMeta.textContent = 'LIVE';
  setStatus('INFERRING · LIVE', 'live');
  refresh();
  inferLoop();
}
function stopInfer() {
  state.inferring = false;
  els.inferToggle.textContent = '추론 시작';
  els.inferMeta.textContent = 'IDLE';
  if (state.trained) setStatus('TRAINED · READY', 'ready');
  refresh();
}
function toggleInfer() { state.inferring ? stopInfer() : startInfer(); }

/* ── 가드 + 단계 갱신 ─────────────────────────────────── */
function refresh() {
  const withData = state.classes.filter(c => c.embeddings.length > 0);
  const canTrain = state.classes.length >= 2 && withData.length >= 2;
  els.train.disabled = !canTrain;
  if (canTrain && !state.trained) {
    els.trainHint.textContent = '데이터 준비 완료. [모델 학습 시작]을 누르세요.';
  }
  syncStepNav();
}

/* ── 학습 종류 탭 ─────────────────────────────────────── */
document.querySelectorAll('.mode').forEach(m => {
  m.addEventListener('click', () => {
    if (m.classList.contains('disabled')) {
      const tag = m.querySelector('.mode-name')?.textContent || '';
      alert(tag + '은(는) 곧 추가됩니다.');
      return;
    }
  });
});

/* ── 이벤트 ───────────────────────────────────────────── */
els.addClass.onclick = () => addClass();
els.camToggle.onclick = toggleCam;
els.train.onclick = train;
els.inferToggle.onclick = toggleInfer;

/* 클래스별 촬영 — 카드의 [📷 촬영] 버튼: 탭=1장, 길게=연속.
   컨테이너 위임이라 촬영 중 카드가 갱신돼도 롱프레스가 끊기지 않는다. */
let holdTimer = null;
function startClassCapture(id) {
  if (!state.stream) return;
  selectClass(id);
  captureSample();
  clearInterval(holdTimer);
  holdTimer = setInterval(captureSample, 120);
}
function endClassCapture() { clearInterval(holdTimer); holdTimer = null; }
els.classList.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.cap-btn');
  if (!b || b.disabled) return;
  e.preventDefault();
  startClassCapture(+b.dataset.id);
});
window.addEventListener('pointerup', endClassCapture);
window.addEventListener('pointercancel', endClassCapture);

/* 탭/서브탭을 떠날 때 활성 카메라·마이크·추론 루프를 일괄 정리.
   각 toggle 함수는 "켜져 있으면 끈다"는 토글 구조이므로,
   활성 상태일 때만 호출하면 기존 teardown 로직(트랙 stop·RAF cancel)을 그대로 재사용한다. */
function stopAllActivity() {
  if (state.stream)    toggleCam();        // 이미지: 카메라 + stopInfer
  if (pose.stream)     poseToggleCam();    // 동작: 카메라 + 추론 + 오버레이 루프
  if (audio.micStream) audioToggleMic();   // 음성: 마이크 + 파형 루프 + stopInfer
  if (audio.inferring) audioStopInfer();   // 음성 추론(listen)은 마이크와 독립이라 별도 정리
  if (detect.stream)   detectToggle();     // 객체 탐지
  if (seg.stream)      segmentToggle();    // 인물 분리
  if (ff.stream)       filterToggle();     // 영상 필터/모션
  if (ct.stream)       ctToggle();         // 색상 추적
  if (skel.stream)     skelToggle();       // 뼈대 검출
  if (face.stream)     faceToggle();       // 얼굴 검출
  if (depth.stream)    depthToggle();      // 깊이 추정
}

/* 좌측 사이드바 기능 선택 — 도메인(AI 학습/영상처리) 아래 기능들을 평면으로 전환.
   각 기능은 기존 패널(+서브패널)을 재사용하고, 상단 정보 카드를 함께 갱신한다. */
const IC = (p) => `<svg class="ni-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

/* 기능 메타데이터 — 사이드바/정보카드가 모두 이 config 에서 생성된다.
   기능 추가 = 이 객체에 항목 추가 + NAV_GROUPS 에 키 등록만 하면 된다. */
const FEATURES = {
  image:   { name: '이미지 분류', icon: IC('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
    panel: 'panel-direct', type: '지도학습 · 전이학습', model: 'MobileNet v2', desc: '카메라로 직접 클래스를 만들어 사진을 분류합니다. 사전학습 특징에 분류 헤드만 학습합니다.' },
  audio:   { name: '음성 분류', icon: IC('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    panel: 'panel-supervised', sub: 'sub-audio', type: '전이학습', model: 'Speech Commands', desc: '짧은 음성 명령을 녹음해 단어를 분류합니다.' },
  pose:    { name: '동작 분류', icon: IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'),
    panel: 'panel-supervised', sub: 'sub-pose', type: '지도학습 · 전이학습', model: 'MoveNet', desc: '자세 키포인트(관절 위치)를 수집·학습해 동작을 분류합니다.' },

  filter:  { name: '영상 효과(필터)', icon: IC('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>'), badge: '알고리즘',
    panel: 'panel-pretrained', sub: 'sub-filter', type: '영상처리 알고리즘', model: 'Canvas · 프레임 차분', desc: '흑백·색반전·고대비·블러 필터와 모션 감지를 실시간으로 체험합니다.' },
  face:    { name: '얼굴 검출', icon: IC('<circle cx="12" cy="11" r="8"/><path d="M9 10h.01M15 10h.01M9 15s1.2 1.5 3 1.5 3-1.5 3-1.5"/>'), badge: '알고리즘', panel: 'panel-pretrained', sub: 'sub-face',
    type: '영상처리 알고리즘', model: 'BlazeFace', desc: '얼굴 위치를 실시간 박스로 검출합니다(누구인지 식별이 아니라 위치 검출).' },
  skeleton:{ name: '뼈대(포즈) 검출', icon: IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'), badge: '알고리즘', panel: 'panel-pretrained', sub: 'sub-skeleton',
    type: '영상처리 알고리즘', model: 'MoveNet', desc: '학습 없이 관절 뼈대를 실시간으로 그립니다.' },
  colortrack:{ name: '색상 추적', icon: IC('<circle cx="9" cy="9" r="5"/><circle cx="16" cy="15" r="4"/>'), badge: '알고리즘',
    panel: 'panel-pretrained', sub: 'sub-colortrack', type: '영상처리 알고리즘', model: 'RGB 임계값', desc: '선택한 색을 가진 영역만 남기고 배경을 어둡게 처리합니다. 색 물체를 들고 움직여 보세요.' },
  detect:  { name: '객체 탐지', icon: IC('<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>'), badge: '사전학습',
    panel: 'panel-pretrained', sub: 'sub-detect', type: '사전학습 추론', model: 'COCO-SSD', desc: '추가 학습 없이 90종 사물을 실시간으로 박스 탐지합니다.' },
  segment: { name: '인물 분리', icon: IC('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3.5-6 7-6s7 2 7 6"/>'), badge: '사전학습',
    panel: 'panel-pretrained', sub: 'sub-segment', type: '사전학습 추론', model: 'BodyPix', desc: '사람과 배경을 픽셀 단위로 분리합니다(얼굴 인식·분류가 아닙니다).' },
};

/* 사이드바 그룹 구성 — 이 배열 순서대로 렌더된다.
   컨셉 정리: 제작 트랙(직접 만드는 AI)만 노출. 영상처리 체험은 explore.html → stages/*.html 로 분리됨. */
const NAV_GROUPS = [
  { title: '직접 만드는 AI · 제작 트랙', items: ['image', 'audio', 'pose'] },
];

/* 단계 네비 — 학습추론/영상처리 기능군에 따라 단계 라벨이 다르다. */
const LEARN_STEPS = ['클래스 만들기', '데이터 수집', '모델 학습', '추론·평가'];
const VISION_STEPS = ['개념', '실행', '파라미터 조정'];
NAV_GROUPS[0].items.forEach((k) => { if (FEATURES[k]) FEATURES[k].steps = LEARN_STEPS; });

/* 이론 영역 — 학습 정보(데이터·목표·예시) + 알고리즘 정보(원리, K-12 눈높이) */
const THEORY = {
  image:   { learn: '내가 찍은 사진들이 그대로 데이터(데이터셋)가 됩니다(보통 2~4종류). 목표는 카메라에 비친 것을 내가 정한 종류로 자동 분류하기예요. 예: 캔·페트·종이를 구분하는 분리수거 도우미. 사진이 많고 다양할수록 더 똑똑해집니다.',
             algo:  'MobileNet(미리 학습된 모델)이 사진에서 중요한 특징을 뽑아내고, 그 위에 작은 분류기만 새로 배웁니다 — 이걸 전이학습이라고 해요. 큰 모델의 “눈”을 빌려 쓰니 적은 사진으로도 빠르게 배웁니다.' },
  audio:   { learn: '단어마다 짧은 녹음을 여러 개 모읍니다. 목표는 말소리를 단어로 분류하기예요. 예: "켜"/"꺼"로 무언가 제어하기. 조용한 곳에서 같은 단어도 조금씩 다르게 녹음하면 더 잘 배워요.',
             algo:  '소리를 스펙트로그램(소리를 그림으로 바꾼 것)으로 만든 뒤, 사전학습 모델이 특징을 뽑고 분류기만 새로 학습합니다. 즉 “소리 사진”을 분류하는 셈이에요.' },
  pose:    { learn: '동작마다 자세 데이터를 모읍니다. 목표는 몸 동작을 분류하기예요. 예: 만세/앉기를 알아맞히는 자세 게임. 몸 전체가 화면에 들어오게 하면 인식이 안정적이에요.',
             algo:  'MoveNet이 관절 17곳의 위치(좌표)를 찾아내고, 그 좌표만 입력으로 작은 분류기를 학습합니다. 사진 전체가 아니라 “관절 위치”만 보므로 가볍고 빨라요.' },
  filter:  { learn: '학습이 필요 없는 고전 영상처리예요. 목표는 “픽셀 값을 바꾸면 화면이 어떻게 변하는가”를 직접 체험하는 거예요. AI의 영상 처리도 이런 픽셀 계산에서 시작합니다.',
             algo:  '화면의 각 픽셀 색(R·G·B)을 규칙대로 바꿉니다. 흑백=세 색의 평균, 색반전=255−값, 모션감지=직전 프레임과의 차이로 “움직인 부분” 찾기.' },
  colortrack:{ learn: '학습이 필요 없어요. 목표는 “특정 색 찾기”의 원리를 체험하는 거예요. 색이 또렷한 물체를 들고 움직여 보세요. 신호등·과일 선별 같은 곳에 쓰이는 기초 원리예요.',
             algo:  '각 픽셀의 색이 내가 고른 색과 얼마나 가까운지(거리)를 계산해, 가까우면 남기고 멀면 어둡게 가립니다(임계값). 임계값을 바꾸면 더 넓게/좁게 잡혀요.' },
  face:    { learn: '대규모 얼굴 데이터로 미리 학습된 모델을 그대로 씁니다. 목표는 “검출”(어디에 있나)과 “인식”(누구인가)의 차이를 이해하는 거예요. 이 코스는 위치만 찾고 신원은 알지 못합니다(개인정보 안전).',
             algo:  'BlazeFace가 화면을 빠르게 훑어 얼굴이 있을 법한 위치에 상자를 칩니다. 누구인지까지는 판단하지 않고 “위치”만 찾습니다.' },
  skeleton:{ learn: '미리 학습된 자세 추정 모델을 그대로 씁니다. 목표는 컴퓨터가 사람 몸을 어떻게 “점과 선”으로 보는지 체험하는 거예요. 운동 자세 교정·동작 분석 등에 쓰여요.',
             algo:  'MoveNet이 관절 17곳을 찾아 점으로 찍고, 정해진 연결 규칙대로 선을 이어 뼈대를 그립니다. 학습 단계 없이 바로 추론만 합니다.' },
  detect:  { learn: 'COCO(사물 90종) 데이터로 미리 학습된 모델을 그대로 씁니다. 목표는 “잘 학습된 모델”의 힘을 체험하는 거예요. 자율주행·CCTV 분석 등에 쓰이는 기술의 축소판이에요.',
             algo:  'COCO-SSD가 화면을 한 번에 훑어 사물의 위치와 종류를 동시에 예측하고, 상자·이름·확률(%)을 함께 표시합니다.' },
};

function buildSidebar() {
  const nav = document.getElementById('sidebar');
  nav.innerHTML = NAV_GROUPS.map((g) => `
    <div class="nav-group">
      <div class="nav-group-title">${g.title}</div>
      ${g.items.map((key) => {
        const f = FEATURES[key];
        const badge = f.badge ? `<span class="nav-badge${f.disabled ? ' soon' : ''}">${f.badge}</span>` : '';
        return `<button class="nav-item${f.disabled ? ' disabled' : ''}" data-feature="${key}"${f.disabled ? ' disabled' : ''}>
          ${f.icon}<span class="ni-label">${f.name}</span>${badge}
        </button>`;
      }).join('')}
    </div>`).join('');
  nav.querySelectorAll('.nav-item:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => selectFeature(btn.dataset.feature));
  });
}

let currentFeature = 'image';

/* 학습추론 기능의 진행 단계를 계산해 상단 StepNav 에 done/active 로 표시.
   영상처리 기능은 진행 개념이 없어 클릭 하이라이트만 유지. */
function syncStepNav() {
  const sn = $('step-nav'); if (!sn) return;
  const pills = sn.querySelectorAll('.step-pill'); if (!pills.length) return;
  let done = null;
  if (currentFeature === 'image') {
    const u = state.classes.filter(c => c.embeddings.length > 0);
    done = [state.classes.length >= 2, u.length >= 2, state.trained, state.inferring];
  } else if (currentFeature === 'pose') {
    const u = pose.classes.filter(c => c.embeddings.length > 0);
    done = [pose.classes.length >= 2, u.length >= 2, pose.trained, pose.inferring];
  } else if (currentFeature === 'audio') {
    const u = audio.classes.filter(c => c.count > 0);
    done = [audio.classes.length >= 2, u.length >= 2, audio.trained, audio.inferring];
  }
  if (!done) return; // 영상처리 기능
  let active = 0;
  done.forEach((d, i) => { if (d) active = Math.min(3, i + 1); });
  pills.forEach((p, i) => {
    p.classList.toggle('done', !!done[i]);
    p.classList.toggle('active', i === active);
  });
}

function selectFeature(key) {
  const f = FEATURES[key];
  if (!f || f.disabled || !f.panel) return;
  currentFeature = key;
  stopAllActivity();
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.feature === key));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === f.panel));
  if (f.sub) {
    document.getElementById(f.panel).querySelectorAll('.sub-panel').forEach((sp) => {
      const on = sp.id === f.sub;
      sp.classList.toggle('active', on);
      sp.style.display = on ? '' : 'none';
    });
  }
  $('fi-name').textContent = f.name;
  $('fi-type').textContent = f.type;
  $('fi-model').textContent = f.model;
  $('fi-desc').textContent = f.desc;

  // 이론 영역 (학습 정보 / 알고리즘 정보)
  const th = THEORY[key], ft = $('fi-theory');
  if (ft) {
    if (th) { ft.style.display = ''; $('fi-learn').textContent = th.learn; $('fi-algo').textContent = th.algo; }
    else ft.style.display = 'none';
  }

  // 상단 단계 네비 (config.steps 기반)
  const sn = $('step-nav');
  if (sn) {
    if (f.steps && f.steps.length) {
      sn.style.display = '';
      sn.innerHTML = f.steps.map((s, i) =>
        `<button class="step-pill${i === 0 ? ' active' : ''}" data-step="${i}"><span class="step-pill-num">${i + 1}</span>${s}</button>`
      ).join('<span class="step-sep"></span>');
      sn.querySelectorAll('.step-pill').forEach((b) => b.addEventListener('click', () => {
        sn.querySelectorAll('.step-pill').forEach((x) => x.classList.toggle('active', x === b));
      }));
      syncStepNav(); // 학습추론 기능이면 진행상황 반영
    } else {
      sn.innerHTML = '';
      sn.style.display = 'none';
    }
  }
}

buildSidebar();

document.getElementById('gallery-close').addEventListener('click', closeGallery);
document.getElementById('gallery-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'gallery-overlay') closeGallery();
});
document.getElementById('audio-rec-close').addEventListener('click', closeAudioRec);
document.getElementById('audio-rec-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'audio-rec-overlay') closeAudioRec();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeGallery(); closeAudioRec(); }
});

init();
poseInit();
audioInit();
detectInit();
segmentInit();
filterInit();
ctInit();
skelInit();
faceInit();
// depthInit(); // 깊이 추정(ARPortraitDepth)은 실험적·불안정으로 탭 숨김 처리 (JS는 휴면)

/* 비전 콘솔 진입 — explore.html / create.html 의 스테이지 카드에서 #<기능키>로 들어온다.
   특정 기능키(#detect, #image 등) → 해당 기능, #explore/#create → 트랙 첫 기능, 그 외 기본값 */
(function entryFromStudio() {
  const h = (location.hash || '').replace('#', '');
  if (FEATURES[h] && FEATURES[h].panel) selectFeature(h);
  else if (h === 'explore') selectFeature('detect');
  else if (h === 'create') selectFeature('image');
  else selectFeature('image'); // 기본
})();

// 비보안 컨텍스트(예: LAN IP + HTTP)에서는 getUserMedia 가 권한 창 없이 차단됨 → 안내 배너
if (!window.isSecureContext) {
  const w = $('insecure-warn');
  if (w) { w.style.display = 'block'; const o = $('insecure-origin'); if (o) o.textContent = location.host; }
}
