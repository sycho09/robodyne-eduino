// records.js — 기록실 (내 기록 보관함)
// 플레이 기록 열람용 UI (실시간 갱신).

import { CHAPTERS, ROOMS } from '../content/curriculum.js';
import { results } from '../app/results.js';
import { progress } from '../app/progress.js';
import { saveAsPdf, saveAsPng } from '../app/reportCard.js';

const GRADE_LABEL = { S: '완벽해요', A: '통과', B: '거의 다 왔어요', C: '조금만 더', D: '다시 도전' };

// 등급 대신 '수료'로 표시하는 방 (이론 과정)
const NO_GRADE = new Set(['basics']);

export function showRecords(host, { onPlay } = {}) {
  ensureStyles();
  host.replaceChildren();

  const root = document.createElement('section');
  root.className = 'records';
  host.appendChild(root);

  let unsubscribe = null;
  const draw = () => {
    root.innerHTML = template();
    wire(root, onPlay);
  };
  draw();
  unsubscribe = results.subscribe(draw);

  // 씬이 교체되면(#app 이 비워지면) 구독을 끊는다.
  const obs = new MutationObserver(() => {
    if (!host.contains(root)) { unsubscribe?.(); obs.disconnect(); }
  });
  obs.observe(host, { childList: true });

  return () => { unsubscribe?.(); obs.disconnect(); };
}

// ── 마크업 ───────────────────────────────────────────────────────────────────
function template() {
  const stats = collect();
  return `
    <header class="records-head">
      <div class="records-headline">
        <p class="records-eyebrow">내 기록실</p>
        <h1 class="records-title">지금까지의 무대</h1>
        <p class="records-sub">
          미니게임 ${stats.total}개 중 <strong>${stats.cleared}개</strong> 클리어
          ${stats.played ? ` · <strong>${stats.played}개</strong> 플레이` : ''}
        </p>
      </div>
      <div class="records-save">
        <button type="button" class="records-save-btn" data-menu aria-haspopup="true" aria-expanded="false">
          결과 저장 <span class="records-caret">▾</span>
        </button>
        <div class="records-menu" hidden>
          <button type="button" data-save="pdf">PDF로 저장 <small>인쇄·제출용</small></button>
          <button type="button" data-save="png">이미지로 저장 <small>공유용 PNG</small></button>
        </div>
      </div>
    </header>

    <div class="records-bar" role="img" aria-label="미니게임 클리어 ${stats.pct}퍼센트">
      <span style="width:${stats.pct}%"></span>
    </div>

    ${CHAPTERS.map(sectionHtml).join('')}


  `;
}

function sectionHtml(ch) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);
  const done = rooms.filter((r) => progress.isCleared(r.id)).length;
  return `
    <section class="records-stage">
      <h2 class="records-stage-head">
        <span class="records-stage-icon" aria-hidden="true">${ch.icon}</span>
        <span class="records-stage-name">${esc(ch.short)}</span>
        <span class="records-stage-count">${done}/${rooms.length}</span>
      </h2>
      <ul class="records-grid">${rooms.map(cardHtml).join('')}</ul>
    </section>`;
}

// 카드에는 통과/미통과 표시를 두지 않는다 — 클리어 집계는 위 진행바가 맡고,
// 카드는 '어떻게 했는지'(등급·지표·도전 횟수)만 보여준다.
function cardHtml(room) {
  const rec = results.get(room.id);
  const best = rec?.best;
  const play = `<button type="button" class="rc-play" data-play="${room.id}">${best ? '다시 도전 ▶' : '플레이하기 ▶'}</button>`;

  if (!best) {
    return `<li class="rc rc-empty">
      <span class="rc-icon" aria-hidden="true">${room.icon}</span>
      <h3 class="rc-name">${esc(room.name)}</h3>
      <p class="rc-empty-msg">아직 기록이 없어요</p>
      <p class="rc-mission">${esc(room.mission)}</p>
      ${play}
    </li>`;
  }

  const chips = best.metrics.length
    ? best.metrics.map((m) => `<li><span>${esc(m.label)}</span><b>${esc(m.value)}</b></li>`).join('')
    : `<li><span>결과</span><b>${esc(best.summary || '기록됨')}</b></li>`;

  const seal = NO_GRADE.has(room.id)
    ? `<span class="rc-seal g-done" title="수료"><b>✓</b><small>수료</small></span>`
    : `<span class="rc-seal g-${best.grade}" title="${GRADE_LABEL[best.grade] || ''}">
      <b>${best.grade}</b><small>등급</small>
    </span>`;

  return `<li class="rc">
    <span class="rc-icon" aria-hidden="true">${room.icon}</span>
    ${seal}
    <h3 class="rc-name">${esc(room.name)}</h3>
    <p class="rc-concept">${esc(room.concept)}</p>
    <ul class="rc-metrics">${chips}</ul>
    <footer class="rc-foot">
      <span>${rec.attempts}번 도전</span>
      <span>${relDate(rec.lastPlayedAt || best.at)}</span>
    </footer>
    ${play}
  </li>`;
}

