/**
 * ui/panels/submit.js — 제출물 만들기.
 *
 * 리포트(인쇄 → PDF) · 이미지 · 영상 · 제출용 JSON 을 모두 여기서 만든다.
 * 외부 라이브러리를 쓰지 않는다 — 인쇄는 window.print + 인쇄 전용 CSS,
 * 영상은 브라우저 내장 MediaRecorder 다. 정적 배포와 의존성 0 을 유지한다.
 *
 * 수치는 저장된 스냅샷(store)에서만 읽는다. 여기서 새로 계산하거나 문장을 지어내지 않는다.
 * 표시 이름은 브라우저에만 남고 어디로도 전송되지 않는다(실명·학교·클래스 입력란을 두지 않는다).
 */

import { ENGINE_VERSION, ENGINE_SEED, SCORING_VERSION } from '../../engine/version.js';
import { formatTicks, TICK_MS } from '../../engine/clock.js';
import { isComparable, codeHash } from '../storage.js';
import { wordsOf, formatGoal } from '../words.js';
import { drawMinimap } from './minimap.js';

const NAME_KEY = 'dtc:v1:displayName';   // 옛 키. 이미 적어 둔 이름을 잃지 않으려고 읽기만 한다.
const PROFILE_KEY = 'dtc:v1:profile';
const NAME_MAX = 20;
const FIELD_MAX = 40;
const NOTE_MAX = 60;
/** 57-C — 기본정보 세 칸(학교 · 교사명 · 클래스코드)의 상한. 폭도 이 길이에 맞춰 고정한다. */
const BASIC_MAX = 10;
/** 이름을 비워 두지 않으려고 미리 채우는 별명. 실명을 요구하지 않는다. */
const ANON_NAME = '익명 도전자';

/**
 * 과제물에 적는 네 칸. 브라우저에만 남고 어디로도 전송되지 않는다.
 * 이름·학교·팀원은 챌린지가 바뀌어도 같으므로 한 벌만 두고, 소감만 챌린지별로 나눠 담는다.
 */
function readProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch { p = {}; }
  if (!p.name) { try { p.name = localStorage.getItem(NAME_KEY) || ''; } catch { p.name = ''; } }
  p.notes = (p.notes && typeof p.notes === 'object') ? p.notes : {};
  return p;
}
function writeProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* 저장 실패는 무시 */ }
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 파일명에 쓸 수 없는 문자만 걷어낸다. 이름 자체는 바꾸지 않는다. */
const safe = (v) => String(v).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_{2,}/g, '_').slice(0, 24) || '무명';

