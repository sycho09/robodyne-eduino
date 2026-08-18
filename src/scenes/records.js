// records.js — 기록실 (내 기록 보관함, 실시간 갱신 UI)

import { CHAPTERS, ROOMS, overallCleared, overallTotal, overallPercent, allRoomIds } from '../content/curriculum.js';
import { results, PASS_GRADE } from '../app/results.js';
import { saveAsPng } from '../app/reportCard.js';
import { stageList, gradeText, gradeKey, hasMedal, esc } from '../app/achievement.js';

const DASH = '-';

export function showRecords(host, { onPlay } = {}) {
  ensureStyles();
  host.replaceChildren();

  const root = document.createElement('section');
  root.className = 'records';
  host.appendChild(root);
  document.body.dataset.inRecords = '1';

  let layout = 'split';   // 'split'(카드) | 'table'(표) — 좌하단 토글이 바꾼다

  const draw = () => {
    root.dataset.layout = layout;
    root.innerHTML = template(layout);
    wire(root, onPlay, (next) => { layout = next; draw(); });
  };
  draw();

  const unsubscribe = results.subscribe(draw);
  const obs = new MutationObserver(() => { if (!host.contains(root)) cleanup(); });
  obs.observe(host, { childList: true });

  // 화면이 빠질 때 치울 것 — 관찰자와 호출 쪽이 같은 함수를 쓴다.
  function cleanup() {
    unsubscribe();
    obs.disconnect();
    delete document.body.dataset.inRecords;
  }
  return cleanup;
}

// ── 마크업 ───────────────────────────────────────────────────────────────────

function template(layout) {
  return `
    <header class="records-head">
      <h1 class="records-title">🏆 내 성취도 기록실</h1>
      <div class="records-save">
        <button type="button" class="records-save-btn" id="btn-save-png">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8; margin-top:-2px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          이미지로 저장
        </button>
      </div>
    </header>

    <div class="records-dock">
      ${layoutToggle(layout)}
    </div>

    <div class="records-content">
      ${layout === 'table'
        ? mockHtml()
        : CHAPTERS.map(sectionHtml).join('') + summaryHtml(CARD_CLS)}
    </div>
  `;
}

function layoutToggle(layout) {
  const btn = (val, label) =>
    `<button type="button" class="${layout === val ? 'is-active' : ''}" data-layout="${val}">${label}</button>`;
  return `
    <div class="records-seg" role="group" aria-label="배치">
      <span class="records-seg-label">배치</span>
      ${btn('split', '카드')}${btn('table', '표')}
    </div>`;
}

// 무대 한 덩이의 껍데기 — 배치마다 클래스 이름만 다르고 구조는 같다.
const CARD_CLS = { box: 'records-stage', head: 'records-stage-head', icon: 'records-stage-icon' };
const TABLE_CLS = { box: 'mk-stage', head: 'mk-head', icon: 'mk-head-icon' };

const stageBox = (cls, rgb, icon, title, body) => `
  <section class="${cls.box}" style="--rc-rgb: ${rgb};">
    <h2 class="${cls.head}"><span class="${cls.icon}" aria-hidden="true">${icon}</span>${title}</h2>
    ${body}
  </section>`;

// 챕터색은 RGB 세 값만 넘긴다 — 쓰는 자리마다 필요한 불투명도가 달라서,
// 완성된 rgba() 를 넘기면 한 자리에 맞춘 값이 다른 자리에서 어긋난다.
const CH_RGB = { ch1: '234, 179, 8', ch2: '236, 72, 153', ch3: '59, 130, 246', ch4: '168, 85, 247' };
const chRgb = (chId) => CH_RGB[chId] || CH_RGB.ch1;
const roomsOf = (ch) => ch.rooms.map((id) => ROOMS[id]).filter(Boolean);

// ── 전체 진척 요약 ────────────────────────────────────────────────────────────
// 진척 판의 테두리색. 챕터색 넷과 겹치면 '무대 하나' 로 읽히므로 그 밖에서 고른다.
const SUMMARY_RGB = '52, 211, 153';

const summaryHtml = (cls) => stageBox(cls, SUMMARY_RGB, '🏅', '나의 진척', summaryPanel());

