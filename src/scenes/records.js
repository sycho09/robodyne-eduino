// records.js — 기록실 (내 기록 보관함, 실시간 갱신 UI)

import { CHAPTERS, ROOMS, overallCleared, overallTotal, overallPercent } from '../content/curriculum.js';
import { results } from '../app/results.js';
import { saveAsPdf, saveAsPng } from '../app/reportCard.js';
import { nav } from '../app/nav.js';

// 등급 대신 '수료'로 표시하는 방 (이론 과정)
const NO_GRADE = new Set(['basics']);

export function showRecords(host, { onPlay } = {}) {
  ensureStyles();
  host.replaceChildren();

  const root = document.createElement('section');
  root.className = 'records';
  host.appendChild(root);

  let unsubscribe = null;

  // [임시] 배경 2종 × 카드 2종 × 배치 2종을 화면에서 갈아 끼우며 고르기 위한 상태.
  //   bg     : 'photo'(허브 사진 · 원본) | 'gradient'(이론관 톤 그라데이션)
  //   card   : 'base'(원본 다크 글래스) | 'dark'(테두리·글로우 강화)
  //   layout : 'grid'(카드 1단) | 'split'(카드 2단 · 스크롤 없이 네 무대) | 'table'(무대별 표 2단)
  // 'photo' + 'base' + 'grid' 조합이 손대기 전 화면 그대로다. 판은 둘 다 어두운 톤이다(흰 판은 뺐다).
  // 조합을 정하고 나면 이 상태와 좌하단 패널, 안 고른 .records[data-bg=…]/[data-card=…] 를 지운다.
  const view = { tab: 'gallery', bg: 'gradient', card: 'dark', layout: 'grid' };

  const draw = () => {
    root.dataset.bg = view.bg;
    root.dataset.card = view.card;
    root.dataset.layout = view.layout;
    root.innerHTML = template(view);
    wire(root, onPlay, (patch) => { Object.assign(view, patch); draw(); });
  };
  draw();
  unsubscribe = results.subscribe(draw);

  const obs = new MutationObserver(() => {
    if (!host.contains(root)) { 
      unsubscribe?.(); 
      obs.disconnect(); 
      delete document.body.dataset.inRecords;
    }
  });
  obs.observe(host, { childList: true });

  document.body.dataset.inRecords = '1';

  return () => { 
    unsubscribe?.(); 
    obs.disconnect(); 
    delete document.body.dataset.inRecords;
  };
}

// ── 마크업 ───────────────────────────────────────────────────────────────────
// 표 판을 쓰는 배치 — 마크업은 한 벌(mockHtml)이고 색만 CSS 에서 갈린다.
// 'mock' 은 평평한 회보라 판, 'table' 은 같은 판에 무대 챕터색(노랑·핑크·파랑·보라)을 입힌 것.
// 둘 다 액션 열을 늘 보여 준다 — '결과 보기 / 바로 플레이' 탭은 카드 배치(1단·2단)용이다.
const DECK_LAYOUTS = new Set(['mock', 'table']);

function template(view) {
  const { tab } = view;
  return `
    <div class="records-shade" aria-hidden="true"></div>

    <header class="records-head">
      <div class="records-headline">
        <h1 class="records-title">🏆 내 성취도 기록실</h1>
      </div>
      <div class="records-save">
        <button type="button" class="records-save-btn" id="btn-save-png">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8; margin-top:-2px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          이미지로 저장
        </button>
      </div>
    </header>

    <div class="records-dock">
      ${abPanel(view)}
      <div class="records-tabs" role="tablist">
        <button type="button" role="tab" class="r-tab ${tab === 'gallery' ? 'is-active' : ''}" data-tab="gallery">결과 보기</button>
        <button type="button" role="tab" class="r-tab ${tab === 'play' ? 'is-active' : ''}" data-tab="play">바로 플레이</button>
      </div>
    </div>

    <div class="records-content">
      ${DECK_LAYOUTS.has(view.layout)
        ? mockHtml()
        : CHAPTERS.map(ch => sectionHtml(ch, view)).join('') + summaryHtml()}
    </div>
  `;
}

// ── 전체 진척 요약 ────────────────────────────────────────────────────────────
// 무대 목록 끝에 흘려 둔다. 2단에서는 방이 적은 오른쪽 열 밑에 붙고, 1단에서는 맨 아래에 온다.
// 수치는 curriculum.js 의 전체 집계를 그대로 쓴다 — 인트로의 '학습 진척 N / 10',
// 커리큘럼 헤더의 '전체 진척'과 같은 함수라 앱 안 어디서 봐도 숫자가 같다.
// 스타트 게이트(이론관)도 하나의 무대로 센다. 화면에 무대 카드로 떠 있는데
// 집계에서만 빠지면 '왜 얘는 안 세지?' 가 된다.
function summaryHtml() {
  return `
    <section class="records-stage" style="--rc-rgb: 251, 191, 36;">
      <h2 class="records-stage-head">
        <span class="records-stage-icon" aria-hidden="true">🏅</span>
        <span class="records-stage-name">나의 진척</span>
      </h2>
      ${summaryPanel()}
    </section>`;
}

