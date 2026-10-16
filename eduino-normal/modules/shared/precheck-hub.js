/* 인공지능 사전진단(무료) — 6개 코스의 사전 진단을 파트별 설문 하나로 통합한 화면.

   문항은 이 파일에 복사해 두지 않는다. modules/<course>/course-config.js 의
   precheck 배열이 그대로 단일 소스이고, /modules/index.html 이 수집용 스텁으로
   6개 config 를 읽어 window.__PRECHECK_CONFIGS 에 담아 준다.
   여기서는 코스마다 3~4문항씩만 골라 총 20문항으로 묶는다 — 문항이 길면
   결제 전 이탈이 커져 20문항으로 줄이기로 한 결정 반영.

   진행 중 답안은 화면에만 있고 어디에도 저장하지 않는다
   (course-dashboard.js 와 같은 원칙 — 프런트에 학습 기록을 남기지 않는다). */
(function () {
  'use strict';

  /* 코스별로 고를 문항 인덱스. 규칙은 두 가지다.
       ① 그 코스 이론의 주요 개념 축을 하나씩 대표하게 한다
       ② 맞다/아니다 정답이 한쪽으로 쏠리지 않게 한다 (전체 10 : 10)
     문항 은행이 큰 concept·vision 만 4문항, 나머지는 3문항.
     course-config.js 의 precheck 순서를 바꾸면 이 인덱스도 함께 손봐야 한다. */
  var PICK = {
    concept: [0, 1, 4, 6],
    data:    [1, 3, 5],
    text:    [2, 4, 5],
    vision:  [0, 2, 5, 6],
    gesture: [0, 3, 5],
    life:    [2, 3, 4]
  };

  /* 파트 순서와 짧은 이름. 사이드바의 정식 코스명은 길어 설문 진행 표시에 쓰기 어렵다. */
  var PARTS_META = [
    { key: 'concept', short: '머신러닝 개념',  name: '머신러닝 개념 실험실' },
    { key: 'data',    short: '데이터 · 예측',  name: '데이터 · 예측 AI (AIoT)' },
    { key: 'text',    short: '텍스트 · 언어',  name: '텍스트 · 언어 AI' },
    { key: 'vision',  short: '비전 · 영상',    name: '비전 · 영상처리 AI' },
    { key: 'gesture', short: '제스처 · 동작',  name: '제스처 · 동작 AI' },
    { key: 'life',    short: '생활 속 AI',     name: '생활 속 인식 AI' }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }

  /* ── 문항 묶기 ── */
  function buildParts() {
    var byKey = {};
    (window.__PRECHECK_CONFIGS || []).forEach(function (cfg) { byKey[cfg.courseKey] = cfg; });

    return PARTS_META.map(function (meta, pi) {
      var cfg = byKey[meta.key];
      var bank = (cfg && cfg.precheck) || [];
      var items = (PICK[meta.key] || []).map(function (i) { return bank[i]; })
        .filter(function (q) { return q && typeof q.statement === 'string'; });
      return { key: meta.key, short: meta.short, name: meta.name, index: pi, items: items };
    }).filter(function (p) { return p.items.length > 0; });
  }

  var PARTS = buildParts();
  var FLAT = [];                                   // 20문항을 한 줄로 편 목록
  PARTS.forEach(function (p) {
    p.items.forEach(function (q, i) { FLAT.push({ part: p, q: q, inPart: i }); });
  });
  var TOTAL = FLAT.length;

  var state = { started: false, cursor: 0, answers: new Array(TOTAL).fill(null) };

  /* ── 사이드바 (코스 대시보드와 같은 마크업을 빌려 쓴다) ── */
  function renderSidebar() {
    var sb = el('dash-sidebar');
    var CD = window.CourseDashboard;
    if (!sb || !CD || !CD.precheckNavGroup) return;
    sb.innerHTML =
      '<a class="dash-home-btn" href="' + window.AppBase.resolve('platform/index.html') + '" title="홈으로">' +
        '<img src="' + window.AppBase.resolve('platform/img/logo.webp') + '" alt="Eduino AI" class="dash-home-logo" />' +
      '</a>' +
      CD.precheckNavGroup(true) +
      CD.courseNavGroup();
  }

  /* ── 1) 시작 화면 ── */
  function paintStart() {
    var cards = PARTS.map(function (p) {
      return '<div class="ph-part">' +
        '<span class="ph-part-n">PART ' + (p.index + 1) + '</span>' +
        '<span class="ph-part-t">' + esc(p.short) + '</span>' +
        '<span class="ph-part-q">' + p.items.length + '문항</span>' +
        '</div>';
    }).join('');

    el('ph-main').innerHTML =
      '<div class="dash-head"><span class="dash-badge">무료 · 사전진단</span>' +
      '<h1>나에게 맞는 시작 코스를 먼저 찾아요</h1>' +
      '<p>6개 코스의 핵심 개념을 파트별 설문으로 물어봅니다. 점수를 매기는 시험이 아니라, 어떤 코스부터 시작하면 좋을지 알려주는 진단이에요.</p></div>' +
      '<div class="ph-start">' +
        '<div class="ph-parts">' + cards + '</div>' +
        '<div class="ph-meta">' +
          '<div class="ph-m"><b>' + TOTAL + '문항</b><span>' + PARTS.length + '개 파트</span></div>' +
          '<div class="ph-m"><b>약 5분</b><span>예상 소요</span></div>' +
          '<div class="ph-m"><b>무료</b><span>가입 불필요</span></div>' +
        '</div>' +
        '<button class="ph-cta" id="ph-start-btn">사전진단 시작하기 →</button>' +
        '<p class="ph-note">결과에서 나의 강점과 함께, 지금 시작하기 좋은 추천 코스를 알려 드려요.</p>' +
      '</div>';

    el('ph-start-btn').addEventListener('click', function () {
      state.started = true;
      state.cursor = 0;
      state.answers = new Array(TOTAL).fill(null);
      paintQuestion();
    });
  }

  /* ── 2) 문항 화면 ── */
  /* 설문이므로 정답을 즉시 알려주지 않는다. 전부 마친 뒤 결과에서 한 번에 보여 준다. */
  var OPTIONS = [
    { v: 'true',  mark: 'O', lab: '맞다' },
    { v: 'false', mark: 'X', lab: '아니다' },
    { v: 'skip',  mark: '?', lab: '잘 모르겠어요' }
  ];

  function paintQuestion() {
    var cur = FLAT[state.cursor];
    var part = cur.part;
    var picked = state.answers[state.cursor];

    var strip = PARTS.map(function (p) {
      var cls = p.index < part.index ? ' done' : (p.index === part.index ? ' now' : '');
      return '<div class="ph-ps' + cls + '">' + (p.index + 1) + ' ' + esc(p.short) + '</div>';
    }).join('');

    var opts = OPTIONS.map(function (o) {
      return '<button class="dash-ox-option' + (picked === o.v ? ' selected' : '') + '" data-v="' + o.v + '">' +
        '<span class="mark">' + o.mark + '</span><span class="lab">' + o.lab + '</span></button>';
    }).join('');

    el('ph-main').innerHTML =
      '<div class="dash-head"><span class="dash-badge">PART ' + (part.index + 1) + ' · ' + esc(part.short) + '</span>' +
      '<h1>아는 만큼만 골라 주세요</h1>' +
      '<p>정답을 바로 알려주지 않아요. 6개 파트를 모두 마치면 나에게 맞는 시작 코스를 추천해 드립니다.</p></div>' +
      '<div class="ph-strip">' + strip + '</div>' +
      '<div class="dash-quiz-card">' +
        '<div class="ph-prog">' +
          '<span>PART ' + (part.index + 1) + ' · ' + (cur.inPart + 1) + ' / ' + part.items.length + '</span>' +
          '<span>전체 ' + (state.cursor + 1) + ' / ' + TOTAL + '</span>' +
        '</div>' +
        '<div class="ph-bar"><i style="width:' + Math.round((state.cursor + 1) / TOTAL * 100) + '%"></i></div>' +
        '<p class="dash-quiz-q">“' + esc(cur.q.statement) + '”</p>' +
        '<div class="dash-ox-options ph-ox3">' + opts + '</div>' +
        '<div class="ph-foot">' +
          '<button class="ph-gbtn" id="ph-prev"' + (state.cursor === 0 ? ' disabled' : '') + '>← 이전</button>' +
          '<button class="ph-gbtn primary" id="ph-next"' + (picked === null ? ' disabled' : '') + '>' +
            (state.cursor === TOTAL - 1 ? '진단 마치기' : '다음 →') + '</button>' +
        '</div>' +
      '</div>';

    el('ph-main').querySelectorAll('.dash-ox-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.answers[state.cursor] = btn.dataset.v;
        paintQuestion();
      });
    });
    el('ph-prev').addEventListener('click', function () {
      if (state.cursor > 0) { state.cursor--; paintQuestion(); }
    });
    el('ph-next').addEventListener('click', function () {
      if (state.answers[state.cursor] === null) return;
      if (state.cursor < TOTAL - 1) { state.cursor++; paintQuestion(); }
      else paintResult();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── 3) 결과 알림 ── */
  function score() {
    var perPart = PARTS.map(function () { return { correct: 0, total: 0 }; });
    var correct = 0;
    FLAT.forEach(function (row, i) {
      var slot = perPart[row.part.index];
      slot.total++;
      // '잘 모르겠어요'(skip)는 오답으로 센다 — 아는 것만 세어야 진단이 된다.
      var my = state.answers[i];
      if (my !== 'true' && my !== 'false') return;
      if ((my === 'true') === row.q.answer) { slot.correct++; correct++; }
    });
    return { correct: correct, perPart: perPart };
  }

  function courseFor(key) {
    return (window.CourseDashboard.COURSES || []).filter(function (c) { return c.key === key; })[0];
  }

  /* 결과는 "선택과 집중" — 성적 나열 없이 강점 하나를 크게 보여주고,
     가장 낮은 파트의 코스 하나만 추천해 바로 시작하게 한다.
     추천을 뺀 나머지 파트는 텍스트 없는 얇은 진행률 바로만 남긴다. */
  function paintResult() {
    var s = score();
    var rates = s.perPart.map(function (p) { return p.total ? p.correct / p.total : 0; });

    // 가장 높은 파트 = 강점, 가장 낮은 파트 = 추천 코스 (동점이면 앞선 파트).
    var strongest = 0, weakest = 0;
    rates.forEach(function (r, i) {
      if (r > rates[strongest]) strongest = i;
      if (r < rates[weakest]) weakest = i;
    });
    var bestPart = PARTS[strongest];
    var weakPart = PARTS[weakest];
    var course = courseFor(weakPart.key);
    var even = rates[strongest] === rates[weakest];   // 전 파트 동점 — 강/약을 가를 수 없다

    var lead = even ? '여섯 파트가 고르게 나왔어요' : '당신의 AI 강점은';
    var headline = even ? '이제 첫 코스만 고르면 돼요' : esc(bestPart.name);
    /* 코스명은 받침 유무가 제각각이라 조사가 붙지 않게 뒤에 '코스'를 고정으로 둔다 */
    var subCopy = even
      ? '어느 코스로 시작해도 좋은 상태예요. 첫걸음으로는 <b>' + esc(weakPart.name) + '</b> 코스를 추천해요.'
      : '하지만 <b>' + esc(weakPart.name) + '</b> 개념은 아직 낯설게 느끼시는군요. 지금 바로 이 코스를 시작해 약점을 보완해 보세요.';

    // 추천 코스를 뺀 나머지 파트 — 이름 없는 얇은 바 (자세한 값은 title 로만)
    var minibars = PARTS.map(function (p, i) {
      if (i === weakest) return '';
      var r = s.perPart[i];
      return '<span class="ph-minibar" title="' + esc(p.name) + ' ' + r.correct + '/' + r.total + '">' +
        '<i style="width:' + Math.round(rates[i] * 100) + '%"></i></span>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.className = 'ph-dim';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="ph-modal">' +
        '<span class="dash-badge">사전진단 완료 · ' + TOTAL + '문항</span>' +
        '<div class="ph-lead">' + lead + '</div>' +
        '<div class="ph-best">' + headline + '</div>' +
        '<div class="ph-score">' + TOTAL + '문항 중 ' + s.correct + '문항 정답</div>' +
        '<p class="ph-desc">' + subCopy + '</p>' +
        (course ? '<a class="ph-cta" href="' + course.href + '">' + esc(course.name) + ' 코스 시작하기 →</a>' : '') +
        '<div class="ph-minibars" aria-label="나머지 파트 정답률">' + minibars + '</div>' +
        '<div class="ph-modal-foot">' +
          '<button class="ph-gbtn" id="ph-retry">다시 진단하기</button>' +
          '<button class="ph-gbtn" id="ph-close">닫기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    el('ph-retry').addEventListener('click', function () { close(); state.started = false; paintStart(); });
    el('ph-close').addEventListener('click', function () { close(); state.started = false; paintStart(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) { close(); state.started = false; paintStart(); } });
  }

  /* ── 시작 ── */
  renderSidebar();
  if (!TOTAL) {
    el('ph-main').innerHTML =
      '<div class="dash-head"><h1>진단 문항을 불러오지 못했어요</h1>' +
      '<p>잠시 후 새로고침해 주세요.</p></div>';
    return;
  }
  paintStart();
})();
