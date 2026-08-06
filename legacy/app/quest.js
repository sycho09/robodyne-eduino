// quest.js — 퀘스트 가이드 패널 (게임의 퀘스트 로그/목표 추적기)
// 현재 퀘스트 제목 + 목표 체크리스트 + 진척을 한곳에 보여준다.
// 게임 HUD 우측 상단에 고정, 헤더 클릭으로 접기/펼치기.

/**
 * @param {HTMLElement} container
 * @param {{ title:string, subtitle?:string, objectives:{text:string, done?:boolean}[] }} data
 * @returns {{ setObjective:(i:number,done:boolean)=>void, setTitle:(t:string)=>void, setSubtitle:(s:string)=>void, el:HTMLElement }}
 */
export function mountQuest(container, data) {
  const state = {
    title: data.title,
    subtitle: data.subtitle || '',
    objectives: data.objectives.map((o) => ({ ...o })),
    open: true,
  };

  const el = document.createElement('div');
  el.className = 'quest-panel';
  container.appendChild(el);

  function render() {
    const doneCount = state.objectives.filter((o) => o.done).length;
    el.classList.toggle('collapsed', !state.open);
    el.innerHTML = `
      <button class="quest-head" data-toggle>
        <span class="quest-scroll">📜</span>
        <span class="quest-title">QUEST · ${state.title}</span>
        <span class="quest-toggle">${state.open ? '–' : '+'}</span>
      </button>
      <div class="quest-body">
        ${state.subtitle ? `<div class="quest-sub">${state.subtitle}</div>` : ''}
        <ul class="quest-list">
          ${state.objectives.map((o) => `
            <li class="${o.done ? 'done' : ''}"><span class="q-check">${o.done ? '✓' : '○'}</span>${o.text}</li>
          `).join('')}
        </ul>
        <div class="quest-foot">목표 ${doneCount} / ${state.objectives.length} 완료</div>
      </div>
    `;
    el.querySelector('[data-toggle]').addEventListener('click', () => { state.open = !state.open; render(); });
  }

  render();

  return {
    el,
    setObjective(i, done) { if (state.objectives[i]) { state.objectives[i].done = done; render(); } },
    setTitle(t) { state.title = t; render(); },
    setSubtitle(s) { state.subtitle = s; render(); },
  };
}