// 판 안쪽은 배치가 달라도 같다 — 껍데기(제목 크기·판 색)만 배치마다 갈아 끼운다.
function summaryPanel() {
  const total = overallTotal();
  const cleared = overallCleared();
  const pct = overallPercent();
  const dist = gradeSpread();
  // 아래 등급 칸의 합계 — '클리어' 와 다른 수다. results 는 통과 못 한 판도 기록해서 등급을 남기고
  // (results.js), 클리어는 방마다 '두 단계 다 통과' 같은 고유 조건을 넘겨야 찍힌다(각 게임 finishAll).
  // 그래서 등급은 있는데 클리어가 아닌 방이 생긴다 — 두 수를 나란히 적어야 등급 칸 합계가
  // 어디서 온 숫자인지 읽힌다(안 그러면 '수료 1 + S 1 인데 왜 1개 클리어지?' 가 된다).
  // 말은 기록증(reportCard.js)의 '· N개 플레이' 와 맞춘다.
  const played = GRADE_ORDER.reduce((n, g) => n + dist[g], 0);
  const left = Math.max(0, total - cleared);

  // is-got 은 '딴 칸' 에 붙는다 — 안 딴 칸을 누르는 게 아니라 딴 칸을 켜는 방향이다.
  // (안 딴 걸 흐리게 하면 '아직 안 함' 이 아니라 '못 하는 것' 으로 읽힌다.)
  const grades = GRADE_ORDER
    .map((g) => `<li data-cell="${g}" class="${dist[g] ? 'is-got' : ''}">
      <span class="rs-g" data-grade="${g}">${GRADE_LABEL[g]}</span><b>${dist[g] || '-'}</b>
    </li>`)
    .join('');

  return `
    <div class="rs">
      <div class="rs-bar"><span style="width: ${pct}%"></span></div>
      <p class="rs-count">
        무대 <b>${total}개</b> 중 <b>${cleared}개</b> 클리어
        ${played ? `· <b>${played}개</b> 플레이` : ''}
        <span class="rs-pct">${pct}%</span>
      </p>

      ${played
        ? `<ul class="rs-grades">${grades}</ul>`
        : `<p class="rs-empty">아직 기록이 없어요 — 첫 도전을 기다리고 있어요!</p>`}

      <p class="rs-goal">${left
        ? `👑 천국의 왕관까지 <b>${left}개</b>`
        : `👑 천국의 왕관을 모두 모았어요!`}</p>
    </div>`;
}

// 이론관은 등급이 없어 '수료' 한 칸을 따로 둔다 — 이게 없으면 막대는 10 기준인데
// 아래 등급 합계는 최대 9라 숫자가 안 맞아 보인다. 맨 앞에 두되 S~D 와 다른 종류로 보이게 한다.
const GRADE_ORDER = ['done', 'S', 'A', 'B', 'C', 'D'];
const GRADE_LABEL = { done: '수료', S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' };

// 최고 기록의 등급만 센다(도전 횟수가 아니라 '지금 가진 등급'의 분포).
function gradeSpread() {
  const out = { done: 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const [id, rec] of Object.entries(results.all())) {
    if (!rec?.best) continue;
    const g = NO_GRADE.has(id) ? 'done' : rec.best.grade;
    if (Object.hasOwn(out, g)) out[g] += 1;
  }
  return out;
}

// [임시] 배경·카드 조합 고르기 패널 — 좌하단. 정하고 나면 이 함수와 호출부, .records-ab CSS 를 지운다.
function abPanel(view) {
  const seg = (key, opts) => opts
    .map(([val, label]) => `<button type="button" class="${view[key] === val ? 'is-active' : ''}" data-${key}="${val}">${label}</button>`)
    .join('');
  return `
    <div class="records-ab">
      <div class="records-seg" role="group" aria-label="배경">
        <span class="records-seg-label">배경</span>
        ${seg('bg', [['photo', '사진'], ['gradient', '그라데이션']])}
      </div>
      <div class="records-seg" role="group" aria-label="카드">
        <span class="records-seg-label">카드</span>
        ${seg('card', [['base', '원본'], ['dark', '강화']])}
      </div>
      <div class="records-seg" role="group" aria-label="배치">
        <span class="records-seg-label">배치</span>
        ${seg('layout', [['grid', '1단'], ['split', '2단'], ['table', '표'], ['mock', '시안']])}
      </div>
    </div>`;
}

// 챕터색은 RGB 세 값만 넘긴다 — 카드 테두리 .5/.75, 글로우 .18~.3 처럼 쓰는 자리마다
// 필요한 불투명도가 달라서, 완성된 rgba() 를 넘기면 한 자리에 맞춘 값이 다른 자리에서 어긋난다.
const CH_RGB = { ch1: '234, 179, 8', ch2: '236, 72, 153', ch3: '59, 130, 246', ch4: '168, 85, 247' };
const chVars = (chId) => `--rc-rgb: ${CH_RGB[chId] || CH_RGB.ch1};`;

// 지표는 게임마다 개수도 이름도 다르다(results.js 가 [{label,value}] 로만 받는 이유).
// 그래서 표에서도 지표마다 열을 만들 수 없고, 한 칸에 모아 적는다.
const metricsOf = (best) => (best?.metrics || []).filter((m) => m.label !== '최고 콤보');

// 카드 배치(1단·2단) 전용 — 표 판을 쓰는 배치는 mockHtml() 로 빠진다.
function sectionHtml(ch, view) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);
  const body = `<ul class="records-grid">${rooms.map(r => cardHtml(r, view.tab, ch.id)).join('')}</ul>`;
  return `
    <section class="records-stage" style="${chVars(ch.id)}">
      <h2 class="records-stage-head">
        <span class="records-stage-icon" aria-hidden="true">${ch.icon}</span>
        <span class="records-stage-name">${esc(ch.short || ch.name)}</span>
      </h2>
      ${body}
    </section>`;
}

// ── 배치 · 시안 그대로 ────────────────────────────────────────────────────────
// [비교용] 보내주신 시안을 옮긴 판. 나머지 배치와 디자인 언어를 일부러 공유하지 않는다:
// 챕터색 테두리·글로우 없이 흰 기 도는 반투명 판, 액션 버튼이 탭과 무관하게 늘 보이고,
// 지표가 한 칸에 모이지 않고 열로 갈린다. 진척 요약도 시안에 없으므로 빼 둔다.
// 열 분배만 '표' 배치와 같게 맞췄다(무대 순서가 열 안에서 이어지도록).
const MOCK_SUFFIX = { ch4: '명예의 전당' };   // 나머지 무대는 '성취도'

function mockHtml() {
  // '표' 배치와 같은 순서로 나눈다 — 앞 절반이 왼쪽, 뒤 절반이 오른쪽.
  // (스타트 → 비기너 → 마스터 → 챔피언 순서가 열 안에서 그대로 이어진다.)
  // 진척 요약은 방이 적은 오른쪽 열 밑에 붙인다 — 다른 배치와 자리가 같다.
  const mid = Math.ceil(CHAPTERS.length / 2);
  const col = (list, tail = '') => `<div class="mk-col">${list.map(mockSection).join('')}${tail}</div>`;
  return `<div class="mk-cols">
    ${col(CHAPTERS.slice(0, mid))}
    ${col(CHAPTERS.slice(mid), mockSummary())}
  </div>`;
}

