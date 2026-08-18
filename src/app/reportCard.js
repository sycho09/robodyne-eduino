// reportCard.js — A4 비율의 밝은 '성취도 기록증'을 만들어 PNG 로 저장한다.
// 평가 문서가 아니라 해낸 것을 남기는 문서라, 시도 횟수·세부 지표는 넣지 않는다.

import { CHAPTERS, ROOMS, isRoomCleared } from '../content/curriculum.js';
import { results, PASS_GRADE } from './results.js';
import { stageList, gradeText, gradeKey, hasMedal, esc } from './achievement.js';

const A4 = { w: 794, h: 1123 };
const DASH = '–';

const fmtDate = (ts) => new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

// ── 기록증 DOM ────────────────────────────────────────────────────────────────
function buildReport({ playerName = '' } = {}) {
  const root = document.createElement('div');
  root.className = 'report-a4';

  // 집계는 이론관까지 포함한 무대 전체 기준 — 기록실 게이지·인트로와 같은 숫자여야 한다.
  const rows = [];
  let cleared = 0;
  let played = 0;
  let total = 0;

  for (const ch of CHAPTERS) {
    for (const rid of ch.rooms) {
      const room = ROOMS[rid];
      if (!room) continue;
      total += 1;
      if (isRoomCleared(rid)) cleared += 1;
      if (results.has(rid)) played += 1;
      rows.push({ chapter: ch, room });
    }
  }

  root.innerHTML = `
    <header class="report-head">
      <div class="report-brand">Eduino AI · 미니게임천국</div>
      <h1 class="report-title">성취도 기록증</h1>
      <dl class="report-meta">
        <div><dt>이름</dt><dd>${playerName ? esc(playerName) : '<span class="report-blank"></span>'}</dd></div>
        <div><dt>발급일</dt><dd>${fmtDate(Date.now())}</dd></div>
        <div><dt>진행</dt><dd>무대 ${total}개 중 <strong>${cleared}개</strong> 클리어 · ${played}개 플레이</dd></div>
      </dl>
    </header>

    <table class="report-table">
      <thead>
        <tr><th class="c-stage">무대</th><th class="c-name">미니게임</th><th class="c-steps">단계별 등급</th><th class="c-medal">메달</th></tr>
      </thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody>
    </table>

    <footer class="report-foot">
      <span>등급 기준 · S 95%↑ / A 85%↑ / B 70%↑ / C 50%↑ / D &nbsp;·&nbsp;
        <span class="g g-medal g-mini">✓</span> 메달은 모든 단계 ${PASS_GRADE}등급↑</span>
      <span class="report-seal">천국의 왕관까지 ${Math.max(0, total - cleared)}개</span>
    </footer>
  `;
  return root;
}

// 화면(기록실)과 같은 구조: 단계별 등급이 '과정', 메달이 '결과'.
function rowHtml({ chapter, room }) {
  return `<tr class="${results.has(room.id) ? '' : 'is-empty'}">
    <td>${esc(chapter.short)}</td>
    <td>${esc(room.name)}</td>
    <td class="c-steps">${stepCells(room)}</td>
    <td class="c-medal">${hasMedal(room)
      ? `<span class="g g-medal" title="${esc(room.reward || '')}">✓</span>`
      : DASH}</td>
  </tr>`;
}

// 이모지 대신 단색 알 — html2canvas 가 OS 폰트를 그대로 구워 기기마다 다른 그림이 되고, 흑백 인쇄에서 뭉갠다.
function stepCells(room) {
  return stageList(room).map((s) => `<span class="st">
    ${s.no ? `<i>${s.no}</i>` : ''}<span class="g g-${gradeKey(s.grade)}">${esc(gradeText(s.grade, DASH))}</span>
  </span>`).join('');
}

// ── 저장 ─────────────────────────────────────────────────────────────────────
// 화면 밖에 실제 크기로 붙여야 폰트·줄바꿈이 인쇄물과 같아진다.
function mountOffscreen(node) {
  const holder = document.createElement('div');
  holder.id = 'report-stage';
  holder.appendChild(node);
  document.body.appendChild(holder);
  return () => holder.remove();
}

