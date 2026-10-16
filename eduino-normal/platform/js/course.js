const IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const CK = IC('<path d="M20 6 9 17l-5-5"/>');
const ICONS = {
  vision: IC('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  gesture: IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'),
  data: IC('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>'),
  text: IC('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  life: IC('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z"/>'),
  concept: IC('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><path d="M8 7l8 0M8 16l8-8"/>'),
};
const COURSES = {
  vision: {
    name:'비전 · 영상처리 AI', href:'../modules/vision/index.html', audience:'초등~중등',
    tagline:'카메라로 “보는 AI”. 물체를 탐지하고, 내 사진으로 분류 AI를 만들어 실제 판정 업무에 투입해 봅니다.',
    learn:[
      {t:'실시간 객체 탐지', d:'카메라에 잡힌 80종의 물체를 상자로 찾아내요.'},
      {t:'이미지는 숫자다', d:'흑백으로 바꿔도 인식되는 걸 보며 AI 가 색이 아닌 형태를 본다는 걸 알아요.'},
      {t:'나만의 분류 AI 학습', d:'내 사진을 모아 전이학습으로 분류기를 만들고 혼동행렬로 평가해요.'},
      {t:'현장 투입 판단', d:'정밀도·재현율로 이 모델을 실제로 써도 되는지 결론을 내려요.'},
    ],
    curriculum:[
      {t:'초급 · 체험', title:'실시간 객체 탐지', desc:'80종을 상자로 찾고, 필터·임계값을 바꿔가며 관찰해요.'},
      {t:'중급 · 제작', title:'내 분류기 만들기', desc:'전이학습으로 학습시키고 혼동행렬로 성능을 읽어요.'},
      {t:'심화 · 응용', title:'자동 판정 도입 미션', desc:'만든 분류기를 실무에 투입해 정밀도·재현율로 판단해요.'},
    ],
    needs:[['📷','웹캠','웹캠이 있는 PC 또는 태블릿'],['🌐','브라우저','크롬 등 최신 브라우저'],['🔒','보안 접속','https 또는 localhost (카메라 권한 허용)']],
    tech:['MobileNet','COCO-SSD','TensorFlow.js'],
    tip:'<b>도입(5분)</b> 흑백·윤곽선으로 바꿔도 인식되는 걸 보여주며 “AI 는 형태를 본다” 각인 → <b>전개</b> 임계값을 올렸다 내리며 놓침↔헛다리 저울질을 관찰하고, 학생별 사진을 모아 분류 AI 제작 → <b>정리</b> 혼동행렬에서 새는 방향을 찾아 “데이터가 왜 중요한가” 토론.'
  },
  gesture: {
    name:'제스처 · 동작 AI', href:'../modules/gesture/index.html', audience:'초등~중등',
    tagline:'손 관절을 실시간 추적해 가위바위보를 인식하고, 내 제스처를 학습시켜 봅니다.',
    learn:[
      {t:'손 관절 추적', d:'손 21개 관절을 실시간으로 추적해요.'},
      {t:'규칙 기반 추론', d:'관절 위치로 가위·바위·보를 판별해요.'},
      {t:'내 제스처 학습', d:'내 제스처를 모아 전이학습으로 분류 AI를 만들어요.'},
      {t:'학습 결과 분석', d:'학습 곡선·혼동행렬로 추론 결과를 확인해요.'},
    ],
    curriculum:[
      {t:'초급 · 체험', title:'가위바위보', desc:'손 관절 추적으로 손 모양을 즉시 인식해요.'},
      {t:'중급 · 제작', title:'내 제스처 학습', desc:'제스처별 데이터를 모아 AI를 학습시켜요.'},
      {t:'심화 · 응용', title:'모델로 대결', desc:'학습한 모델로 가위바위보 대결을 하며 임계값을 조절하고, 규칙 기반 판정과 비교해요.'},
    ],
    needs:[['📷','웹캠','웹캠이 있는 PC 또는 태블릿'],['🌐','브라우저','크롬 등 최신 브라우저'],['🔒','보안 접속','https 또는 localhost (카메라 권한)']],
    tech:['Handpose','TensorFlow.js'],
    tip:'손 모양을 다양한 각도·거리로 모을수록 정확도가 올라가요. 반 전체가 같은 제스처를 모아 “데이터 양 = 똑똑함”을 체감시켜 보세요.'
  },
  data: {
    name:'데이터 · 예측 AI (AIoT)', href:'../modules/data/index.html', audience:'중·고~대학',
    tagline:'표·데이터의 관계를 보고, 예측 모델을 학습시키고, 비슷한 것끼리 자동으로 무리 짓습니다.',
    learn:[
      {t:'관계 관찰', d:'데이터의 상관관계를 그래프로 살펴봐요.'},
      {t:'회귀 학습·예측', d:'경사하강법으로 회귀를 학습해 값을 예측해요.'},
      {t:'자동 군집화', d:'정답 없이 비슷한 데이터를 K-means로 묶어요.'},
      {t:'핵심 개념 체득', d:'상관관계·회귀·군집화를 하나의 흐름으로 이어서 다뤄요.'},
    ],
    curriculum:[
      {t:'초급 · 관찰', title:'관계 살펴보기', desc:'산점도·추세선으로 두 값의 관계를 읽어요.'},
      {t:'중급 · 예측', title:'예측 모델 만들기', desc:'점을 찍어 직선/곡선을 학습시켜 예측해요.'},
      {t:'심화 · 군집', title:'무리 짓기', desc:'정답 없이 비슷한 데이터를 색으로 자동 분류.'},
    ],
    needs:[['💻','PC/태블릿','마우스·터치로 점 찍기 좋은 화면'],['🌐','브라우저','크롬 등 최신 브라우저'],['✅','준비물 없음','카메라 불필요']],
    tech:['TensorFlow.js','K-means'],
    tip:'“공부시간↔점수” 같은 친숙한 예시로 시작해, 학생이 직접 점을 찍어 예측선이 따라오는 걸 보여주면 이해가 빨라요.'
  },
  text: {
    name:'텍스트 · 언어 AI', href:'../modules/text/index.html', audience:'중등~대학',
    tagline:'글을 숫자로 바꿔 비슷한 말을 찾고, 예문을 모아 문장 분류 AI를 직접 학습시킵니다.',
    learn:[
      {t:'문장을 숫자로', d:'문장을 벡터로 바꾸는 원리를 이해해요.'},
      {t:'닮은 정도 비교', d:'문장 간 유사도를 수치로 비교해요.'},
      {t:'문장 분류 학습', d:'분류별 예문을 모아 분류 AI를 학습시켜요.'},
      {t:'추론 근거 확인', d:'AI가 어떤 단어를 보고 추론하는지 확인해요.'},
    ],
    curriculum:[
      {t:'초급 · 체험', title:'비슷한 말 찾기', desc:'문장을 써서 보기와 닮은 정도를 비교해요.'},
      {t:'중급 · 제작', title:'문장 분류 만들기', desc:'예문을 모아 분류 AI를 학습시켜요.'},
      {t:'심화 · 응용', title:'고객 리뷰 분류기', desc:'리뷰를 분류하고 임계값을 조절해 실무 미션을 해결해요.'},
    ],
    needs:[['💻','PC/태블릿','키보드 입력이 편한 환경'],['🌐','브라우저','크롬 등 최신 브라우저'],['✅','준비물 없음','카메라 불필요']],
    tech:['TensorFlow.js','Bag-of-words'],
    tip:'“칭찬/불평”처럼 대비되는 분류로 시작하면 효과가 또렷해요. 학생이 예문을 직접 추가해 정확도가 오르는 걸 체험시켜 보세요.'
  },
  life: {
    name:'생활 속 인식 AI', href:'../modules/life/index.html', audience:'초등~중등',
    tagline:'카메라로 QR·바코드를 읽고, 사진 속 글자를 인식(OCR)합니다. 생활 속 AI를 체험해요.',
    learn:[
      {t:'복원 원리 이해', d:'QR·바코드가 숫자/글자로 복원되는 원리를 배워요.'},
      {t:'실시간 스캔·추론', d:'카메라로 코드를 즉시 읽어 기록해요.'},
      {t:'글자 인식(OCR)', d:'사진 속 글자를 텍스트로 변환해요.'},
      {t:'인식 한계 분석', d:'흐림·기울기 등 어떤 조건에서 인식이 실패하는지 확인해요.'},
    ],
    curriculum:[
      {t:'초급 · 체험', title:'QR·바코드 스캔', desc:'코드를 비추면 즉시 읽어 기록해요.'},
      {t:'중급 · 제작', title:'글자 인식(OCR)', desc:'촬영한 글자를 텍스트로 바꿔요.'},
      {t:'심화 · 응용', title:'인식 한계와 자동화', desc:'실패 조건을 분석하고 문서 처리 자동화까지 연결해요.'},
    ],
    needs:[['📷','웹캠','웹캠이 있는 PC 또는 태블릿'],['🖨','인쇄물','실습용 QR·바코드 시트(제공)'],['🔒','보안 접속','https 또는 localhost (카메라 권한)']],
    tech:['jsQR','ZXing','Tesseract.js'],
    tip:'코스 안의 “실습용 코드 인쇄” 시트를 미리 출력해 나눠주면 바로 스캔 실습이 가능해요.'
  },
  concept: {
    name:'머신러닝 개념 실험실', href:'../modules/concept/index.html', audience:'고교~대학',
    tagline:'결정 경계·과적합, 지도학습 vs 비지도학습을 직접 그려보며 핵심 개념을 익힙니다.',
    learn:[
      {t:'결정 경계 학습', d:'정답(색)을 칠해 분류 경계를 학습해요.'},
      {t:'과적합 이해', d:'모델 복잡도와 과적합/일반화의 관계를 봐요.'},
      {t:'지도 vs 비지도', d:'두 학습 방식의 차이를 직접 비교해요.'},
      {t:'개념을 눈으로', d:'데이터로 추상 개념을 시각적으로 이해해요.'},
    ],
    curriculum:[
      {t:'초급 · 분류', title:'결정 경계 그리기', desc:'라벨을 칠해 경계를 학습하고 과적합까지 체험해요.'},
      {t:'중급 · 비교', title:'지도 vs 비지도', desc:'정답이 있을 때와 없을 때가 어떻게 다른지 비교해요.'},
      {t:'심화 · 검증', title:'같은 데이터, 다른 질문', desc:'군집 결과와 실제 정답을 겹쳐 보며 차이를 읽어요.'},
    ],
    needs:[['💻','PC/태블릿','클릭으로 점 찍기 좋은 화면'],['🌐','브라우저','크롬 등 최신 브라우저'],['✅','준비물 없음','카메라 불필요']],
    tech:['TensorFlow.js'],
    tip:'복잡도를 1→3으로 올리며 경계가 “점에 달라붙는” 과적합을 보여주면 추상 개념이 단번에 이해돼요.'
  },
};
const ORDER = ['concept','data','text','vision','gesture','life'];
// 배우는 것 카드 아이콘 (관찰 → 학습 → 응용 → 이해)
const LIC = [
  IC('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>'),
  IC('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  IC('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'),
  IC('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'),
];

const key = new URLSearchParams(location.search).get('c');
const dkey = COURSES[key] ? key : 'vision';
const c = COURSES[dkey];
document.title = c.name + ' — Eduino AI';
document.getElementById('c-ic').innerHTML = ICONS[dkey];
document.getElementById('c-name').textContent = c.name;
document.getElementById('cr-name').textContent = c.name;
document.getElementById('c-tag').textContent = c.tagline;
document.getElementById('c-chips').innerHTML =
  `<span class="chip aud">대상 ${c.audience}</span><span class="chip lv">초급</span><span class="chip lv">중급</span><span class="chip lv">심화</span>`;
document.getElementById('c-start').href = c.href;
document.getElementById('nav-cta').href = c.href;
document.getElementById('c-learn').innerHTML = c.learn.map((it, i) => `<div class="learn-card"><span class="lc-ic i${i}">${LIC[i % LIC.length]}</span><div class="lc-body"><h3>${it.t}</h3><p>${it.d}</p></div></div>`).join('');
document.getElementById('c-curr').innerHTML = c.curriculum
  .map((u, i) => `<div class="flow-node t${i+1}"><span class="fn-step">${i+1}</span><span class="fn-badge">${u.t}</span><h3>${u.title}</h3><p>${u.desc}</p></div>`)
  .join('<div class="flow-arrow"></div>');
document.getElementById('c-needs').innerHTML = c.needs.map(n => `<div class="n"><span class="ic">${n[0]}</span><span><b>${n[1]}</b> · ${n[2]}</span></div>`).join('');
document.getElementById('c-tech').innerHTML = (c.tech || []).map(t => `<span class="tech">${t}</span>`).join('');
document.getElementById('c-tip').innerHTML = c.tip;
document.getElementById('c-other').innerHTML = ORDER.filter(k => k !== dkey).map(k => `<a href="./course.html?c=${k}">${COURSES[k].name}</a>`).join('');

/* 동작 미리보기 애니메이션은 ../modules/shared/course-preview.js 단일 소스를 쓴다.
   (학습 대시보드 1단계 '학습 미리보기' 와 같은 파일) */
if (window.CoursePreview) CoursePreview.mount(document.querySelector('.demo'), dkey);