// 요약도 시안 껍데기를 입는다 — 제목은 .mk-head(19px), 판은 흰 기 도는 반투명.
function mockSummary() {
  return `
    <section class="mk-stage" style="--rc-rgb: 251, 191, 36;">
      <h2 class="mk-head">
        <span class="mk-head-icon" aria-hidden="true">🏅</span>
        나의 진척
      </h2>
      ${summaryPanel()}
    </section>`;
}

function mockSection(ch) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);

  // 열 머리는 이 무대에서 기록이 있는 첫 방의 지표 이름을 그대로 쓴다.
  // 값은 라벨이 아니라 '몇 번째 지표인가'로 채운다 — 시안이 그렇게 생겼다
  // (무지개의 첫 지표 74% 가 라이트쇼 기준으로 붙은 열 아래에 들어가 있다).
  const sample = rooms.map((r) => metricsOf(results.get(r.id)?.best)).find((m) => m.length) || [];
  const h1 = sample[0]?.label || '기록';
  const h2 = sample[1]?.label || null;
  const rankHead = ch.id === 'ch4' ? '랭킹' : '랭크';

  // 챕터색은 '표' 배치에서만 쓴다(시안은 평평한 판이라 이 값을 안 읽는다) — 두 배치가
  // 마크업 한 벌을 나눠 쓰므로, 색을 쓰는 쪽에 맞춰 변수만 늘 실어 둔다.
  return `
    <section class="mk-stage" style="${chVars(ch.id)}">
      <h2 class="mk-head">
        <span class="mk-head-icon" aria-hidden="true">${ch.icon}</span>
        ${esc(ch.short || ch.name)} ${MOCK_SUFFIX[ch.id] || '성취도'}
      </h2>
      <div class="mk-panel">
        <table class="mk">
          <thead>
            <tr>
              <th>타이틀</th>
              <th>${esc(h1)}</th>
              ${h2 ? `<th>${esc(h2)}</th>` : ''}
              <th>${rankHead}</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>${rooms.map((r) => mockRow(r, !!h2)).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

function mockRow(room, hasSecond) {
  const best = results.get(room.id)?.best;
  const m = metricsOf(best);
  const isNoGrade = NO_GRADE.has(room.id);
  const rank = best ? (isNoGrade ? '수료' : best.grade) : '-';
  const rankAttr = best ? (isNoGrade ? 'done' : best.grade) : 'none';

  return `<tr>
    <td class="mk-name"><span class="mk-icon" aria-hidden="true">${room.icon}</span>${esc(room.name)}</td>
    <td>${m[0] ? esc(m[0].value) : '-'}</td>
    ${hasSecond ? `<td>${m[1] ? esc(m[1].value) : '-'}</td>` : ''}
    <td class="mk-rank"><span data-grade="${rankAttr}">${rank}</span></td>
    <td class="mk-act">
      <button type="button" class="mk-btn ${best ? 'is-again' : ''}" data-play="${room.id}">
        ${best ? '다시 도전 ▶' : '플레이하기 ▶'}
      </button>
    </td>
  </tr>`;
}

function cardHtml(room, tab, chId) {
  const rec = results.get(room.id);
  const best = rec?.best;

  const isPlay = tab === 'play';
  const playBtn = isPlay ? `<button type="button" class="rc-play" data-play="${room.id}">${best ? '다시 도전 ▶' : '플레이하기 ▶'}</button>` : '';
  const cardClickProps = isPlay ? `data-play="${room.id}" role="button" tabindex="0"` : '';
  const styleVars = chVars(chId);

  // 등급색은 CSS 에 맡긴다(흰 판에서는 한 단계 조인 값이어야 대비가 선다).
  if (!best) {
    return `<li class="rc" ${cardClickProps} style="${styleVars}">
      <div class="rc-content">
        <span class="rc-icon" aria-hidden="true">${room.icon}</span>
        <div class="rc-info">
          <h3 class="rc-name">${esc(room.name)}</h3>
          <div class="rc-body">
            <div class="rc-metrics-item">미클리어</div>
            <div class="rc-metrics-item">도전 대기 중!</div>
          </div>
        </div>
        <span class="rc-seal" data-grade="none">-</span>
      </div>
      ${playBtn}
    </li>`;
  }

  const displayMetrics = metricsOf(best);
  const scoreText = (displayMetrics.length)
    ? displayMetrics.map((m) => `<div class="rc-metrics-item">${esc(m.label)}: <b>${esc(m.value)}</b></div>`).join('')
    : `<div class="rc-metrics-item">결과: <b>${esc(best.summary || '기록됨')}</b></div>`;
  
  const isNoGrade = NO_GRADE.has(room.id);
  const gradeText = isNoGrade ? '수료' : best.grade;
  const gradeAttr = isNoGrade ? 'done' : best.grade;

  return `<li class="rc" ${cardClickProps} style="${styleVars}">
    <div class="rc-content">
      <span class="rc-icon" aria-hidden="true">${room.icon}</span>
      <div class="rc-info">
        <h3 class="rc-name">${esc(room.name)}</h3>
        <div class="rc-body">
          ${scoreText}
        </div>
      </div>
      <span class="rc-seal" data-grade="${gradeAttr}">${gradeText}</span>
    </div>
    ${playBtn}
  </li>`;
}

// ── 동작 ─────────────────────────────────────────────────────────────────────
function wire(root, onPlay, update) {
  // 탭 전환
  root.querySelectorAll('.r-tab').forEach((t) => {
    t.addEventListener('click', () => update({ tab: t.dataset.tab }));
  });

  // [임시] 배경·카드 조합 토글 — 카드 목록의 [data-play] 와 섞이지 않게 패널 안에서만 찾는다.
  root.querySelectorAll('.records-ab [data-bg]').forEach((b) => {
    b.addEventListener('click', () => update({ bg: b.dataset.bg }));
  });
  root.querySelectorAll('.records-ab [data-card]').forEach((b) => {
    b.addEventListener('click', () => update({ card: b.dataset.card }));
  });
  root.querySelectorAll('.records-ab [data-layout]').forEach((b) => {
    b.addEventListener('click', () => update({ layout: b.dataset.layout }));
  });

  // 카드에서 바로 그 방으로 — 최고 기록을 갱신하러 가는 가장 짧은 길.
  root.querySelectorAll('[data-play]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay?.(b.dataset.play);
    });
  });

  const saveBtn = root.querySelector('#btn-save-png');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const origHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      try {
        await saveAsPng();
      } catch (err) {
        toast(err.message || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHtml;
      }
    });
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'records-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ── 허브의 '내 기록실' 버튼 ───────────────────────────────────────────────────
// nav.js 의 뒤로 버튼과 같은 방식(body 에 고정 배치)으로 붙인다.
let entryBtn = null;
export const recordsEntry = {
  show({ onOpen } = {}) {
    if (!entryBtn) {
      ensureStyles();
      entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      entryBtn.className = 'records-entry';
      document.body.appendChild(entryBtn);
    }
    // 숫자만 있으면 '플레이한 개수'로 읽힌다 — 등급이 붙은 방 5개인데 3 이 뜨는 이유가 안 보인다.
    // 클리어는 방마다 고유 조건(전 단계 통과 등)을 넘겨야 찍히므로 그 말을 숫자에 붙여 둔다.
    entryBtn.innerHTML = `<span class="records-entry-icon" aria-hidden="true">🏅</span> 내 기록실 <b>${overallCleared()}/${overallTotal()}</b><small>클리어</small>`;
    entryBtn.onclick = () => onOpen?.();
    entryBtn.hidden = false;
  },
  hide() { if (entryBtn) entryBtn.hidden = true; },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 스타일 ───────────────────────────────────────────────────────────────────
let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = `
.records {
  --ink: #f5f3ff; --dim: #a5a0c0; --line: rgba(255,255,255,.2);
  /* 판 크기의 기준값 — 시안 배치에서 정했고, 표 배치도 이걸 받아 쓴다.
     전체 폭과 두 단 사이 홈을 같이 잡아야 한 열 폭(= (1180 - 32) / 2 = 574px)이 맞는다.
     둘 중 하나만 맞추면 배치를 오갈 때 판이 몇 px 씩 어긋나 보인다. */
  --deck-w: 1180px; --deck-gap: 32px;
  position: absolute; inset: 0; overflow-y: auto; z-index: 50;
  padding: 40px 24px 120px; color: var(--ink);
  background-color: #2b213e;   /* 배경 이미지·그라데이션이 뜨기 전 바탕 */
}
.records > * { position: relative; z-index: 1; }

