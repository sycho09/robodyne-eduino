/* 4단계 학습 대시보드(진단-이론-실습-평가) 공통 로직. 각 모듈은 CourseDashboard.init() 만 호출합니다. */
(function () {
  // 사이드바 "코스 목록" 순서 (platform/index.html 카탈로그와 일치해야 함)
  var COURSES = [
    { key: 'concept', name: '머신러닝 개념 실험실', href: '/modules/concept/index.html', icon: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><path d="M8 7l8 0M8 16l8-8"/>' },
    { key: 'data', name: '데이터 · 예측 AI (AIoT)', href: '/modules/data/index.html', icon: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>' },
    { key: 'text', name: '텍스트 · 언어 AI', href: '/modules/text/index.html', icon: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
    { key: 'vision', name: '비전 · 영상처리 AI', href: '/modules/vision/index.html', icon: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>' },
    { key: 'gesture', name: '제스처 · 동작 AI', href: '/modules/gesture/index.html', icon: '<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>' },
    { key: 'life', name: '생활 속 인식 AI', href: '/modules/life/index.html', icon: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z"/>' }
  ];
  var STEP_LABELS = ['사전 진단', '이론 학습', '실습 퀘스트', '최종 평가'];
  // 이론 상세 페이지 구성 (정의 → 예시 → 실무 활용)
  var THEORY_SECTIONS = [
    { key: 'definition', label: '정의', fallback: 'desc', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>' },
    { key: 'example', label: '예시', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { key: 'practice', label: '실무 활용', icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' }
  ];
  var activeFinish = null;     // init 시점의 finishPractice — CourseDashboard.finish() 가 위임한다.
  var activeProgress = null;   // init 시점의 progressPayload — CourseDashboard.progress() 가 위임한다.
  var activeMarkDone = null;   // init 시점의 markDone — CourseDashboard.markDone() 이 위임한다.

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

    /* 사전 진단(PreCheckOX/MCQ)은 선별용, 최종 평가(FinalQuizMCQ)는 변별용으로 목적과 형식이 다릅니다. */
    var PRE_ITEMS = config.precheck || config.diagnosis || [];
    var PRE_MODE = config.precheck ? 'ox' : 'mcq';

    var THEORY_LEN = (config.theory || []).length;

    /* 무료/유료 접근 제한 로직 (단위 테스트 등 Access 객체가 없으면 잠금 해제) */
    function paid() { return !window.Access || window.Access.isPaid(config.courseKey); }
    function noticeStrip(key, info, text) {
      return window.Access ? window.Access.notice(key, info, text) : '';
    }
    /* 사전 진단 분석 결과는 유료 기능이므로 화면 표시에만 이 함수를 사용합니다. */
    function shownStatus(i) { return paid() ? (state.progress.conceptStatus[i] || '') : ''; }

    // 이전 버전이 남긴 저장 키 청소 — 프런트에는 더 이상 아무것도 저장하지 않는다.
    try {
      localStorage.removeItem('eduino_course_progress:' + config.courseKey);
      localStorage.removeItem('eduino-ocr-corrections');
    } catch (e) {}

    // 풀던 답안과 보던 위치. 단계를 떠나면 버리고, 서버로 가지 않는다.
    function freshDraft() {
      return {
        preIndex: 0, preAnswers: new Array(PRE_ITEMS.length).fill(null),
        theoryIndex: 0, theoryView: 'list',
        quizIndex: 0, quizAnswers: new Array(config.quiz.length).fill(null)
      };
    }

    /* 실습 탭 상태 변수 선언 (초기화 덮어쓰기 방지를 위해 앞쪽에 선언) */
    var practiceTabs = [];
    var practiceControls = null;

    var state = {
      step: 0,
      // 화면에 남는 '표시' = DB 로 갈 값. 단계를 옮겨도 지우지 않는다. 새 표시는 반드시 여기에.
      progress: {
        completedSteps: [false, false, false, false],   // 사이드바 초록 체크
        conceptStatus: new Array(THEORY_LEN).fill(''),  // '' | 'weak' | 'known' — 취약/스킵 태그
        theoryRead: new Array(THEORY_LEN).fill(false),  // 읽음 태그
        /* 최종 평가 점수 보존 (화면 이동 시 초기화되지 않도록 유지) */
        quizScore: null                                 // null | { correct, total }
      },
      draft: freshDraft()
    };

    /* 서버 DB 연동 페이로드: state.progress. 항목 수 변경 시 인덱스 어긋남 방지를 위해 통째로 무시합니다. */
    var saved = config.progress;
    if (saved && saved.completedSteps && saved.conceptStatus && saved.theoryRead &&
        saved.completedSteps.length === 4 &&
        saved.conceptStatus.length === THEORY_LEN && saved.theoryRead.length === THEORY_LEN) {
      state.progress = {
        completedSteps: saved.completedSteps.slice(),
        conceptStatus: saved.conceptStatus.slice(),
        theoryRead: saved.theoryRead.slice(),
        quizScore: saved.quizScore || null
      };
    }
    function progressPayload() {
      return {
        courseKey: config.courseKey,
        completedSteps: state.progress.completedSteps.slice(),
        conceptStatus: state.progress.conceptStatus.slice(),
        theoryRead: state.progress.theoryRead.slice(),
        quizScore: state.progress.quizScore
      };
    }
    function emitProgress() {
      if (typeof config.onProgress !== 'function') return;
      try { config.onProgress(progressPayload()); } catch (e) {}
    }

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
    activeMarkDone = markDone;
    activeProgress = progressPayload;

    renderSidebar();
    paintPreCheck();
    paintTheory();
    appendPracticeControls();
    paintQuizQuestion();
    goTo(state.step);

    /* 실습 퀘스트 탭 잠금 처리 (Access 모듈 연동) */
    if (window.Access) window.Access.applyCourseGate({ scope: config.courseKey });

    /* 네 단계 간의 자유로운 이동을 지원합니다. (진행 상황은 사이드바에 표시) */
    function goTo(i) {
      var from = state.step;
      state.step = i;
      for (var p = 0; p < 4; p++) shell.querySelector('#dash-panel-' + p).hidden = p !== i;
      if (from !== i) leaveStep(from);
      syncSidebar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* 단계 이동 시 초기화: 임시 작성 중인 답안(draft) 리셋 및 실습 타이머/카메라 종료 등 뒷정리를 수행합니다. */
    function leaveStep(i) {
      state.draft = freshDraft();
      if (i === 0) paintPreCheck();
      else if (i === 1) paintTheory();
      else if (i === 2) (window.CoursePracticeLeave || []).forEach(function (fn) { try { fn(); } catch (e) {} });
      else if (i === 3) paintQuizQuestion();
    }

    function renderSidebar() {
      var sb = shell.querySelector('#dash-sidebar');
      var flowItems = '<div class="dash-nav-sub">' + STEP_LABELS.map(function (label, i) {
        return '<div class="dash-nav-item dash-nav-sub-item" data-goto-step="' + i + '"><span class="dash-nav-num">' + (i + 1) + '</span><span>' + label + '</span></div>';
      }).join('') + '</div>';
      
      // 코스 목록에는 잠금 표시를 두지 않는다 — 코스별 개별 판매 구조라 목록이 곧 상품 목록이다.
      var courseItems = COURSES.map(function (c) {
        var isActive = c.key === config.courseKey;
        var itemHtml = '<a class="dash-nav-item linkable' + (isActive ? ' active course-active' : '') + '" href="' + c.href + '">' + icon(c.icon) + '<span>' + esc(c.name) + '</span></a>';
        if (isActive) {
          itemHtml += flowItems;
        }
        return itemHtml;
      }).join('');
      
      sb.innerHTML = '<div class="dash-nav-group"><div class="dash-nav-group-title">학습 커리큘럼</div>' + courseItems + '</div>';

      if (backBtn) {
        backBtn.className = 'dash-home-btn';
        backBtn.innerHTML = '<img src="/platform/img/logo.webp" alt="Eduino AI" class="dash-home-logo" />';
        backBtn.removeAttribute('style'); // Remove inline styles if any
        sb.insertBefore(backBtn, sb.firstChild);
      }
      sb.querySelectorAll('[data-goto-step]').forEach(function (elm) {
        elm.addEventListener('click', function (e) {
          e.stopPropagation(); // prevent triggering parent clicks
          var i = +elm.dataset.gotoStep;
          goTo(i);
        });
      });
      sb.querySelectorAll('.course-active').forEach(function (elm) {
        elm.addEventListener('click', function (e) {
          e.preventDefault();
          // 메뉴만 접는다 — 단계 이동은 하지 않는다. 보던 패널이 그대로 남아야 빈 화면이 되지 않는다.
          var sub = elm.nextElementSibling;
          if (sub && sub.classList.contains('dash-nav-sub')) {
            sub.style.display = (sub.style.display === 'none') ? 'flex' : 'none';
          }
        });
      });
      applySidebarLocks(sb);
      syncSidebar();
    }

    /* 사이드바 진입 잠금 표시 (최종 평가 등) */
    function applySidebarLocks(sb) {
      if (paid() || !window.Access) return;
      var evalItem = sb.querySelector('[data-goto-step="3"]');
      if (evalItem) window.Access.mark(evalItem);
    }

    function syncSidebar() {
      shell.querySelectorAll('#dash-sidebar [data-goto-step]').forEach(function (elm, i) {
        var isActive = i === state.step;
        // 현재 위치(active) 및 완료 상태(done)를 동기화합니다.
        var isDone = !!state.progress.completedSteps[i];
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
    function paintPreCheck() {
      var panel = shell.querySelector('#dash-panel-0');
      if (state.draft.preIndex >= PRE_ITEMS.length) { paintPreCheckResult(panel); return; }
      if (PRE_MODE === 'ox') paintPreCheckOX(panel);
      else paintPreCheckMCQ(panel);
    }

    // 문항 카드 공통 셸 — OX/4지선다가 options 영역만 다르게 채워 쓴다.
    function preCheckCard(optionsHtml, questionText) {
      return '<div class="dash-head"><span class="dash-badge">사전 진단</span><h1>실습 전, 아는 만큼 확인해봐요</h1><p>점수를 매기는 시험이 아니에요. 어떤 개념을 이미 아는지 가려내어 이론 학습을 맞춰 드립니다.</p></div>' +
             '<div class="dash-quiz-card">' +
               '<div class="dash-quiz-progress">문항 ' + (state.draft.preIndex + 1) + ' / ' + PRE_ITEMS.length + '</div>' +
               '<p class="dash-quiz-q">' + questionText + '</p>' +
               optionsHtml +
               '<div id="pre-feedback-area" style="margin-top:24px; display:none; padding-top:24px; border-top:1px solid var(--line);"></div>' +
             '</div>';
    }

    // 진술이 맞는지 즉답하는 O/X. 개념 하나당 한 문장이라 문항 수를 늘려도 부담이 적다.
    function paintPreCheckOX(panel) {
      var q = PRE_ITEMS[state.draft.preIndex];
      var optionsHtml =
        '<div class="dash-ox-options">' +
        '<button class="dash-ox-option" data-v="true"><span class="mark">O</span><span class="lab">맞다</span></button>' +
        '<button class="dash-ox-option" data-v="false"><span class="mark">X</span><span class="lab">아니다</span></button>' +
        '</div>';
      panel.innerHTML = preCheckCard(optionsHtml, '"' + esc(q.statement) + '"');

      panel.querySelectorAll('.dash-ox-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = btn.dataset.v === 'true';
          state.draft.preAnswers[state.draft.preIndex] = my;
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
      var q = PRE_ITEMS[state.draft.preIndex];
      var optionsHtml = '<div class="dash-quiz-options">' + q.options.map(function (opt, i) {
        return '<button class="dash-quiz-option" data-i="' + i + '">' + esc(opt) + '</button>';
      }).join('') + '</div>';
      panel.innerHTML = preCheckCard(optionsHtml, 'Q. ' + esc(q.question));

      panel.querySelectorAll('.dash-quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = +btn.dataset.i;
          state.draft.preAnswers[state.draft.preIndex] = my;
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
        '<div class="dash-theory-label" style="margin-bottom:12px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' Concept ' + (state.draft.preIndex + 1) + '</div>' +
        '<div class="dash-theory-explain' + (matched ? '' : ' wrong') + '"><span class="ic">' +
        icon(matched
          ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>') +
        '</span><span>' + explain + '</span></div>' +
        '<div class="dash-theory-next"><button class="btn primary" id="dash-pf-next">' +
          (state.draft.preIndex < PRE_ITEMS.length - 1 ? '다음 문항' : '진단 마치기') + '</button></div>';
      fbArea.querySelector('#dash-pf-next').addEventListener('click', function () {
        state.draft.preIndex++;
        paintPreCheck();
      });
    }

    // 개념별 선별 결과 — 응답을 theory 인덱스(concept)로 묶어 known/weak을 계산한다.
    function computeConceptStatus() {
      var theories = theoryList();
      state.progress.conceptStatus = theories.map(function (t, ci) {
        var answered = 0, missed = 0;
        PRE_ITEMS.forEach(function (item, i) {
          if (item.concept !== ci || state.draft.preAnswers[i] === null) return;
          answered++;
          var truth = PRE_MODE === 'ox' ? item.answer : item.answerIndex;
          if (state.draft.preAnswers[i] !== truth) missed++;
        });
        if (!answered) return '';
        return missed > 0 ? 'weak' : 'known';
      });
    }

    // 점수·등급은 표기하지 않는다. 어떤 개념을 건너뛰어도 되고 어떤 개념을 봐야 하는지만 안내한다.
    function paintPreCheckResult(panel) {
      state.progress.completedSteps[0] = true;
      computeConceptStatus();
      emitProgress();
      syncSidebar();
      paintTheory(); // 이론 목록 카드에 스킵 가능 / 취약 개념 표시 반영

      var theories = theoryList();
      var weak = theories.filter(function (t, i) { return state.progress.conceptStatus[i] === 'weak'; });
      var known = theories.filter(function (t, i) { return state.progress.conceptStatus[i] === 'known'; });

      // 칩을 누르면 이론 학습 탭의 해당 개념 상세로 곧장 들어간다.
      function chips(cls) {
        return theories.reduce(function (acc, t, i) {
          if (state.progress.conceptStatus[i] !== cls) return acc;
          return acc + '<button class="dash-status-chip ' + cls + '" data-jump-theory="' + i + '">' +
            esc(t.title) + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</button>';
        }, '');
      }

      // 정답 개수는 무료 구간이다. 점수·등급은 여전히 매기지 않고 맞힌 개수만 알린다.
      var correct = PRE_ITEMS.reduce(function (n, item, i) {
        if (state.draft.preAnswers[i] === null) return n;
        var truth = PRE_MODE === 'ox' ? item.answer : item.answerIndex;
        return n + (state.draft.preAnswers[i] === truth ? 1 : 0);
      }, 0);
      var scoreHtml = '<div class="ax-score" style="align-self:center;">맞힌 문항 <b>' + correct + '</b> / ' + PRE_ITEMS.length + '</div>';

      // 개념별 취약 영역 분석 리포트는 유료 구간이다.
      var reportHtml = paid()
        ? '<div class="dash-precheck-report">' +
        '<section class="dash-status-group weak">' +
        '<h3>' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 먼저 볼 개념</h3>' +
        (weak.length ? '<div class="dash-status-chips">' + chips('weak') + '</div>' : '<p class="dash-status-empty">헷갈린 개념이 없었어요. 전체를 훑어보며 정리해도 좋아요.</p>') +
        '</section>' +
        '<section class="dash-status-group known">' +
        '<h3>' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 건너뛰어도 되는 개념</h3>' +
        (known.length ? '<div class="dash-status-chips">' + chips('known') + '</div>' : '<p class="dash-status-empty">아직 없어요. 이론 학습에서 차근차근 쌓아 봅시다.</p>') +
        '</section>' +
        '</div>'
        : noticeStrip('precheck-report', {
          title: '개념별 취약 영역 분석',
          desc: '응답을 <b>개념 단위로 묶어</b> 먼저 볼 개념과 건너뛰어도 되는 개념을 가려 줍니다.',
          previewLabel: '이 리포트가 가려 주는 개념',
          items: theories.map(function (t) { return { title: t.title, desc: '분석 결과 비공개' }; }),
          note: '이론 학습은 무료예요. 전체 개념을 처음부터 볼 수 있어요.'
        }, '어떤 개념이 약한지 짚어 주는 <b>개념별 취약 영역 분석</b>은 수업용 라이선스에 들어 있어요.');

      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">사전 진단 완료</span>' +
        (paid()
          ? '<h1>학습 경로를 맞춰 두었어요</h1><p>응답을 개념별로 묶어 이론 학습 목록에 표시했습니다. 아래 개념부터 확인해 보세요.</p>'
          : '<h1>진단을 마쳤어요</h1><p>맞힌 문항 수를 알려드려요.</p>') +
        scoreHtml +
        '</div>' +
        reportHtml +
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
      if (state.draft.theoryView === 'detail' && theoryList()[state.draft.theoryIndex]) paintTheoryDetail();
      else paintTheoryList();
    }

    function openTheory(i) {
      state.draft.theoryIndex = i;
      state.draft.theoryView = 'detail';
      state.progress.theoryRead[i] = true;
      emitProgress();
      paintTheory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function closeTheory() {
      state.draft.theoryView = 'list';
      paintTheory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* 처리 흐름 블록은 두지 않는다.
       개념 카드에 이미 '개념 1·2·3…' 번호가 붙어 있어 순서는 그 번호가 표현한다.
       흐름 칩은 그 번호 순서를 짧은 말로 되풀이하거나(예: 토큰화→임베딩→유사도),
       실습 패널 위쪽 단계 바(.flow)가 이미 보여 주는 조작 순서를 미리 말할 뿐이었다.
       되먹임("틀리면 보강")은 hint 가 담당한다. 카드뉴스 형식의 강점을 지키기 위해
       이 화면에는 카드와 CTA 만 둔다. */

    // 목록: 카드는 진입점이므로 제목 + 요약 1~2문장만 노출한다(점진적 정보 노출).
    function paintTheoryList() {
      var panel = shell.querySelector('#dash-panel-1');
      var theories = theoryList();
      var cardsHtml = theories.map(function (t, i) {
        // 사전 진단(선별) 결과 연동: weak = 강조, known = 스킵 가능 표시
        var st = shownStatus(i);
        var tag = st === 'weak'
          ? '<span class="dash-concept-tag weak">' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 취약 개념</span>'
          : st === 'known'
            ? '<span class="dash-concept-tag known">' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 스킵 가능</span>'
            : (state.progress.theoryRead[i] ? '<span class="dash-concept-tag read">' + icon('<polyline points="20 6 9 17 4 12"/>') + ' 읽음</span>' : '');
        return '<button class="dash-concept-card' + (st ? ' ' + st : '') + (state.progress.theoryRead[i] ? ' read' : '') + '" data-open-theory="' + i + '">' +
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
          (theories.some(function (t, i) { return !!shownStatus(i); })
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
        state.progress.completedSteps[1] = true;
        emitProgress();
        syncSidebar();
        goTo(2);
      });
    }

    // 상세: 스크롤형 줄글. 상단에 목록 복귀 버튼, 하단에 이전/다음 개념 이동 버튼을 둬
    // 목록으로 되돌아가지 않고도 개념 간 비교·연속 학습이 가능하게 한다.
    function paintTheoryDetail() {
      var panel = shell.querySelector('#dash-panel-1');
      var theories = theoryList();
      var t = theories[state.draft.theoryIndex];
      var total = theories.length;

      var bodyHtml = THEORY_SECTIONS.map(function (sec) {
        var text = t[sec.key] || (sec.fallback ? t[sec.fallback] : '');
        if (!text) return '';
        return '<section class="dash-article-section">' +
          '<h2 class="dash-article-h2">' + icon(sec.icon) + ' ' + sec.label + '</h2>' +
          '<div class="dash-article-body">' + text + '</div>' +
          '</section>';
      }).join('');

      var prev = theories[state.draft.theoryIndex - 1];
      var next = theories[state.draft.theoryIndex + 1];

      panel.innerHTML =
        '<div class="dash-article-bar">' +
          '<button class="dash-article-back" id="dash-th-back">' + icon('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>') + ' 목록으로 돌아가기</button>' +
          '<span class="dash-article-counter">개념 ' + (state.draft.theoryIndex + 1) + ' / ' + total + '</span>' +
        '</div>' +
        '<article class="dash-article">' +
          '<header class="dash-article-head">' +
            '<span class="dash-article-icon">' + icon(t.icon) + '</span>' +
            (shownStatus(state.draft.theoryIndex) === 'weak'
              ? '<div class="dash-concept-tag weak" style="margin-bottom:10px;">' + icon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + ' 사전 진단에서 헷갈린 개념이에요</div>' : '') +
            '<h1>' + esc(t.title) + '</h1>' +
            (t.summary || t.desc ? '<p class="dash-article-lead">' + esc(t.summary || t.desc) + '</p>' : '') +
            (t.point ? '<div class="dash-theory-point" style="display:inline-flex; align-items:center; gap:4px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' 핵심 포인트: ' + esc(t.point) + '</div>' : '') +
          '</header>' +
          bodyHtml +
        '</article>' +
        '<nav class="dash-article-nav">' +
          (prev
            ? '<button class="dash-article-navbtn" data-go-theory="' + (state.draft.theoryIndex - 1) + '"><span class="dir">' + icon('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>') + ' 이전 개념</span><b>' + esc(prev.title) + '</b></button>'
            : '<span class="dash-article-navbtn empty"></span>') +
          (next
            ? '<button class="dash-article-navbtn next" data-go-theory="' + (state.draft.theoryIndex + 1) + '"><span class="dir">다음 개념 ' + icon('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>') + '</span><b>' + esc(next.title) + '</b></button>'
            : '<span class="dash-article-navbtn empty"></span>') +
        '</nav>';

      panel.querySelector('#dash-th-back').addEventListener('click', closeTheory);
      panel.querySelectorAll('[data-go-theory]').forEach(function (elm) {
        elm.addEventListener('click', function () { openTheory(+elm.dataset.goTheory); });
      });
    }

    /* ---- Step 3: 실습 ----------------------------------------------------
       모든 실습 탭을 완료해야 평가로 넘어갑니다. 탭 완료 판정은 각 모듈이 CourseDashboard.markDone('탭키')를 호출해 알립니다. */

    function collectPracticeTabs() {
      var btns = practiceContent.querySelectorAll('.steps .step');
      practiceTabs = Array.prototype.map.call(btns, function (b, i) {
        var b1 = b.querySelector('.t b');
        return {
          key: b.dataset.step || String(i),
          label: (b1 ? b1.textContent : '').trim() || ('실습 ' + (i + 1)),
          el: b,
          done: false
        };
      });
    }
    function tabsLeft() {
      return practiceTabs.filter(function (t) { return !t.done; });
    }
    var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
    function paintPracticeTabs() {
      practiceTabs.forEach(function (t, i) {
        t.el.classList.toggle('done', t.done);
        var n = t.el.querySelector('.n');
        if (!n) return;
        if (t.done) { if (!n.querySelector('svg')) n.innerHTML = CHECK; }
        else if (n.querySelector('svg')) n.textContent = String(i + 1);
      });
    }

    /* 무료 사용자: 최종 평가 미제공으로 인해 실습 컨트롤 UI를 렌더링하지 않습니다. */
    function paintPracticeControls() {
      if (!practiceControls) return;
      if (!paid()) { practiceControls.hidden = true; return; }
      practiceControls.hidden = false;
      var left = tabsLeft();
      var btn = practiceControls.querySelector('#dash-to-eval');
      if (left.length) {
        btn.className = 'btn accent';
        btn.setAttribute('aria-disabled', 'true');
        btn.textContent = '실습 진행도 ' + (practiceTabs.length - left.length) + '/' + practiceTabs.length +
          /* 탭 이름의 ' · ' 와 혼동되지 않도록 쉼표로 연결합니다. */
          ' — 남은 실습: ' + left.map(function (t) { return t.label; }).join(', ');
      } else {
        btn.className = 'btn primary lg';
        btn.removeAttribute('aria-disabled');
        btn.textContent = '실습 완료, 최종 평가로 이동';
      }
    }

    /* 남은 탭을 말로 설명하는 대신 그 자리를 가리킨다. */
    function pointAtLeftovers() {
      var left = tabsLeft();
      if (!left.length) return;
      left[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      left.forEach(function (t) {
        t.el.classList.remove('dash-flash');
        void t.el.offsetWidth;              // 연속 클릭에도 다시 재생되게 리플로우로 끊는다
        t.el.classList.add('dash-flash');
      });
    }

    function markDone(tabKey) {
      var t = practiceTabs.filter(function (x) { return x.key === tabKey; })[0];
      if (!t || t.done) return;
      t.done = true;
      paintPracticeTabs();
      paintPracticeControls();
    }

    function appendPracticeControls() {
      var panel = shell.querySelector('#dash-panel-2');
      collectPracticeTabs();
      practiceControls = document.createElement('div');
      practiceControls.className = 'dash-controls';
      practiceControls.innerHTML = '<button class="btn accent" id="dash-to-eval">평가로 이동</button>';
      panel.appendChild(practiceControls);
      practiceControls.querySelector('#dash-to-eval').addEventListener('click', finishPractice);
      paintPracticeTabs();
      paintPracticeControls();
    }

    /* 게이트웨이: 각 모듈의 완료 버튼(CourseDashboard.finish())도 이 검사 로직을 통과해야 합니다. */
    function finishPractice() {
      if (tabsLeft().length) { pointAtLeftovers(); return; }
      state.progress.completedSteps[2] = true;
      emitProgress();
      syncSidebar();
      goTo(3);
    }

    // ---- Step 4: 최종 평가 (FinalQuizMCQ · 변별용) ----
    // 오답 보기에 유사 개념을 섞어 4지선다로 이론+실습 종합 이해도를 평가합니다.
    function paintQuizQuestion() {
      var panel = shell.querySelector('#dash-panel-3');
      var total = config.quiz.length;
      // 문항 · 채점 · 결과 전체가 유료 구간이다. 문항을 아예 그리지 않고 잠금 안내만 둔다.
      if (!paid()) { paintQuizLock(panel, total); return; }
      if (state.draft.quizIndex >= total) { paintQuizResult(panel); return; }
      var q = config.quiz[state.draft.quizIndex];
      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">최종 평가</span><h1>배운 내용을 확인해봐요</h1><p>진단 → 이론 → 실습에서 다룬 개념을 종합해 고르세요. 비슷해 보이는 보기를 구분하는 게 핵심입니다.</p></div>' +
        '<div class="dash-quiz-card">' +
          '<div class="dash-quiz-progress">문항 ' + (state.draft.quizIndex + 1) + ' / ' + total + '</div>' +
          '<p class="dash-quiz-q">Q. ' + esc(q.question) + '</p>' +
          '<div class="dash-quiz-options">' + q.options.map(function (opt, i) {
            return '<button class="dash-quiz-option" data-i="' + i + '">' + esc(opt) + '</button>';
          }).join('') + '</div>' +
          '<div id="quiz-feedback-area" style="margin-top:24px; display:none; padding-top:24px; border-top:1px solid var(--line);"></div>' +
        '</div>';
      panel.querySelectorAll('.dash-quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var my = +btn.dataset.i;
          state.draft.quizAnswers[state.draft.quizIndex] = my;
          var opts = panel.querySelectorAll('.dash-quiz-option');
          opts.forEach(function (b) { b.disabled = true; });

          btn.classList.add(my === q.answerIndex ? 'correct' : 'wrong');
          if (my !== q.answerIndex) opts[q.answerIndex].classList.add('correct');

          var isRight = my === q.answerIndex;
          var fbArea = panel.querySelector('#quiz-feedback-area');
          fbArea.style.display = 'block';
          fbArea.innerHTML = 
            '<div class="dash-theory-label" style="margin-bottom:12px;">' + icon('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>') + ' Q' + (state.draft.quizIndex + 1) + ' 해설</div>' +
            '<div class="dash-theory-explain' + (isRight ? '' : ' wrong') + '"><span class="ic">' +
              icon(isRight
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>') +
              '</span><span>' + (q.explain || '정답입니다.') + '</span></div>' +
            '<div class="dash-theory-next">' + (state.draft.quizIndex < total - 1
              ? '<button class="btn primary" id="dash-qf-next">다음 문제 풀기</button>'
              : '<button class="btn primary" id="dash-qf-next">최종 결과 확인하기</button>') + '</div>';

          fbArea.querySelector('#dash-qf-next').addEventListener('click', function () {
            state.draft.quizIndex++;
            paintQuizQuestion();
          });
        });
      });
    }

    /* 잠금 화면은 평가 단계 자리에 그대로 둔다 — 사이드바에서 4단계로 들어오면
       무엇이 잠겼는지 여기서 읽힌다(문항은 DOM 에 만들지 않는다). */
    function paintQuizLock(panel, total) {
      /* 사전 진단 결과 화면과 같은 방식으로 맞춘다 — 단계의 제목·설명은 그대로 두고
         잠긴 내용은 한 줄 안내로만 알린 뒤 눌렀을 때 팝업으로 보여 준다.
         잠금 화면을 제자리에 통째로 얹으면 제목과 설명이 두 벌이 된다. */
      panel.innerHTML =
        '<div class="dash-head"><span class="dash-badge">최종 평가</span><h1>배운 내용을 확인해봐요</h1>' +
        '<p>진단 → 이론 → 실습에서 다룬 개념을 종합해 실제 이해도를 가르는 단계입니다.</p></div>' +
        noticeStrip('final-quiz', {
          title: '최종 평가',
          desc: '문항 · 채점 · 결과 리포트 <b>전체가 수업용 라이선스</b>에 들어 있어요.',
          previewLabel: '평가에서 받는 것',
          items: [
            { title: '4지선다 ' + total + '문항', desc: '혼동하기 쉬운 유사 개념을 섞은 변별 문항' },
            { title: '즉시 채점 · 문항별 해설', desc: '왜 그 답인지 문항마다 풀이' },
            { title: '완주 리포트', desc: STEP_LABELS.join(' → ') + ' 4단계 되짚기' }
          ],
          note: '사전 진단 · 이론 학습 · 실습 ① ② 는 무료로 계속 이용할 수 있어요.'
        }, '문항 · 채점 · 결과 리포트는 <b>수업용 라이선스</b>에 들어 있어요.');
    }

    function paintQuizResult(panel) {
      state.progress.completedSteps[3] = true;
      emitProgress();
      syncSidebar();
      var total = config.quiz.length;
      var correct = config.quiz.filter(function (q, i) { return state.draft.quizAnswers[i] === q.answerIndex; }).length;
      state.progress.quizScore = { correct: correct, total: total };
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

  // finish(): 실습 단계를 완료 처리하고 다음 단계(평가)로 넘어갑니다. (각 모듈 실습 내 자체 완료 버튼용)
  window.CourseDashboard = {
    init: init,
    finish: function () { if (activeFinish) activeFinish(); },
    /* 개별 실습 탭 완료 마킹 (모듈에서 유의미한 결과 도출 시 1회 호출, tabKey = data-step) */
    markDone: function (tabKey) { if (activeMarkDone) activeMarkDone(tabKey); },
    progress: function () { return activeProgress ? activeProgress() : null; }
  };
})();
