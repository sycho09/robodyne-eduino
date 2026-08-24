/* 4단계 학습 대시보드 공유 셸 (사전진단 → 이론 → 실습 → 평가)
   각 모듈 index.html은 <div id="practice-content"> 안에 기존 콘텐츠를 두고,
   CourseDashboard.init({ courseKey, diagnosis, quiz, resultCopy, hint })만 호출하면 됨.
   tf.js 등 특정 모듈 전용 전역에 의존하지 않는 순수 DOM 코드 (life 모듈은 tf.js를 쓰지 않음). */
(function () {
  var COURSES = [
    { key: 'text', name: '텍스트 · 언어 AI', href: '/modules/text/index.html', icon: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
    { key: 'data', name: '데이터 · 예측 AI (AIoT)', href: '/modules/data/index.html', icon: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>' },
    { key: 'gesture', name: '제스처 · 동작 AI', href: '/modules/gesture/index.html', icon: '<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>' },
    { key: 'life', name: '생활 속 인식 AI', href: '/modules/life/index.html', icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z"/>' },
    { key: 'concept', name: '머신러닝 개념 실험실', href: '/modules/concept/index.html', icon: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><path d="M8 7l8 0M8 16l8-8"/>' },
    { key: 'vision', name: '비전 · 영상처리 AI', href: '/index.html', icon: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>' }
  ];
  var STEP_LABELS = ['사전 진단', '이론 학습', '실습 퀘스트', '최종 평가'];
  // 이론 상세 페이지의 줄글 구성 (정의 → 예시 → 실무 활용).
  // 각 코스 course-config.js의 theory 항목에서 key에 해당하는 필드를 읽는다.
  var THEORY_SECTIONS = [
    { key: 'definition', label: '정의', fallback: 'desc', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
    { key: 'example', label: '예시', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { key: 'practice', label: '실무 활용', icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' }
  ];
  var activeFinish = null;   // init 시점의 finishPractice — CourseDashboard.finish() 가 위임한다.
  // 진도는 코스별로 따로 보관한다. 키를 공유하면 A코스의 단계가 B코스로 새어 나간다.
  // sessionStorage가 아닌 localStorage인 이유: 브라우저를 닫았다 다시 들어와도 진도가 남아야 한다.
  // 계정별 진도는 추후 서버로 옮길 예정이며, 그때 이 키 하나만 교체하면 된다.
  var STORE_PREFIX = 'eduino_course_progress:';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function icon(inner) {
    return '<svg class="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  function init(config) {
    var practiceContent = document.getElementById('practice-content');
    if (!practiceContent) { console.error('[CourseDashboard] #practice-content 요소를 찾을 수 없습니다.'); return; }

    /* Step 1(사전 진단)과 Step 4(최종 평가)는 목적이 달라 문항 형식도 다르다.
       - PreCheckOX  : 선별(screening)용. 개념당 O/X 단문 진술. 점수·등급을 매기지 않고,
                       결과를 이론 학습의 "이미 아는 개념 / 취약 개념" 표시에만 사용한다.
       - PreCheckMCQ : precheck 없이 기존 diagnosis(4지선다)만 가진 코스를 위한 폴백.
       - FinalQuizMCQ: 변별(discrimination)용. 4지선다 + 혼동 유발 오답 보기. 여기서만 점수를 표기한다. */
    var PRE_ITEMS = config.precheck || config.diagnosis || [];
    var PRE_MODE = config.precheck ? 'ox' : 'mcq';

    var storeKey = STORE_PREFIX + (config.courseKey || 'unknown');
    var THEORY_LEN = (config.theory || []).length;

    function freshState() {
      return { step: 0, maxStep: 0, completedSteps: [false, false, false, false], preIndex: 0, preAnswers: new Array(PRE_ITEMS.length).fill(null), conceptStatus: new Array(THEORY_LEN).fill(''), theoryIndex: 0, theoryView: 'list', theoryRead: new Array(THEORY_LEN).fill(false), quizIndex: 0, quizAnswers: new Array(config.quiz.length).fill(null) };
    }
    // 저장된 진도는 저장 당시의 문항·개념 수를 전제로 한 인덱스 뭉치다. course-config.js에서
    // 문항을 추가/삭제하면 인덱스가 어긋나 엉뚱한 개념이 "취약"으로 표시되므로, 길이가 하나라도
    // 다르면 복원하지 않고 처음부터 시작한다.
    function loadState() {
      try {
        var s = JSON.parse(localStorage.getItem(storeKey));
        if (!s || !s.preAnswers || !s.conceptStatus || !s.quizAnswers || !s.theoryRead) return null;
        if (s.preAnswers.length !== PRE_ITEMS.length) return null;
        if (s.conceptStatus.length !== THEORY_LEN || s.theoryRead.length !== THEORY_LEN) return null;
        if (s.quizAnswers.length !== config.quiz.length) return null;
        return s;
      } catch (e) { return null; }
    }
    function saveState() {
      try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) {}
    }

    var state = loadState() || freshState();

    var shell = document.createElement('div');
    shell.className = 'dash-shell';
    shell.innerHTML =
      '<aside class="dash-sidebar" id="dash-sidebar"></aside>' +
      '<div class="dash-main-wrapper" style="display:flex; flex-direction:column; min-width:0; background:var(--bg-soft);">' +
        '<div id="dash-topbar-host"></div>' +
        '<div class="dash-main" style="flex:1;">' +
          '<section class="dash-panel" id="dash-panel-0"></section>' +
          '<section class="dash-panel" id="dash-panel-1" hidden></section>' +
          '<section class="dash-panel" id="dash-panel-2" hidden></section>' +
          '<section class="dash-panel" id="dash-panel-3" hidden></section>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(shell, practiceContent);
    shell.querySelector('#dash-panel-2').appendChild(practiceContent);

    var topbar = practiceContent.querySelector('.topbar');
    var backBtn = null;
    if (topbar) {
      backBtn = topbar.querySelector('.back');
      
      var topbarLogo = topbar.querySelector('.logo-mark-img');
      if (topbarLogo) topbarLogo.parentNode.removeChild(topbarLogo);

      shell.querySelector('#dash-topbar-host').appendChild(topbar);
    }

    if (config.hint) setupHint(config.hint);
    activeFinish = finishPractice;

    renderSidebar();
    paintPreCheck();
    paintTheory();
    appendPracticeControls();
    paintQuizQuestion();
    goTo(state.step);

    /* 네 단계 모두 언제든 이동할 수 있다. 학습 순서를 강제하지 않고, 어디까지 했는지는
       사이드바의 초록 체크로만 알린다(진행 상황 표시 ≠ 접근 제한).
       순서 안내가 필요하면 각 단계의 설명 문구로 다룬다. */
    function goTo(i) {
      state.step = i;
      state.maxStep = Math.max(state.maxStep, i);
      for (var p = 0; p < 4; p++) shell.querySelector('#dash-panel-' + p).hidden = p !== i;
      syncSidebar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      saveState();
    }

    function renderSidebar() {
      var sb = shell.querySelector('#dash-sidebar');
      var flowItems = STEP_LABELS.map(function (label, i) {
        return '<div class="dash-nav-item" data-goto-step="' + i + '"><span class="dash-nav-num">' + (i + 1) + '</span><span>' + label + '</span></div>';
      }).join('');
      var courseItems = COURSES.map(function (c) {
        return '<a class="dash-nav-item linkable' + (c.key === config.courseKey ? ' active' : '') + '" href="' + c.href + '">' + icon(c.icon) + '<span>' + esc(c.name) + '</span></a>';
      }).join('');
      sb.innerHTML =
        '<div class="dash-nav-group"><div class="dash-nav-group-title">학습 흐름</div>' + flowItems + '</div>' +
        '<div class="dash-nav-group"><div class="dash-nav-group-title">코스 목록</div>' + courseItems + '</div>';
        
      if (backBtn) {
        backBtn.className = 'dash-home-btn';
        backBtn.innerHTML = '<img src="/platform/img/logo.webp" alt="Eduino AI" class="dash-home-logo" />';
        backBtn.removeAttribute('style'); // Remove inline styles if any
        sb.insertBefore(backBtn, sb.firstChild);
      }
      sb.querySelectorAll('[data-goto-step]').forEach(function (elm) {
        elm.addEventListener('click', function () {
          var i = +elm.dataset.gotoStep;
          goTo(i);
        });
      });
      syncSidebar();
    }
    function syncSidebar() {
      shell.querySelectorAll('#dash-sidebar [data-goto-step]').forEach(function (elm, i) {
        var isActive = i === state.step;
        // 완료 표시는 "지금 보고 있는 단계"여도 유지한다. 현재 위치는 행 배경(active)이,
        // 완료 여부는 번호 자리의 초록 체크가 각각 나타내야 되짚어 볼 때 진도를 읽을 수 있다.
        var isDone = !!state.completedSteps[i];
        elm.classList.toggle('active', isActive);
        elm.classList.toggle('done', isDone);
        elm.classList.add('linkable');
        var num = elm.querySelector('.dash-nav-num');
        if (num) num.textContent = isDone ? '✓' : String(i + 1);
      });
    }

    function setupHint(hint) {
      var modal = document.createElement('div');
      modal.className = 'dash-hint-modal';
      modal.innerHTML =
        '<div class="dash-hint-dialog">' +
          '<button class="dash-hint-close" aria-label="닫기">×</button>' +
          '<h3 class="dash-hint-title">' + esc(hint.title) + '</h3>' +
          '<div class="dash-hint-body">' + hint.body + '</div>' +
        '</div>';
      document.body.appendChild(modal);
      var btn = document.createElement('button');
      btn.className = 'dash-hint-btn';
      btn.innerHTML = icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>');
      btn.title = '힌트 보기'; // Add tooltip for accessibility
      document.body.appendChild(btn);
      var open = function () { modal.classList.add('on'); };
      var close = function () { modal.classList.remove('on'); };
      btn.addEventListener('click', open);
      modal.querySelector('.dash-hint-close').addEventListener('click', close);
      modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }

    // ---- Step 1: 사전 진단 (선별용) ----
    // 형식만 분기하고 카드/피드백/진행 표시 등 공통 UI 컴포넌트는 그대로 재사용한다.
    function paintPreCheck() {
      var panel = shell.querySelector('#dash-panel-0');
      if (state.preIndex >= PRE_ITEMS.length) { paintPreCheckResult(panel); return; }
      if (PRE_MODE === 'ox') paintPreCheckOX(panel);
      else paintPreCheckMCQ(panel);
    }

    // 문항 카드 공통 셸 — OX/4지선다가 options 영역만 다르게 채워 쓴다.
    function preCheckCard(optionsHtml, questionText) {
      return '<div class="dash-head"><span class="dash-badge">사전 진단</span><h1>실습 전, 아는 만큼 확인해봐요</h1><p>점수를 매기는 시험이 아니에요. 어떤 개념을 이미 아는지 가려내어 이론 학습을 맞춰 드립니다.</p></div>' +
             '<div class="dash-quiz-card">' +
               '<div class="dash-quiz-progress">문항 ' + (state.preIndex + 1) + ' / ' + PRE_ITEMS.length + '</div>' +
               '<p class="dash-quiz-q">' + questionText + '</p>' +
               optionsHtml +
               '<div id="pre-feedback-area" style="margin-top:24px; display:none; padding-top:24px; border-top:1px solid var(--line);"></div>' +
             '</div>';
    }

    // 진술이 맞는지 즉답하는 O/X. 개념 하나당 한 문장이라 문항 수를 늘려도 부담이 적다.
    function paintPreCheckOX(panel) {
      var q = PRE_ITEMS[state.preIndex];
      var optionsHtml =
        '<div class="dash-ox-options">' +
          '<button class="dash-ox-option" data-v="true"><span class="mark">O</span><span class="lab">맞다</span></button>' +
          '<button class="dash-ox-option" data-v="false"><span class="mark">X</span><span class="lab">아니다</span></button>' +
        '</div>';
      panel.innerHTML = preCheckCard(optionsHtml, '"' + esc(q.statement) + '"');

      panel.querySelectorAll('.dash-ox-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = btn.dataset.v === 'true';
          state.preAnswers[state.preIndex] = my;
          saveState();
          var opts = panel.querySelectorAll('.dash-ox-option');
          opts.forEach(function (b) { b.disabled = true; });
          var matched = my === q.answer;
          btn.classList.add(matched ? 'correct' : 'wrong');
          if (!matched) {
            opts.forEach(function (b) { if ((b.dataset.v === 'true') === q.answer) b.classList.add('correct'); });
          }
          paintPreFeedback(panel, matched, q.explain);
        });
      });
    }

    // precheck를 아직 정의하지 않은 코스용 4지선다 폴백.
    function paintPreCheckMCQ(panel) {
      var q = PRE_ITEMS[state.preIndex];
      var optionsHtml = '<div class="dash-quiz-options">' + q.options.map(function (opt, i) {
        return '<button class="dash-quiz-option" data-i="' + i + '">' + esc(opt) + '</button>';
      }).join('') + '</div>';
      panel.innerHTML = preCheckCard(optionsHtml, 'Q. ' + esc(q.question));

      panel.querySelectorAll('.dash-quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = +btn.dataset.i;
          state.preAnswers[state.preIndex] = my;
          saveState();
          var opts = panel.querySelectorAll('.dash-quiz-option');
          opts.forEach(function (b) { b.disabled = true; });
          var matched = my === q.answerIndex;
          btn.classList.add(matched ? 'correct' : 'wrong');
          if (!matched) opts[q.answerIndex].classList.add('correct');
          paintPreFeedback(panel, matched, q.explain);
        });
      });
    }

    // 제자리(in-place) 해설 — 두 형식이 공유한다.
    function paintPreFeedback(panel, matched, explain) {
      var fbArea = panel.querySelector('#pre-feedback-area');
      fbArea.style.display = 'block';
      fbArea.innerHTML =
        '<div class="dash-theory-label" style="margin-bottom:12px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' Concept ' + (state.preIndex + 1) + '</div>' +
        '<div class="dash-theory-explain' + (matched ? '' : ' wrong') + '"><span class="ic">' +
          icon(matched
            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>') +
          '</span><span>' + explain + '</span></div>' +
        '<div class="dash-theory-next"><button class="btn primary" id="dash-pf-next">' +
          (state.preIndex < PRE_ITEMS.length - 1 ? '다음 문항' : '진단 마치기') + '</button></div>';
      fbArea.querySelector('#dash-pf-next').addEventListener('click', function () {
        state.preIndex++;
        saveState();
        paintPreCheck();
      });
    }

    // 개념별 선별 결과 — 응답을 theory 인덱스(concept)로 묶어 known/weak을 계산한다.
    function computeConceptStatus() {
      var theories = theoryList();
      state.conceptStatus = theories.map(function (t, ci) {
        var answered = 0, missed = 0;
        PRE_ITEMS.forEach(function (item, i) {
          if (item.concept !== ci || state.preAnswers[i] === null) return;
          answered++;
          var truth = PRE_MODE === 'ox' ? item.answer : item.answerIndex;
          if (state.preAnswers[i] !== truth) missed++;
        });
        if (!answered) return '';
        return missed > 0 ? 'weak' : 'known';
      });
    }

    // 점수·등급은 표기하지 않는다. 어떤 개념을 건너뛰어도 되고 어떤 개념을 봐야 하는지만 안내한다.
    function paintPreCheckResult(panel) {
      state.completedSteps[0] = true;
      computeConceptStatus();
      saveState();
      syncSidebar();
      paintTheory(); // 이론 목록 카드에 스킵 가능 / 취약 개념 표시 반영

      var theories = theoryList();
      var weak = theories.filter(function (t, i) { return state.conceptStatus[i] === 'weak'; });
      var known = theories.filter(function (t, i) { return state.conceptStatus[i] === 'known'; });

      // 칩을 누르면 이론 학습 탭의 해당 개념 상세로 곧장 들어간다.
      function chips(cls) {
        return theories.reduce(function (acc, t, i) {
          if (state.conceptStatus[i] !== cls) return acc;
          return acc + '<button class="dash-status-chip ' + cls + '" data-jump-theory="' + i + '">' +
            esc(t.title) + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</button>';
        }, '');
      }

      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">사전 진단 완료</span><h1>학습 경로를 맞춰 두었어요</h1><p>응답을 개념별로 묶어 이론 학습 목록에 표시했습니다. 아래 개념부터 확인해 보세요.</p></div>' +
        '<div class="dash-precheck-report">' +
          '<section class="dash-status-group weak">' +
            '<h3>' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 먼저 볼 개념</h3>' +
            (weak.length ? '<div class="dash-status-chips">' + chips('weak') + '</div>' : '<p class="dash-status-empty">헷갈린 개념이 없었어요. 전체를 훑어보며 정리해도 좋아요.</p>') +
          '</section>' +
          '<section class="dash-status-group known">' +
            '<h3>' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 건너뛰어도 되는 개념</h3>' +
            (known.length ? '<div class="dash-status-chips">' + chips('known') + '</div>' : '<p class="dash-status-empty">아직 없어요. 이론 학습에서 차근차근 쌓아 봅시다.</p>') +
          '</section>' +
        '</div>' +
        '<div class="dash-controls" style="justify-content:center;"><button class="btn primary lg" id="dash-to-theory">이론 학습 목록으로 이동</button></div>';
      panel.querySelector('#dash-to-theory').addEventListener('click', function () { closeTheory(); goTo(1); });
      panel.querySelectorAll('[data-jump-theory]').forEach(function (elm) {
        elm.addEventListener('click', function () {
          goTo(1);
          openTheory(+elm.dataset.jumpTheory);
        });
      });
    }

    // ---- Step 2: 이론 (카드 목록 = 진입점 / 상세 = 줄글 본문) ----
    function theoryList() { return config.theory || []; }

    function paintTheory() {
      if (state.theoryView === 'detail' && theoryList()[state.theoryIndex]) paintTheoryDetail();
      else paintTheoryList();
    }

    function openTheory(i) {
      state.theoryIndex = i;
      state.theoryRead[i] = true;
      state.theoryView = 'detail';
      saveState();
      paintTheory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function closeTheory() {
      state.theoryView = 'list';
      saveState();
      paintTheory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 목록: 카드는 진입점이므로 제목 + 요약 1~2문장만 노출한다(점진적 정보 노출).
    function paintTheoryList() {
      var panel = shell.querySelector('#dash-panel-1');
      var theories = theoryList();
      var cardsHtml = theories.map(function (t, i) {
        // 사전 진단(선별) 결과 연동: weak = 강조, known = 스킵 가능 표시
        var st = state.conceptStatus[i] || '';
        var tag = st === 'weak'
          ? '<span class="dash-concept-tag weak">' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 취약 개념</span>'
          : st === 'known'
            ? '<span class="dash-concept-tag known">' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 스킵 가능</span>'
            : (state.theoryRead[i] ? '<span class="dash-concept-tag read">' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 읽음</span>' : '');
        return '<button class="dash-concept-card' + (st ? ' ' + st : '') + (state.theoryRead[i] ? ' read' : '') + '" data-open-theory="' + i + '">' +
                 '<div class="dash-concept-top">' +
                   '<span class="dash-concept-icon">' + icon(t.icon) + '</span>' +
                   '<span class="dash-concept-no">개념 ' + (i + 1) + '</span>' +
                   tag +
                 '</div>' +
                 '<h3 class="dash-concept-title">' + esc(t.title) + '</h3>' +
                 '<p class="dash-concept-summary">' + esc(t.summary || t.desc || '') + '</p>' +
                 '<span class="dash-concept-cta">자세히 보기 ' + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</span>' +
               '</button>';
      }).join('');

      var courseName = COURSES.find(function (c) { return c.key === config.courseKey; });
      var title = courseName ? courseName.name + ' : 필수 이론' : '필수 이론';

      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">이론학습</span><h1>' + esc(title) + '</h1><p>' +
          (state.conceptStatus.some(function (s) { return s; })
            ? '사전 진단 결과를 반영했어요. <b>취약 개념</b>부터 열어 보고, <b>스킵 가능</b> 표시는 건너뛰어도 좋습니다.'
            : '카드를 눌러 개념별 상세 설명으로 들어가세요. 정의 → 예시 → 실무 활용 순으로 이어집니다.') +
        '</p></div>' +
        '<div class="dash-concept-grid">' + cardsHtml + '</div>' +
        '<div class="dash-theory-action">' +
          '<button class="btn primary lg" id="dash-th-go-practice" style="display:inline-flex; align-items:center; justify-content:center; gap:8px;">이론 마스터! 실습 퀘스트 시작하기 ' + icon('<polygon points="22 2 15 22 11 13 2 9 22 2"/><line x1="22" y1="2" x2="11" y2="13"/>') + '</button>' +
        '</div>';

      panel.querySelectorAll('[data-open-theory]').forEach(function (elm) {
        elm.addEventListener('click', function () { openTheory(+elm.dataset.openTheory); });
      });
      panel.querySelector('#dash-th-go-practice').addEventListener('click', function () {
        state.completedSteps[1] = true;
        syncSidebar();
        goTo(2);
      });
    }

    // 상세: 스크롤형 줄글. 상단에 목록 복귀 버튼, 하단에 이전/다음 개념 이동 버튼을 둬
    // 목록으로 되돌아가지 않고도 개념 간 비교·연속 학습이 가능하게 한다.
    function paintTheoryDetail() {
      var panel = shell.querySelector('#dash-panel-1');
      var theories = theoryList();
      var t = theories[state.theoryIndex];
      var total = theories.length;

      var bodyHtml = THEORY_SECTIONS.map(function (sec) {
        var text = t[sec.key] || (sec.fallback ? t[sec.fallback] : '');
        if (!text) return '';
        return '<section class="dash-article-section">' +
                 '<h2 class="dash-article-h2">' + icon(sec.icon) + ' ' + sec.label + '</h2>' +
                 '<div class="dash-article-body">' + text + '</div>' +
               '</section>';
      }).join('');

      var prev = theories[state.theoryIndex - 1];
      var next = theories[state.theoryIndex + 1];

      panel.innerHTML =
        '<div class="dash-article-bar">' +
          '<button class="dash-article-back" id="dash-th-back">' + icon('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>') + ' 목록으로 돌아가기</button>' +
          '<span class="dash-article-counter">개념 ' + (state.theoryIndex + 1) + ' / ' + total + '</span>' +
        '</div>' +
        '<article class="dash-article">' +
          '<header class="dash-article-head">' +
            '<span class="dash-article-icon">' + icon(t.icon) + '</span>' +
            (state.conceptStatus[state.theoryIndex] === 'weak'
              ? '<div class="dash-concept-tag weak" style="margin-bottom:10px;">' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 사전 진단에서 헷갈린 개념이에요</div>' : '') +
            '<h1>' + esc(t.title) + '</h1>' +
            (t.summary || t.desc ? '<p class="dash-article-lead">' + esc(t.summary || t.desc) + '</p>' : '') +
            (t.point ? '<div class="dash-theory-point" style="display:inline-flex; align-items:center; gap:4px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' 핵심 포인트: ' + esc(t.point) + '</div>' : '') +
          '</header>' +
          bodyHtml +
        '</article>' +
        '<nav class="dash-article-nav">' +
          (prev
            ? '<button class="dash-article-navbtn" data-go-theory="' + (state.theoryIndex - 1) + '"><span class="dir">' + icon('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>') + ' 이전 개념</span><b>' + esc(prev.title) + '</b></button>'
            : '<span class="dash-article-navbtn empty"></span>') +
          (next
            ? '<button class="dash-article-navbtn next" data-go-theory="' + (state.theoryIndex + 1) + '"><span class="dir">다음 개념 ' + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</span><b>' + esc(next.title) + '</b></button>'
            : '<span class="dash-article-navbtn empty"></span>') +
        '</nav>';

      panel.querySelector('#dash-th-back').addEventListener('click', closeTheory);
      panel.querySelectorAll('[data-go-theory]').forEach(function (elm) {
        elm.addEventListener('click', function () { openTheory(+elm.dataset.goTheory); });
      });
    }

    // ---- Step 3: 실습 (기존 콘텐츠 그대로, 하단 컨트롤만 추가) ----
    function appendPracticeControls() {
      var panel = shell.querySelector('#dash-panel-2');
      var controls = document.createElement('div');
      controls.className = 'dash-controls';
      // accent(연한 채움)로 둔다 — 모든 실습 화면에 상시 노출되므로 채움으로 두면
      // 각 단계가 가진 본래의 다음-단계 버튼과 강조가 겹친다.
      controls.innerHTML = '<span></span><button class="btn accent" id="dash-to-eval">평가로 이동</button>';
      panel.appendChild(controls);
      controls.querySelector('#dash-to-eval').addEventListener('click', finishPractice);
    }
    function finishPractice() {
      state.completedSteps[2] = true;
      goTo(3);
    }

    // ---- Step 4: 최종 평가 (FinalQuizMCQ · 변별용) ----
    // 사전 진단(O/X 선별)과 달리 4지선다를 유지한다. 오답 보기에 정답과 혼동하기 쉬운
    // 유사 개념을 섞어 두어, 이론+실습을 마친 뒤의 실제 이해도를 가른다.
    function paintQuizQuestion() {
      var panel = shell.querySelector('#dash-panel-3');
      var total = config.quiz.length;
      if (state.quizIndex >= total) { paintQuizResult(panel); return; }
      var q = config.quiz[state.quizIndex];
      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">최종 평가</span><h1>배운 내용을 확인해봐요</h1><p>진단 → 이론 → 실습에서 다룬 개념을 종합해 고르세요. 비슷해 보이는 보기를 구분하는 게 핵심입니다.</p></div>' +
        '<div class="dash-quiz-card">' +
          '<div class="dash-quiz-progress">문항 ' + (state.quizIndex + 1) + ' / ' + total + '</div>' +
          '<p class="dash-quiz-q">Q. ' + esc(q.question) + '</p>' +
          '<div class="dash-quiz-options">' + q.options.map(function (opt, i) {
            return '<button class="dash-quiz-option" data-i="' + i + '">' + esc(opt) + '</button>';
          }).join('') + '</div>' +
          '<div id="quiz-feedback-area" style="margin-top:24px; display:none; padding-top:24px; border-top:1px solid var(--line);"></div>' +
        '</div>';
      panel.querySelectorAll('.dash-quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = +btn.dataset.i;
          state.quizAnswers[state.quizIndex] = my;
          saveState();
          var opts = panel.querySelectorAll('.dash-quiz-option');
          opts.forEach(function (b) { b.disabled = true; });
          
          btn.classList.add(my === q.answerIndex ? 'correct' : 'wrong');
          if (my !== q.answerIndex) opts[q.answerIndex].classList.add('correct');
          
          var isRight = my === q.answerIndex;
          var fbArea = panel.querySelector('#quiz-feedback-area');
          fbArea.style.display = 'block';
          fbArea.innerHTML = 
            '<div class="dash-theory-label" style="margin-bottom:12px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' Q' + (state.quizIndex + 1) + ' 해설</div>' +
            '<div class="dash-theory-explain' + (isRight ? '' : ' wrong') + '"><span class="ic">' +
              icon(isRight
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>') +
              '</span><span>' + (q.explain || '정답입니다.') + '</span></div>' +
            '<div class="dash-theory-next">' + (state.quizIndex < total - 1
              ? '<button class="btn primary" id="dash-qf-next">다음 문제 풀기</button>'
              : '<button class="btn primary" id="dash-qf-next">최종 결과 확인하기</button>') + '</div>';
              
          fbArea.querySelector('#dash-qf-next').addEventListener('click', function () {
            state.quizIndex++;
            saveState();
            paintQuizQuestion();
          });
        });
      });
    }

    function paintQuizResult(panel) {
      state.completedSteps[3] = true;
      saveState();
      syncSidebar();
      var total = config.quiz.length;
      var correct = config.quiz.filter(function (q, i) { return state.quizAnswers[i] === q.answerIndex; }).length;
      var rc = config.resultCopy || { title: '수고했어요!', body: '학습을 모두 완료했습니다.' };
      // 진단 → 이론 → 실습 → 평가 4단계를 한 줄로 되짚어 코스의 완결감을 준다.
      var recap = STEP_LABELS.map(function (label) {
        return '<span class="dash-recap-step">' + icon('<polyline points="20 6 9 17 4 12"/>') + ' ' + label + '</span>';
      }).join('<span class="dash-recap-arrow">' + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</span>');
      panel.innerHTML =
        '<div class="dash-result">' +
          '<div class="emoji" style="color:var(--primary-ink);">' + icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>') + '</div>' +
          '<h2>' + esc(rc.title) + '</h2>' +
          '<div class="score">' + total + '문항 중 ' + correct + '개 정답</div>' +
          '<p>' + esc(rc.body) + '</p>' +
          '<div class="dash-recap">' + recap + '</div>' +
        '</div>';
    }
  }

  // finish(): 모듈 실습 안에 자체 완료 버튼을 둘 때 호출한다.
  // (예: data 코스의 "실습 완료, 최종 평가로 넘어가기") — 실습 단계를 완료 처리하고 평가로 넘어간다.
  window.CourseDashboard = {
    init: init,
    finish: function () { if (activeFinish) activeFinish(); }
  };
})();