/* 판 바탕의 다크톤 — 카드(.rc)·진척 요약(.rs)·표 판(.mk-panel)이 한 값을 나눠 쓴다.
   판마다 알파를 따로 잡아 두면(전에는 카드 .88/.84, 판 .86/.82) 나란히 놓였을 때
   판 하나만 배경에 덜 잠겨 붕 떠 보인다. [data-card] 토글이 바꾸는 것도 이 한 줄이라
   카드와 판이 늘 같이 움직인다. */
.records[data-card="base"] { --deck-fill: linear-gradient(135deg, rgba(26, 22, 42, .8), rgba(16, 14, 26, .7)); }
.records[data-card="dark"] { --deck-fill: linear-gradient(135deg, rgba(22, 18, 36, .88), rgba(12, 10, 22, .84)); }

/* ── [배경 1] 허브 사진 — 원본 ────────────────────────────────────────────────
   사진은 밝고 무늬가 있어서 글자·카드가 묻힌다. .records-shade 가 그걸 눌러 준다. */
.records[data-bg="photo"] { background-image: url('/brand/hub-bg.webp'); background-size: cover;
  background-position: center; background-repeat: no-repeat; }
.records-shade {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: linear-gradient(180deg, rgba(20,14,32,.12) 0%, rgba(20,14,32,.2) 55%, rgba(20,14,32,.5) 100%);
}
/* 그라데이션 배경은 이미 어두워서 한 겹 더 덮으면 색만 죽는다. */
.records[data-bg="gradient"] .records-shade { display: none; }

/* ── [배경 2] 이론관(basics) 그라데이션 — 03-onboarding.css 의 .pm-bg 와 같은 값 ──
   스크롤 컨테이너의 배경은 내용과 함께 밀리지 않으므로(attachment: scroll) 화면에 고정돼 보인다. */
