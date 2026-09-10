/* 무료/유료 접근 제어 공통 레이어 — 기준서: docs/access-policy.md (3장 "공통 제약")
   일반 코스 5종(modules/)과 비전 제작 트랙 3종이 이 파일 하나를 공유한다.
   구매 상태의 단일 출처이며, 잠금은 표시 렌더링과 이벤트 차단으로만 만든다
   (학습 콘텐츠·모델 로직 무수정). 코스·트랙별 분기 없이 공유 마크업 규약에 규칙 하나를 적용한다. */
(function () {
  'use strict';

  var PLAN_KEY = 'eduino_plan';           // 'free' | 'paid'
  var ENT_KEY = 'eduino_entitlements';    // { <scope>: true } — 코스 단품 구매용
  /* 메인의 요금 섹션이 사라져 앵커가 죽었다. 그 섹션에 있던 도입 문의 메일로 잇는다. */
  var CTA_HREF = 'mailto:hello@eduino.kr?subject=Eduino%20AI%20%EB%8F%84%EC%9E%85%20%EB%AC%B8%EC%9D%98';
  var CTA_LABEL = '도입·구매 문의';

  /* ── 저장소 (읽기 실패해도 무료로 동작) ── */
  function raw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  /* ── 테마 판별 (다크 콘솔 지원) ── */
  if (typeof window !== 'undefined' && window.document) {
    var style = getComputedStyle(document.documentElement);
    if (!style.getPropertyValue('--card').trim() && style.getPropertyValue('--panel')) {
      document.documentElement.setAttribute('data-ax-theme', 'dark');
    }
  }

  /* 개발 검증용 강제 적용 — ?plan=paid / ?plan=free
     저장소에 그대로 써 두므로 페이지를 옮기거나 새로고침해도 유지되고, 반대 값으로 되돌릴 수 있다. */
  (function applyQueryOverride() {
    var m = /[?&]plan=(paid|free)/.exec(location.search);
    if (m) write(PLAN_KEY, m[1]);
  })();

  function plan() { return raw(PLAN_KEY) === 'paid' ? 'paid' : 'free'; }
  function setPlan(p) { write(PLAN_KEY, p === 'paid' ? 'paid' : 'free'); }
  function entitlements() { try { return JSON.parse(raw(ENT_KEY)) || {}; } catch (e) { return {}; } }
  /* scope 는 코스/트랙 키. 사이드바 코스 목록에 잠금 표시를 두지 않는 근거가
     "코스별 개별 판매" 이므로, 전체 플랜과 코스 단품 권한을 함께 본다. */
  function isPaid(scope) { return plan() === 'paid' || (!!scope && entitlements()[scope] === true); }

  /* ── 표시 요소 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function lockIcon(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  }
  /* 배지는 자물쇠 아이콘 하나로 끝낸다. 학습 화면에 "유료" 같은 상업 문구를 띄우지 않고,
     설명은 잠금 화면에서만 한다. 다만 표시가 아이콘뿐이면 뜻이 전해지지 않는 경로가 있으므로
     라벨은 title(hover 툴팁)과 aria-label(스크린리더)로 남긴다. */
  function badge(label) {
    var text = esc(label || '수업용 라이선스');
    return '<span class="ax-badge" role="img" title="' + text + '" aria-label="' + text + '">' +
      lockIcon('ax-badge-ic') + '</span>';
  }

  /* 잠금 표시 부착 — 라벨을 흐리게 하거나 숨기지 않는다 (기준서 1-3 / 2-5). */
  function mark(el, label) {
    if (!el || el.classList.contains('ax-locked')) return el;
    el.classList.add('ax-locked');
    el.insertAdjacentHTML('beforeend', badge(label));
    return el;
  }

  /* 잠금 화면 — info = { title, desc, previewLabel, items:[{title,desc}], note }
     desc·note 만 HTML 그대로 넣는다(호출부가 <b> 강조를 쓴다). 나머지는 escape. */
  function screen(info) {
    info = info || {};
    var items = info.items || [];
    var preview = items.length
      ? '<div class="ax-preview">' +
          '<div class="ax-preview-label">' + esc(info.previewLabel || '이 미션에서 만드는 산출물') + '</div>' +
          '<ol class="ax-preview-list">' + items.map(function (it, i) {
            return '<li class="ax-preview-item">' +
                     '<span class="ax-preview-no">' + (i + 1) + '</span>' +
                     '<span class="ax-preview-text"><b>' + esc(it.title) + '</b>' +
                       (it.desc ? '<span>' + esc(it.desc) + '</span>' : '') + '</span>' +
                   '</li>';
          }).join('') + '</ol>' +
          '<div class="ax-preview-veil">' + lockIcon('ax-veil-ic') + '</div>' +
        '</div>'
      : '';
    return '<div class="ax-lock">' +
             '<div class="ax-lock-head">' +
               '<span class="ax-lock-eyebrow">' + lockIcon('ax-eyebrow-ic') + ' 수업용 라이선스</span>' +
               '<h2 class="ax-lock-title">' + esc(info.title || '수업용 라이선스 콘텐츠') + '</h2>' +
               (info.desc ? '<p class="ax-lock-desc">' + info.desc + '</p>' : '') +
             '</div>' +
             preview +
             '<div class="ax-lock-cta">' +
               '<a class="btn primary lg" href="' + CTA_HREF + '">' + CTA_LABEL + '</a>' +
               (info.note ? '<p class="ax-lock-note">' + info.note + '</p>' : '') +
             '</div>' +
           '</div>';
  }

  /* ── 잠금 화면 모달 (클릭을 막은 자리에서 띄운다) ── */
  var modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'ax-modal';
    modal.innerHTML = '<div class="ax-modal-dialog" role="dialog" aria-modal="true">' +
                        '<button class="ax-modal-close" aria-label="닫기">×</button>' +
                        '<div class="ax-modal-body"></div>' +
                      '</div>';
    document.body.appendChild(modal);
    modal.querySelector('.ax-modal-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return modal;
  }
  function open(info) {
    ensureModal();
    modal.querySelector('.ax-modal-body').innerHTML = screen(info);
    modal.classList.add('on');
  }
  function close() { if (modal) modal.classList.remove('on'); }

  /* ── 잠금 정보 저장소 ──
     화면 내용은 키로 등록해 두고 DOM 에는 키만 남긴다. 다시 그려져도 위임으로 받으므로
     리스너가 끊기지 않고, 요소 참조를 배열에 쌓지 않아 새지도 않는다. */
  var INFOS = {};
  var seq = 0;
  function defineInfo(key, info) { INFOS[key] = info; return key; }
  function infoFor(key) {
    var info = INFOS[key];
    return typeof info === 'function' ? info() : info;
  }

  /* 상태에 따라 켜고 끄는 잠금 (예: 클래스가 2개일 때만 추가 버튼 잠금). */
  function setLocked(el, key, on, label) {
    if (!el) return el;
    if (on) {
      if (el.dataset.axLock) return el;
      el.dataset.axLock = key;
      el.setAttribute('aria-disabled', 'true');
      mark(el, label);
    } else if (el.dataset.axLock) {
      delete el.dataset.axLock;
      el.removeAttribute('aria-disabled');
      el.classList.remove('ax-locked');
      var b = el.querySelector('.ax-badge');
      if (b) b.parentNode.removeChild(b);
    }
    return el;
  }

  /* 한 번 걸면 풀지 않는 잠금. info 를 함수로 주면 클릭 시점의 DOM 을 읽는다. */
  function gate(el, info, label) {
    if (!el || el.dataset.axLock) return el;
    return setLocked(el, defineInfo('gate:' + (++seq), info), true, label);
  }

  /* 한 줄 안내 띠 — 무료 내용이 이미 있는 화면(사전 진단 결과·최종 평가)에서 쓴다.
     screen() 을 통째로 얹으면 제목도 다음 행동 버튼도 두 벌이 되므로, 띠만 두고
     자세한 내용은 눌렀을 때 모달로 보여 준다(실습 ③ 탭 잠금과 같은 상호작용). */
  function notice(key, info, text) {
    defineInfo(key, info);
    return '<div class="ax-inline" data-ax-notice="' + esc(key) + '" role="button" tabindex="0">' +
             lockIcon('ax-inline-ic') +
             '<span class="ax-inline-text">' + text + '</span>' +
             '<span class="ax-inline-more">자세히 보기</span>' +
           '</div>';
  }

  /* ── 이벤트 위임 (캡처 단계) ──
     data-ax-lock   : 원래 동작을 막고 잠금 화면을 띄운다. 대상의 onclick 은 버블 단계에
                      있어 스크립트 등록 순서와 무관하게 여기서 먼저 잡힌다.
     data-ax-notice : 막지 않고 띄우기만 한다 — 띠 자체가 여는 버튼이다. */
  function onActivate(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var locked = t.closest('[data-ax-lock]');
    if (locked) {
      e.preventDefault();
      e.stopImmediatePropagation();
      open(infoFor(locked.dataset.axLock));
      return;
    }
    var hint = t.closest('[data-ax-notice]');
    if (hint) open(infoFor(hint.dataset.axNotice));
  }
  document.addEventListener('click', onActivate, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') onActivate(e);
  }, true);

  /* 일반 코스 5종 공통 게이트 — 실습 ③ 탭만 잠근다 (기준서 1-2).
     다섯 코스가 .steps > .step 3개 마크업을 공유하므로 인덱스 규칙 하나로 끝난다. */
  function applyCourseGate(opt) {
    opt = opt || {};
    if (isPaid(opt.scope)) return false;
    var steps = document.querySelectorAll('.steps .step');
    if (steps.length < 3) return false;
    var locked = steps[2];
    gate(locked, function () { return missionInfo(locked); });
    remainingNote(steps[1]);
    return true;
  }

  /* 잠긴 탭의 산출물 미리보기를 그 탭의 마크업에서 그대로 읽어 온다.
     탭 라벨은 .step .t 의 b/span, 미션 단계는 패널 안 .flow .fstep 의 .ft b/span.
     코스마다 문구를 복사해 두지 않으므로 콘텐츠가 바뀌면 잠금 화면도 함께 따라간다. */
  function textOf(el) { return el ? el.textContent.trim() : ''; }
  function missionInfo(stepBtn) {
    var title = textOf(stepBtn.querySelector('.t b')) || '응용 미션';
    var desc = textOf(stepBtn.querySelector('.t span'));
    var panel = document.getElementById('panel-' + stepBtn.dataset.step);
    var items = [];
    if (panel) {
      Array.prototype.forEach.call(panel.querySelectorAll('.flow .fstep'), function (f) {
        var t = textOf(f.querySelector('.ft b'));
        if (t) items.push({ title: t, desc: textOf(f.querySelector('.ft > span')) });
      });
    }
    return {
      title: title,
      desc: (desc ? esc(desc) + ' — ' : '') +
        '실무 상황을 그대로 옮긴 <b>응용 미션</b>이에요. 앞의 실습에서 익힌 것을 실제 산출물까지 연결합니다.',
      previewLabel: '이 미션에서 만드는 산출물',
      items: items,
      note: '실습 ① · ② 와 이론 학습은 무료로 계속 이용할 수 있어요.'
    };
  }

  /* 실습 ② 아래에 남은 분량을 알린다 (기준서 1-3).
     "완료 시점" 을 코스 로직에서 읽어 오려면 모듈 코드를 고쳐야 하므로,
     실습 ② 패널 맨 끝에 두어 그 실습을 끝낸 자리에서 읽히게 한다. */
  function remainingNote(secondStep) {
    var panel = secondStep && document.getElementById('panel-' + secondStep.dataset.step);
    if (!panel || panel.querySelector('.ax-remaining')) return;
    var box = document.createElement('div');
    box.className = 'ax-remaining';
    box.innerHTML = lockIcon('ax-remaining-ic') +
      '<span class="ax-remaining-text"><b>여기까지가 1차시 분량의 약 3분의 2입니다.</b>' +
      '남은 응용 미션(실습 ③)과 최종 평가는 수업용 라이선스에 들어 있어요.</span>' +
      '<a class="ax-remaining-cta" href="' + CTA_HREF + '">' + CTA_LABEL + '</a>';
    panel.appendChild(box);
  }

  /* ══════════════════════════════════════════════════════════════
     비전 제작 트랙 3종 — 이미지 분류 · 동작 분류 · 음성 분류 (기준서 2장)
     ══════════════════════════════════════════════════════════════
     세 트랙은 id 접두사만 다르고 마크업 규약이 같다 (이미지 = 없음, 동작 = p-, 음성 = a-).
     그래서 접두사 표 하나를 순회하는 것으로 끝나며 트랙별 분기 코드를 두지 않는다. */
  var PREFIXES = ['', 'p-', 'a-'];

  /* 무료 상한 (기준서 2-1 · 2-2 · 2-3 · 2-4). 유료는 상한 없음. */
  var FREE_LIMITS = { classes: 2, shots: 30, records: 20 };
  function limit(kind, scope) {
    if (isPaid(scope)) return Infinity;
    return FREE_LIMITS[kind] == null ? Infinity : FREE_LIMITS[kind];
  }

  /* 자리를 유지한 채 덮는다 (기준서 2-1 세부 규칙: 혼동행렬 영역은 자리를 유지한 채 잠금 표시). */
  function veil(el, key) {
    if (!el || el.dataset.axVeil === '1') return el;
    el.dataset.axVeil = '1';
    el.classList.add('ax-veiled');
    var cover = document.createElement('div');
    cover.className = 'ax-veil';
    cover.dataset.axLock = key;
    cover.setAttribute('role', 'button');
    cover.setAttribute('tabindex', '0');
    cover.innerHTML = lockIcon('ax-veil-lock') +
      '<span class="ax-veil-label">' + esc((infoFor(key) || {}).title || '') + '</span>' +
      '<span class="ax-veil-more">자세히 보기</span>';
    el.appendChild(cover);
    return el;
  }

  /* 클래스 수 · 데이터 상한 (기준서 2-1 · 2-5). 세 트랙이 클래스 목록 DOM 을 공유하므로
     각 렌더러 끝에서 이 함수 하나를 부르면 된다.
     cfg = { container, addBtn, countMeta, count, max, kind, scope } · kind: 'shots' | 'records' */
  function capClasses(cfg) {
    if (!cfg || !cfg.container) return;
    var free = !isPaid(cfg.scope);
    var classMax = free ? Math.min(cfg.max, FREE_LIMITS.classes) : cfg.max;
    var dataMax = free ? (FREE_LIMITS[cfg.kind] || Infinity) : Infinity;

    if (cfg.countMeta) cfg.countMeta.textContent = cfg.count + ' / ' + classMax;
    if (cfg.addBtn) {
      var full = cfg.count >= classMax;
      /* 무료 상한에 닿았을 때는 disabled 로 죽이지 않는다 — 눌러서 이유를 읽을 수 있어야 한다.
         유료 상한(4개)에 닿은 경우는 설명할 것이 없으므로 그대로 비활성. */
      if (free) {
        setLocked(cfg.addBtn, 'classes', full);
        cfg.addBtn.disabled = false;
      } else {
        cfg.addBtn.disabled = full;
      }
    }

    var reached = false;
    Array.prototype.forEach.call(cfg.container.querySelectorAll('.class-item'), function (item) {
      var btn = item.querySelector('.cap-btn');
      var cell = item.querySelector('.class-count');
      if (!btn || !cell) return;
      var n = parseInt(cell.textContent, 10) || 0;
      if (n < dataMax) return;
      /* 수집 버튼은 진짜로 비활성으로 둔다(기준서 2-5). 이유는 아래 안내 문구가 말한다. */
      btn.disabled = true;
      btn.classList.add('ax-frozen');
      reached = true;
    });
    capNote(cfg, dataMax, reached);
  }

  /* 상한 안내 문구 — 이미지 트랙은 데이터 코치 자리에, 코치가 없는 동작·음성 트랙은
     클래스 목록 바로 아래에 같은 문구를 둔다 (기준서 2-5). */
  function capNote(cfg, dataMax, reached) {
    var host = cfg.container.parentNode;
    if (!host) return;
    var note = host.querySelector('.ax-cap-note');
    if (!reached || dataMax === Infinity) {
      if (note) note.parentNode.removeChild(note);
      return;
    }
    var text = '무료 버전은 클래스당 ' + dataMax + (cfg.kind === 'records' ? '번' : '장') + '까지 모을 수 있어요.';
    if (note) { note.querySelector('.ax-cap-text').textContent = text; return; }
    note = document.createElement('div');
    note.className = 'ax-cap-note';
    note.innerHTML = lockIcon('ax-cap-ic') + '<span class="ax-cap-text">' + esc(text) + '</span>';
    var coach = host.querySelector('#lab-coach');
    if (coach) coach.parentNode.insertBefore(note, coach);
    else cfg.container.parentNode.insertBefore(note, cfg.container.nextSibling);
  }

  /* 잠금 화면 문구 — 한곳에 모아 둔다. 여러 번 불러도 같은 값으로 덮어쓸 뿐이다. */
  function defineVisionLocks() {
    defineInfo('classes', {
      title: '클래스 3개 이상',
      desc: '무료 구간은 <b>클래스 2개</b>까지예요. 3~4개로 늘리면 더 촘촘하게 나누는 분류기를 만들 수 있어요.',
      previewLabel: '클래스를 늘리면',
      items: [
        { title: '3~4종 분류기', desc: '분리수거처럼 여러 갈래로 나누는 주제' },
        { title: '자유 주제 구성', desc: '내가 정한 종류로 직접 구성' }
      ],
      note: '클래스 2개짜리 분류기는 무료로 끝까지 만들 수 있어요.'
    });
    defineInfo('epochs', {
      title: '학습 횟수 조절',
      desc: '같은 데이터를 <b>몇 번 반복해 학습</b>할지 직접 정합니다. 무료 구간은 기본값으로 고정돼요.',
      previewLabel: '조절하면 볼 수 있는 것',
      items: [
        { title: '과소 · 과대 학습 비교', desc: '횟수를 바꿔 가며 정확도 변화 관찰' },
        { title: '학습 시간 조절', desc: '수업 시간에 맞춰 짧게 또는 길게' }
      ],
      note: '기본값으로도 학습 · 추론은 끝까지 무료로 할 수 있어요.'
    });
    defineInfo('confusion', {
      title: '혼동행렬',
      desc: 'AI 가 <b>어떤 클래스를 서로 헷갈렸는지</b> 표로 보여 줍니다. 틀린 이유를 짚는 평가 도구예요.',
      previewLabel: '이 표에서 읽는 것',
      items: [
        { title: '클래스별 오답 분포', desc: '무엇을 무엇으로 잘못 봤는지' },
        { title: '데이터 보완 지점', desc: '어느 클래스를 더 모아야 하는지' }
      ],
      note: '학습곡선(정확도 · 손실 변화)은 무료로 볼 수 있어요.'
    });
    defineInfo('preset', {
      title: '더 많은 주제',
      desc: '마스크 착용 여부, 손동작 같은 <b>준비된 주제</b>를 바로 불러옵니다.',
      previewLabel: '열리는 주제',
      items: [
        { title: '마스크 썼나요?', desc: '썼음 · 안 썼음' },
        { title: '엄지 척 / 아래', desc: '엄지 척 · 엄지 아래' }
      ],
      note: '분리수거 · 가위바위보는 무료로 그대로 쓸 수 있어요.'
    });
    defineInfo('preset-custom', {
      title: '자유 주제',
      desc: '<b>직접 주제를 정해 나만의 분류기 만들기</b> — 무엇을 나눌지 내가 정하고 클래스 이름도 직접 붙입니다.',
      previewLabel: '자유 주제로 할 수 있는 것',
      items: [
        { title: '우리 반만의 분류기', desc: '교실 물건, 급식 메뉴, 무엇이든' },
        { title: '수업마다 새 주제', desc: '한 번 배우면 계속 다시 만들기' }
      ],
      note: '준비된 무료 주제로도 파이프라인 4단계를 끝까지 체험할 수 있어요.'
    });
    defineInfo('output', {
      title: '결과물 만들기',
      desc: '학습한 모델로 <b>AI 상상보드</b>와 <b>내 AI 캐릭터 카드</b>를 만들어 남깁니다.',
      previewLabel: '만들 수 있는 것',
      items: [
        { title: 'AI 상상보드', desc: '추론 결과를 엮어 만드는 작품' },
        { title: '내 AI 캐릭터 카드', desc: '내 모델을 소개하는 카드' }
      ],
      note: '추론 결과 화면은 <b>이미지 저장하기</b>로 무료로 남길 수 있어요.'
    });
    defineInfo('challenge', {
      title: '정확도 챌린지',
      desc: '만든 모델의 정확도를 <b>겨루는 미션</b>이에요. 기록이 남고 결과를 견줘 볼 수 있어요.',
      previewLabel: '챌린지에서 하는 것',
      items: [
        { title: '정확도 측정', desc: '같은 조건에서 모델 성능 비교' },
        { title: '기록 남기기', desc: '반 안에서 결과 공유' }
      ],
      note: '추론 · 평가 자체는 무료로 계속 할 수 있어요.'
    });
    defineInfo('mission', {
      title: '미션함 · 미션 제출',
      desc: '만든 결과물을 <b>미션함에 담아 제출</b>하고, 선생님이 학급 현황을 확인합니다.',
      previewLabel: '제출하면',
      items: [
        { title: '내 미션함', desc: '만든 결과물 보관' },
        { title: '제출 · 확인서', desc: '학급 현황판에 기록' }
      ],
      note: '만든 이미지는 저장해서 따로 낼 수 있어요.'
    });
  }

  /* ── 비전 3트랙 공통 게이트 ──
     UI 가 다시 그려질 때마다 다시 불러도 되도록 전부 멱등하게 만든다. */
  function applyVisionGate(opt) {
    opt = opt || {};
    if (isPaid(opt.scope)) return false;

    PREFIXES.forEach(function (pfx) {
      /* 학습 횟수 — 숨기지 않고 기본값을 보인 채 잠근다(기준서 2-1 세부 규칙).
         disabled 대신 readOnly 를 쓰는 이유: disabled 요소에는 click 이 오지 않아
         왜 못 바꾸는지 설명할 길이 없어진다. */
      var ep = document.getElementById(pfx + 'epochs');
      if (ep && !ep.dataset.axLock) {
        ep.readOnly = true;
        ep.classList.add('ax-frozen');
        ep.dataset.axLock = 'epochs';
        var row = ep.closest ? ep.closest('.train-row') : null;
        var lab = row && row.querySelector('label');
        if (lab) setLocked(lab, 'epochs', true);
      }
      /* 혼동행렬 — 자리를 유지한 채 덮는다. 음성 트랙에는 이 영역이 없다. */
      veil(document.getElementById(pfx + 'confusion-box'), 'confusion');
    });

    /* 정확도 챌린지는 학습을 마쳐야 나타나므로, 있을 때만 걸린다(멱등이라 매번 불러도 된다). */
    setLocked(document.getElementById('challengeBtn'), 'challenge', true);
    return true;
  }

  /* 잠금 문구는 로드 시점에 한 번 등록해 둔다 — 어느 화면이 먼저 그려지든 참조할 수 있게. */
  defineVisionLocks();

  /* ── QA 전환 배지 (개발용) ────────────────────────────────────────
     지금 무료로 보고 있는지 유료로 보고 있는지 화면에서 알 수가 없으면 QA 가 계속
     헷갈린다. 그래서 상태 표시와 전환을 한 칩에서 겸한다.

     프로덕션에 딸려 나가지 않는 것이 이 코드의 제1 요건이라, "지울 때 잊지 않기" 에
     기대지 않는다 — 개발 호스트가 아니면 DOM 을 아예 만들지 않는다.
       · localhost · 127.0.0.1 · app:// · file://  → 항상 표시
       · 그 밖(배포 도메인)                        → ?qa=1 이 붙었을 때만
     ?qa=1 은 저장하지 않으므로 그 링크를 벗어나면 사라진다. 결제 연동 후에는
     plan() 이 서버 값을 읽게 되므로 이 배지도 함께 걷어내면 된다. */
  function qaBadge() {
    var h = location.hostname;
    var devHost = h === 'localhost' || h === '127.0.0.1' || h === '' ||
      location.protocol === 'app:' || location.protocol === 'file:';
    if (!devHost && !/[?&]qa=1(&|$)/.test(location.search)) return;
    if (!document.body || document.getElementById('ax-qa')) return;

    var now = plan();
    var box = document.createElement('div');
    box.id = 'ax-qa';
    box.className = 'ax-qa';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', '개발용 등급 전환');
    box.innerHTML =
      '<span class="ax-qa-lab">QA</span>' +
      '<span class="ax-qa-seg" data-on="' + now + '">' +
        '<button type="button" class="ax-qa-opt" data-p="free">무료</button>' +
        '<button type="button" class="ax-qa-opt" data-p="paid">유료</button>' +
      '</span>';
    Array.prototype.forEach.call(box.querySelectorAll('.ax-qa-opt'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.p === now));
      b.addEventListener('click', function () {
        if (b.dataset.p === plan()) return;          // 이미 그 등급이면 아무것도 하지 않는다
        setPlan(b.dataset.p);
        /* 잠금은 화면을 그릴 때 한 번 적용되므로 다시 그려야 반영된다.
           이때 URL 에 ?plan= 이 남아 있으면 다음 로드에서 그 값이 방금 고른 값을
           덮어쓰므로(applyQueryOverride) 떼고 이동한다. */
        try {
          var u = new URL(location.href);
          u.searchParams.delete('plan');
          location.replace(u.toString());
        } catch (e) { location.reload(); }
      });
    });
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', qaBadge);
  else qaBadge();

  window.Access = {
    /* 구매 상태 */
    plan: plan,
    setPlan: setPlan,          // 결제 연동 시 서버 조회로 갈아 끼울 자리
    isPaid: isPaid,
    limit: limit,
    /* 잠금 표시 */
    mark: mark,
    gate: gate,
    setLocked: setLocked,
    /* 잠금 화면 */
    screen: screen,
    notice: notice,
    close: close,
    /* 화면별 일괄 적용 */
    applyCourseGate: applyCourseGate,
    applyVisionGate: applyVisionGate,
    capClasses: capClasses
  };
})();
