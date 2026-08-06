// curriculumHeader.js — 페이지 상단 커리큘럼 스텝퍼 + 전체 진척 바.
// HUB·챕터 씬 상단에 마운트. mountCurriculumHeader(root,{active,crumb,onChapter}) → {el, refresh()}
import {
  CHAPTERS, chapterClearedCount, chapterTotal, chapterDone, chapterUnlocked,
  overallCleared, overallTotal, overallPercent,
} from '../content/curriculum.js';

export function mountCurriculumHeader(root, { active = null, crumb = '연구소 복도', onChapter } = {}) {
  const el = document.createElement('div');
  el.className = 'curr-header';
  root.prepend(el);

  function stepHtml(c) {
    const done = chapterDone(c.id), unlocked = chapterUnlocked(c.id);
    const cur = active === c.id;
    const cls = ['ch-step', done ? 'done' : '', cur ? 'active' : '', !unlocked ? 'locked' : ''].filter(Boolean).join(' ');
    const badge = done ? '✓' : !unlocked ? '🔒' : String(c.no);
    return `
      <button class="${cls}" data-ch="${c.id}" ${!unlocked ? 'disabled' : ''}>
        <span class="ch-badge">${badge}</span>
        <span class="ch-meta"><b>${c.label}</b><small>${chapterClearedCount(c.id)} / ${chapterTotal(c.id)}</small></span>
      </button>`;
  }

  function render() {
    const pct = overallPercent();
    el.innerHTML = `
      <div class="ch-brand">
        <div class="ch-logo"><img src="/brand/logo.webp" alt="Eduino AI" /></div>
        <div class="ch-crumb">스타터 키트 · ${crumb}</div>
      </div>
      <div class="ch-steps">${CHAPTERS.map((c, i) => (i ? '<span class="ch-link"></span>' : '') + stepHtml(c)).join('')}</div>
      <div class="ch-overall">
        <div class="ch-ov-top">전체 진척 <b>${overallCleared()} / ${overallTotal()}</b></div>
        <div class="ch-bar"><div class="ch-bar-fill" style="width:${pct}%"></div></div>
        <div class="ch-ov-pct">${pct}%</div>
      </div>`;
    el.querySelectorAll('.ch-step').forEach((b) => {
      if (b.disabled) return;
      b.onclick = () => onChapter?.(b.dataset.ch);
    });
  }
  render();
  return { el, refresh: render, destroy: () => el.remove() };
}
