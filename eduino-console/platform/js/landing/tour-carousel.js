/* 콘솔 투어 캐러셀 */
(function () {
/* ── 콘솔 투어 캐러셀 ──
   normal/platform/index.html 의 같은 이름 블록과 동작 코드가 같다 — 내용만 다르다.
   장수는 '단계 수' 가 아니라 '보여줄 화면 수' 다. 02·03 은 같은 목록의 두 보기 방식,
   04·05 는 스테이지가 가질 수 있는 두 모양이라 각각 한 묶음이고 색이 같다.
   그래서 배지가 단계 번호 대신 트랙 이름이나 대상을 든다.
   문구는 console/shared.js 의 TRACKS[].desc 및 entry.html 의 모드 설명과 같은 뜻으로
   유지할 것. 화면이 바뀌면 platform/img/flow/ 의 스크린샷도 함께 다시 찍는다. */
const FLOW = [
  {
    title: '입장', badge: '세 가지 모드',
    desc: '체험 · 수업 개설 · 수업 참여 중 하나를 고르면 바로 시작합니다. 가입도 설치도 없어요.',
    shot: 'tour-1-entry', alt: '입장 화면 — 체험 모드 · 수업 개설 · 수업 참여 세 카드'
  },
  {
    title: '카드로 고르기', badge: 'TRACK 01 · 체험 5종',
    desc: '스테이지를 카드로 넘겨 보며 고릅니다. 학습 없이 바로 관찰하는 다섯 가지예요.',
    shot: 'tour-2-cards', alt: '스테이지 선택 화면 — 체험 스테이지 카드를 좌우로 넘겨 보는 모습'
  },
  {
    title: '로드맵으로 보기', badge: 'TRACK 02 · 제작 3종',
    desc: '같은 목록을 경로로 펼쳐 한눈에 봅니다. 카드와 로드맵은 상단바에서 바로 오갈 수 있어요.',
    shot: 'tour-3-map', alt: '로드맵 화면 — 이미지 · 음성 · 동작 분류 세 미션이 경로로 이어진 모습'
  },
  {
    title: '바로 관찰', badge: '학습 없이',
    desc: '카메라만 켜면 AI가 바로 작동합니다. 컴퓨터가 화면 속 세상을 어떻게 보는지 관찰해요.',
    shot: 'tour-4-stage', alt: '객체 탐지 스테이지 화면 — 카메라를 켜면 사물을 실시간으로 찾아 박스로 표시한다'
  },
  {
    title: '직접 제작', badge: '내 데이터로',
    desc: '클래스 만들기 → 데이터 수집 → 모델 학습 → 추론·평가. 나만의 AI를 완성해요.',
    shot: 'tour-5-make', alt: '이미지 분류 제작 화면 — 클래스 만들기부터 추론·평가까지 4단계 작업대'
  },
  {
    title: '수업 운영', badge: '교사용',
    desc: '수업명을 적으면 6자리 코드가 발급됩니다. 학급 전체가 그 코드로 함께 들어와요.',
    shot: 'tour-6-class', alt: '수업 개설 화면 — 수업명과 인원을 적고 코드를 발급받는 창'
  },
];

(function () {
  const car = document.getElementById('flow-car');
  const track = document.getElementById('flow-track');
  const dots = document.getElementById('flow-dots');
  if (!car || !track || !dots) return;
  const prev = car.querySelector('.fcar-nav.prev');
  const next = car.querySelector('.fcar-nav.next');

  /* lazy 를 쓰지 않는다. 2~4번 슬라이드는 트랙 안에서 오른쪽으로 한두 화면 밀려 있어
     lazy 임계 밖이라, 화살표를 눌러야 그때 받아오기 시작해 빈 칸이 번쩍인다.
     width/height 는 실제 파일 픽셀 — 이미지가 늦게 와도 자리가 안 흔들린다. */
  track.innerHTML = FLOW.map((s, i) =>
    `<article class="fslide fs-t${i + 1}" role="group" aria-roledescription="슬라이드" aria-label="${i + 1} / ${FLOW.length} · ${s.title}">
      <div class="fs-text">
        <div class="fs-head"><span class="fs-num">0${i + 1}</span><span class="fs-badge">${s.badge}</span></div>
        <h3>${s.title}</h3><p>${s.desc}</p>
      </div>
      <div class="fs-shot">
        <img src="img/flow/${s.shot}.webp" alt="${s.alt}" width="1200" height="750"
          decoding="async" fetchpriority="${i === 0 ? 'high' : 'low'}">
      </div>
    </article>`).join('');

  dots.innerHTML = FLOW.map((s, i) =>
    `<button class="fcar-dot" type="button" data-go="${i}" aria-label="${i + 1}번째 ${s.title}"></button>`).join('');

  const slides = [...track.children];
  const dotEls = [...dots.children];
  let idx = 0;

  /* 앞에서 뒤로 흐르는 순서라 끝에서 처음으로 되감지 않는다 — 양끝에서 버튼을 끈다 */
  function go(n) {
    idx = Math.max(0, Math.min(FLOW.length - 1, n));
    track.style.transform = `translateX(${-idx * 100}%)`;
    slides.forEach((el, i) => el.setAttribute('aria-hidden', String(i !== idx)));
    dotEls.forEach((el, i) => el.setAttribute('aria-current', String(i === idx)));
    prev.disabled = idx === 0;
    next.disabled = idx === FLOW.length - 1;
  }

  prev.addEventListener('click', () => go(idx - 1));
  next.addEventListener('click', () => go(idx + 1));
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(+b.dataset.go);
  });
  car.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
  });

  /* 태블릿 스와이프. 세로 스크롤은 CSS touch-action:pan-y 가 그대로 넘겨준다 */
  const view = car.querySelector('.fcar-view');
  let x0 = null;
  view.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  view.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 44) go(idx + (dx < 0 ? 1 : -1));
  });
  view.addEventListener('pointercancel', () => { x0 = null; });

  go(0);
})();
})();