.records[data-bg="gradient"] {
  background-image:
    radial-gradient(900px 600px at 14% 12%, rgba(255,210,90,.30), transparent 60%),
    radial-gradient(820px 620px at 88% 18%, rgba(255,122,184,.28), transparent 60%),
    radial-gradient(900px 700px at 78% 92%, rgba(111,183,255,.30), transparent 60%),
    radial-gradient(760px 640px at 10% 88%, rgba(155,140,255,.26), transparent 60%),
    linear-gradient(160deg, #3a2230, #34202a 55%, #2a1a22);
}

.records-head { text-align: center; margin-bottom: 0; position: relative; }
.records-headline { display: flex; flex-direction: column; align-items: center; }
.records-title { margin: 0 0 40px; font-size: clamp(28px, 4vw, 36px); font-weight: 800; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }

.records-save { position: fixed; right: 24px; top: 16px; z-index: 70; }

/* 좌하단 조작 묶음 — 위에서부터 [배경]·[카드]·[탭]. 임시 패널을 걷어내도 탭은 이 자리에 남는다. */
.records-dock {
  position: fixed; left: 24px; bottom: 32px; z-index: 100;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}

/* [임시] 배경·카드 조합 패널 — 조합을 정하고 나면 이 블록과 abPanel() 을 지운다. */
.records-ab { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.records-seg {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px 4px 4px; border-radius: 999px;
  background: rgba(18,14,30,.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.15); box-shadow: 0 16px 40px rgba(0,0,0,.5);
}
.records-seg-label { order: -1; padding: 0 4px 0 10px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,.4); }
.records-seg button {
  height: 30px; padding: 0 12px; border: none; border-radius: 999px; cursor: pointer;
  background: transparent; color: rgba(255,255,255,.55); font-size: 12px; font-weight: 700; transition: all .16s;
}
.records-seg button:hover { color: #fff; }
.records-seg button.is-active { background: rgba(255,255,255,.16); color: #fff; }

.records-save-btn {
  height: 44px; padding: 0 20px 0 16px; border-radius: 999px; cursor: pointer;
  background: rgba(18,14,30,.5); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.16); color: #eef0ff; font-weight: 700; font-size: 14px; letter-spacing: -.01em;
  box-shadow: 0 8px 26px rgba(0,0,0,.4); transition: background .16s, border-color .16s, transform .12s;
  display: flex; align-items: center; gap: 6px;
}
.records-save-btn:hover { background: rgba(30,24,50,.72); border-color: rgba(255,255,255,.32); transform: scale(1.02); }



/* 위 [배경]·[카드] 칩과 같은 치수 — 같은 열에 세로로 쌓이므로 크기가 다르면 층이 어긋나 보인다.
   (임시 패널을 지운 뒤에도 이 값 그대로 남으면 된다. .records-seg 와 값을 맞춰 둔 것뿐이다.) */
.records-tabs {
  display: flex; gap: 4px; padding: 4px; border-radius: 999px;
  background: rgba(18,14,30,.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.15); box-shadow: 0 16px 40px rgba(0,0,0,.5);
}
.r-tab {
  height: 30px; padding: 0 12px; border: none; border-radius: 999px; cursor: pointer;
  background: transparent; color: rgba(255,255,255,.55); font-size: 12px; font-weight: 700; transition: all .16s;
}
.r-tab:hover { color: #fff; }
.r-tab.is-active { background: rgba(255,255,255,.16); color: #fff; }

.records-content { max-width: 1024px; margin: 0 auto; }
.records-stage { margin-bottom: 40px; }
.records-stage-head { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 22px; font-weight: 800; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.6); }
.records-stage-icon { font-size: 26px; }

.records-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

/* ── 카드 2단 배치 ───────────────────────────────────────────────────────────
   네 무대를 스크롤 없이 한 화면에 담기 위해 무대 단위로 2단에 흘린다.
   좌/우를 고정 분할하지 않는 이유: 무대별 방 수가 1·6·2·1 로 크게 기울어 있어서
   반씩 자르면 한쪽만 길어진다. 단 흘림(column)은 높이가 알아서 맞물리고,
   나중에 방이 늘거나 줄어도 분할 지점을 다시 잡을 필요가 없다.
   (표 배치는 이 규칙을 안 쓴다 — 시안과 같은 .mk-cols 격자로 나눈다.) */
.records[data-layout="split"] .records-content { column-count: 2; column-gap: 24px; }
.records[data-layout="split"] .records-stage {
  /* inline-block + width:100% 는 단 안에서 break-inside 가 확실히 먹게 하는 조합이다. */
  display: inline-block; width: 100%; break-inside: avoid; margin-bottom: 24px;
}

/* 카드 2단은 한 단이 카드 2장을 제대로 품을 만큼 넓어야 한다.
   .rc-name 이 nowrap 이라(줄바꿈 금지) 카드가 320px 아래로 좁아지면 제목이 도장을 밀어낸다.
   그래서 폭을 1380px 까지 열고, 최소 카드 폭도 280 → 320 으로 올려
   어중간하게 좁은 2장 대신 넉넉한 1장으로 떨어지게 한다. */
.records[data-layout="split"] .records-content { max-width: 1380px; }
.records[data-layout="split"] .records-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }

/* ── [배치] 시안 · 표 공통 판 ─────────────────────────────────────────────────
   시안(mock)과 표(table)는 여기 있는 .mk* 한 벌을 그대로 나눠 쓴다 — 구조·치수·열 분배·
   헤더 이름·글자 크기가 전부 같다. 갈리는 건 색뿐이고, 그건 아래 [표] 블록에 몰아 뒀다.
   여기 값은 시안 기준(평평한 회보라 판, 고정색)이라 --rc-rgb 를 안 읽는다.
   한 열 574px — 가장 긴 방 이름이 nowrap 으로 들어가고(표 최소폭 약 510px),
   나의 진척의 등급 6칸도 칸당 85px 로 여유가 남는 선이다. 값은 .records 의 --deck-* 에 있다. */
.records[data-layout="mock"] .records-content,
.records[data-layout="table"] .records-content { max-width: var(--deck-w); }
.mk-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--deck-gap); align-items: start; }
.mk-col { display: flex; flex-direction: column; gap: 34px; }