export function createSubmit({ root, challenge, kit, entry, store, sim, assets, viewCanvas, getCode, mlSummary, decisionSummary, dev, hooks }) {
  // 같은 값을 계기와 과제물이 다르게 부르지 않는다. 말은 매니페스트가 고른다.
  const word = wordsOf(challenge);
  // 버튼과 팝업 제목이 다른 말을 쓰면 학생은 다른 기능으로 읽는다. 이름도 한곳에서 고른다.
  const submitLabel = ((challenge.scene && challenge.scene.ui) || {}).submit_label || '과제물 만들기';
  const canRecord = typeof window.MediaRecorder === 'function'
    && typeof viewCanvas.captureStream === 'function';

  // 인쇄 CSS 가 body 직계 자식을 기준으로 감추므로, 각 조각을 body 에 바로 붙인다.
  const host = document.createElement('template');
  host.innerHTML = `
    <!-- 52차 — 두 단계다.
         1단계는 결과 요약만 보여 준다. [내 결과만 저장] 을 누르면 입력칸을 하나도
         보여주지 않고 끝난다 — 브라우저에만 남고 아무 정보도 밖으로 나가지 않는다.
         2단계는 [저장하고 게시판에 올리기] 를 눌렀을 때만 열린다. -->
    <div class="modal" data-el="modal" hidden>
      <div class="modal__box modal__box--rules" role="dialog" aria-modal="true" aria-label="${submitLabel}">
        <div class="modal__row">
          <b class="modal__title">${submitLabel}</b>
          <span class="modal__spacer"></span>
          <button class="modal__x" type="button" data-el="close" aria-label="닫기">×</button>
        </div>

        <!-- 57-C 파트4 — 좌측 세로 스텝 2단계. 필수는 여전히 이름 하나이고,
             1단계만 채우고 [내 결과만 저장] 으로 끝낼 수 있다. 2단계를 한 번도 안 열어도 제출은 성립한다. -->
        <div class="sub2" data-el="sub2">
          <nav class="sub2__nav">
            <button class="sub2__step is-on" type="button" data-step="1">
              <b>기본정보</b><span>누가 · 어느 기록</span>
            </button>
            <button class="sub2__step" type="button" data-step="2">
              <b>프로젝트 설명</b><span>코드 · 사진 · 공개</span>
            </button>
            <div class="sub2__navgap"></div>
            <!-- 내려받기는 네비 맨 아래에 고정한다. 단계를 오가도 자리가 바뀌지 않는다. -->
            <div class="sub2__dl">
              <button class="btn" data-el="do-trail">🖼 주행 궤적 이미지</button>
              <button class="btn" data-el="do-pdf">📕 PDF</button>
            </div>
          </nav>

          <div class="sub2__body" data-el="sub2-body">
            <div class="sub2__pane" data-el="stage1">
              <!-- ① 게시할 기록 고르기 — 자취를 남기는 챌린지에서만 뜬다(파트3). -->
              <div class="subsec" data-el="pick-head" hidden>게시할 기록 고르기</div>
              <div class="picks" data-el="picks" hidden></div>

              <!-- ② 엔진이 채우고 사람이 못 고치는 값. 무엇이 담기는지는 매니페스트가 정한다.
                   방금 주행을 끝낸 학생이 제 기록을 먼저 본다 — 입력칸보다 위에 둔다. -->
              <div class="subsec">내 기록 <i class="subsec__note" data-el="autolist"></i></div>
              <div class="myrec">
                <dl class="outcome__stats" data-el="sum-stats"></dl>
                <table class="segtable" data-el="sum-segs">
                  <thead><tr><th>구간</th><th>종류</th><th>걸린 시간</th></tr></thead>
                  <tbody data-el="sum-segs-body"></tbody>
                </table>
              </div>

              <div class="subsec">내가 쓰는 것</div>
              <div class="modal__fields">
                <label class="modal__field">
                  <span>이름 또는 닉네임</span>
                  <input type="text" maxlength="${NAME_MAX}" data-el="name" placeholder="${ANON_NAME}">
                </label>
              </div>
              <div class="modal__fields modal__fields--basic">
                <label class="modal__field modal__field--basic">
                  <span>학교 <i>선택</i></span>
                  <input type="text" maxlength="${BASIC_MAX}" data-el="school">
                </label>
                <label class="modal__field modal__field--basic">
                  <span>교사명 <i>선택</i></span>
                  <input type="text" maxlength="${BASIC_MAX}" data-el="teacher">
                </label>
                <label class="modal__field modal__field--basic">
                  <span>클래스코드 <i>선택</i></span>
                  <input type="text" maxlength="${BASIC_MAX}" data-el="classcode">
                </label>
              </div>
              <p class="modal__hint" data-el="sum-shots">화면 두 장과 업로드한 최종 코드가 함께 담깁니다.</p>
            </div>

            <div class="sub2__pane is-off" data-el="stage2">
              <div class="subsec">프로젝트 설명 <i>전부 선택 입력입니다</i></div>
              <label class="modal__field modal__field--wide">
                <span>한 줄 코멘트 <i>게시판에 보입니다</i></span>
                <input type="text" maxlength="${NOTE_MAX}" data-el="comment">
              </label>
              <label class="modal__field modal__field--wide">
                <span>어떻게 코드를 고쳤나요 <i>과제물 파일에만 담깁니다</i></span>
                <textarea rows="4" maxlength="600" data-el="applied"></textarea>
              </label>
              <div class="modal__fields">
                <label class="modal__field">
                  <span>사진 첨부 <i>선택</i></span>
                  <input type="file" accept="image/*" data-el="photo">
                </label>
                <label class="modal__check">
                  <input type="checkbox" data-el="share-code"><span>게시판에 코드도 함께 공개</span>
                </label>
              </div>
              <p class="modal__hint">학교 · 교사명 · 클래스코드 · 응용 회고 · 첨부 사진은 게시판에 나가지 않습니다. 과제물 파일에만 담깁니다.</p>
            </div>
          </div>

          <!-- 저장한 뒤 완료 화면. 네비 옆에 들어와야 내려받기가 저장 전후로 같은 자리에 있다. -->
          <div class="subdone" data-el="stage-done" hidden>
            <div class="subdone__cap">제출 번호</div>
            <b class="subdone__no" data-el="done-no">—</b>
            <p class="modal__hint" data-el="done-hint">이 번호가 게시판 글과 과제물 파일 양쪽에 찍혀 있습니다.</p>
            <p class="modal__hint">내려받기는 왼쪽 아래에 있습니다. PDF 는 인쇄 창에서 저장합니다.</p>
          </div>
        </div>

        <div class="rules__foot sub2__foot" data-el="stage1-foot">
          <span class="sub2__count" data-el="step-count">1 / 2 단계</span>
          <span class="howto__gap"></span>
          <p class="modal__hint modal__hint--lock" data-el="lock-why" hidden>한 바퀴를 완주하면 열립니다.</p>
          <button class="btn" type="button" data-el="go-prev" hidden>← 이전</button>
          <button class="btn" data-el="go-local">내 결과만 저장</button>
          <button class="btn btn--go" type="button" data-el="go-next">다음 →</button>
          <button class="btn btn--go" data-el="go-share" hidden>게시판에 올리기</button>
        </div>

        <div class="modal__note modal__note--collapse" data-el="note"></div>
        <div class="modal__row"${dev ? '' : ' hidden'}>
          <button class="btn btn--danger" data-el="do-wipe">[dev] 이 챌린지 기록 초기화</button>
          <span class="modal__spacer"></span>
        </div>
      </div>
    </div>
    <div class="modal" data-el="confirm" hidden>
      <div class="modal__box modal__box--sm" role="dialog" aria-modal="true">
        <div class="modal__title">기록을 지울까요?</div>
        <p class="modal__hint">이 챌린지에 쌓인 시도 이력·스냅샷·회고가 모두 사라집니다. 되돌릴 수 없습니다.</p>
        <div class="modal__row">
          <span class="modal__spacer"></span>
          <button class="btn" data-el="confirm-no">취소</button>
          <button class="btn btn--danger" data-el="confirm-yes">지우기</button>
        </div>
      </div>
    </div>
    <div class="recbadge" data-el="recbadge" hidden><span class="recbadge__dot"></span>녹화 중 · 4x</div>
    <div class="report" data-el="report" hidden></div>`;
  const parts = Array.from(host.content.children);
  document.body.append(...parts);
  const q = (name) => document.body.querySelector(`[data-el="${name}"]`);
  const el = {
    modal: q('modal'), name: q('name'), school: q('school'), teacher: q('teacher'),
    classcode: q('classcode'),
    comment: q('comment'), applied: q('applied'), shareCode: q('share-code'), photo: q('photo'),
    sub2: q('sub2'), sub2Body: q('sub2-body'), stage1: q('stage1'), stage2: q('stage2'),
    stage1Foot: q('stage1-foot'), stageDone: q('stage-done'),
    picks: q('picks'), pickHead: q('pick-head'), autolist: q('autolist'),
    stepCount: q('step-count'), goPrev: q('go-prev'), goNext: q('go-next'),
    doneNo: q('done-no'), doneHint: q('done-hint'),
    goLocal: q('go-local'), goShare: q('go-share'),
    sumStats: q('sum-stats'), sumSegs: q('sum-segs'), sumSegsBody: q('sum-segs-body'),
    sumShots: q('sum-shots'),
    lockWhy: q('lock-why'),
    note: q('note'), close: q('close'),
    report: q('report'), confirm: q('confirm'), recbadge: q('recbadge'),
  };
  const profile = readProfile();
  // 57-C — 기본정보 세 칸이 프로필에 함께 남는다. 챌린지가 바뀌어도 같은 값이라 한 벌만 둔다.
  const FIELDS = [['name', 'name'], ['school', 'school'], ['teacher', 'teacher'], ['classcode', 'classcode']];
  for (const [key, elKey] of FIELDS) el[elKey].value = profile[key] || '';
  // 이름은 비워 두지 않는다. 실명을 요구하지 않고 기본 별명을 미리 채워 둔다.
  if (!el.name.value) el.name.value = ANON_NAME;

  // ── 제출 번호 (54차 파트N) ────────────────────────────────
  // DTC-<챌린지코드>-<YYMMDD>-<4자리 일련>. 챌린지 코드는 매니페스트가 소유한다 —
  // 코드에 표를 박으면 챌린지를 늘릴 때마다 화면을 고쳐야 한다.
  // 일련번호는 이 브라우저 안에서만 센다. 서버가 없으므로 전역 유일이 아니고, 그래도 된다 —
  // 번호는 과제물 파일과 게시판 글을 맞춰 보기 위한 것이다.
  const SERIAL_KEY = 'dtc:v1:submitSerial';
  const CHALLENGE_CODE = (challenge.scene && challenge.scene.ui && challenge.scene.ui.submit_code)
    || challenge.submit_code || null;

  function nextSerial() {
    let n = 0;
    try { n = parseInt(localStorage.getItem(SERIAL_KEY) || '0', 10) || 0; } catch (_) { n = 0; }
    n += 1;
    try { localStorage.setItem(SERIAL_KEY, String(n)); } catch (_) { /* 저장 실패는 무시 */ }
    return n;
  }

  function makeSubmissionNo() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const code = CHALLENGE_CODE || challenge.challenge_id.slice(0, 3).toUpperCase();
    return `DTC-${code}-${yy}${mm}${dd}-${String(nextSerial()).padStart(4, '0')}`;
  }

  // 이번에 만든 제출 번호. 저장을 누르기 전에는 없다.
  let submissionNo = null;

  // 고른 이미지의 이름. 게시판 카드에는 이름만 나간다.
  let photoName = null;
  // 54차 파트N — 과제물 파일에 첨부 사진이 들어간다. 그림은 이 브라우저 메모리에만 두고,
  // 학생이 내려받는 파일 안에만 담긴다 — 저장소에도, 게시판 카드에도 넣지 않는다.
  let photoData = null;

  function say(text) { el.note.textContent = text; }

  // ── 57-C 파트4 — 좌측 세로 스텝 2단계 ──────────────────────
  /**
   * 필수는 여전히 이름 하나다(54차). 2단계는 열어도 되고 안 열어도 된다 —
   * 1단계에서 [내 결과만 저장] 을 누르면 그대로 끝난다.
   * 정보를 지키는 방법은 숨기는 것이 아니라 선택으로 두는 것이다.
   */
  let step = 1;
  const stepBtns = Array.from(el.sub2.querySelectorAll('[data-step]'));

  function paintLock() {
    // 잠금 사유는 [게시판에 올리기] 옆에서만 뜻이 통한다. 1단계에서는 감춘다.
    el.lockWhy.hidden = !(step === 2 && !finishedRun());
  }

  function showStep(n) {
    step = n === 2 ? 2 : 1;
    // 감추되 자리는 남긴다(.is-off). 두 단계 중 높은 쪽이 상자 높이를 정하므로
    // 단계를 오가도 왼쪽 아래 내려받기 자리가 움직이지 않는다.
    el.stage1.classList.toggle('is-off', step !== 1);
    el.stage2.classList.toggle('is-off', step !== 2);
    for (const b of stepBtns) b.classList.toggle('is-on', Number(b.dataset.step) === step);
    el.stepCount.textContent = `${step} / 2 단계`;
    // 하단 오른쪽 — 1단계 [내 결과만 저장][다음 →] · 2단계 [← 이전][내 결과만 저장][게시판에 올리기]
    el.goPrev.hidden = step !== 2;
    el.goNext.hidden = step !== 1;
    el.goShare.hidden = step !== 2;
    paintLock();
  }

  /** 'form' 은 쓰는 화면, 'done' 은 저장한 뒤 제출 번호를 보여 주는 화면이다. */
  function showStage(which) {
    const form = which === 'form';
    // 네비는 두 화면에 다 남는다 — 내려받기가 저장 전후로 같은 자리에 있어야 한다.
    // 단계 버튼은 다 쓴 화면에서 누를 것이 아니므로 그것만 감춘다.
    el.sub2Body.hidden = !form;
    for (const b of stepBtns) b.hidden = !form;
    el.stage1Foot.hidden = !form;
    el.stageDone.hidden = form;
    if (form) showStep(step);
  }

  for (const b of stepBtns) b.addEventListener('click', () => showStep(Number(b.dataset.step)));
  el.goNext.addEventListener('click', () => showStep(2));
  el.goPrev.addEventListener('click', () => showStep(1));

  // ── 1단계 ③ 자동으로 함께 저장되는 것 ───────────────────────
  /**
   * 무엇이 담기는지는 매니페스트(record.fields)가 정한다. 여기서는 그 목록을 그대로 읽어
   * 사람이 읽는 말로만 바꾼다 — 항목을 코드가 더하거나 빼지 않는다.
   * 항목 이름의 목록 자체는 loader 의 RECORD_FIELDS 가 소유한다.
   */
  const RECORD_WORD = {
    lap_total: '전체 랩타임',
    lap_splits: '구간별 시간',
    path_image: '주행 궤적(좌표)',
  };
  const RECORD_FIELDS = (challenge.record && challenge.record.fields) || [];
  /** 자취를 남기는 챌린지에서만 기록 고르기가 뜬다. 분기를 코드에 박지 않는다. */
  const KEEPS_PATH = RECORD_FIELDS.includes('path_image');

  function paintAuto() {
    const names = RECORD_FIELDS.map((f) => RECORD_WORD[f] || f);
    el.autolist.textContent = names.length ? `자동으로 함께 저장됩니다 — ${names.join(' · ')}` : '';
  }

  // ── 1단계 ① 게시할 기록 고르기 ──────────────────────────────
  /** 자취가 남아 있는 시도만 고를 수 있다. 오래된 자취는 저장소에서 이미 빠져 있다. */
  function pathRows() {
    if (!KEEPS_PATH) return [];
    return store.history
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r && r.path && Array.isArray(r.path.samples) && r.path.samples.length);
  }
  /** 고른 기록. 아무것도 안 골라도 제출은 성립한다 — 그때는 가장 빠른 완주가 나간다. */
  let pickIdx = -1;
  function pickedRow() {
    const row = pickIdx >= 0 ? store.history[pickIdx] : null;
    return row || finishedRun();
  }

  function paintPicks() {
    const rows = pathRows();
    el.pickHead.hidden = rows.length === 0;
    el.picks.hidden = rows.length === 0;
    if (!rows.length) { pickIdx = -1; return; }
    // 기본값은 가장 빠른 완주. 완주가 없으면 마지막 시도다.
    const done = rows.filter(({ r }) => !r.ended && typeof r.ticks === 'number');
    const def = done.length ? done.reduce((a, b) => (a.r.ticks <= b.r.ticks ? a : b)) : rows[rows.length - 1];
    if (!rows.some(({ i }) => i === pickIdx)) pickIdx = def.i;
    el.picks.replaceChildren(...rows.map(({ r, i }) => {
      const lab = document.createElement('label');
      lab.className = 'pick';
      lab.classList.toggle('is-on', i === pickIdx);
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'dtc-pick';
      radio.checked = i === pickIdx;
      radio.addEventListener('change', () => { pickIdx = i; paintPicks(); });
      const thumb = pathCanvas(r.path, 96, 96);
      thumb.className = 'pick__thumb';
      const cap = document.createElement('span');
      cap.className = 'pick__cap';
      const no = document.createElement('b');
      no.textContent = `시도 ${r.path.attempt || '—'}`;
      const t = document.createElement('i');
      t.textContent = (!r.ended && typeof r.ticks === 'number') ? `${formatTicks(r.ticks)}초` : '미완주';
      cap.append(no, t);
      lab.append(radio, thumb, cap);
      return lab;
    }));
  }

  function open() {
    // 52-1차 — 모달 뒤에서 주행이 계속되면 요약이 무엇의 요약인지 알 수 없다. 먼저 멈춘다.
    if (hooks && hooks.stopRun) hooks.stopRun();
    el.modal.hidden = false;
    say('');
    paintAuto();
    paintPicks();
    paintSummary();
    paintDownloads();
    step = 1;
    showStage('form');
    el.name.focus();
  }
  function hide() { el.modal.hidden = true; }
  el.close.addEventListener('click', hide);
  el.modal.addEventListener('click', (e) => { if (e.target === el.modal) hide(); });
  // 채운 내용은 그대로 남아 다음에 이어 쓸 수 있다. 저장한 뒤에도 다시 열어 고치면 된다.
  const saveProfile = () => {
    for (const [key, elKey] of FIELDS) profile[key] = el[elKey].value;
    profile.applied = profile.applied && typeof profile.applied === 'object' ? profile.applied : {};
    profile.applied[challenge.challenge_id] = el.applied.value;
    writeProfile(profile);
  };
  for (const k of ['name', 'school', 'teacher', 'classcode', 'applied']) el[k].addEventListener('input', saveProfile);
  // 이름을 비우면 기본 별명으로 되돌아간다 — 빈 이름으로는 제출되지 않는다.
  el.name.addEventListener('blur', () => { if (!el.name.value.trim()) el.name.value = ANON_NAME; });
  el.applied.value = (profile.applied && profile.applied[challenge.challenge_id]) || '';
  el.photo.addEventListener('change', () => {
    const f = (el.photo.files && el.photo.files[0]) || null;
    photoName = f ? f.name : null;
    photoData = null;
    if (!f) { say(''); return; }
    const reader = new FileReader();
    reader.onload = () => { photoData = String(reader.result); };
    reader.readAsDataURL(f);
    say(`이미지 ${photoName} 를 담았습니다.`);
  });

  /**
   * 1단계 — 결과 요약만. 값은 저장된 스냅샷과 엔진 자취에서만 온다.
   * 여기서 새로 계산하거나 문장을 지어내지 않는다.
   */
  function paintSummary() {
    const { best } = summary();
    // 55차 보강5 5-3 — 판단 결과 한 장이 더 담기는 챌린지에서는 그 사실을 미리 적는다.
    const hasJudge = !!((hooks && hooks.judgeShot) ? hooks.judgeShot() : null);
    el.sumShots.textContent = hasJudge
      ? '화면 세 장(완주 순간 · 위에서 본 트랙 · 판단 결과)과 업로드한 최종 코드가 함께 담깁니다.'
      : '화면 두 장과 업로드한 최종 코드가 함께 담깁니다.';
    const goal = challenge.scoring && challenge.scoring.goal_ticks;
    const stats = [];
    stats.push(['기록', best ? `${formatTicks(best.ticks)}초` : '아직 없음']);
    if (typeof goal === 'number') {
      stats.push(['목표', `${formatGoal(formatTicks(goal))}초`]);
      stats.push(['목표 달성', best ? (best.ticks <= goal ? '달성' : '아직') : '아직']);
    }
    // 아직 안 달렸으면 양쪽 다 "—" 다. 0 으로 적으면 "0회 벗어났다" 로 읽힌다.
    stats.push([word('offtrack'), best ? `${best.offtrack || 0}회` : '—']);
    stats.push(['규칙 위반', best ? `${best.violations || 0}회` : '—']);
    el.sumStats.replaceChildren(...stats.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
    // 완주 전에는 구간 값을 보이지 않는다. 한 칸만 값이 있으면 "그 구간이 제일 느리다" 로
    // 읽히는데, 실은 아직 그 구간밖에 안 지난 것이다.
    const done = !!best;
    const rows = (hooks && hooks.segmentRows) ? hooks.segmentRows() : [];
    el.sumSegs.hidden = rows.length === 0;
    if (!el.sumSegs.hidden) {
      const usable = done ? rows.filter((r) => r.ticks !== null) : [];
      const slowest = usable.length ? usable.reduce((a, b) => (a.ticks >= b.ticks ? a : b)).n : -1;
      el.sumSegsBody.replaceChildren(...rows.map((r) => {
        const tr = document.createElement('tr');
        if (r.n === slowest) tr.className = 'is-slowest';
        const t = (done && r.ticks !== null) ? `${formatTicks(r.ticks)}초` : '—';
        for (const v of [String(r.n), r.kind, t]) {
          const td = document.createElement('td');
          td.textContent = v;
          tr.append(td);
        }
        return tr;
      }));
    }
    // 53차 — 게시판은 자랑이 아니라 제출 창구다. 한 바퀴를 완주했으면 연다.
    // 이탈이 있어 최고 기록으로는 인정되지 않는 주행도 올릴 수 있고, 그 사실은 카드에 적힌다.
    const finished = finishedRun();
    el.goShare.disabled = !finished;
    paintLock();
  }

  /** 완주한 시도 가운데 가장 빠른 것. 이탈이 있어도 완주는 완주다. */
  function finishedRun() {
    const rows = store.history.filter((r) => !r.ended && typeof r.ticks === 'number');
    return rows.length ? rows.reduce((a, b) => (a.ticks <= b.ticks ? a : b)) : null;
  }

  // ── 저장된 스냅샷에서만 읽는 요약 ────────────────────────────
  /**
   * 게시판 카드에 실리는 값. 닉네임 · 기록 · 이미지 셋뿐이다.
   * 학교와 교사명은 여기에 넣지 않는다 — 선생님 확인용이고 카드에 보이면 안 된다.
   * 실제 전송은 게시판이 붙는 차수에 이 함수가 낸 것만 보낸다.
   */
  function boardCard() {
    // 학생이 1단계에서 고른 기록이 나간다. 안 골랐으면 가장 빠른 완주다.
    const row = pickedRow();
    const scored = (row && !row.ended && typeof row.ticks === 'number') ? row : null;
    return {
      submission_no: submissionNo,
      challenge_id: challenge.challenge_id,
      nickname: (el.name.value || ANON_NAME).trim(),
      ticks: scored ? scored.ticks : null,
      // 게시판은 제출 창구다. 이탈·위반은 감추지 않고 카드에 함께 적는다.
      offtrack: row ? (row.offtrack || 0) : null,
      violations: row ? (row.violations || 0) : null,
      comment: el.comment.value.trim() || null,
      // 완주 화면 한 장. 이미지 자체가 아니라 만들 수 있다는 사실만 표시한다 —
      // 실제 전송은 게시판이 붙는 차수에 이 함수가 낸 것만 보낸다.
      image: photoName,
      // 코드는 학생이 켰을 때만 나간다. 기본은 꺼짐이다.
      code: el.shareCode.checked ? getCode() : null,
      // 나가지 않는 값(학교 · 교사명 · 응용 회고 · 첨부 사진)은 여기에 넣지 않는다.
      // 이건 어겨서는 안 된다 — 카드에 없으면 게시판이 알 방법이 없다.
    };
  }

  function summary() {
    const rows = store.history;
    const comparable = rows.filter((r) => isComparable(r, ENGINE_VERSION, challenge.version, SCORING_VERSION));
    const legacy = rows.filter((r) => !r.ended && !isComparable(r, ENGINE_VERSION, challenge.version, SCORING_VERSION));
    const best = comparable.length ? comparable.reduce((a, b) => (a.ticks <= b.ticks ? a : b)) : null;
    return { rows, comparable, legacy, best };
  }

  function fileBase(kind) {
    const { best } = summary();
    const lap = best ? `${formatTicks(best.ticks)}s` : '기록없음';
    return `${challenge.challenge_id}_${safe(el.name.value)}_${lap}_${kind}`;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ── 궤적 이미지 ──────────────────────────────────────────────
  // 인쇄용은 종이에 맞춰 밝게 뒤집는다. 화면·PNG 저장은 앱과 같은 다크 그대로 둔다.
  const PRINT_THEME = {
    bg: '#ffffff', band: '#e3e6ee', edge: '#9aa1b4', center: '#aeb4c4',
    trail: '#1f6feb', car: '#1f2536', text: '#1f2536', sub: '#c42a2a',
  };

  /** 미니 탑뷰와 같은 그림을 큰 캔버스에 다시 그리고 랩타임 자막을 얹는다. */
  /**
   * 57-C 파트3 — 저장해 둔 좌표로 지난 시도의 궤적을 다시 그린다.
   *
   * 그리는 것은 지금 화면이 쓰는 그 함수(drawMinimap)다. 그리는 코드를 두 벌 두면 언젠가
   * 한쪽만 고쳐져 "저장된 그림" 과 "지금 그림" 이 달라진다.
   * 그래서 저장된 좌표로 sim 시늉만 만들어 넘긴다 — drawMinimap 이 읽는 것은
   * challenge · kit · track · trail · vehicle · offtrack.active 여섯뿐이다.
   *
   * 같은 좌표 배열이면 언제 그려도 같은 그림이 나온다. 벽시계도 난수도 끼어들지 않는다.
   */
  function simLike(path) {
    const last = path.samples[path.samples.length - 1] || [0, 0, 0, 0];
    return {
      challenge: sim.challenge,
      kit: sim.kit,
      track: sim.track,
      trail: path.samples.map(([, x, y]) => ({ x, y })),
      vehicle: { x: last[1], y: last[2], heading_mdeg: last[3] },
      offtrack: { active: false },
    };
  }

  /** 저장된 자취 하나를 캔버스에 그린다. 크기와 테마는 살아 있는 궤적 그림과 같게 둔다. */
  function pathCanvas(path, w = 320, h = 320, theme) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = (theme && theme.bg) || css('--c-view-bg');
    ctx.fillRect(0, 0, w, h);
    drawMinimap(ctx, simLike(path), w, h, assets, theme);
    return c;
  }

  function trailCanvas(w = 900, h = 900, theme) {
    const { best } = summary();
    // 1단계에서 고른 기록이 있으면 그 좌표로 다시 그린다. 없으면 지금 화면 그대로다.
    const picked = pickedRow();
    const stored = (picked && picked.path && Array.isArray(picked.path.samples) && picked.path.samples.length)
      ? picked : null;
    const lines = scoreLines((stored && !stored.ended && typeof stored.ticks === 'number') ? stored : best, word);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h + 36 + lines.length * 24 + 8;
    const ctx = c.getContext('2d');
    ctx.fillStyle = (theme && theme.bg) || css('--c-view-bg');
    ctx.fillRect(0, 0, c.width, c.height);
    drawMinimap(ctx, stored ? simLike(stored.path) : sim, w, h, assets, theme);
    ctx.fillStyle = (theme && theme.text) || css('--c-text');
    ctx.font = `700 22px ${css('--font-ui') || 'sans-serif'}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${challenge.title}${el.name.value ? ` · ${el.name.value}` : ''}`, 20, h + 22);
    ctx.font = `600 18px ${css('--font-mono') || 'monospace'}`;
    ctx.fillStyle = (theme && theme.sub) || css('--c-accent') || '#7ab8ff';
    lines.forEach((line, i) => ctx.fillText(line, 20, h + 46 + i * 24));
    return c;
  }

  q('do-trail').addEventListener('click', () => {
    trailCanvas().toBlob((b) => { download(b, `${fileBase('궤적')}.png`); say('주행 궤적 PNG 를 저장했습니다.'); }, 'image/png');
  });

  /**
 * 저장 이미지에 들어가는 세 줄. 기록이 어디서 늘었는지가 파일만 봐도 보여야 한다.
 * 값은 기록에 남아 있는 것을 그대로 읽는다 — 여기서 다시 세지 않는다.
 */
