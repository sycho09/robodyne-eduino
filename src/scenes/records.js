// records.js — 기록실 (내 기록 보관함, 실시간 갱신 UI)

import { CHAPTERS, ROOMS } from '../content/curriculum.js';
import { results } from '../app/results.js';
import { progress } from '../app/progress.js';
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
  let currentTab = 'gallery';

  const draw = () => {
    root.innerHTML = template(currentTab);
    wire(root, onPlay, (newTab) => { currentTab = newTab; draw(); });
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
function template(tab) {
  return `
    <div class="chsel-shade" style="position: fixed; pointer-events: none; z-index: 0;"></div>
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

    <div class="records-tabs" role="tablist">
      <button type="button" role="tab" class="r-tab ${tab === 'gallery' ? 'is-active' : ''}" data-tab="gallery">결과 보기</button>
      <button type="button" role="tab" class="r-tab ${tab === 'play' ? 'is-active' : ''}" data-tab="play">바로 플레이</button>
    </div>

    <div class="records-content">
      ${CHAPTERS.map(ch => sectionHtml(ch, tab)).join('')}
    </div>
  `;
}



function sectionHtml(ch, tab) {
  const rooms = ch.rooms.map((id) => ROOMS[id]).filter(Boolean);
  return `
    <section class="records-stage">
      <h2 class="records-stage-head">
        <span class="records-stage-icon" aria-hidden="true">${ch.icon}</span>
        <span class="records-stage-name">${esc(ch.short || ch.name)}</span>
      </h2>
      <ul class="records-grid">${rooms.map(r => cardHtml(r, tab, ch.id)).join('')}</ul>
    </section>`;
}

function cardHtml(room, tab, chId) {
  const rec = results.get(room.id);
  const best = rec?.best;

  const gradeColors = { S: '#a855f7', A: '#fb7185', B: '#60a5fa', C: '#fb923c', D: '#94a3b8' };
  const gColor = best ? gradeColors[best.grade] || '#fff' : '#475569';

  const isPlay = tab === 'play';
  const playBtn = isPlay ? `<button type="button" class="rc-play" data-play="${room.id}">${best ? '다시 도전 ▶' : '플레이하기 ▶'}</button>` : '';
  const cardClickProps = isPlay ? `data-play="${room.id}" role="button" tabindex="0"` : '';

  const themeMap = {
    ch1: { border: 'rgba(234, 179, 8, 0.5)', glow: 'rgba(234, 179, 8, 0.25)', hoverGlow: 'rgba(234, 179, 8, 0.5)', btn: '#eab308' },
    ch2: { border: 'rgba(236, 72, 153, 0.5)', glow: 'rgba(236, 72, 153, 0.25)', hoverGlow: 'rgba(236, 72, 153, 0.5)', btn: '#ec4899' },
    ch3: { border: 'rgba(59, 130, 246, 0.5)', glow: 'rgba(59, 130, 246, 0.25)', hoverGlow: 'rgba(59, 130, 246, 0.5)', btn: '#3b82f6' },
    ch4: { border: 'rgba(168, 85, 247, 0.5)', glow: 'rgba(168, 85, 247, 0.25)', hoverGlow: 'rgba(168, 85, 247, 0.5)', btn: '#a855f7' }
  };
  const theme = themeMap[chId] || themeMap.ch1;
  const styleVars = `--rc-bdr: ${theme.border}; --rc-glow: ${theme.glow}; --rc-hg: ${theme.hoverGlow}; --rc-btn: ${theme.btn};`;

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
        <span class="rc-seal" style="color: #475569;">-</span>
      </div>
      ${playBtn}
    </li>`;
  }

  const displayMetrics = (best.metrics || []).filter(m => m.label !== '최고 콤보');
  const scoreText = (displayMetrics.length)
    ? displayMetrics.map((m) => `<div class="rc-metrics-item">${esc(m.label)}: <b>${esc(m.value)}</b></div>`).join('')
    : `<div class="rc-metrics-item">결과: <b>${esc(best.summary || '기록됨')}</b></div>`;
  
  const isNoGrade = NO_GRADE.has(room.id);
  const gradeText = isNoGrade ? '수료' : best.grade;
  const finalColor = isNoGrade ? '#34d399' : gColor;
  const sealStyle = `color: ${finalColor}; ${isNoGrade ? 'font-size: 24px;' : ''}`;

  return `<li class="rc" ${cardClickProps} style="${styleVars}">
    <div class="rc-content">
      <span class="rc-icon" aria-hidden="true">${room.icon}</span>
      <div class="rc-info">
        <h3 class="rc-name">${esc(room.name)}</h3>
        <div class="rc-body">
          ${scoreText}
        </div>
      </div>
      <span class="rc-seal" style="${sealStyle}">${gradeText}</span>
    </div>
    ${playBtn}
  </li>`;
}

// ── 동작 ─────────────────────────────────────────────────────────────────────
function wire(root, onPlay, setTab) {
  // 탭 전환
  root.querySelectorAll('.r-tab').forEach((t) => {
    t.addEventListener('click', () => setTab(t.dataset.tab));
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
    const s = collect();
    entryBtn.innerHTML = `<span class="records-entry-icon" aria-hidden="true">🏅</span> 내 기록실 <b>${s.cleared}/${s.total}</b>`;
    entryBtn.onclick = () => onOpen?.();
    entryBtn.hidden = false;
  },
  hide() { if (entryBtn) entryBtn.hidden = true; },
};

// ── 집계 (내 기록실 버튼 용도) ──
function collect() {
  const ids = CHAPTERS.flatMap((c) => c.rooms).filter((id) => !NO_GRADE.has(id));
  const cleared = ids.filter((id) => progress.isCleared(id)).length;
  return { total: ids.length, cleared, pct: ids.length ? Math.round((cleared / ids.length) * 100) : 0 };
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
  --ink: #f5f3ff; --dim: #a5a0c0; --line: rgba(255,255,255,.2);
  position: absolute; inset: 0; overflow-y: auto; z-index: 50;
  background: url('/brand/hub-bg.webp') center/cover no-repeat, #2b213e;
  padding: 40px 24px 120px; color: var(--ink);
}
.records > * { position: relative; z-index: 1; }

.records-head { text-align: center; margin-bottom: 0; position: relative; }
.records-headline { display: flex; flex-direction: column; align-items: center; }
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



.records-tabs { 
  position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px;
  background: rgba(18, 14, 30, 0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 5px;
  z-index: 100; box-shadow: 0 16px 40px rgba(0,0,0,0.5);
}
.r-tab {
  background: transparent; border: none;
  color: rgba(255,255,255,0.5); padding: 10px 32px; border-radius: 999px;
  font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s;
}
.r-tab:hover { color: #fff; }
.r-tab.is-active {
  background: rgba(255,255,255,0.15); color: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.2);
}

.records-content { max-width: 1024px; margin: 0 auto; }
.records-stage { margin-bottom: 40px; }
.records-stage-head { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font-size: 22px; font-weight: 800; color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.6); }
.records-stage-icon { font-size: 26px; }

.records-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

.rc {
  position: relative; padding: 20px; border-radius: 16px;
  background: 
    radial-gradient(ellipse 35% 60% at 50% 0%, var(--rc-glow) 0%, transparent 100%),
    linear-gradient(135deg, rgba(26, 22, 42, 0.8), rgba(16, 14, 26, 0.7)); 
  border: 1px solid var(--rc-bdr, rgba(255,255,255,0.15));
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 6px var(--rc-glow), inset 0 0 6px var(--rc-glow);
  display: flex; flex-direction: column; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}
.rc:hover, .rc:focus-visible { 
  transform: translateY(-4px); 
  background: 
    radial-gradient(ellipse 35% 60% at 50% 0%, var(--rc-glow) 0%, transparent 100%),
    linear-gradient(135deg, rgba(36, 30, 56, 0.85), rgba(24, 20, 38, 0.75));
  box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 6px var(--rc-glow), inset 0 0 6px var(--rc-glow); 
  outline: none; 
}

.rc-content { display: flex; align-items: center; width: 100%; }
.rc-icon { font-size: 40px; margin-right: 16px; }
.rc-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.rc-name { font-size: 16px; font-weight: 700; margin: 0; color: #fff; white-space: nowrap; }
.rc-seal { 
  display: flex; align-items: center; justify-content: center; align-self: stretch;
  font-size: 44px; font-weight: 900; line-height: 1; text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border-left: 1px solid rgba(255,255,255,0.15); padding-left: 16px; margin-left: 12px; width: 60px; text-align: center;
}

.rc-body { display: flex; flex-direction: column; gap: 2px; }
.rc-metrics-item { font-size: 13px; color: rgba(255,255,255,0.6); display: flex; align-items: center; }
.rc-metrics-item b { color: rgba(255,255,255,0.9); margin-left: 4px; font-weight: 600; }

.rc-play {
  display: block; width: 100%; margin-top: 14px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 10px 12px;
  background: rgba(255,255,255,.05); color: #fff; font-size: 13px; font-weight: 700;
  transition: background .15s, border-color .15s;
}
.rc-play:hover { background: var(--rc-glow); border-color: var(--rc-bdr); }

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
  .records { padding: 84px 16px 110px; }
  .records-head { text-align: left; margin-top: 20px; }
  .records-headline { align-items: flex-start; }
  .records-save { position: absolute; top: 16px; right: 16px; }
  .records-save-btn { height: 38px; padding: 0 16px 0 12px; font-size: 13px; }
  .records-tabs { bottom: 24px; }
  .r-tab { padding: 10px 24px; font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) { .records-bar span, .rc { transition: none; } }`;
  document.head.appendChild(el);
}
