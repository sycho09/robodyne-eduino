// records.js — 기록실 (내 기록 보관함, 실시간 갱신 UI)

import {
  CHAPTERS, ROOMS, overallCleared, overallTotal, overallPercent,
  roomStages, allRoomIds, isRoomCleared,
} from '../content/curriculum.js';
import { results, PASS_GRADE } from '../app/results.js';
import { saveAsPng } from '../app/reportCard.js';
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

  // [임시] 좌하단 패널로 갈아 끼우는 A/B 상태. 배치 넷은 두 쌍이고, 쌍 안에서는 마크업이 같고
  // 판 색만 다르다(1 = 다크 판 + 챕터색, 2 = 흰 기 도는 평평한 판).
  // 조합을 정하면 이 상태와 abPanel(), 안 고른 [data-card=…]/[data-layout=…] 규칙을 지운다.
  const view = { card: 'dark', layout: 'split' };

  const draw = () => {
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
// 표 판을 쓰는 배치 — 마크업 한 벌(mockHtml)을 나눠 쓰고 색만 CSS 에서 갈린다.
const DECK_LAYOUTS = new Set(['mock', 'table']);

function template(view) {
  return `
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
    </div>

    <div class="records-content">
      ${DECK_LAYOUTS.has(view.layout)
        ? mockHtml()
        : CHAPTERS.map(sectionHtml).join('') + summaryHtml()}
    </div>
  `;
}

// ── 전체 진척 요약 ────────────────────────────────────────────────────────────
// 수치는 curriculum.js 의 전체 집계를 그대로 쓴다 — 인트로·커리큘럼 헤더와 같은 함수라
// 앱 어디서 봐도 숫자가 같다.

// 진척 판의 테두리·글로우 색(--rc-rgb). 챕터색 넷(노랑·분홍·파랑·보라)과 겹치면 '무대 하나' 로
// 읽히므로 그 밖에서 고른다 — 전에 쓰던 금색은 스타트 게이트의 노랑과 너무 가까웠다.
const SUMMARY_RGB = '52, 211, 153';

function summaryHtml() {
  return `
    <section class="records-stage" style="--rc-rgb: ${SUMMARY_RGB};">
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
  // 기록이 하나라도 있는 방 수. 클리어와 다른 수다 — results 는 통과 못 한 판도 기록하지만,
  // 클리어는 방마다 '모든 단계 통과' 조건을 넘겨야 찍힌다. 말은 기록증(reportCard.js)과 맞춘다.
  const played = allRoomIds().filter((id) => results.has(id)).length;
  const left = Math.max(0, total - cleared);

  return `
    <div class="rs">
      <div class="rs-bar"><span style="width: ${pct}%"></span></div>
      <p class="rs-count">
        무대 <b>${total}개</b> 중 <b>${cleared}개</b> 클리어
        ${played ? `· <b>${played}개</b> 플레이` : ''}
        <span class="rs-pct">${pct}%</span>
      </p>

      ${left
        ? `<p class="rs-rule">🏅 메달은 무대의 <b>모든 단계</b>를 <b>${PASS_GRADE}등급 이상</b>으로 통과해야 받아요</p>`
        : ''}

      <ul class="rs-rooms">${roomCells()}</ul>

      <p class="rs-goal">${left
        ? `👑 천국의 왕관까지 <b>${left}개</b>`
        : `👑 천국의 왕관을 모두 모았어요!`}</p>
    </div>`;
}

// 메달 진열장 — 무대 하나에 칸 하나(10칸)라 진행바 분모와 눈금이 맞는다. 등급은 여기서 말하지
// 않는다: 알파벳을 같이 넣으면 '1단계는 S인데 왜 A지?' 가 생기고, 등급은 표가 단계별로 맡는다.
// 안 딴 메달은 흑백으로 — 투명도로 누르면 '못 하는 것' 이 되지만 흑백은 '아직 안 모은 것' 이다.
function roomCells() {
  return allRoomIds().map((id) => {
    const room = ROOMS[id];
    if (!room) return '';
    const got = isRoomCleared(id);
    return `<li class="${got ? 'is-got' : ''}" title="${esc(room.name)} · ${esc(room.reward || '')}">
      <span class="rs-medal">${firstEmoji(room.reward)}</span>
    </li>`;
  }).join('');
}

// reward 에서 그림 하나만 떼어 낸다('🔨🚩 버튼 메달' 처럼 둘 붙은 방이 있다).
// 변이 선택자(🎚️)와 ZWJ 조합은 한 글자로 붙잡고, 새로 시작하는 별개 이모지에서 끊는다.
const firstEmoji = (s) =>
  (String(s || '').match(/^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u) || ['🏅'])[0];

// [임시] 배경·카드 조합 고르기 패널 — 좌하단. 정하고 나면 이 함수와 호출부, .records-ab CSS 를 지운다.
function abPanel(view) {
  const seg = (key, opts) => opts
    .map(([val, label]) => `<button type="button" class="${view[key] === val ? 'is-active' : ''}" data-${key}="${val}">${label}</button>`)
    .join('');
  return `
    <div class="records-ab">
      <div class="records-seg" role="group" aria-label="카드">
        <span class="records-seg-label">카드</span>
        ${seg('card', [['base', '원본'], ['dark', '강화']])}
      </div>
      <div class="records-seg" role="group" aria-label="배치">
        <span class="records-seg-label">배치</span>
        ${seg('layout', [['split', '카드1'], ['split2', '카드2'], ['table', '표1'], ['mock', '표2']])}
      </div>
    </div>`;
}

// 챕터색은 RGB 세 값만 넘긴다 — 카드 테두리 .5/.75, 글로우 .18~.3 처럼 쓰는 자리마다
// 필요한 불투명도가 달라서, 완성된 rgba() 를 넘기면 한 자리에 맞춘 값이 다른 자리에서 어긋난다.
const CH_RGB = { ch1: '234, 179, 8', ch2: '236, 72, 153', ch3: '59, 130, 246', ch4: '168, 85, 247' };
const chVars = (chId) => `--rc-rgb: ${CH_RGB[chId] || CH_RGB.ch1};`;

// 지표는 게임마다 개수도 이름도 다르다(results.js 가 [{label,value}] 로만 받는 이유).
// 그래서 표에서도 지표마다 열을 만들 수 없고, 한 칸에 모아 적는다.

// 카드 배치 전용 — 표 판을 쓰는 배치는 mockHtml() 로 빠진다.
function sectionHtml(ch) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);
  const body = `<ul class="records-grid">${rooms.map((r) => cardHtml(r, ch.id)).join('')}</ul>`;
  return `
    <section class="records-stage" style="${chVars(ch.id)}">
      <h2 class="records-stage-head">
        <span class="records-stage-icon" aria-hidden="true">${ch.icon}</span>
        <span class="records-stage-name">${esc(ch.short || ch.name)}</span>
      </h2>
      ${body}
    </section>`;
}

// ── 표 판 배치(표1·표2 공용) ──────────────────────────────────────────────────
const MOCK_SUFFIX = { ch4: '명예의 전당' };   // 나머지 무대는 '성취도'

function mockHtml() {
  // 앞 절반이 왼쪽, 뒤 절반이 오른쪽. 진척 요약은 방이 적은 오른쪽 열 밑에 붙는다.
  const mid = Math.ceil(CHAPTERS.length / 2);
  const col = (list, tail = '') => `<div class="mk-col">${list.map(mockSection).join('')}${tail}</div>`;
  return `<div class="mk-cols">
    ${col(CHAPTERS.slice(0, mid))}
    ${col(CHAPTERS.slice(mid), mockSummary())}
  </div>`;
}

// 요약도 같은 껍데기를 입는다 — 제목은 .mk-head(19px).
function mockSummary() {
  return `
    <section class="mk-stage" style="--rc-rgb: ${SUMMARY_RGB};">
      <h2 class="mk-head">
        <span class="mk-head-icon" aria-hidden="true">🏅</span>
        나의 진척
      </h2>
      ${summaryPanel()}
    </section>`;
}

// 적중·정확도 같은 세부 지표 대신 단계별 등급을 한 열씩 놓는다 — 지표는 게임마다 이름도 개수도
// 달라, 한 무대의 첫 방 이름을 열 머리로 빌려 쓰고 다른 방 값을 자리로만 끼워 넣고 있었다.
function mockSection(ch) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);

  // 한 무대 안에서는 단계 수가 같지만, 최댓값으로 잡아야 한 방만 늘어도 열이 안 모자란다.
  const cols = Math.max(1, ...rooms.map((r) => roomStages(r.id).length));

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
              ${Array.from({ length: cols }, (_, i) => `<th>${i + 1}단계</th>`).join('')}
              <th class="mk-medal">메달</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>${rooms.map((r) => mockRow(r, cols)).join('')}</tbody>
        </table>
      </div>
    </section>`;
}

function mockRow(room, cols) {
  const played = results.has(room.id);
  return `<tr>
    <td class="mk-name"><span class="mk-icon" aria-hidden="true">${room.icon}</span>${esc(room.name)}</td>
    ${stageCells(room, cols)}
    ${medalCell(room)}
    <td class="mk-act">
      <button type="button" class="mk-btn ${played ? 'is-again' : ''}" data-play="${room.id}">
        ${played ? '다시 도전 ▶' : '플레이하기 ▶'}
      </button>
    </td>
  </tr>`;
}

// 방마다 다른 reward 이모지가 아니라 공통 🏅 로 간다 — 타이틀 칸에 이미 그 방 아이콘이 있어
// 같은 그림이 한 줄에 두 번 나오고(10방 중 7방), 열마다 모양이 달라 줄도 안 맞아 보인다.
// 고유 아이콘은 진열장(roomCells)에 몰아 준다. 무슨 메달인지는 title 로 단다.
function medalCell(room) {
  if (!isRoomCleared(room.id)) return '<td class="mk-medal"><span class="mk-medal-none">-</span></td>';
  return `<td class="mk-medal" title="${esc(room.reward || '')}"><span class="mk-medal-got">🏅</span></td>`;
}

// 단계마다 한 칸씩. 안 해 본 단계는 '-' 로 자리만 남아 몇 단계짜리인지가 같이 읽힌다.
// 이름은 열 머리(1단계·2단계)가 대신하고, 해 본 단계만 title 로 달아 둔다.
function stageCells(room, cols) {
  const stages = roomStages(room.id);
  const isNoGrade = NO_GRADE.has(room.id);

  return Array.from({ length: cols }, (_, i) => {
    const s = stages[i];
    // 이론관은 등급을 안 매긴다 — 마쳤다는 것 자체가 통과라 '수료' 한 칸으로 끝낸다.
    if (isNoGrade) {
      return `<td class="mk-gr"><span data-grade="${s ? 'done' : 'none'}">${s ? '수료' : '-'}</span></td>`;
    }
    if (!s) return `<td class="mk-gr"><span data-grade="none">-</span></td>`;
    return `<td class="mk-gr" title="${esc(s.name)}"><span data-grade="${esc(s.grade)}">${esc(s.grade)}</span></td>`;
  }).join('');
}

// 표와 같은 구조로 읽힌다: [타이틀] · [단계별 등급 = 과정] · [메달 = 결과].
// 큰 알파벳 하나(방 대표 등급)를 뺀 이유는 표와 같다 — 1단계 S · 2단계 D 인 방에 D 만 크게
// 박히면 '내 S 어디 갔어?' 가 된다. 액션 버튼도 없다: 카드 전체가 버튼이라 아래가 안 무겁다.
function cardHtml(room, chId) {
  return `<li class="rc" data-play="${room.id}" role="button" tabindex="0" style="${chVars(chId)}">
    <div class="rc-content">
      <span class="rc-icon" aria-hidden="true">${room.icon}</span>
      <div class="rc-info">
        <h3 class="rc-name">${esc(room.name)}</h3>
        <div class="rc-body">${cardBadges(room)}</div>
      </div>
      ${cardMedal(room)}
    </div>
  </li>`;
}

// 카드엔 열 머리가 없으니 배지에 단계 번호를 같이 넣는다.
const STAGE_NO = ['①', '②', '③', '④', '⑤'];

// 카드가 보여 줄 단계 목록 — 배지든 줄글이든 같은 데이터를 쓴다.
// 이론관은 등급을 안 매기고 단계도 하나라, 번호 없이 '수료' 한 칸으로 끝낸다.
function cardStages(room) {
  if (NO_GRADE.has(room.id)) {
    const done = results.has(room.id);
    return [{ no: null, name: '', grade: done ? '수료' : '-', attr: done ? 'done' : 'none' }];
  }
  return roomStages(room.id).map((s, i) => ({
    no: i + 1,
    name: s?.name || '',
    grade: s ? s.grade : '-',
    attr: s ? s.grade : 'none',
  }));
}

function cardBadges(room) {
  const chips = cardStages(room).map((s) =>
    `<span class="rc-sb" title="${esc(s.name)}">${s.no ? `<i>${STAGE_NO[s.no - 1] || s.no}</i>` : ''}<b data-grade="${esc(s.attr)}">${esc(s.grade)}</b></span>`).join('');
  return `<div class="rc-badges">${chips}</div>`;
}

// 표의 메달 칸과 같은 규칙 — 공통 🏅. 카드 왼쪽에 이미 그 방 아이콘이 크게 있다.
function cardMedal(room) {
  return isRoomCleared(room.id)
    ? `<span class="rc-seal is-got" title="${esc(room.reward || '')}">🏅</span>`
    : '<span class="rc-seal">-</span>';
}

// ── 동작 ─────────────────────────────────────────────────────────────────────
function wire(root, onPlay, update) {
  // [임시] 배경·카드 조합 토글 — 카드 목록의 [data-play] 와 섞이지 않게 패널 안에서만 찾는다.
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
  background-color: #2b213e;   /* 그라데이션이 뜨기 전 바탕 */
}

/* 판 바탕의 다크톤 — 카드(.rc)·진척 요약(.rs)·표 판(.mk-panel)이 한 값을 나눠 쓴다.
   판마다 알파를 따로 잡아 두면(전에는 카드 .88/.84, 판 .86/.82) 나란히 놓였을 때
   판 하나만 배경에 덜 잠겨 붕 떠 보인다. [data-card] 토글이 바꾸는 것도 이 한 줄이라
   카드와 판이 늘 같이 움직인다. */
.records[data-card="base"] { --deck-fill: linear-gradient(135deg, rgba(26, 22, 42, .8), rgba(16, 14, 26, .7)); }
.records[data-card="dark"] { --deck-fill: linear-gradient(135deg, rgba(22, 18, 36, .88), rgba(12, 10, 22, .84)); }

/* ── 배경 — 이론관(basics) 그라데이션. 03-onboarding.css 의 .pm-bg 와 같은 값 ──────
   스크롤 컨테이너의 배경은 내용과 함께 밀리지 않으므로(attachment: scroll) 화면에 고정돼 보인다.
   허브 사진 배경도 있었는데 뺐다 — 사진은 밝고 무늬가 있어 글자·카드가 묻혀서, 그걸 누르는
   어두운 막(.records-shade)을 한 겹 더 깔아야 했다. 그라데이션은 이미 어두워 막이 필요 없다. */
.records {
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



.records-content { max-width: 1024px; margin: 0 auto; }
.records-stage { margin-bottom: 40px; }
.records-stage-head { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 22px; font-weight: 800; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.6); }
.records-stage-icon { font-size: 26px; }

/* 한 단이 카드 2장을 제대로 품을 만큼 넓어야 한다 — .rc-name 이 nowrap 이라(줄바꿈 금지)
   카드가 320px 아래로 좁아지면 제목이 메달 칸을 밀어낸다. 그래서 최소 카드 폭을 320 으로 잡아,
   어중간하게 좁은 2장 대신 넉넉한 1장으로 떨어지게 한다.
   auto-fill 이라 폭이 줄면 한 줄 카드 수가 알아서 줄어든다(미디어 쿼리가 따로 필요 없다). */
.records-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }

/* ── 카드 배치 ───────────────────────────────────────────────────────────────
   네 무대를 스크롤 없이 한 화면에 담기 위해 무대 단위로 2단에 흘린다.
   좌/우를 고정 분할하지 않는 이유: 무대별 방 수가 1·6·2·1 로 크게 기울어 있어서
   반씩 자르면 한쪽만 길어진다. 단 흘림(column)은 높이가 알아서 맞물리고,
   나중에 방이 늘거나 줄어도 분할 지점을 다시 잡을 필요가 없다.
   column-count 를 기본값이 아니라 배치 스코프에 두는 이유: 표·시안 배치도 .records-content 를
   쓰는데, 거기는 안쪽이 .mk-cols 격자라 단 흘림이 걸리면 격자가 단에 잘려 깨진다. */
.records[data-layout^="split"] .records-content { max-width: 1380px; column-count: 2; column-gap: 24px; }
.records[data-layout^="split"] .records-stage {
  /* inline-block + width:100% 는 단 안에서 break-inside 가 확실히 먹게 하는 조합이다. */
  display: inline-block; width: 100%; break-inside: avoid; margin-bottom: 24px;
}

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
   어두운 색으로 채우면 배경보다 어두워져 시안과 정반대가 된다.
   막의 알파가 곧 불투명도다: .085 는 배경이 91.5% 그대로 올라와 판이 배경색에 물들었다.
   .16 이면 배경이 84% 비쳐 유리 느낌은 남기면서 판의 경계가 선다. 더/덜은 이 값 하나만 만지면 된다. */
