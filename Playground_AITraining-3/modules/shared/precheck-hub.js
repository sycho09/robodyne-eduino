/* 인공지능 사전진단(무료) — 6개 코스의 사전 진단을 파트별 설문 하나로 통합한 화면.

   문항은 이 파일에 복사해 두지 않는다. modules/<course>/course-config.js 의
   precheck 배열이 그대로 단일 소스이고, /modules/index.html 이 수집용 스텁으로
   6개 config 를 읽어 window.__PRECHECK_CONFIGS 에 담아 준다.
   여기서는 코스마다 5문항씩만 골라 30문항으로 묶는다.

   진행 중 답안은 화면에만 있고 어디에도 저장하지 않는다
   (course-dashboard.js 와 같은 원칙 — 프런트에 학습 기록을 남기지 않는다). */
(function () {
  'use strict';

  /* 코스별로 고를 문항 인덱스. 규칙은 두 가지다.
       ① 그 코스 이론의 모든 개념(concept)이 최소 한 번씩 나오게 한다
       ② 맞다/아니다 정답이 한쪽으로 쏠리지 않게 한다 (전체 15 : 15)
     course-config.js 의 precheck 순서를 바꾸면 이 인덱스도 함께 손봐야 한다. */
  var PICK = {
    concept: [0, 1, 2, 4, 6],
    data:    [0, 1, 2, 4, 5],
    text:    [0, 1, 3, 5, 6],
    vision:  [0, 1, 2, 5, 7],
    gesture: [0, 1, 2, 3, 4],
    life:    [0, 1, 2, 4, 5]
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

  /* 점수 구간별 AI 능력치 4단계. 30문항 만점 기준. */
  var TIERS = [
    { key: 't1', name: '초보',   min: 0,  max: 9,  desc: 'AI 를 이제 막 만나는 단계예요. 개념을 그림과 체험으로 먼저 익히면 빨라집니다.' },
    { key: 't2', name: '중급',   min: 10, max: 17, desc: '용어는 익숙하지만 원리가 아직 흐릿한 단계예요. 직접 학습시켜 보면 확 잡힙니다.' },
    { key: 't3', name: '상급',   min: 18, max: 24, desc: '원리를 대체로 이해하고 있어요. 실습 퀘스트에서 값을 바꿔 가며 확인해 보세요.' },
    { key: 't4', name: '전문가', min: 25, max: 30, desc: '개념이 탄탄합니다. 심화 미션과 실무 지표(정밀도·재현율)까지 밀어붙여 보세요.' }
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
  var FLAT = [];                                   // 30문항을 한 줄로 편 목록
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
      '<a class="dash-home-btn" href="/platform/index.html" title="홈으로">' +
        '<img src="/platform/img/logo.webp" alt="Eduino AI" class="dash-home-logo" />' +
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

    var tiers = TIERS.map(function (t) {
      return '<div class="ph-tier ' + t.key + '"><div class="tn">' + t.name + '</div>' +
        '<div class="tr">' + t.min + '–' + t.max + '점</div></div>';
    }).join('');

    el('ph-main').innerHTML =
      '<div class="dash-head"><span class="dash-badge">무료 · 사전진단</span>' +
      '<h1>나의 AI 능력치를 먼저 확인해요</h1>' +
      '<p>6개 코스의 핵심 개념을 파트별 설문으로 물어봅니다. 점수를 매기는 시험이 아니라, 어떤 코스부터 시작하면 좋을지 알려주는 진단이에요.</p></div>' +
      '<div class="ph-start">' +
        '<div class="ph-parts">' + cards + '</div>' +
        '<div class="ph-meta">' +
          '<div class="ph-m"><b>' + TOTAL + '문항</b><span>' + PARTS.length + '개 파트</span></div>' +
          '<div class="ph-m"><b>약 7분</b><span>예상 소요</span></div>' +
          '<div class="ph-m"><b>무료</b><span>가입 불필요</span></div>' +
        '</div>' +
        '<button class="ph-cta" id="ph-start-btn">사전진단 시작하기 →</button>' +
        '<p class="ph-note">결과는 점수 구간에 따라 4단계 AI 능력치로 안내해 드려요.</p>' +
      '</div>' +
      '<div class="ph-tiers">' + tiers + '</div>';

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
      '<p>정답을 바로 알려주지 않아요. 6개 파트를 모두 마치면 나의 AI 능력치를 한 번에 보여 드립니다.</p></div>' +
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

  function tierFor(n) {
    for (var i = 0; i < TIERS.length; i++) {
      if (n >= TIERS[i].min && n <= TIERS[i].max) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function paintResult() {
    var s = score();
    var tier = tierFor(s.correct);

    // 가장 낮은 파트를 다음에 볼 코스로 추천한다 (동점이면 앞선 파트).
    var weakest = 0;
    s.perPart.forEach(function (p, i) {
      var rate = p.total ? p.correct / p.total : 1;
      var best = s.perPart[weakest].total ? s.perPart[weakest].correct / s.perPart[weakest].total : 1;
      if (rate < best) weakest = i;
    });
    var weakPart = PARTS[weakest];
    var course = (window.CourseDashboard.COURSES || []).filter(function (c) { return c.key === weakPart.key; })[0];

    var gauge = TIERS.map(function (t) {
      var span = (t.max - t.min + 1) / (TIERS[TIERS.length - 1].max + 1) * 100;
      return '<i class="' + t.key + (t.key === tier.key ? ' on' : '') + '" style="width:' + span + '%"></i>';
    }).join('');
    var labels = TIERS.map(function (t) {
      return '<span' + (t.key === tier.key ? ' class="on"' : '') + '>' + t.name + '</span>';
    }).join('');
    var rows = PARTS.map(function (p, i) {
      var r = s.perPart[i];
      return '<div class="ph-mp"><span class="mn">' + esc(p.name) + '</span>' +
        '<span class="mb"><i style="width:' + Math.round(r.correct / r.total * 100) + '%"></i></span>' +
        '<span class="mv">' + r.correct + '/' + r.total + '</span></div>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.className = 'ph-dim';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="ph-modal">' +
        '<span class="dash-badge">사전진단 완료 · ' + TOTAL + '문항</span>' +
        '<div class="ph-lead">나의 AI 능력치는</div>' +
        '<div class="ph-grade ' + tier.key + '">' + tier.name + '</div>' +
        '<div class="ph-score">' + TOTAL + '문항 중 ' + s.correct + '문항 정답 · ' + s.correct + '점</div>' +
        '<div class="ph-gauge">' + gauge + '</div>' +
        '<div class="ph-glab">' + labels + '</div>' +
        '<p class="ph-desc">' + tier.desc + '</p>' +
        '<div class="ph-mparts">' + rows + '</div>' +
        (course ? '<a class="ph-cta" href="' + course.href + '">' + esc(course.name) + ' 코스로 이동 →</a>' : '') +
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
