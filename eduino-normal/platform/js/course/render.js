/* 화면 전환 — 쿼리스트링 코스 선택에 맞춰 히어로·미리보기·학습 목록·4단계 채우기 */
(function () {
  const IC = window.IC;
  const ICONS = window.ICONS;
  const COURSES = window.COURSES;
  const ORDER = window.ORDER;

    const key = new URLSearchParams(location.search).get('c');
    const dkey = COURSES[key] ? key : 'vision';
    const c = COURSES[dkey];
    document.title = c.name + ' — Eduino AI';
    document.getElementById('c-ic').innerHTML = ICONS[dkey];
    document.getElementById('c-name').textContent = c.name;
    document.getElementById('cr-name').textContent = c.name;
    document.getElementById('c-tag').textContent = c.tagline;
    document.getElementById('c-start').href = c.href;
    document.getElementById('nav-cta').href = c.href;

    document.getElementById('demo-in').textContent = c.demo.in;
    document.getElementById('demo-proc').textContent = c.demo.proc;
    document.getElementById('demo-out').textContent = c.demo.out;
    document.getElementById('demo-cap').innerHTML = '<p>' + c.demo.cap + '</p>';
    /* 입력 · 학습/추론 · 출력 아이콘 — 옆에 붙는 문구가 코스마다 다르므로 아이콘도
       COURSES[].demo.ic 에서 코스별로 가져온다. 페이지의 다른 아이콘과 같은 IC() 로
       만들어 굵기·뷰박스를 맞추고, 색은 .pnode.* .pic 의 color 를 따른다. */
    ['in', 'proc', 'out'].forEach(k => {
      const el = document.querySelector('.pnode.' + k + ' .pic');
      if (el && c.demo.ic && c.demo.ic[k]) el.innerHTML = IC(c.demo.ic[k]);
    });

    const LIC = [
      IC('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>'),
      IC('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
      IC('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'),
      IC('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'),
    ];
    document.getElementById('c-learn').innerHTML = c.learn.map((it, i) => `<div class="learn-card"><span class="lc-ic i${i}">${LIC[i % LIC.length]}</span><div class="lc-body"><h3>${it.t}</h3><p>${it.d}</p></div></div>`).join('');
    /* 4단계 학습 과정 — [체험 시작] 이 여는 modules/shared/course-dashboard.js 의
       STEP_LABELS(사전 진단 · 이론 학습 · 실습 퀘스트 · 최종 평가) 와 같은 순서다.
       문항·개념 수는 코스마다 다르므로 여기 적지 않고 course-config.js 에서 읽는다.
       무료/유료 구간은 카드가 아니라 아래 각주(#c-freenote) 한 줄이 말한다. */

    function renderSteps(cfg) {
      /* 개수를 못 읽었을 때는 숫자 없는 이름으로 떨어뜨린다 — 배지가 비지 않게 */
      const cnt = (arr, fmt, fallback) => (Array.isArray(arr) && arr.length) ? fmt(arr.length) : fallback;
      /* 요금 표시는 카드에 달지 않는다 — 코스마다 값이 다른 개수 칩만 남기고,
         무료/유료 구간은 아래 각주(#c-freenote) 한 줄이 책임진다. */
      const steps = [
        {
          title: '사전 진단',
          badge: cnt(cfg.precheck, v => `OX ${v}문항`, 'OX 문항'),
          desc: '점수를 매기는 시험이 아니에요. 아는 개념을 가려내 이론 학습 경로를 맞춰 줍니다.'
        },
        {
          title: '이론 학습',
          badge: cnt(cfg.theory, v => `핵심 개념 ${v}개`, '핵심 개념'),
          desc: '정의 → 예시 → 실무 활용 순서로 개념을 읽습니다.'
        },
        {
          title: '실습 퀘스트',
          badge: `${c.curriculum.length}단계`,
          desc: c.curriculum.map(u => u.title).join(' → ')
        },
        {
          title: '최종 평가',
          badge: cnt(cfg.quiz, v => `${v}문항`, '평가 문항'),
          desc: '문항을 풀면 즉시 채점하고, 문항별 해설을 보여 줍니다.'
        },
      ];
      document.getElementById('c-steps').innerHTML = steps
        .map((s, i) =>
          `<div class="flow-node t${i + 1}">` +
          `<div class="fn-head"><span class="fn-step">0${i + 1}</span><span class="fn-badge">${s.badge}</span></div>` +
          `<h3>${s.title}</h3><p>${s.desc}</p></div>`)
        .join('<div class="flow-arrow"></div>');
    }

    /* modules/<코스>/course-config.js 는 최상위에서 CourseDashboard.init(...) 만 부른다 (6개 코스 확인).
       그래서 셰임 하나로 데이터만 받아 낸다 — modules/ 쪽은 읽기만 하고 고치지 않는다.
       먼저 개수 없이 한 번 그려 두므로, 로드가 실패해도 이 블록이 비지 않는다. */
    renderSteps({});
    window.CourseDashboard = { init: (cfg) => renderSteps(cfg || {}) };
    const cfgScript = document.createElement('script');
    cfgScript.src = `../modules/${dkey}/course-config.js`;
    document.head.appendChild(cfgScript);

    document.getElementById('c-freenote').innerHTML =
      '<b>사전 진단부터 최종 평가까지 전체 단계</b> 가 결제 없이 열려 있어요.';
    document.getElementById('c-other').innerHTML = ORDER.filter(k => k !== dkey).map(k => `<a href="./course.html?c=${k}">${COURSES[k].name}</a>`).join('');

  window.dkey = dkey;
})();
