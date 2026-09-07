(function () {
    const IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    const CK = IC('<path d="M20 6 9 17l-5-5"/>');

    /* 목업 사이드바 아이콘 */
    const SIDE = [
      IC('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
      IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'),
      IC('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>'),
      IC('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    ];
    document.getElementById('mock-side').innerHTML = SIDE.map((s, i) => `<b class="${i === 0 ? 'act' : ''}">${s}</b>`).join('');

    /* ── 히어로 라이브 데모: 추론 결과를 순환 재생 ── */
    (function () {
      const DC = 251.3; // 2πr (r=40)
      const STATES = [
        { tag: '웃음 😊', labels: ['웃음', '무표정', '놀람'], probs: [0.86, 0.10, 0.04] },
        { tag: '놀람 😮', labels: ['웃음', '무표정', '놀람'], probs: [0.08, 0.13, 0.79] },
        { tag: '무표정 😐', labels: ['웃음', '무표정', '놀람'], probs: [0.12, 0.74, 0.14] },
      ];
      const rows = document.getElementById('m-rows');
      const arc = document.getElementById('m-arc');
      const pct = document.getElementById('m-pct');
      const tag = document.getElementById('m-tag');
      if (!rows || !arc) return;
      // 막대 골격 생성(라벨은 고정)
      rows.innerHTML = STATES[0].labels.map((l, i) =>
        `<div class="row"><span class="lab">${l}</span><span class="track"><span class="fill" id="m-fill-${i}"></span></span></div>`).join('');
      const fills = STATES[0].labels.map((_, i) => document.getElementById('m-fill-' + i));

      let cur = 0; // 현재 표시 중인 도넛 %
      function apply(s) {
        const top = Math.round(Math.max(...s.probs) * 100);
        s.probs.forEach((p, i) => { fills[i].style.width = Math.round(p * 100) + '%'; });
        arc.setAttribute('stroke-dasharray', (Math.max(...s.probs) * DC).toFixed(1) + ' ' + DC);
        tag.textContent = s.tag;
        const step = () => { if (cur === top) return; cur += (cur < top ? 1 : -1); pct.textContent = cur + '%'; requestAnimationFrame(step); };
        step();
      }
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let i = 0; apply(STATES[0]);
      if (!reduce) setInterval(() => { i = (i + 1) % STATES.length; apply(STATES[i]); }, 2600);
    })();



    /* ── 진행 4단계 캐러셀 ──
       라벨·순서·설명은 platform/course.html 의 renderSteps() 와 같은 내용이다.
       course.html 은 코스가 정해져 있어 개수 배지를 course-config.js 에서 읽지만,
       랜딩은 코스가 정해지지 않았으므로 숫자 없이 종류만 적는다. */
    const FLOW = [
      {
        title: '사전 진단', badge: 'OX 문항',
        desc: '아는 개념을 가려내 이어지는 이론 학습 경로를 맞춰 줍니다.',
        shot: 'step-1', alt: '사전 진단 화면 — OX 문항을 하나씩 풀며 아는 개념을 가려낸다'
      },
      {
        title: '이론 학습', badge: '핵심 개념',
        desc: '정의 → 예시 → 실무 활용 순서로, 진단에서 걸러진 개념부터 읽습니다.',
        shot: 'step-2', alt: '이론 학습 화면 — 핵심 개념 카드가 나열되고 카드를 눌러 상세 설명으로 들어간다'
      },
      {
        title: '실습 퀘스트', badge: '단계별 실습',
        desc: '직접 데이터를 만들고 모델을 학습시켜, 경계가 어떻게 그어지는지 눈으로 확인합니다.',
        shot: 'step-3', alt: '실습 퀘스트 화면 — 찍은 점들을 학습시키자 배경이 두 색으로 갈리며 분류 경계가 나타난 모습'
      },
      {
        title: '최종 평가', badge: '4지선다',
        desc: '문항을 풀면 즉시 채점하고, 문항별 해설과 완주 리포트를 보여 줍니다.',
        shot: 'step-4', alt: '최종 평가 화면 — 4지선다 문항과 보기 네 개'
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
         네 장 합쳐 148KB 뿐이라 전부 받되 히어로와 경쟁하지 않게 우선순위만 낮춘다.
         width/height 는 쓰지 않는다. 장마다 원본 픽셀 크기가 다르기 때문이다(내용에 맞춰
         잘라 900x563 짜리도 있고 1200x750 짜리도 있다). 비율은 모두 16:10 이고,
         자리 예약은 .fs-shot 의 aspect-ratio 가 이미 하고 있어 흔들리지 않는다. */
      track.innerHTML = FLOW.map((s, i) =>
        `<article class="fslide fs-t${i + 1}" role="group" aria-roledescription="슬라이드" aria-label="${i + 1} / ${FLOW.length} · ${s.title}">
        <div class="fs-text">
          <div class="fs-head"><span class="fs-num">0${i + 1}</span><span class="fs-badge">${s.badge}</span></div>
          <h3>${s.title}</h3><p>${s.desc}</p>
        </div>
        <div class="fs-shot">
          <img src="./img/flow/${s.shot}.webp" alt="${s.alt}"
            decoding="async" fetchpriority="${i === 0 ? 'high' : 'low'}">
        </div>
      </article>`).join('');

      dots.innerHTML = FLOW.map((s, i) =>
        `<button class="fcar-dot" type="button" data-go="${i}" aria-label="${i + 1}단계 ${s.title}"></button>`).join('');

      const slides = [...track.children];
      const dotEls = [...dots.children];
      let idx = 0;

      /* 4단계는 순서가 있는 흐름이라 끝에서 처음으로 되감지 않는다 — 양끝에서 버튼을 끈다 */
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

    /* 코스 카탈로그 */
    const MODULES = [
      {
        key: 'concept', name: '머신러닝 개념 실험실', live: true, href: '../modules/concept/index.html',
        icon: IC('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><path d="M8 7l8 0M8 16l8-8"/>'),
        desc: '결정 경계와 과적합, 지도 vs 비지도학습을 직접 그려 보며 비교.',
        lv: { 초급: '분류 경계 그리기·과적합 체험', 중급: '지도 vs 비지도 비교', 심화: '군집 결과와 정답 겹쳐 보기' }
      },
      {
        key: 'data', name: '데이터 · 예측 AI (AIoT)', live: true, href: '../modules/data/index.html',
        icon: IC('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>'),
        desc: '표 데이터의 관계를 관찰하고, 예측 모델을 만들고, 비슷한 것끼리 자동으로 묶어 봅니다.',
        lv: { 초급: '산점도로 두 값의 관계 관찰', 중급: '다음 값을 맞히는 예측 모델', 심화: '군집화로 비슷한 것끼리 묶기' }
      },
      {
        key: 'text', name: '텍스트 · 언어 AI', live: true, href: '../modules/text/index.html',
        icon: IC('<path d="M4 6h16M4 12h16M4 18h10"/>'),
        desc: '글을 숫자로 바꿔 닮은 정도를 재고, 예문으로 분류기를 만들어 실무 미션까지.',
        lv: { 초급: '비슷한 말 찾기·유사도', 중급: '예문으로 문장 분류기 학습', 심화: '고객 리뷰 분류·임계값 미션' }
      },
      {
        key: 'vision', name: '비전 · 영상처리 AI', live: true, href: '../modules/vision/index.html',
        icon: IC('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
        desc: '객체 탐지로 AI 의 눈을 관찰하고, 내 분류기를 학습시켜 실제 판정 업무에 투입해 봅니다.',
        lv: { 초급: '객체 탐지·픽셀과 임계값 관찰', 중급: '전이학습으로 내 분류기 제작', 심화: '정밀도·재현율로 도입 판단' }
      },
      {
        key: 'gesture', name: '제스처 · 동작 AI', live: true, href: '../modules/gesture/index.html',
        icon: IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'),
        desc: '손 관절 추적·가위바위보 인식부터 내 제스처 학습·제어까지.',
        lv: { 초급: '손 21관절 추적·가위바위보', 중급: '내 제스처 수집→전이학습', 심화: '학습한 모델로 가위바위보 대결' }
      },
      {
        key: 'life', name: '생활 속 인식 AI', live: true, href: '../modules/life/index.html',
        icon: IC('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z"/>'),
        desc: 'QR·바코드와 글자 인식(OCR)을 체험하고, 인식이 실패하는 조건까지 분석.',
        lv: { 초급: 'QR·바코드 찾기', 중급: '글자 인식(OCR)', 심화: '인식 한계 분석·문서 처리 자동화' }
      },
    ];
    document.getElementById('catalog').innerHTML = MODULES.map(m => {
      const tag = m.live ? 'a' : 'div', href = m.live ? ` href="./course.html?c=${m.key}"` : '';
      const status = m.live ? '<span class="tag on">● 체험 가능</span>' : '<span class="tag off">준비중</span>';
      const cls = ['b1', 'b2', 'b3'];
      const lv = Object.entries(m.lv).map(([k, v], i) => `<div class="r ${cls[i]}"><b>${k}</b><span>${v}</span></div>`).join('');
      return `<${tag} class="mod ${m.live ? 'live' : 'soon'}"${href}>
    <div class="mod-top"><div class="mod-ic">${m.icon}</div>${status}</div>
    <h3>${m.name}</h3><p class="d">${m.desc}</p>
    <div class="lv">${lv}</div>
    <div class="foot"><span class="go">${m.live ? '자세히 보기 →' : '곧 공개'}</span></div>
  </${tag}>`;
    }).join('');

    /* ── 마감: 헤더 스크롤 상태 + 스크롤 등장(스태거) ── */
    (function () {
      const bar = document.querySelector('.topbar');
      const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // 등장 대상: 섹션 헤더 + 카드 그룹들
      const groups = [
        ['.head'],
        ['.fcar'],
        ['#catalog .mod'],
        ['.mock-wrap'],
      ];
      const targets = [];
      groups.forEach(([sel]) => {
        const els = [...document.querySelectorAll(sel)];
        els.forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = (Math.min(i, 4) * 55) + 'ms'; targets.push(el); });
      });
      if (reduce || !('IntersectionObserver' in window)) {
        targets.forEach(el => el.classList.add('in'));
        return;
      }
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      targets.forEach(el => io.observe(el));
    })();
})();