export async function saveAsPng(opts) {
  ensureStyles();
  let html2canvas;
  try {
    ({ default: html2canvas } = await import('html2canvas'));
  } catch {
    throw new Error('이미지 저장에는 html2canvas 가 필요해요. 터미널에서 npm i html2canvas 를 실행해 주세요.');
  }
  const node = buildReport(opts);
  const unmount = mountOffscreen(node);
  try {
    try { await document.fonts?.ready; } catch {}
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', width: A4.w, height: A4.h });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `미니게임천국_성취도기록증_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  } finally {
    unmount();
  }
}

// ── 스타일 (기록증 전용 · 앱 화면과 분리) ──────────────────────────────────────
let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = `
#report-stage { position: fixed; left: -10000px; top: 0; }
.report-a4 {
  width: ${A4.w}px; min-height: ${A4.h}px; box-sizing: border-box; padding: 56px 52px 40px;
  background: #fff; color: #1c1917;
  font-family: 'Pretendard', system-ui, -apple-system, 'Malgun Gothic', sans-serif;
  display: flex; flex-direction: column;
}
.report-head { border-bottom: 3px solid #1c1917; padding-bottom: 20px; }
.report-brand { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #f59e0b; font-weight: 700; }
.report-title { margin: 6px 0 18px; font-size: 34px; font-weight: 800; letter-spacing: -.02em; }
.report-meta { display: flex; gap: 36px; margin: 0; font-size: 13px; }
.report-meta div { display: flex; gap: 10px; align-items: baseline; }
.report-meta dt { color: #78716c; font-weight: 600; }
.report-meta dd { margin: 0; font-weight: 500; }
.report-blank { display: inline-block; width: 110px; border-bottom: 1px solid #a8a29e; }

.report-table { width: 100%; border-collapse: collapse; margin-top: 26px; font-size: 13px; }
.report-table th { text-align: left; font-size: 11px; letter-spacing: .08em; color: #78716c;
  padding: 0 10px 9px; border-bottom: 1px solid #d6d3d1; font-weight: 700; }
.report-table td { padding: 13px 10px; border-bottom: 1px solid #f0efed; vertical-align: middle; }
.report-table .c-stage { color: #78716c; width: 108px; }
.report-table .c-name { font-weight: 700; width: 158px; }
.report-table .c-steps { color: #44403c; }
.report-table .c-medal { width: 56px; text-align: center; }
/* 안 해 본 방도 '–' 로 자리를 남긴다 — 비면 '몇 개 중 몇 개' 라는 이 표의 성격이 흐려진다. */
.report-table tr.is-empty td { color: #a8a29e; }

.report-table .st { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
.report-table .st i { font-style: normal; font-size: 10px; color: #a8a29e; }
.g { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border-radius: 8px; font-weight: 800; font-size: 13px; color: #fff; }
/* 등급색 — 화면과 색상(hue)은 같고 명도만 내렸다(흰 종이 위 알 배경이라). 괄호가 화면 값. 대비 전부 4.5:1↑ */
.g-S { background: #7c3aed; }   /* 보라 (#a855f7) */
.g-A { background: #e11d48; }   /* 로즈 (#fb7185) */
.g-B { background: #2563eb; }   /* 파랑 (#60a5fa) */
.g-C { background: #c2410c; }   /* 주황 (#fb923c) */
.g-D { background: #64748b; }   /* 슬레이트 (#94a3b8) */
.g-done { background: #047857; width: auto; padding: 0 8px; font-size: 12px; }   /* 초록 (#34d399) */
.g-none { background: #f1f5f9; color: #cbd5e1; }
/* 메달 — 등급색 어디와도 안 겹치는 금색이라 같은 줄에서 '등급 하나 더'로 안 읽힌다. */
.g-medal { background: #b45309; }
.g-mini { width: 16px; height: 16px; border-radius: 5px; font-size: 10px; vertical-align: -3px; }

.report-foot { margin-top: auto; padding-top: 18px; border-top: 1px solid #d6d3d1;
  display: flex; justify-content: space-between; font-size: 11px; color: #78716c; }
.report-seal { font-weight: 700; color: #f59e0b; }`;
  document.head.appendChild(el);
}