// 판 안쪽은 배치가 달라도 같다 — 껍데기만 배치마다 갈아 끼운다.
function summaryPanel() {
  const total = overallTotal();
  const cleared = overallCleared();
  const pct = overallPercent();
  // 플레이 수는 클리어와 다른 수다 — results 는 통과 못 한 판도 기록한다.
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

// 메달 진열장 — 무대 하나에 칸 하나(10칸)라 진행바 분모와 눈금이 맞는다.
// 등급은 여기서 말하지 않는다: 그건 단계 열이 맡는다.
function roomCells() {
  return allRoomIds().map((id) => {
    const room = ROOMS[id];
    if (!room) return '';
    return `<li class="${hasMedal(room) ? 'is-got' : ''}" title="${esc(room.name)} · ${esc(room.reward || '')}">
      <span class="rs-medal">${firstEmoji(room.reward)}</span>
    </li>`;
  }).join('');
}

// reward 에서 그림 하나만 떼어 낸다('🔨🚩 버튼 메달' 처럼 둘 붙은 방이 있다).
// 변이 선택자(🎚️)와 ZWJ 조합은 한 글자로 붙잡고, 새로 시작하는 별개 이모지에서 끊는다.
const firstEmoji = (s) =>
  (String(s || '').match(/^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u) || ['🏅'])[0];

// ── 카드 배치 ────────────────────────────────────────────────────────────────
function sectionHtml(ch) {
  const cards = roomsOf(ch).map((r) => cardHtml(r, ch.id)).join('');
  return stageBox(CARD_CLS, chRgb(ch.id), ch.icon, esc(ch.short || ch.name),
    `<ul class="records-grid">${cards}</ul>`);
}

// 표와 같은 구조: [이름] · [단계별 등급 = 과정] · [메달 = 결과].
// 방 대표 등급(큰 알파벳)은 안 쓴다 — 1단계 S · 2단계 D 인 방에 D 만 크게 박히면 오해가 된다.
function cardHtml(room, chId) {
  return `<li class="rc" data-play="${room.id}" role="button" tabindex="0" style="--rc-rgb: ${chRgb(chId)};">
    <div class="rc-content">
      <span class="rc-icon" aria-hidden="true">${room.icon}</span>
      <div class="rc-info">
        <h3 class="rc-name">${esc(room.name)}</h3>
        ${cardBadges(room)}
      </div>
      ${hasMedal(room)
        ? `<span class="rc-seal is-got" title="${esc(room.reward || '')}">🏅</span>`
        : '<span class="rc-seal">-</span>'}
    </div>
  </li>`;
}

// 카드엔 열 머리가 없으니 배지에 단계 번호를 같이 넣는다.
const STAGE_NO = ['①', '②', '③', '④', '⑤'];

function cardBadges(room) {
  const chips = stageList(room).map((s) =>
    `<span class="rc-sb" title="${esc(s.name)}">${s.no ? `<i>${STAGE_NO[s.no - 1] || s.no}</i>` : ''}<b data-grade="${gradeKey(s.grade)}">${esc(gradeText(s.grade, DASH))}</b></span>`).join('');
  return `<div class="rc-badges">${chips}</div>`;
}

// ── 표 배치 ──────────────────────────────────────────────────────────────────
const MOCK_SUFFIX = { ch4: '명예의 전당' };   // 나머지 무대는 '성취도'

function mockHtml() {
  // 앞 절반이 왼쪽, 뒤 절반이 오른쪽. 진척 요약은 방이 적은 오른쪽 열 밑에 붙는다.
  const mid = Math.ceil(CHAPTERS.length / 2);
  const col = (list, tail = '') => `<div class="mk-col">${list.map(mockSection).join('')}${tail}</div>`;
  return `<div class="mk-cols">
    ${col(CHAPTERS.slice(0, mid))}
    ${col(CHAPTERS.slice(mid), summaryHtml(TABLE_CLS))}
  </div>`;
}

// 세부 지표 대신 단계별 등급을 한 열씩 놓는다 — 지표는 게임마다 이름도 개수도 달라 열이 안 맞는다.
function mockSection(ch) {
  const rooms = roomsOf(ch);
  // 한 무대 안에서는 단계 수가 같지만, 최댓값으로 잡아야 한 방만 늘어도 열이 안 모자란다.
  const cols = Math.max(1, ...rooms.map((r) => stageList(r).length));
  const head = `${esc(ch.short || ch.name)} ${MOCK_SUFFIX[ch.id] || '성취도'}`;

  const table = `
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
      </div>`;

  return stageBox(TABLE_CLS, chRgb(ch.id), ch.icon, head, table);
}

function mockRow(room, cols) {
  const played = results.has(room.id);
  return `<tr>
    <td class="mk-name"><span class="mk-icon" aria-hidden="true">${room.icon}</span>${esc(room.name)}</td>
    ${stageCells(room, cols)}
    ${hasMedal(room)
      ? `<td class="mk-medal" title="${esc(room.reward || '')}"><span class="mk-medal-got">🏅</span></td>`
      : '<td class="mk-medal"><span class="mk-medal-none">-</span></td>'}
    <td class="mk-act">
      <button type="button" class="mk-btn" data-play="${room.id}">
        ${played ? '다시 도전 ▶' : '플레이하기 ▶'}
      </button>
    </td>
  </tr>`;
}

// 단계 이름은 열 머리(1단계·2단계)가 대신하고, 해 본 단계만 title 로 달아 둔다.
function stageCells(room, cols) {
  const list = stageList(room);
  return Array.from({ length: cols }, (_, i) => {
    const s = list[i] || { name: '', grade: null };
    const title = s.name ? ` title="${esc(s.name)}"` : '';
    return `<td class="mk-gr"${title}><span data-grade="${gradeKey(s.grade)}">${esc(gradeText(s.grade, DASH))}</span></td>`;
  }).join('');
}

// ── 동작 ─────────────────────────────────────────────────────────────────────
function wire(root, onPlay, onLayout) {
  // 배치 토글 — 무대 목록의 [data-play] 와 섞이지 않게 패널 안에서만 찾는다.
  root.querySelectorAll('.records-seg [data-layout]').forEach((b) => {
    b.addEventListener('click', () => onLayout(b.dataset.layout));
  });

  root.querySelectorAll('[data-play]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay?.(b.dataset.play);
    });
  });

  const saveBtn = root.querySelector('#btn-save-png');
  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await saveAsPng();
    } catch (err) {
      toast(err.message || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'records-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ── 허브의 '내 기록실' 버튼 ───────────────────────────────────────────────────
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
    // 숫자만 있으면 '플레이한 개수' 로 읽힌다 — 무엇을 센 숫자인지 말을 붙여 둔다.
    entryBtn.innerHTML = `<span aria-hidden="true">🏅</span> 내 기록실 <b>${overallCleared()}/${overallTotal()}</b><small>클리어</small>`;
    entryBtn.onclick = () => onOpen?.();
    entryBtn.hidden = false;
  },
  hide() { if (entryBtn) entryBtn.hidden = true; },
};

