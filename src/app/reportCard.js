// reportCard.js — 결과 저장 (PDF/PNG)
// 기록실 화면 대신 A4 비율의 밝은 기록증을 생성해 저장.
// '성적표'가 아니라 '기록증'이다 — 점수를 매겨 평가하는 문서가 아니라
// 무엇을 얼마나 해냈는지 남겨 주는 문서다. 파일명·제목 문구도 여기에 맞춘다.

import { CHAPTERS, ROOMS } from '../content/curriculum.js';
import { results } from './results.js';
import { progress } from './progress.js';

const A4 = { w: 794, h: 1123 };

// 등급 대신 '수료'로 적는 방 (이론 과정)
const NO_GRADE = new Set(['basics']);

const fmtDate = (ts) => new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

// ── 기록증 DOM ────────────────────────────────────────────────────────────────
export function buildReport({ playerName = '' } = {}) {
  const root = document.createElement('div');
  root.className = 'report-a4';

  // 집계는 스타트 게이트(이론관)까지 포함한 무대 전체 기준 — 화면(기록실 진척 게이지),
  // 인트로의 '학습 진척 N / 10' 과 같은 숫자여야 한다. NO_GRADE 는 등급 표기에만 쓴다.
  const rows = [];
  let cleared = 0;
  let played = 0;
  let total = 0;

  for (const ch of CHAPTERS) {
    for (const rid of ch.rooms) {
      const room = ROOMS[rid];
      if (!room) continue;
      const rec = results.get(rid);
      const best = rec?.best || null;
      total += 1;
      if (progress.isCleared(rid)) cleared += 1;
      if (rec) played += 1;
      rows.push({ chapter: ch, room, rec, best });
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
        <tr><th class="c-stage">무대</th><th class="c-name">미니게임</th><th class="c-grade">등급</th><th class="c-detail">세부 기록</th></tr>
      </thead>
      <tbody>
        ${rows.map(rowHtml).join('')}
      </tbody>
    </table>

    <footer class="report-foot">
      <span>등급 기준 · S 95%↑ / A 85%↑ / B 70%↑ / C 50%↑ / D</span>
      <span class="report-seal">천국의 왕관까지 ${Math.max(0, total - cleared)}개</span>
    </footer>
  `;
  return root;
}

// 시도 횟수는 적지 않는다 — 등급이 '최고 기록' 기준이라 나란히 놓으면
// '이 등급까지 N번 걸렸다'는 대비가 생기고, 기록증이 아이들끼리 비교되는 물건이 된다.
// results 에는 attempts 가 계속 쌓이므로 필요해지면 언제든 되살릴 수 있다.
function rowHtml({ chapter, room, rec, best }) {
  if (!rec || !best) {
    return `<tr class="is-empty">
      <td>${esc(chapter.short)}</td>
      <td>${esc(room.name)}</td>
      <td class="c-grade"><span class="g g-none">–</span></td>
      <td class="c-detail">아직 플레이하지 않았어요</td>
    </tr>`;
  }
  const displayMetrics = best.metrics.filter(m => m.label !== '최고 콤보');
  const detail = displayMetrics.length
    ? displayMetrics.map((m) => `${esc(m.label)} ${esc(m.value)}`).join(' · ')
    : esc(best.summary || '기록 없음');
  const grade = NO_GRADE.has(room.id)
    ? `<span class="g g-done">수료</span>`
    : `<span class="g g-${best.grade}">${best.grade}</span>`;
  return `<tr>
    <td>${esc(chapter.short)}</td>
    <td>${esc(room.name)}</td>
    <td class="c-grade">${grade}</td>
    <td class="c-detail">${detail}</td>
  </tr>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 저장 ─────────────────────────────────────────────────────────────────────
// 화면 밖(뷰포트 왼쪽 바깥)에 실제 크기로 붙여야 폰트·줄바꿈이 인쇄물과 같아진다.
function mountOffscreen(node) {
  const holder = document.createElement('div');
  holder.id = 'report-stage';
  holder.appendChild(node);
  document.body.appendChild(holder);
  return () => holder.remove();
}

export async function saveAsPdf(opts) {
  ensureStyles();
  const node = buildReport(opts);
  const unmount = mountOffscreen(node);
  document.body.classList.add('is-printing-report');
  const done = () => {
    document.body.classList.remove('is-printing-report');
    unmount();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // 폰트·이미지가 자리를 잡은 뒤 인쇄해야 첫 줄이 밀리지 않는다.
  try { await document.fonts?.ready; } catch {}
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.print();
  setTimeout(done, 60_000); // afterprint 를 안 주는 브라우저 대비
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
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
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
.report-table .c-grade { width: 56px; text-align: center; }
.report-table .c-detail { color: #44403c; }
.report-table tr.is-empty td { color: #a8a29e; }

.g { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border-radius: 9px; font-weight: 800; font-size: 15px; color: #fff; }
.g-S { background: #7c3aed; } .g-A { background: #059669; } .g-B { background: #0284c7; }
.g-C { background: #f59e0b; } .g-D { background: #a8a29e; }
.g-done { background: #0f766e; width: auto; padding: 0 8px; font-size: 12px; }
.g-none { background: none; color: #d6d3d1; }

.report-foot { margin-top: auto; padding-top: 18px; border-top: 1px solid #d6d3d1;
  display: flex; justify-content: space-between; font-size: 11px; color: #78716c; }
.report-seal { font-weight: 700; color: #f59e0b; }

@media print {
  @page { size: A4; margin: 0; }
  body.is-printing-report > *:not(#report-stage) { display: none !important; }
  body.is-printing-report #report-stage { position: static; left: auto; }
  body.is-printing-report .report-a4 { box-shadow: none; }
}`;
  document.head.appendChild(el);
}