function scoreLines(best, word) {
  if (!best) return ['기록 없음'];
  const pen = best.penalty_ticks || 0;
  const drive = typeof best.drive_ticks === 'number' ? best.drive_ticks : best.lap_ticks;
  if (!pen && typeof drive !== 'number') return [`최고 기록 ${formatTicks(best.ticks)}초 · ${word('offtrack')} ${best.offtrack}회`];
  const why = [];
  if (best.offtrack_penalty_ticks) why.push(`${word('offtrack')} ${best.offtrack}회`);
  if (best.violation_penalty_ticks) why.push(`규칙 위반 ${best.violations}회`);
  return [
    `주행 시간 ${formatTicks(drive)}초`,
    `페널티 ${pen ? `+${formatTicks(pen)}초${why.length ? ` (${why.join(' · ')})` : ''}` : '없음'}`,
    `최고 기록 ${formatTicks(best.ticks)}초`,
  ];
}

/** 가운데 시뮬 화면을 그대로 담고 아래에 자막을 붙인다. 교사가 파일만 보고도 알아보게. */
  function shotCanvas() {
    const { best } = summary();
    const lines = scoreLines(best, word);
    const c = document.createElement('canvas');
    c.width = viewCanvas.width;
    c.height = viewCanvas.height + 40 + lines.length * 26 + 12;
    const ctx = c.getContext('2d');
    ctx.fillStyle = css('--c-stage') || '#0b1320';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(viewCanvas, 0, 0);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css('--c-stage-text') || '#eaf1fa';
    ctx.font = `700 22px ${css('--font-ui') || 'sans-serif'}`;
    ctx.fillText(`${challenge.title}${el.name.value ? ` · ${el.name.value}` : ''}`, 20, viewCanvas.height + 26);
    ctx.font = `600 18px ${css('--font-mono') || 'monospace'}`;
    ctx.fillStyle = css('--c-accent') || '#e83a3a';
    lines.forEach((line, i) => ctx.fillText(line, 20, viewCanvas.height + 54 + i * 26));
    return c;
  }

  // 57-C 에서 UI 제거. 코드는 보존
  function saveShot() {
    shotCanvas().toBlob((b) => { download(b, `${fileBase('화면')}.png`); say('현재 화면 PNG 를 저장했습니다.'); }, 'image/png');
  }

  // ── 제출용 JSON ──────────────────────────────────────────────
  // 57-C 에서 UI 제거. 코드는 보존
  function downloadJson() {
    const { comparable, legacy, best } = summary();
    const code = getCode();
    const payload = {
      format: 'dtc.submission/1',
      created_at: new Date().toISOString(),
      display_name: el.name.value || null,
      school: el.school.value || null,
      teacher: el.teacher.value || null,   // 게시판 카드에는 나가지 않는다 — 선생님 확인용
      classcode: el.classcode.value || null,
      team: null,
      reflection: null,
      kit_id: challenge.kit_id,
      challenge_id: challenge.challenge_id,
      challenge_version: challenge.version,
      engine_version: ENGINE_VERSION,
      seed: ENGINE_SEED,
      track_id: String((challenge.scene.assets || {}).background || '').replace('slot:', '') || challenge.scene.track.shape,
      best: {
        lap_time_ms: best ? best.ticks * TICK_MS : null,
        offtrack: best ? best.offtrack : null,
        attempts: store.attempt,
        completed: !!best,
      },
      code,
      code_hash: codeHash(code),
      history: comparable.map((r) => ({
        changes: Array.isArray(r.changes) ? r.changes : [],
        lap_time_ms: r.ticks * TICK_MS,
        delta_ms: typeof r.delta === 'number' ? r.delta * TICK_MS : null,
        note: (r.snapshot && store.notes[r.snapshot]) || null,
        ...(r.threshold !== undefined
          ? { threshold: r.threshold, detection_rate: r.detection_rate, practice_mode: !!r.practice_mode }
          : {}),
      })),
      legacy_records: legacy.length,
      // 자율주행 채점 결과. 위반·정확 대응·완벽 주행 여부가 함께 나간다.
      decisions: decisionSummary && decisionSummary() ? (() => {
        const d = decisionSummary();
        return {
          total: d.total, correct: d.correct, violations: d.violations, perfect: d.perfect,
          penalty_ms: d.penalty_ticks * TICK_MS, classify_correct: d.classify_correct, classify_rate: d.classify_rate,
          points: d.results.map((r) => ({ id: r.id, expect: r.expect, seen: r.seen, ok: r.ok, classified_ok: r.classified_ok })),
        };
      })() : null,
      // 학습 결과는 지표만 나간다 — 사진도 특징값도 제출물에 들어가지 않는다.
      ml: mlSummary && mlSummary() ? mlSummary() : null,
      // 해답을 열어봤는지. 교사가 채점할 때 알아야 하는 사실이라 감추지 않는다.
      solution_viewed: !!store.solutionSeenAt,
      solution_viewed_at: store.solutionSeenAt ? new Date(store.solutionSeenAt).toISOString() : null,
      // 모드에 따라 함께 남는 값. 웹캠 챌린지는 결정론이 성립하지 않으므로 임계값·인식률을 같이 둔다.
      camera: best && best.threshold !== undefined ? {
        threshold: best.threshold, detection_rate: best.detection_rate, practice_mode: !!best.practice_mode,
      } : null,
      // 21차에 입력 UI 가 붙을 자리. school·teacher 는 게시판이 계정으로 아는 정보라 우리가 채우지 않는다.
      team_name: null,
      members: [],
      report: {},
      school: '',
      teacher: '',
      classcode: '',
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${fileBase('제출')}.json`);
    say('제출용 JSON 을 저장했습니다.');
  }

  // ── 리포트 ───────────────────────────────────────────────────
  function sparkline(rows) {
    if (rows.length < 2) return '';
    let best = Infinity;
    const series = rows.map((r) => { best = Math.min(best, r.ticks); return best; });
    const max = Math.max(...series);
    const min = Math.min(...series);
    const span = Math.max(1, max - min);
    const pts = series.map((v, i) => `${((i / (series.length - 1)) * 100).toFixed(1)},${(30 - ((max - v) / span) * 26 - 2).toFixed(1)}`);
    return `<svg class="report__spark" viewBox="-2 -2 104 34" preserveAspectRatio="none"><path d="M${pts.join(' L')}"></path></svg>`;
  }

  /**
   * 과제물 한 건 (54차 파트N). 차례는 지시서가 정한다:
   *   표지 → 이번 주행(기록 표 + 구간 표) → 화면 두 장 → 코드 전문 → 응용 회고 → 첨부 사진.
   * 워드와 PDF 가 같은 문서를 쓴다 — 두 벌을 따로 만들면 반드시 달라진다.
   * 값은 저장된 스냅샷과 엔진 자취에서만 온다. 여기서 새로 계산하지 않는다.
   */
  function assignmentHtml({ forWord = false } = {}) {
    const { rows, best } = summary();
    const row = finishedRun() || best;
    const done = !!row;
    const goal = challenge.scoring && challenge.scoring.goal_ticks;
    const trail = trailCanvas(760, 560, PRINT_THEME).toDataURL('image/png');
    const shot = shotCanvas().toDataURL('image/png');
    // 55차 보강5 5-3 — 분류로 판단하는 챌린지에만 한 장 더. 교사가 "이 학생이 무엇을 학습했나" 를
    // 보는 자리다. 화면에 그려진 것을 그대로 옮긴다 — 여기서 다시 그리지 않는다.
    // 이 그림은 과제물 파일에만 담긴다. 게시판 카드에는 나가지 않는다(boardCard 참고).
    const judgeCanvas = (hooks && hooks.judgeShot) ? hooks.judgeShot() : null;
    const judge = judgeCanvas ? judgeCanvas.toDataURL('image/png') : null;
    const segs = (hooks && hooks.segmentRows) ? hooks.segmentRows() : [];
    const points = (hooks && hooks.pointRows) ? hooks.pointRows() : [];
    const meta = [
      ['제출 번호', submissionNo || '—'],
      ['챌린지', challenge.title],
      ['난이도', entry && entry.difficulty ? entry.difficulty : '—'],
      ['목표', typeof goal === 'number' ? `${formatGoal(formatTicks(goal))}초` : '—'],
      ['이름', el.name.value || ANON_NAME],
      ['학교', el.school.value || '—'],
      ['교사명', el.teacher.value || '—'],
      ['클래스코드', el.classcode.value || '—'],
      ['제출일', new Date().toLocaleDateString('ko-KR')],
    ];
    const score = [
      ['기록', row ? `${formatTicks(row.ticks)}초` : '기록 없음'],
      ['목표 달성', typeof goal === 'number' ? (row && row.ticks <= goal ? '달성' : '아직') : '—'],
      [word('offtrack'), row ? `${row.offtrack || 0}회` : '—'],
      ['규칙 위반', row ? `${row.violations || 0}회` : '—'],
      ['달린 횟수', `${store.attempt}회`],
      ['가장 느린 구간', (() => {
        const usable = done ? segs.filter((r) => r.ticks !== null) : [];
        if (!usable.length) return '—';
        const slow = usable.reduce((a, b) => (a.ticks >= b.ticks ? a : b));
        return `${slow.n}번 ${slow.kind} · ${formatTicks(slow.ticks)}초`;
      })()],
    ];
    const cell = (v) => `<td>${esc(v)}</td>`;
    const segTable = segs.length
      ? `<table class="report__table"><thead><tr><th>구간</th><th>종류</th><th class="num">걸린 시간</th></tr></thead><tbody>${
        segs.map((r) => `<tr>${cell(r.n)}${cell(r.kind)}<td class="num">${done && r.ticks !== null ? `${formatTicks(r.ticks)}초` : '—'}</td></tr>`).join('')}</tbody></table>`
      : '';
    const ptTable = points.length
      ? `<table class="report__table"><thead><tr><th>지점</th><th>상황</th><th>본 것</th><th>판정</th></tr></thead><tbody>${
        points.map((r) => `<tr>${cell(r.no)}${cell(r.name)}${cell(r.seen)}${cell(r.verdict)}</tr>`).join('')}</tbody></table>`
      : '';
    const applied = el.applied.value.trim();
    // 첨부 사진은 이 파일 안에만 담긴다. 게시판 카드에는 나가지 않는다(boardCard 참고).
    const photo = photoData
      ? `<img class="report__img" src="${photoData}" alt="첨부 사진">`
      : '<p class="report__empty">첨부한 사진이 없습니다.</p>';
    const shotCap = done ? '완주 순간' : '멈춘 자리';
    return `
      <div class="report__page">
        ${forWord ? '' : '<button class="btn report__close" data-el="report-close">닫기</button>'
          + '<button class="btn btn--primary report__print" data-el="report-print">인쇄 / PDF 저장</button>'}
        <h1 class="report__h1">과제물 — ${esc(challenge.title)}</h1>
        <dl class="report__meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>

        <h2 class="report__h2">이번 주행</h2>
        <div class="report__score">${score.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        ${segTable}
        ${ptTable}
        ${rows.length ? '' : '<p class="report__empty">아직 기록이 없습니다.</p>'}

        <h2 class="report__h2">화면 — ${esc(shotCap)}</h2>
        <img class="report__img" src="${shot}" alt="${esc(shotCap)}">
        <h2 class="report__h2">화면 — 위에서 본 트랙</h2>
        <img class="report__img" src="${trail}" alt="위에서 본 트랙">
        ${judge ? `<h2 class="report__h2">화면 — 판단 결과 (내가 학습시킨 모델이 읽는 것)</h2>
        <img class="report__img" src="${judge}" alt="판단 결과">` : ''}

        <h2 class="report__h2">업로드한 최종 코드</h2>
        <pre class="report__code">${esc(getCode())}</pre>

        <h2 class="report__h2">코드를 어떻게 응용했나</h2>
        ${applied ? `<p class="report__note">${esc(applied)}</p>` : '<p class="report__empty">쓴 내용이 없습니다.</p>'}

        <h2 class="report__h2">첨부 사진</h2>
        ${photo}
      </div>`;
  }

  /** 화면에서 보는 과제물. [인쇄 / PDF 저장] 이 브라우저의 PDF 저장을 연다. */
  function buildReport() {
    el.report.innerHTML = assignmentHtml();
    el.report.hidden = false;
    el.report.querySelector('[data-el="report-close"]').addEventListener('click', () => { el.report.hidden = true; });
    el.report.querySelector('[data-el="report-print"]').addEventListener('click', () => window.print());
  }

  /**
   * 워드로 내려받기. 라이브러리를 쓰지 않는다 — 워드는 HTML 문서를 그대로 연다.
   * 글상자로 잠그지 않는다: 선생님이 채점 코멘트를 문서 어디에나 바로 달 수 있어야 한다.
   */
  // 57-C 에서 UI 제거. 코드는 보존
  function downloadWord() {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(challenge.title)} 과제물</title>
      <style>
        body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; line-height: 1.6; }
        h1 { font-size: 18pt; } h2 { font-size: 13pt; margin-top: 18pt; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 4pt 6pt; font-size: 10pt; }
        .num { text-align: right; }
        .report__meta div { margin-bottom: 3pt; }
        .report__meta dt { display: inline; font-weight: bold; }
        .report__meta dd { display: inline; margin: 0 0 0 6pt; }
        .report__score div { display: inline-block; width: 32%; margin-bottom: 4pt; }
        .report__score span { color: #555; font-size: 9pt; display: block; }
        .report__code { border: 1px solid #ccc; padding: 6pt; font-family: Consolas, monospace; font-size: 9.5pt; white-space: pre-wrap; }
        img { max-width: 100%; }
      </style></head><body>${assignmentHtml({ forWord: true })}</body></html>`;
    download(new Blob(['\ufeff', html], { type: 'application/msword' }), `${fileBase('과제물')}.doc`);
    say('워드 문서를 저장했습니다.');
  }

  /**
   * 저장한다. 두 버튼 모두 여기로 온다 — 다른 것은 게시판에 올릴 값을 만드느냐뿐이다.
   * 어느 쪽이든 과제물 파일을 내려받을 수 있다.
   */
  /**
   * 한 번이라도 달렸는가. 완주 여부와는 다르다 —
   * 완주하지 못한 주행도 '멈춘 자리' 화면으로 과제물이 된다(54차 파트N).
   * 막을 것은 한 번도 안 달린 상태다.
   */
  function ranOnce() {
    if (hooks && hooks.ranOnce && hooks.ranOnce()) return true;
    return store.history.some((r) => typeof r.ticks === 'number' || r.ended);
  }

  /** 내려받기는 늘 보이되 한 번도 안 달렸으면 잠근다. 창을 열 때와 저장한 뒤 둘 다 지난다. */
  function paintDownloads() {
    const has = ranOnce();
    q('do-pdf').disabled = !has;
    q('do-trail').disabled = !has;
  }

  function finish({ toBoard }) {
    // 이름은 필수다. 비어 있으면 기본 별명으로 되돌린다 — 실명을 요구하지 않는다.
    if (!el.name.value.trim()) el.name.value = ANON_NAME;
    saveProfile();
    // 54차 보강6-5 — 제출 번호는 게시할 때만 매긴다.
    // [내 결과만 저장] 은 게시를 안 하므로 번호가 필요 없다. 한 번도 안 달렸으면
    // 애초에 담을 것이 없으므로 번호도 파일도 만들지 않는다.
    submissionNo = toBoard ? makeSubmissionNo() : null;
    el.doneNo.textContent = submissionNo || '게시하지 않음';
    el.doneNo.classList.toggle('is-none', !submissionNo);
    // 게시판은 아직 없다. 값의 모양만 맞춰 두고 보내지 않는다(54차 파트N).
    lastCard = toBoard ? boardCard() : null;
    const { best } = summary();
    say(toBoard
      ? '이 브라우저에 저장했습니다. 게시판이 열리면 이 번호로 올라갑니다.'
      : (best
        ? `이 브라우저에 저장했습니다 — 최고 기록 ${formatTicks(best.ticks)}초.`
        : '이 브라우저에 저장했습니다.'));
    // 한 번도 안 달렸으면 빈 과제물이 내려받아진다. 잠근다.
    const has = ranOnce();
    paintDownloads();
    el.doneHint.textContent = has
      ? (submissionNo ? '이 번호가 게시판 글과 과제물 파일 양쪽에 찍혀 있습니다.' : '이 브라우저에만 남았습니다. 과제물 파일은 지금 내려받을 수 있습니다.')
      : '아직 한 번도 달리지 않아 담을 것이 없습니다. 한 번 달린 뒤에 내려받을 수 있습니다.';
    showStage('done');
  }

  let lastCard = null;
  el.goLocal.addEventListener('click', () => finish({ toBoard: false }));
  el.goShare.addEventListener('click', () => finish({ toBoard: true }));
  q('do-pdf').addEventListener('click', () => { hide(); buildReport(); });

  // ── 주행 영상 (webm) ────────────────────────────────────────
  // 57-C 에서 UI 제거. 코드는 보존
  let recorder = null;
  function toggleRecording() {
    if (recorder) { recorder.stop(); return; }
    if (!canRecord) { say('이 브라우저는 화면 녹화를 지원하지 않습니다. 이미지 저장을 이용하세요.'); return; }
    const chunks = [];
    const stream = viewCanvas.captureStream(30);
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    } catch {
      recorder = null;
      say('이 브라우저는 webm 녹화를 지원하지 않습니다.');
      return;
    }
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      recorder = null;
      el.recbadge.hidden = true;
      const b = q('do-rec'); if (b) b.textContent = '주행 영상 (webm)';   // 버튼은 57-C 에서 없앴다
      download(new Blob(chunks, { type: 'video/webm' }), `${fileBase('주행')}.webm`);
      say('주행 영상(webm)을 저장했습니다. mp4 변환은 지원하지 않습니다.');
    };
    hide();
    el.recbadge.hidden = false;
    const rb = q('do-rec'); if (rb) rb.textContent = '녹화 중지';
    recorder.start();
    hooks.restartForRecording();          // 4x 로 처음부터 다시 달린다(렌더만 캡처한다)
    const t0 = performance.now();
    const watch = () => {
      if (!recorder) return;
      if (!hooks.isRunning() || performance.now() - t0 > 60000) { recorder.stop(); return; }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  // ── [dev] 기록 초기화 ───────────────────────────────────────
  q('do-wipe').addEventListener('click', () => { el.confirm.hidden = false; });
  q('confirm-no').addEventListener('click', () => { el.confirm.hidden = true; });
  q('confirm-yes').addEventListener('click', () => {
    try { localStorage.removeItem(`dtc:v1:${challenge.kit_id}:${challenge.challenge_id}`); } catch { /* 무시 */ }
    location.reload();
  });

  root.addEventListener('click', open);

  return {
    saveShot,
    /** 게시판 카드에 실릴 값. 제출 번호 · 닉네임 · 기록 · 완주 화면 · 코멘트(+공개 시 코드). */
    boardCard,
    /** 마지막으로 만든 카드. 게시판이 붙는 차수에 이 값만 보낸다. */
    lastBoardCard: () => lastCard,
    dispose() {
      if (recorder) { try { recorder.stop(); } catch { /* 이미 멈춤 */ } }
      for (const node of parts) node.remove();
    },
  };
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