// ── 스타일 ───────────────────────────────────────────────────────────────────
let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = `
/* --deck-w/-gap: 두 단과 홈을 같이 잡아야 한 열이 574px 로 맞는다.
   --deck-fill: 카드·진척 판·표 판이 나눠 쓰는 한 값 — 판마다 알파가 다르면 하나만 붕 떠 보인다.
   배경 그라데이션은 이론관(03-onboarding.css 의 .pm-bg)과 같은 값이다. */
.records {
  --ink: #f5f3ff;
  --deck-w: 1180px; --deck-gap: 32px;
  --deck-fill: linear-gradient(135deg, rgba(22, 18, 36, .88), rgba(12, 10, 22, .84));
  position: absolute; inset: 0; overflow-y: auto; z-index: 50;
  padding: 40px 24px 120px; color: var(--ink);
  background-color: #2b213e;   /* 그라데이션이 뜨기 전 바탕 */
  background-image:
    radial-gradient(900px 600px at 14% 12%, rgba(255,210,90,.30), transparent 60%),
    radial-gradient(820px 620px at 88% 18%, rgba(255,122,184,.28), transparent 60%),
    radial-gradient(900px 700px at 78% 92%, rgba(111,183,255,.30), transparent 60%),
    radial-gradient(760px 640px at 10% 88%, rgba(155,140,255,.26), transparent 60%),
    linear-gradient(160deg, #3a2230, #34202a 55%, #2a1a22);
}

.records-head { text-align: center; margin-bottom: 0; position: relative; }
.records-title { margin: 0 0 40px; font-size: clamp(28px, 4vw, 36px); font-weight: 800; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }

.records-save { position: fixed; right: 24px; top: 16px; z-index: 70; }
.records-save-btn {
  height: 44px; padding: 0 20px 0 16px; border-radius: 999px; cursor: pointer;
  background: rgba(18,14,30,.5); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.16); color: #eef0ff; font-weight: 700; font-size: 14px; letter-spacing: -.01em;
  box-shadow: 0 8px 26px rgba(0,0,0,.4); transition: background .16s, border-color .16s, transform .12s;
  display: flex; align-items: center; gap: 6px;
}
.records-save-btn:hover { background: rgba(30,24,50,.72); border-color: rgba(255,255,255,.32); transform: scale(1.02); }

/* 좌하단 배치 토글 — 카드/표. */
.records-dock {
  position: fixed; left: 24px; bottom: 32px; z-index: 100;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
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

.records-content { margin: 0 auto; }
.records-stage { margin-bottom: 40px; }
.records-stage-head { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 22px; font-weight: 800; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.6); }
.records-stage-icon { font-size: 26px; }

/* 최소 카드 폭 320px — .rc-name 이 nowrap 이라 더 좁아지면 제목이 메달 칸을 밀어낸다.
   auto-fill 이라 폭이 줄면 한 줄 카드 수가 알아서 준다(미디어 쿼리가 따로 필요 없다). */
.records-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }

/* ── [배치] 카드 ──────────────────────────────────────────────────────────────
   무대별 방 수가 1·6·2·1 로 기울어 좌/우 고정 분할은 한쪽만 길어진다. 단 흘림은 알아서 맞물린다.
   column-count 를 배치 스코프에 두는 이유: 표 배치의 .mk-cols 격자는 단에 잘리면 깨진다. */
.records[data-layout="split"] .records-content { max-width: 1380px; column-count: 2; column-gap: 24px; }
.records[data-layout="split"] .records-stage {
  /* inline-block + width:100% 라야 단 안에서 break-inside 가 확실히 먹는다. */
  display: inline-block; width: 100%; break-inside: avoid; margin-bottom: 24px;
}

/* ── [배치] 표 ────────────────────────────────────────────────────────────────
   한 열 574px — 가장 긴 방 이름이 nowrap 으로 들어가는 선. 값은 .records 의 --deck-* 에 있다. */
.records[data-layout="table"] .records-content { max-width: var(--deck-w); }
.mk-cols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--deck-gap); align-items: start; }
.mk-col { display: flex; flex-direction: column; gap: 34px; }

.mk-head {
  display: flex; align-items: center; gap: 9px; margin: 0 0 12px;
  font-size: 19px; font-weight: 800; color: #e8e4ef; text-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.mk-head-icon { font-size: 21px; }

/* 판 껍데기 — 진척 요약과 표 판이 나란히 놓이므로 같은 옷을 입는다. */
.rs, .mk-panel {
  border-radius: 14px; overflow: hidden;
  background: var(--deck-fill);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(var(--rc-rgb), .5);
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
}
/* 표 쪽만 10px — 14px 을 그대로 두면 옆 표와 둥글기가 어긋난다. */
.mk-panel, .mk-stage .rs { border-radius: 10px; }

.mk { width: 100%; border-collapse: collapse; font-size: 13px; }
/* 머리 행은 판 위에 한 겹 더 얹힌다 — 판보다 한 단만 밝혀야 띠로 갈리면서 글자도 안 묻는다. */
.mk thead tr { background: rgba(255,255,255,.05); }
.mk th { padding: 12px 14px; text-align: center; font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,.45); }
.mk th:first-child { text-align: left; }
.mk td { padding: 11px 14px; text-align: center; color: rgba(255,255,255,.6); border-top: 1px solid rgba(255,255,255,.07); }
.mk tbody tr:first-child td { border-top: 0; }
/* 방이 여섯인 무대가 있어 눈이 가로로 미끄러진다 — 올린 줄만 밝힌다. */
.mk tbody tr:hover { background: rgba(255,255,255,.04); }

/* td.mk-name: .mk td 가 가운데 정렬을 걸어 두므로 같은 무게로 받아야 왼쪽 정렬이 먹는다.
   width:1%: auto 레이아웃은 남는 폭을 열 크기에 비례해 나눠 줘서, 제일 넓은 이름 열이
   남는 폭을 통째로 먹고 옆 열을 밀어낸다. nowrap 이라 최소폭이 곧 이름 길이다. */
.mk td.mk-name { text-align: left; color: #fff; font-weight: 600; white-space: nowrap; }
.mk th:first-child, .mk td.mk-name { width: 1%; }
.mk-icon { font-size: 17px; margin-right: 10px; vertical-align: -.15em; }

/* 단계 칸 — 등급색은 .records [data-grade=…] 한 벌을 그대로 받는다. */
.mk-gr span { font-weight: 800; font-size: 15px; }
.mk-gr span[data-grade="done"] { font-size: 12px; }   /* '수료' 는 두 글자라 줄인다 */
/* 안 한 단계의 '-' 는 공용 색(#475569)이면 판 위에서 거의 안 보여 '못 하는 단계' 로 읽힌다. */
.mk-gr span[data-grade="none"] { color: inherit; opacity: .5; }

/* 메달 칸 — 단계 열이 '과정', 이 칸이 '결과' 다. */
.mk-medal { width: 62px; }
.mk-medal-got { font-size: 19px; }
.mk-medal-none { opacity: .5; }

/* 평소엔 표 글자와 같은 톤으로 눌러 둔다 — 행마다 색이 다른 버튼이 세로로 늘어서면
   눈이 거기부터 읽어서 정작 기록이 안 보인다. 챕터색은 올린 한 행에서만 올라온다. */
.mk-act { width: 132px; }
.mk-btn {
  padding: 7px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap;
  font-size: 12px; font-weight: 700;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: rgba(255,255,255,.6);
  transition: background .15s, border-color .15s, color .15s;
}
.mk-btn:hover { background: rgba(var(--rc-rgb), .3); border-color: rgba(var(--rc-rgb), .9); color: #fff; }

/* 등급색 — 카드 배지와 표의 등급 칸이 [data-grade] 하나로 같은 값을 쓴다. */
.records [data-grade="S"] { color: #a855f7; }
.records [data-grade="A"] { color: #fb7185; }
.records [data-grade="B"] { color: #60a5fa; }
.records [data-grade="C"] { color: #fb923c; }
.records [data-grade="D"] { color: #94a3b8; }
.records [data-grade="done"] { color: #34d399; }
.records [data-grade="none"] { color: #475569; }

/* ── 카드 ─────────────────────────────────────────────────────────────────────
   배경이 어두워 카드와 명도가 붙는다 — 판을 진하게 깔고 챕터색 테두리·글로우로 경계를 세운다.
   .rc 는 카드 배치에만 나오므로 배치 스코프가 없다. */
.rc {
  position: relative; padding: 20px; border-radius: 16px;
  display: flex; flex-direction: column;
  background:
    radial-gradient(ellipse 60% 70% at 50% 0%, rgba(var(--rc-rgb), .26) 0%, transparent 100%),
    var(--deck-fill);
  border: 1px solid rgba(var(--rc-rgb), .75);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 34px rgba(0,0,0,.5), 0 0 20px rgba(var(--rc-rgb), .22), inset 0 1px 0 rgba(255,255,255,.08);
  transition: transform .2s, box-shadow .2s, background .2s, border-color .2s;
}
/* 카드 전체가 버튼이다 — 버튼을 따로 두면 카드 아래가 무거워진다. */
.rc[data-play] { cursor: pointer; }
.rc:hover, .rc:focus-visible {
  transform: translateY(-4px); outline: none;
  border-color: rgb(var(--rc-rgb));
  box-shadow: 0 16px 44px rgba(0,0,0,.55), 0 0 30px rgba(var(--rc-rgb), .42), inset 0 1px 0 rgba(255,255,255,.1);
}

.rc-content { display: flex; align-items: center; width: 100%; }
.rc-icon { font-size: 40px; margin-right: 16px; }
.rc-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rc-name { font-size: 16px; font-weight: 700; margin: 0; white-space: nowrap; color: #fff; }
/* 못 딴 방도 '-' 로 자리를 남긴다 — 칸이 비면 카드마다 폭이 달라져 격자가 어긋난다. */
.rc-seal {
  display: flex; align-items: center; justify-content: center; align-self: stretch;
  font-size: 20px; line-height: 1; color: rgba(255,255,255,.35);
  border-left: 1px solid rgba(255,255,255,.15); padding-left: 16px; margin-left: 12px; width: 60px; text-align: center;
}
.rc-seal.is-got { font-size: 34px; color: inherit; text-shadow: 0 2px 10px rgba(251,191,36,.35); }

/* 단계 배지 — 알 하나가 한 단계라 경계가 분명하다. */
.rc-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.rc-sb {
  display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px;
  border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
}
.rc-sb i { font-style: normal; font-size: 10px; opacity: .55; }   /* 단계 번호 */
.rc-sb b { font-weight: 800; font-size: 13px; }
.rc-sb b[data-grade="done"] { font-size: 11px; }
/* 표의 '-' 와 같은 이유 — 공용 색은 카드 위에서 거의 안 보인다. */
.rc-sb b[data-grade="none"] { color: rgba(255,255,255,.5); }

/* 카드 배치의 진척 판만 카드와 같은 만큼 테두리·글로우를 올린다 — 나란히 놓이므로
   한쪽만 얇으면 그 판만 덜 여문 것으로 보인다. 표 쪽은 행 구분선이 이미 촘촘해 덧칠하지 않는다. */
.records[data-layout="split"] .rs {
  border-color: rgba(var(--rc-rgb), .75);
  box-shadow: 0 10px 34px rgba(0,0,0,.5), 0 0 20px rgba(var(--rc-rgb), .18);
}

/* ── 진척 요약 ────────────────────────────────────────────────────────────────
   금색은 이 블록에서만 — 챕터색과 겹치지 않아야 '전체 합계' 로 읽힌다(.records-entry 와 같은 값). */
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

.rs-rule { margin: 7px 0 0; font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.5); }
.rs-rule b { font-weight: 700; color: rgba(255,255,255,.78); }

/* 메달 진열장 — 무대 하나에 칸 하나(10칸)라 진행바 분모와 눈금이 맞는다. */
.rs-rooms {
  list-style: none; margin: 11px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px;
}
.rs-rooms li {
  display: flex; align-items: center; justify-content: center; padding: 7px 0;
  border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
}
/* 안 딴 메달은 흑백 — 투명도로 누르면 '못 하는 것' 이 되지만 흑백은 '아직 안 모은 것' 이다. */
.rs-medal { font-size: 20px; line-height: 1.1; filter: grayscale(1); opacity: .5; }
.rs-rooms li.is-got { border-color: rgba(251,191,36,.45); background: rgba(251,191,36,.1); }
.rs-rooms li.is-got .rs-medal { filter: none; opacity: 1; }

.rs-goal {
  margin: 10px 0 0; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.08);
  font-size: 13px; color: rgba(255,255,255,.62);
}
.rs-goal b { color: #fbbf24; font-weight: 800; font-variant-numeric: tabular-nums; }

/* 허브의 입구 버튼 — nav.js 의 뒤로 버튼과 같은 방식(body 에 고정 배치). */
.records-entry {
  position: fixed; right: 20px; top: 18px; z-index: 40; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 10px 18px;
  background: rgba(20,16,38,.72); backdrop-filter: blur(8px);
  color: #f5f3ff; font-size: 14px; font-weight: 700;
}
.records-entry:hover { background: rgba(34,28,58,.9); }
.records-entry b { color: #fbbf24; font-variant-numeric: tabular-nums; }
/* '클리어' 는 숫자를 읽는 단서지 숫자와 같은 무게가 아니다. */
.records-entry small { font-size: 12px; font-weight: 700; color: rgba(245,243,255,.6); }
.records-entry[hidden] { display: none; }

.records-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60;
  max-width: min(92vw, 460px); padding: 13px 20px; border-radius: 13px;
  background: #221c3a; color: #f5f3ff; font-size: 14px; border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
}

.records :focus-visible, .records-entry:focus-visible { outline: 2px solid #fbbf24; outline-offset: 3px; }

/* 좁아지면 글자가 먼저 깨진다 — 단부터 접는다. 표는 열이 많아 더 일찍 접힌다. */
@media (max-width: 900px) { .records[data-layout="split"] .records-content { column-count: 1; } }
@media (max-width: 1100px) { .mk-cols { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .records { padding: 84px 16px 110px; }
  .records-head { text-align: left; margin-top: 20px; }
  .records-save { position: absolute; top: 16px; right: 16px; }
  .records-save-btn { height: 38px; padding: 0 16px 0 12px; font-size: 13px; }
  .records-dock { left: 16px; bottom: 20px; }
  .records-seg button { height: 28px; padding: 0 10px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .rs-bar span, .rc { transition: none; } }`;
  document.head.appendChild(el);
}