.mk-panel {
  border-radius: 10px; overflow: hidden;
  background: rgba(236, 232, 245, .16);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.13);
}
.mk { width: 100%; border-collapse: collapse; font-size: 13px; }
/* 머리 행은 판 위에 한 겹 더 얹히므로, 판(.16)에 더해진 값이 이 행의 밝기다.
   배경보다는 밝아야 머리 행으로 읽히고(어둡게 깔면 배경에 잠겨 띠가 아니라 구멍처럼 보인다),
   그렇다고 예전 .14(겹치면 약 .28)까지 올리면 그 위의 밝은 글자가 묻힌다.
   .09 면 겹쳐서 약 .24 — 판보다 한 단 밝아 띠로 갈리면서 글자는 살아 있다. */
.mk thead tr { background: rgba(255,255,255,.09); }
.mk th {
  /* 바탕이 눌린 만큼 글자는 그대로 둔다 — #9b93a8 은 이 바탕에서 2.3:1 까지 떨어진다. */
  padding: 12px 14px; text-align: center; font-size: 11.5px; font-weight: 600; color: #c8c1d4;
}
.mk th:first-child { text-align: left; }
.mk td { padding: 11px 14px; text-align: center; color: #b8b0c4; border-top: 1px solid rgba(255,255,255,.05); }
.mk tbody tr:first-child td { border-top: 0; }
/* 한 행에 마우스를 올리면 그 줄만 밝아진다 — 방이 여섯인 무대가 있어 눈이 가로로 미끄러진다.
   시안 판은 흰 막이라 표(.04)보다 조금 더 올려야 같은 만큼 눈에 띈다. */
.mk tbody tr:hover { background: rgba(255,255,255,.07); }

/* td 선택자(.mk td)가 가운데 정렬을 걸어 두므로, 이름 칸은 같은 무게(td.mk-name)로 받아야
   왼쪽 정렬이 먹는다. .mk-name 만으로는 구체성이 한 단 낮아 가운데로 끌려간다. */
.mk td.mk-name { text-align: left; color: #e8e4ef; font-weight: 600; white-space: nowrap; }
/* 표가 내용보다 넓으면 auto 레이아웃은 남는 폭을 열 크기에 비례해 나눠 준다 — 타이틀 열이
   제일 넓으니 남는 폭도 제일 많이 먹고, 그게 통째로 이름 뒤 빈칸이 되어 옆 열을 밀어낸다.
   width:1% 로 '이 열은 최소만' 이라 못 박는다. nowrap 이라 최소폭이 곧 이름 길이라
   글자가 잘릴 일은 없고, 남는 폭은 단계 열이 가져간다. */
.mk th:first-child, .mk td.mk-name { width: 1%; }
.mk-icon { font-size: 17px; margin-right: 10px; vertical-align: -.15em; }

/* 단계 칸 — 등급색은 .records [data-grade=…] 한 벌을 그대로 받는다(S 보라·D 회색). */
.mk-gr span { font-weight: 800; font-size: 15px; }
.mk-gr span[data-grade="done"] { font-size: 12px; }   /* '수료' 는 두 글자라 줄인다 */
/* 아직 안 한 단계의 '-' 는 공용 [data-grade="none"](#475569)을 쓰면 판 위에서 거의 안 보이고,
   그러면 '안 한 단계' 가 아니라 '못 하는 단계' 로 읽힌다. 칸 색을 그대로 물려받게 둔다. */
.mk-gr span[data-grade="none"] { color: inherit; opacity: .5; }

/* 메달 칸 — 단계 열이 '과정', 이 칸이 '결과' 다. 한 줄에서 둘이 같이 읽힌다. */
.mk-medal { width: 62px; }
.mk-medal-got { font-size: 19px; }
.mk-medal-none { opacity: .5; }

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
/* 값은 위 .mk-panel 과 같아야 한다 — 나란히 놓이는 두 판이라 한쪽만 투명하면 그것만 묽어 보인다.
   (판 불투명도를 .085 → .16 으로 올릴 때 표 판만 올리고 여기를 빠뜨려 실제로 그렇게 됐었다.) */
.records[data-layout="mock"] .mk-stage .rs {
  border-radius: 10px;
  background: rgba(236, 232, 245, .16);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,.13);
  box-shadow: none;
}

/* 진척 요약 판 — 카드 배치가 쓰는 톤. 무대 카드 묶음과 바로 나란히 놓이므로
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

/* 버튼은 평소엔 표 글자와 같은 톤으로 눌러 둔다 — 기록 유무로도 안 가른다.
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
  display: flex; flex-direction: column;
  transition: transform .2s, box-shadow .2s, background .2s, border-color .2s;
}
/* '바로 플레이' 탭에서는 카드가 통째로 버튼이다 — 그때만 손 모양과 뜨는 반응을 준다.
   [data-play] 는 누를 수 있을 때만 붙는다(cardHtml). '결과 보기' 탭에서 손 모양이 뜨면
   눌러도 아무 일이 없어 거짓말이 된다. */
.rc[data-play] { cursor: pointer; }
.rc[data-play]:hover, .rc[data-play]:focus-visible { transform: translateY(-4px); outline: none; }

.rc-content { display: flex; align-items: center; width: 100%; }
.rc-icon { font-size: 40px; margin-right: 16px; }
.rc-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rc-name { font-size: 16px; font-weight: 700; margin: 0; white-space: nowrap; color: #fff; }
/* 카드 오른쪽 = 결과 칸. 큰 알파벳 하나를 박던 자리인데 이제 공통 메달이 온다.
   못 딴 방은 '-' 로 자리만 남긴다 — 칸이 비면 카드마다 폭이 달라져 격자가 어긋난다. */
.rc-seal {
  display: flex; align-items: center; justify-content: center; align-self: stretch;
  font-size: 20px; line-height: 1; color: rgba(255,255,255,.35);
  border-left: 1px solid rgba(255,255,255,.15); padding-left: 16px; margin-left: 12px; width: 60px; text-align: center;
}
.rc-seal.is-got { font-size: 34px; color: inherit; text-shadow: 0 2px 10px rgba(251,191,36,.35); }

/* 단계 배지 — 가로로 늘어놓는다. 알 하나가 한 단계라 경계가 분명하다. */
.rc-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.rc-sb {
  display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px;
  border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
}
.rc-sb i { font-style: normal; font-size: 10px; opacity: .55; }   /* 단계 번호 */
.rc-sb b { font-weight: 800; font-size: 13px; }
.rc-sb b[data-grade="done"] { font-size: 11px; }                   /* '수료' 는 두 글자라 줄인다 */
/* 안 한 단계의 '-' 는 공용 [data-grade="none"](#475569)이면 카드 위에서 거의 안 보인다.
   '못 하는 단계' 가 아니라 '아직 안 한 단계' 로 읽히도록 카드 글자색을 물려받게 둔다. */
.rc-sb b[data-grade="none"] { color: rgba(255,255,255,.5); }



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

/* ── [배치] 카드2 — 표2 와 같은 평평한 판 ────────────────────────────────────
   구조·치수·반응형은 카드1 과 한 벌을 쓰고([data-layout^="split"]) 여기서는 판 색만 갈아 끼운다.
   값은 표2 의 .mk-panel 과 같다 — 두 배치가 같은 '흰 기 도는 막' 이어야 나란히 놓고 고를 수 있다.
   li.rc 로 잡는 이유: 위 [data-card] 규칙과 클래스 수가 같아 순서에 기대게 되는데,
   요소 하나(li)를 더해 두면 규칙이 어디로 옮겨가도 이 값이 이긴다. */
.records[data-layout="split2"] li.rc {
  background: rgba(236, 232, 245, .16);
  border-color: rgba(255,255,255,.13);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: none;
}
/* 평평한 판이라 글로우로 뜨게 할 수 없다 — 막을 한 겹 더 얹고 테두리만 세운다. */
.records[data-layout="split2"] li.rc:hover,
.records[data-layout="split2"] li.rc:focus-visible {
  background: rgba(236, 232, 245, .22);
  border-color: rgba(255,255,255,.28);
}
/* 진척 판과 진열장도 같이 평평하게 — 카드와 나란히 놓이는 판이라 톤이 달라지면 그것만 뜬다.
   빈 칸은 반대로 어둡게: 흰 막 위에 흰 칸을 얹으면 경계가 녹는다(표2 에서 겪은 것과 같다).
   div.rs 로 잡는 이유는 li.rc 와 같다 — 아래 .records[data-card="dark"] .rs 와 클래스 수가 같아
   순서로만 이기게 되는데, 그 규칙이 이 아래에 있어서 실제로 졌다(카드2 에서 '강화' 를 누르면
   진척 판만 초록 테두리·글로우가 새어 나왔다). 요소 하나를 더해 순서와 무관하게 이기게 한다. */
.records[data-layout="split2"] div.rs {
  background: rgba(236, 232, 245, .16);
  border-color: rgba(255,255,255,.13);
  box-shadow: none;
}
.records[data-layout="split2"] .rs-rooms li:not(.is-got) {
  background: rgba(28, 22, 44, .16);
  border-color: rgba(255,255,255,.14);
}

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

/* 아직 딸 메달이 남았을 때 나오는 규칙 한 줄 — 표에 메달 열을 따로 두지 않는 대신,
   '단계 등급이 다 A 이상이면 메달' 이라는 규칙을 여기서 한 번 말한다.
   어느 방의 어느 단계가 모자란지는 표의 단계 열이 그대로 보여 준다. */
.rs-rule { margin: 7px 0 0; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.5); }
.rs-rule b { font-weight: 700; color: rgba(255,255,255,.78); }

/* 메달 진열장 — 무대 하나에 칸 하나(10칸)라 진행바 분모와 눈금이 맞는다.
   글자를 안 넣는다: 알파벳을 같이 두면 '1단계는 S인데 왜 A지?' 가 다시 생긴다.
   여기는 '몇 개 모았나' 만 답하고, 등급은 표의 단계 열이 맡는다. */
.rs-rooms {
  list-style: none; margin: 11px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px;
}
.rs-rooms li {
  display: flex; align-items: center; justify-content: center; padding: 7px 0;
  border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
}
/* 시안 판은 흰 막(rgba(236,232,245,.16))이라 배경보다 밝다. 그 위에 흰색 바탕(.04)과 흰색
   테두리(.07)를 얹으면 흰 위에 흰을 더하는 꼴이라 칸 경계가 사라진다 — 표(어두운 판)에서는
   같은 값이 잘 보이는 이유가 이것이다. 그래서 시안에서만 반대로 간다:
   바탕을 살짝 어둡게 깔아 판보다 한 단 내려앉히고, 테두리는 유리처럼 얇은 반투명 흰 선만 남긴다.
   :not(.is-got) 로 빈 칸만 잡는다 — 딴 칸까지 걸면 이 규칙이 구체성에서 이겨 금색을 덮어쓴다.
   딴 칸은 아래 공용 .rs-rooms li.is-got 값 그대로 간다(배치와 무관하게 같은 금색). */
.records[data-layout="mock"] .rs-rooms li:not(.is-got) {
  background: rgba(28, 22, 44, .16);
  border-color: rgba(255,255,255,.14);
}
/* 안 딴 메달은 흑백 — 투명도로 누르면 '못 하는 것' 이 되지만, 흑백은 수집판의 관용 표현이라
   '아직 안 모은 것' 으로 읽힌다. 무엇을 모으는 중인지는 시작할 때부터 보여야 한다. */
.rs-medal { font-size: 20px; line-height: 1.1; filter: grayscale(1); opacity: .5; }
/* 딴 칸은 색이 돌아오고 금색으로 켜진다 — 진행바·왕관 문구와 같은 금색이라 한 덩어리로 읽힌다. */
.rs-rooms li.is-got { border-color: rgba(251,191,36,.45); background: rgba(251,191,36,.1); }
.rs-rooms li.is-got .rs-medal { filter: none; opacity: 1; }

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
  .records[data-layout^="split"] .records-content { column-count: 1; }
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
  .records-seg button { height: 28px; padding: 0 10px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .rs-bar span, .rc { transition: none; } }`;
  document.head.appendChild(el);
}