.mk-head {
  display: flex; align-items: center; gap: 9px; margin: 0 0 12px;
  font-size: 19px; font-weight: 800; color: #e8e4ef; text-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.mk-head-icon { font-size: 21px; }

/* 판은 어두운 색을 깐 게 아니라 '흰 기가 도는 반투명 막'이다 — 시안의 패널이 배경보다
   밝고 회보라빛인 게 그래서고, 패널마다 톤이 미세하게 다른 것도 뒤가 비쳐서다.
   어두운 색으로 채우면 배경보다 어두워져 시안과 정반대가 된다. */
.mk-panel {
  border-radius: 10px; overflow: hidden;
  background: rgba(236, 232, 245, .085);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.09);
}
.mk { width: 100%; border-collapse: collapse; font-size: 13px; }
/* 머리 행은 판 위에 한 겹 더 얹히므로, 판(.085)과 눈에 띄게 갈리려면 이만큼 필요하다. */
.mk thead tr { background: rgba(255,255,255,.14); }
.mk th {
  /* 바탕이 밝아진 만큼 글자도 올린다 — #9b93a8 은 이 바탕에서 2.3:1 까지 떨어진다. */
  padding: 12px 14px; text-align: center; font-size: 11.5px; font-weight: 600; color: #c8c1d4;
}
.mk th:first-child { text-align: left; }
.mk td { padding: 11px 14px; text-align: center; color: #b8b0c4; border-top: 1px solid rgba(255,255,255,.05); }
.mk tbody tr:first-child td { border-top: 0; }

/* td 선택자(.mk td)가 가운데 정렬을 걸어 두므로, 이름 칸은 같은 무게(td.mk-name)로 받아야
   왼쪽 정렬이 먹는다. .mk-name 만으로는 구체성이 한 단 낮아 가운데로 끌려간다. */
.mk td.mk-name { text-align: left; color: #e8e4ef; font-weight: 600; white-space: nowrap; }
/* 표가 내용보다 넓으면 auto 레이아웃은 남는 폭을 열 크기에 비례해 나눠 준다 — 타이틀 열이
   제일 넓으니 남는 폭도 제일 많이 먹고, 그게 통째로 이름 뒤 빈칸이 되어 옆 열을 밀어낸다.
   width:1% 로 '이 열은 최소만' 이라 못 박는다. nowrap 이라 최소폭이 곧 이름 길이라
   글자가 잘릴 일은 없고, 남는 폭은 지표·랭크·액션이 고르게 나눠 가진다. */
.mk th:first-child, .mk td.mk-name { width: 1%; }
.mk-icon { font-size: 17px; margin-right: 10px; vertical-align: -.15em; }
/* 등급색은 .records [data-grade=…] 한 벌을 그대로 받는다 — 시안의 S 보라·D 회색과 같은 값이다. */
.mk-rank span { font-weight: 800; font-size: 15px; }
.mk-rank span[data-grade="done"] { font-size: 12px; }
/* 아직 도전 안 한 방의 '-' 만 예외로 뺀다. 공용 [data-grade="none"] 은 #475569 라 판 위에서
   거의 안 보이는데, 그러면 '안 한 방' 이 아니라 '못 누르는 방' 으로 읽힌다(실제로는 바로 플레이된다).
   같은 행 다른 칸의 '-' 와 같은 밝기여야 하므로 색을 새로 정하지 않고 칸에서 물려받는다 —
   시안은 #b8b0c4, 표는 rgba(255,255,255,.6) 으로 각 배치의 값이 알아서 따라온다. */
.mk-rank span[data-grade="none"] { color: inherit; }

.mk-act { width: 132px; }
.mk-btn {
  padding: 7px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap;
  font-size: 12px; font-weight: 700; background: transparent;
  border: 1px solid rgba(150,130,220,.5); color: #b8a8e0;
  transition: background .15s, border-color .15s;
}
.mk-btn:hover { background: rgba(150,130,220,.16); border-color: rgba(150,130,220,.9); }
/* 기록이 있는 방은 금색 — 시안에서 '다시 도전'만 다른 색을 쓴다. */
.mk-btn.is-again { border-color: rgba(212,168,67,.6); color: #e8c96a; }
.mk-btn.is-again:hover { background: rgba(212,168,67,.16); border-color: rgba(212,168,67,1); }

/* 진척 요약도 표와 같은 판으로 — .mk-stage 를 끼워 [data-card] 쪽 .rs 규칙(챕터색 글로우)보다
   구체성을 한 단 높인다. 그 규칙이 이 아래에 있어 순서로는 못 이긴다. */
.records[data-layout="mock"] .mk-stage .rs {
  border-radius: 10px;
  background: rgba(236, 232, 245, .085);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.09);
  box-shadow: none;
}

/* 진척 요약 판 — 카드 배치(1단·2단)가 쓰는 톤. 무대 카드 묶음과 바로 나란히 놓이므로
   바탕은 카드와 같은 --deck-fill 을 받는다(챕터색 글로우만 카드 쪽에 더 있다). */
.rs {
  border-radius: 14px; overflow: hidden;
  background: var(--deck-fill);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(var(--rc-rgb), .5);
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
}

/* ── [배치] 표 = 시안의 판 + 표의 색 ─────────────────────────────────────────
   구조·치수·열 분배·헤더 이름·글자 크기는 위 .mk* 한 벌을 그대로 받는다.
   시안과 갈리는 건 이 블록이 전부고, 전부 색이다:
     · 판 바탕 — 시안의 흰 기 도는 막 대신, 표가 쓰던 다크그레이 그라데이션
     · 표 안 톤 — 머리 행·글자·구분선 모두 표가 쓰던 값
     · 테두리 · 글로우 · 버튼 — 무대 챕터색(노랑·핑크·파랑·보라)
   판 모서리(10px)만 시안 값을 따른다 — .rs 의 14px 을 그대로 두면 옆에 놓인
   무대 표와 둥글기가 달라져 한 벌로 안 보인다. */
.records[data-layout="table"] .mk-panel,
.records[data-layout="table"] .mk-stage .rs {
  border-radius: 10px;
  background: var(--deck-fill);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(var(--rc-rgb), .5);
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
}
/* '강화' 쪽에서는 카드와 같은 만큼 테두리·글로우를 올린다(원본과 차이가 보이게). */
.records[data-card="dark"][data-layout="table"] .mk-panel,
.records[data-card="dark"][data-layout="table"] .mk-stage .rs {
  border-color: rgba(var(--rc-rgb), .75);
  box-shadow: 0 10px 34px rgba(0,0,0,.5), 0 0 20px rgba(var(--rc-rgb), .18);
}

/* 표 안 톤 — 바탕이 어두워진 만큼 시안의 회보라 글자(#c8c1d4·#b8b0c4) 대신 흰 계열로 간다. */
.records[data-layout="table"] .mk thead tr { background: rgba(255,255,255,.05); }
.records[data-layout="table"] .mk th { color: rgba(255,255,255,.45); }
.records[data-layout="table"] .mk td { color: rgba(255,255,255,.6); border-top-color: rgba(255,255,255,.07); }
.records[data-layout="table"] .mk td.mk-name { color: #fff; }
.records[data-layout="table"] .mk tbody tr:hover { background: rgba(255,255,255,.04); }

/* 버튼은 평소엔 지표 값(적중·정확도)과 같은 톤으로 눌러 둔다 — 기록 유무로도 안 가른다.
   행마다 색이 다른 버튼이 세로로 늘어서면 눈이 거기부터 읽어서 정작 기록이 안 보인다.
   무대 챕터색은 마우스를 올린 한 행에서만 올라온다 — '지금 누르는 건 이 무대' 라는 신호로만 쓴다. */
.records[data-layout="table"] .mk-btn,
.records[data-layout="table"] .mk-btn.is-again {
  background: rgba(255,255,255,.06);
  border-color: rgba(255,255,255,.16);
  color: rgba(255,255,255,.6);
  transition: background .15s, border-color .15s, color .15s;
}
.records[data-layout="table"] .mk-btn:hover,
.records[data-layout="table"] .mk-btn.is-again:hover {
  background: rgba(var(--rc-rgb), .3);
  border-color: rgba(var(--rc-rgb), .9);
  color: #fff;
}

/* 등급색 — 카드의 도장과 표의 등급 칸이 [data-grade] 하나로 같은 값을 쓴다. */
.records [data-grade="S"] { color: #a855f7; }
.records [data-grade="A"] { color: #fb7185; }
.records [data-grade="B"] { color: #60a5fa; }
.records [data-grade="C"] { color: #fb923c; }
.records [data-grade="D"] { color: #94a3b8; }
.records [data-grade="done"] { color: #34d399; }
.records [data-grade="none"] { color: #475569; }

/* 카드 — 구조(치수·정렬)는 여기서 한 번만 정하고, 색은 아래 두 스타일이 각자 칠한다. */
.rc {
  position: relative; padding: 20px; border-radius: 16px;
  border: 1px solid transparent;
  display: flex; flex-direction: column; cursor: pointer;
  transition: transform .2s, box-shadow .2s, background .2s, border-color .2s;
}
.rc:hover, .rc:focus-visible { transform: translateY(-4px); outline: none; }

.rc-content { display: flex; align-items: center; width: 100%; }
.rc-icon { font-size: 40px; margin-right: 16px; }
.rc-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rc-name { font-size: 16px; font-weight: 700; margin: 0; white-space: nowrap; color: #fff; }
.rc-seal {
  display: flex; align-items: center; justify-content: center; align-self: stretch;
  font-size: 44px; font-weight: 900; line-height: 1; text-shadow: 0 2px 8px rgba(0,0,0,.3);
  border-left: 1px solid rgba(255,255,255,.15); padding-left: 16px; margin-left: 12px; width: 60px; text-align: center;
}
.rc-seal[data-grade="done"] { font-size: 24px; }

.rc-body { display: flex; flex-direction: column; gap: 2px; }
.rc-metrics-item { font-size: 13px; display: flex; align-items: center; color: rgba(255,255,255,.62); }
.rc-metrics-item b { margin-left: 4px; font-weight: 600; color: rgba(255,255,255,.92); }

.rc-play {
  display: block; width: 100%; margin-top: 14px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 10px 12px;
  background: rgba(255,255,255,.06); color: #fff;
  font-size: 13px; font-weight: 700; transition: background .15s, border-color .15s, color .15s;
}

/* ── [카드 1] 원본 다크 글래스 ────────────────────────────────────────────────
   밝은 사진 배경 위에서 잡은 값이다. 판이 반투명(.8/.7)해서 배경이 비쳐 보이고,
   테두리 .5 · 글로우 6px 으로 얇게 떠 있다. */
.records[data-card="base"] .rc {
  background:
    radial-gradient(ellipse 35% 60% at 50% 0%, rgba(var(--rc-rgb), .25) 0%, transparent 100%),
    var(--deck-fill);
  border-color: rgba(var(--rc-rgb), .5);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 32px rgba(0,0,0,.3), 0 0 6px rgba(var(--rc-rgb), .25), inset 0 0 6px rgba(var(--rc-rgb), .25);
}
.records[data-card="base"] .rc:hover, .records[data-card="base"] .rc:focus-visible {
  background:
    radial-gradient(ellipse 35% 60% at 50% 0%, rgba(var(--rc-rgb), .25) 0%, transparent 100%),
    linear-gradient(135deg, rgba(36, 30, 56, .85), rgba(24, 20, 38, .75));
  box-shadow: 0 12px 40px rgba(0,0,0,.4), 0 0 6px rgba(var(--rc-rgb), .25), inset 0 0 6px rgba(var(--rc-rgb), .25);
}
.records[data-card="base"] .rc-play:hover { background: rgba(var(--rc-rgb), .25); border-color: rgba(var(--rc-rgb), .5); }

/* ── [카드 2] 다크 글래스 강화 ────────────────────────────────────────────────
   배경이 사진에서 어두운 그라데이션으로 바뀌면서 카드와 배경의 명도가 붙었다.
   판을 더 어둡게(불투명하게) 깔고 챕터색 테두리·글로우를 올려 경계를 되살린다. */
.records[data-card="dark"] .rc {
  background:
    radial-gradient(ellipse 60% 70% at 50% 0%, rgba(var(--rc-rgb), .26) 0%, transparent 100%),
    var(--deck-fill);
  border-color: rgba(var(--rc-rgb), .75);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 34px rgba(0,0,0,.5), 0 0 20px rgba(var(--rc-rgb), .22), inset 0 1px 0 rgba(255,255,255,.08);
}
.records[data-card="dark"] .rc:hover, .records[data-card="dark"] .rc:focus-visible {
  border-color: rgb(var(--rc-rgb));
  box-shadow: 0 16px 44px rgba(0,0,0,.55), 0 0 30px rgba(var(--rc-rgb), .42), inset 0 1px 0 rgba(255,255,255,.1);
}
.records[data-card="dark"] .rc-play:hover { background: rgba(var(--rc-rgb), .3); border-color: rgba(var(--rc-rgb), .9); }

/* 요약 패널도 '강화'에서는 카드와 같은 만큼 테두리·글로우를 올린다(원본과 차이가 보이게).
   표 배치의 판은 위 [배치] 표 블록에서 따로 올린다 — 거기가 구체성이 한 단 높다. */
.records[data-card="dark"] .rs {
  border-color: rgba(var(--rc-rgb), .75);
  box-shadow: 0 10px 34px rgba(0,0,0,.5), 0 0 20px rgba(var(--rc-rgb), .18);
}

/* ── 진척 요약 ────────────────────────────────────────────────────────────────
   금색은 이 블록에서만 쓴다 — 챕터색(노랑·분홍·파랑·보라)과 겹치지 않아야
   '무대 하나'가 아니라 '전체 합계'로 읽힌다. .records-entry 의 금색과 같은 값. */
.rs { padding: 13px 16px; }
.rs-bar { height: 8px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
.rs-bar span {
  display: block; height: 100%; border-radius: 999px; transition: width .4s ease;
  background: linear-gradient(90deg, #fbbf24, #f59e0b); box-shadow: 0 0 10px rgba(251,191,36,.5);
}
.rs-count {
  display: flex; align-items: baseline; gap: 6px; margin: 8px 0 0;
  font-size: 13px; color: rgba(255,255,255,.62);
}
.rs-count b { color: #fff; font-weight: 700; }
.rs-pct { margin-left: auto; font-size: 18px; font-weight: 800; color: #fbbf24; font-variant-numeric: tabular-nums; }

.rs-grades {
  list-style: none; margin: 11px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;
}
.rs-grades li {
  display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 0;
  border-radius: 9px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
}
/* 0 개인 등급도 눌러 두지 않는다 — 개수 자리의 '-' 가 이미 '아직 없음' 을 말하는데
   칸까지 흐려 두면 '못 따는 등급' 처럼 읽힌다. 표의 미도전 행과 같은 판단.
   대신 반대 방향으로 간다: 딴 칸에 그 등급색을 켠다. 기본 칸은 위 값 그대로 또렷하고,
   성취에만 강조가 얹히므로 '비활성' 로 읽힐 여지가 없다.
   색은 카드(--rc-rgb)와 같이 RGB 세 값만 넘긴다 — 테두리 .45 / 바탕 .1 처럼 자리마다
   필요한 불투명도가 달라서, 완성된 #hex 를 쓰면 한 자리에 맞춘 값이 다른 자리에서 어긋난다.
   값은 아래 .records [data-grade=…] 글자색을 그대로 옮긴 것이라 글자와 칸의 색이 같다. */
.rs-grades li { --g-rgb: 255, 255, 255; }
.rs-grades li[data-cell="S"]    { --g-rgb: 168, 85, 247; }
.rs-grades li[data-cell="A"]    { --g-rgb: 251, 113, 133; }
.rs-grades li[data-cell="B"]    { --g-rgb: 96, 165, 250; }
.rs-grades li[data-cell="C"]    { --g-rgb: 251, 146, 60; }
.rs-grades li[data-cell="D"]    { --g-rgb: 148, 163, 184; }
.rs-grades li[data-cell="done"] { --g-rgb: 52, 211, 153; }
/* 수료 칸의 초록도 여기에 태운다 — 전에는 개수와 무관하게 늘 켜져 있어서, 다른 칸이 같은
   밝기가 된 뒤로는 '수료만 땄다' 로 읽혔다. '다른 종류' 라는 단서는 글자가 이미 하고 있다
   (여섯 중 유일하게 글자가 아닌 단어 + 초록 + 12px). */
.rs-grades li.is-got { border-color: rgba(var(--g-rgb), .45); background: rgba(var(--g-rgb), .1); }
.rs-g { font-size: 16px; font-weight: 900; line-height: 1; }
/* '수료'는 두 글자라 16px 이면 칸을 넘친다. 카드 도장(.rc-seal)에서 쓴 것과 같은 처리. */
.rs-g[data-grade="done"] { font-size: 12px; }
.rs-grades b { font-size: 13px; font-weight: 700; color: rgba(255,255,255,.9); font-variant-numeric: tabular-nums; }

.rs-empty { margin: 11px 0 0; font-size: 13px; color: rgba(255,255,255,.5); }

.rs-goal {
  margin: 10px 0 0; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.08);
  font-size: 13px; color: rgba(255,255,255,.62);
}
.rs-goal b { color: #fbbf24; font-weight: 800; font-variant-numeric: tabular-nums; }

.records-entry {
  position: fixed; right: 20px; top: 18px; z-index: 40; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 10px 18px;
  background: rgba(20,16,38,.72); backdrop-filter: blur(8px);
  color: #f5f3ff; font-size: 14px; font-weight: 700;
}
.records-entry:hover { background: rgba(34,28,58,.9); }
.records-entry b { color: #fbbf24; font-variant-numeric: tabular-nums; }
/* '클리어'는 숫자를 읽는 단서지 숫자와 같은 무게가 아니다 — 한 단계 눌러 둔다. */
.records-entry small { font-size: 12px; font-weight: 700; color: rgba(245,243,255,.6); }
.records-entry[hidden] { display: none; }

.records-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60;
  max-width: min(92vw, 460px); padding: 13px 20px; border-radius: 13px;
  background: #221c3a; color: #f5f3ff; font-size: 14px; border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
}

.records :focus-visible, .records-entry:focus-visible { outline: 2px solid #fbbf24; outline-offset: 3px; }

/* 2단은 좁아지면 글자가 먼저 깨진다 — 단부터 접는다. */
@media (max-width: 900px) {
  .records[data-layout="split"] .records-content { column-count: 1; }
}
/* 시안·표 배치는 표가 5열이라 더 일찍 접힌다. */
@media (max-width: 1100px) {
  .mk-cols { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .records { padding: 84px 16px 110px; }
  .records-head { text-align: left; margin-top: 20px; }
  .records-headline { align-items: flex-start; }
  .records-save { position: absolute; top: 16px; right: 16px; }
  .records-save-btn { height: 38px; padding: 0 16px 0 12px; font-size: 13px; }
  .records-dock { left: 16px; right: 16px; bottom: 20px; gap: 6px; }
  .records-seg button, .r-tab { height: 28px; padding: 0 10px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .records-bar span, .rc { transition: none; } }`;
  document.head.appendChild(el);
}
