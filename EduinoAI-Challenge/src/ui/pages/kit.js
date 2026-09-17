/**
 * ui/pages/kit.js — 킷 상세. 그 킷의 챌린지 목록.
 *
 * 처음 들어온 사람이 "어디부터 하면 되는지" 를 화면에서 알 수 있어야 한다(49차).
 * 그래서 계열로 묶고, 계열 안에서 난이도 순으로 세우고, 아직 목표를 못 넘긴 것 가운데
 * 가장 앞에 "여기부터" 를 붙인다.
 *
 * 잠그지는 않는다. 순서를 권할 뿐 아무 챌린지나 열 수 있어야 자유롭게 실습한다.
 *
 * 카드에 적는 값은 전부 카탈로그(index.json)와 매니페스트가 소유한다 —
 * 이름·요약·난이도·배우는 것은 카탈로그가, 목표 시간은 매니페스트(scoring.goal_ticks)가.
 */

import { loadCatalog, loadKitCatalog } from '../../challenges/loader.js';
import { readSummary } from '../storage.js';
import { ENGINE_VERSION, SCORING_VERSION } from '../../engine/version.js';
import { formatTicks } from '../../engine/clock.js';
import { formatGoal } from '../words.js';

const DIFFICULTY_LABEL = { basic: '초급', intermediate: '중급', advanced: '상급', expert: '심화' };
const DIFFICULTY_ORDER = { basic: 0, intermediate: 1, advanced: 2, expert: 3 };
/** 갈래 이름은 카탈로그의 series 가 소유한다. 내부 mode 값(1·2)은 그대로 둔다. */
const MODE_FALLBACK = { 1: 'RC카 이동제어', 2: 'RC카 색상제어' };
const seriesOf = (c) => c.series || MODE_FALLBACK[c.mode] || `모드 ${c.mode}`;

/** 목표 시간은 매니페스트가 소유한다. 카탈로그에 옮겨 적으면 두 값이 어긋난다. */
async function goalsOf(entries) {
  const base = new URL('challenges/index.json', new URL('../../', import.meta.url)).href;
  const pairs = await Promise.all(entries.map(async (c) => {
    try {
      const res = await fetch(new URL(c.path, base));
      if (!res.ok) return [c.challenge_id, null];
      const j = await res.json();
      return [c.challenge_id, (j.scoring && j.scoring.goal_ticks) || null];
    } catch { return [c.challenge_id, null]; }
  }));
  return new Map(pairs);
}

export async function mountKit(root, { kitId, soleKit = false }) {
  const [kitCatalog, challengeCatalog] = await Promise.all([loadKitCatalog(), loadCatalog()]);
  const kit = (kitCatalog.kits || []).find((k) => k.kit_id === kitId);
  if (!kit) {
    root.innerHTML = `<div class="hub"><div class="empty">그런 킷이 없습니다: ${esc(kitId)}
      <a class="btn" href="/" data-link="/">허브로</a></div></div>`;
    return () => {};
  }

  // hidden 은 목록에서만 내린다. 파일과 기록은 그대로 남아 폴백·구버전 조회에 쓰인다.
  const all = challengeCatalog.challenges.filter((c) => c.kit_id === kitId && !c.hidden);
  // 계열 순서는 카탈로그에 처음 나온 순서를 따른다(코드에 이름을 박지 않는다).
  const seriesList = [];
  for (const c of all) if (!seriesList.includes(seriesOf(c))) seriesList.push(seriesOf(c));

  const goals = await goalsOf(all);
  const summaryOf = (c) => readSummary(kitId, c.challenge_id,
    { engineVersion: ENGINE_VERSION, challengeVersion: c.challenge_version, scoringVersion: SCORING_VERSION });

  // 계열 → 난이도 순으로 한 줄로 세운 뒤, 그 줄에서 "여기부터" 를 고른다.
  const ordered = all.slice().sort((a, b) => (seriesList.indexOf(seriesOf(a)) - seriesList.indexOf(seriesOf(b)))
    || (DIFFICULTY_ORDER[a.difficulty] ?? 9) - (DIFFICULTY_ORDER[b.difficulty] ?? 9));
  // 아직 목표를 못 넘긴 것 가운데 가장 앞. 기록이 하나도 없으면 맨 앞 챌린지가 된다.
  const next = ordered.find((c) => {
    const s = summaryOf(c);
    const goal = goals.get(c.challenge_id);
    return s.bestTicks === null || (goal !== null && s.bestTicks > goal);
  }) || null;

  root.innerHTML = `
    <div class="page">
      <header class="shell__header">
        <!-- 54차 보강3 — 1행 브랜드는 챌린지 화면과 같은 글자다. 두 곳이 다르면 같은
             서비스로 안 읽힌다. 허브에는 [게시판 돌아가기] 가 필요 없어 오른쪽은 비운다. -->
        <div class="brand">EduinoAI 챌린지 게시판</div>
        <div class="header__spacer"></div>
      </header>
      <div class="hub">
      ${soleKit ? '' : `<nav class="crumbs"><a href="/" data-link="/">허브</a><span>/</span><b>${esc(kit.name)}</b></nav>`}
      <header class="hub__head">
        <div class="hub__title">${esc(kit.name)}</div>
        <p class="hub__lede">${esc(kit.summary || '')}</p>
      </header>
      ${seriesList.map((name) => seriesBlock(name)).join('')}
      </div>
    </div>`;

  function seriesBlock(name) {
    const list = ordered.filter((c) => seriesOf(c) === name);
    return `
      <section class="series">
        <h2 class="series__title">${esc(name)}<span class="series__count">${list.length}개</span></h2>
        <div class="rows">${list.map(rowOf).join('')}</div>
      </section>`;
  }

  function rowOf(c) {
    const s = summaryOf(c);
    const goal = goals.get(c.challenge_id);
    const path = `/challenge/${kitId}/${c.challenge_id}`;
    const isNext = next && next.challenge_id === c.challenge_id;
    const cleared = goal !== null && s.bestTicks !== null && s.bestTicks <= goal;
    return `
      <a class="row${isNext ? ' row--next' : ''}" href="${path}" data-link="${path}">
        <div class="row__main">
          <div class="row__title">
            ${isNext ? '<span class="badge badge--next">여기부터</span>' : ''}
            <span class="badge">${esc(DIFFICULTY_LABEL[c.difficulty] || c.difficulty || '초급')}</span>
            ${esc(c.title)}
            ${cleared ? '<span class="badge badge--ok">목표 달성</span>' : (s.completed ? '<span class="badge badge--ok">완주</span>' : '')}
          </div>
          <div class="row__summary">${esc(c.summary || '')}</div>
          ${c.learn ? `<div class="row__learn"><span>배우는 것</span>${esc(c.learn)}</div>` : ''}
        </div>
        <div class="row__stats">
          <div class="row__goal">목표 <b>${goal === null ? '없음' : `${formatGoal(formatTicks(goal))}초`}</b></div>
          <div class="row__best${s.bestTicks === null ? ' row__best--none' : ''}">${s.bestTicks === null
            ? '아직 안 해봤어요'
            : `${formatTicks(s.bestTicks)}<span>초</span>`}</div>
        </div>
      </a>`;
  }

  return () => {};
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