// ── 동작 ─────────────────────────────────────────────────────────────────────
function wire(root, onPlay) {
  // 카드에서 바로 그 방으로 — 최고 기록을 갱신하러 가는 가장 짧은 길.
  root.querySelectorAll('[data-play]').forEach((b) => {
    b.addEventListener('click', () => onPlay?.(b.dataset.play));
  });

  const btn = root.querySelector('[data-menu]');
  const menu = root.querySelector('.records-menu');

  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const open = () => { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); };

  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
  document.addEventListener('click', close, { once: true });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });

  menu.querySelectorAll('[data-save]').forEach((b) => {
    b.addEventListener('click', async () => {
      close();
      const kind = b.dataset.save;
      const label = b.textContent;
      b.disabled = true;
      try {
        if (kind === 'pdf') await saveAsPdf();
        else await saveAsPng();
      } catch (err) {
        toast(err.message || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      } finally {
        b.disabled = false;
        b.firstChild && (b.firstChild.textContent = label);
      }
    });
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
    const s = collect();
    entryBtn.innerHTML = `<span class="records-entry-icon" aria-hidden="true">🏅</span> 내 기록실 <b>${s.cleared}/${s.total}</b>`;
    entryBtn.onclick = () => onOpen?.();
    entryBtn.hidden = false;
  },
  hide() { if (entryBtn) entryBtn.hidden = true; },
};

// ── 집계 ─────────────────────────────────────────────────────────────────────
// 집계 대상은 등급이 있는 미니게임 9개 — basics 는 점수 없는 수료 과정이라 분모에 넣지 않는다.
// 평균 등급은 내지 않는다: 게임마다 등급 컷(85%/80%)과 정확도 산출 방식(적중률·색거리·점수비)이
// 달라서 한 숫자로 평균 내면 뜻이 흐려진다.
function collect() {
  const ids = CHAPTERS.flatMap((c) => c.rooms).filter((id) => !NO_GRADE.has(id));
  const cleared = ids.filter((id) => progress.isCleared(id)).length;
  return {
    total: ids.length,
    played: ids.filter((id) => results.has(id)).length,
    cleared,
    pct: ids.length ? Math.round((cleared / ids.length) * 100) : 0,
  };
}

function relDate(ts) {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  if (d <= 0) return '오늘';
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 스타일 ───────────────────────────────────────────────────────────────────
let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  el.textContent = `
.records {
  --ink: #f5f3ff; --dim: #a5a0c0; --line: rgba(255,255,255,.09);
  --card: rgba(255,255,255,.045);
  max-width: 1120px; margin: 0 auto; padding: 84px 24px 72px; color: var(--ink);
}
.records-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.records-eyebrow { margin: 0; font-size: 12px; letter-spacing: .2em; color: #fbbf24; font-weight: 700; }
.records-title { margin: 6px 0 8px; font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -.02em; }
.records-sub { margin: 0; color: var(--dim); font-size: 15px; }
.records-sub strong { color: var(--ink); }

.records-save { position: relative; }
.records-save-btn {
  border: 0; cursor: pointer; border-radius: 999px; padding: 12px 22px; font-size: 15px; font-weight: 700;
  color: #2a1608; background: linear-gradient(100deg, #fbbf24, #fb7185);
  box-shadow: 0 8px 24px rgba(251,113,133,.28);
}
.records-save-btn:hover { filter: brightness(1.06); }
.records-caret { margin-left: 4px; font-size: 12px; }
.records-menu {
  position: absolute; right: 0; top: calc(100% + 10px); z-index: 20; min-width: 232px;
  background: #221c3a; border: 1px solid var(--line); border-radius: 16px; padding: 6px;
  box-shadow: 0 22px 48px rgba(0,0,0,.5);
}
.records-menu button {
  display: block; width: 100%; text-align: left; border: 0; background: none; cursor: pointer;
  color: var(--ink); font-size: 14px; font-weight: 600; padding: 12px 14px; border-radius: 11px;
}
.records-menu button:hover { background: rgba(255,255,255,.07); }
.records-menu button:disabled { opacity: .5; cursor: progress; }
.records-menu small { display: block; margin-top: 2px; font-weight: 500; color: var(--dim); font-size: 12px; }

.records-bar { height: 6px; border-radius: 99px; background: rgba(255,255,255,.08); margin: 26px 0 40px; overflow: hidden; }
.records-bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #fbbf24, #fb7185); transition: width .5s ease; }

.records-stage { margin-bottom: 38px; }
.records-stage-head { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 15px; font-weight: 700; }
.records-stage-icon { font-size: 19px; }
.records-stage-count { margin-left: auto; color: var(--dim); font-weight: 600; font-variant-numeric: tabular-nums; }

.records-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(258px, 1fr)); }

/* 카드 = 아케이드 티켓 조각. 왼쪽의 점선 절취선이 이 화면의 서명 요소다. */
.rc {
  position: relative; padding: 20px 20px 16px 30px; border-radius: 16px;
  background: var(--card); border: 1px solid var(--line); overflow: hidden;
}
.rc::before {
  content: ''; position: absolute; left: 14px; top: 14px; bottom: 14px; width: 0;
  border-left: 2px dashed rgba(255,255,255,.16);
}
.rc-icon { font-size: 22px; }
.rc-name { margin: 8px 0 3px; font-size: 16px; font-weight: 700; }
.rc-concept { margin: 0 0 14px; font-size: 12.5px; color: var(--dim); }
.rc-seal {
  position: absolute; right: 16px; top: 16px; width: 46px; height: 46px; border-radius: 13px;
  display: grid; place-content: center; text-align: center; line-height: 1; color: #fff;
}
.rc-seal b { font-size: 20px; font-weight: 800; }
.rc-seal small { display: block; font-size: 9px; opacity: .85; margin-top: 2px; }
.g-S { background: #7c3aed; } .g-A { background: #059669; } .g-B { background: #0284c7; }
.g-C { background: #f59e0b; color: #2a1608; } .g-D { background: #6b7280; }
.g-done { background: #0f766e; }

.rc-metrics { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.rc-metrics li { display: flex; gap: 5px; align-items: baseline; padding: 5px 10px; border-radius: 8px;
  background: rgba(0,0,0,.25); font-size: 12px; }
.rc-metrics span { color: var(--dim); }
.rc-metrics b { font-weight: 700; font-variant-numeric: tabular-nums; }
.rc-foot { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11.5px; color: var(--dim); }

.rc-play {
  display: block; width: 100%; margin-top: 12px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 9px 12px;
  background: rgba(255,255,255,.05); color: var(--ink); font-size: 13px; font-weight: 700;
  transition: background .15s, border-color .15s;
}
.rc-play:hover { background: rgba(251,191,36,.14); border-color: rgba(251,191,36,.4); }

.rc-empty { opacity: .62; }
.rc-empty:hover { opacity: 1; }
.rc-empty-msg { margin: 0 0 6px; font-size: 13px; color: var(--dim); }
.rc-mission { margin: 0 0 2px; font-size: 12px; color: var(--dim); }

.records-note { margin: 8px 0 0; font-size: 12.5px; color: var(--dim); }

.records-entry {
  position: fixed; right: 20px; top: 18px; z-index: 40; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 10px 18px;
  background: rgba(20,16,38,.72); backdrop-filter: blur(8px);
  color: #f5f3ff; font-size: 14px; font-weight: 700;
}
.records-entry:hover { background: rgba(34,28,58,.9); }
.records-entry b { color: #fbbf24; font-variant-numeric: tabular-nums; }
.records-entry[hidden] { display: none; }

.records-toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60;
  max-width: min(92vw, 460px); padding: 13px 20px; border-radius: 13px;
  background: #221c3a; color: #f5f3ff; font-size: 14px; border: 1px solid rgba(255,255,255,.12);
  box-shadow: 0 16px 40px rgba(0,0,0,.5);
}

.records :focus-visible, .records-entry:focus-visible { outline: 2px solid #fbbf24; outline-offset: 3px; }

@media (max-width: 640px) {
  .records { padding: 76px 16px 60px; }
  .records-head { flex-direction: column; align-items: stretch; }
  .records-save-btn { width: 100%; }
  .records-menu { left: 0; right: 0; }
  .records-entry { right: 12px; top: 12px; padding: 9px 14px; font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) { .records-bar span { transition: none; } }`;
  document.head.appendChild(el);
}
