/**
 * main.js — 라우터 부트스트랩.
 *
 * 화면(홈 / 킷 상세 / 챌린지)은 각각 페이지 모듈이 소유한다.
 * 여기서는 경로에 맞는 모듈을 붙이고, 떠날 때 dispose() 를 부르는 일만 한다.
 */

import { createRouter } from './ui/router.js';
import { mountHome } from './ui/pages/home.js';
import { mountKit } from './ui/pages/kit.js';
import { mountChallenge } from './ui/pages/challenge.js';
import { mountChallenge as mountScout } from './ui/pages/scout.js';
import { loadCatalog, MODE } from './challenges/loader.js';

const root = document.getElementById('app');
const BASE_TITLE = 'Challenge Digital Twin';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 길을 잘못 든 화면에서 [허브로] 만 주면 학생은 처음부터 다시 찾아야 한다.
 * 있는 챌린지 목록을 함께 띄워 그 자리에서 고르게 한다.
 * 목록을 못 불러오면 목록만 빠지고 안내는 그대로 남는다.
 */
async function fallbackList() {
  try {
    const catalog = await loadCatalog();
    // 목록에서 내린 챌린지는 여기에도 나오지 않는다(52차).
    // "지금 열 수 있는 챌린지" 라고 적어 두고 못 여는 것을 보이면 거짓말이 된다.
    const rows = (catalog.challenges || []).filter((c) => !c.hidden).map((c) => `
      <a class="miss__row" href="/challenge/${escapeHtml(c.kit_id)}/${escapeHtml(c.challenge_id)}"
         data-link="/challenge/${escapeHtml(c.kit_id)}/${escapeHtml(c.challenge_id)}">
        <b>${escapeHtml(c.title)}</b><span>${escapeHtml(c.track_label || c.summary || '')}</span>
      </a>`).join('');
    return rows ? `<div class="miss__list">${rows}</div>` : '';
  } catch (_) {
    return '';
  }
}

async function showMiss(lead) {
  root.innerHTML = `<div class="hub"><div class="empty miss">
    <p class="miss__lead">${lead}</p>
    <a class="btn" href="/" data-link="/">허브로</a>
  </div></div>`;
  const list = await fallbackList();
  if (!list) return;
  const box = root.querySelector('.miss');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', `<p class="miss__cap">지금 열 수 있는 챌린지</p>${list}`);
}

const router = createRouter({
  async onRoute(route) {
    root.innerHTML = '';
    document.title = BASE_TITLE;
    try {
      if (route.name === 'home') return await mountHome(root);
      if (route.name === 'kit') return await mountKit(root, route);
      if (route.name === 'challenge') {
        // 목록에서 내린 챌린지는 주소로 들어와도 열지 않는다. 파일은 그대로 남아 있고
        // 노출 경로만 닫는다(하드삭제 금지). 폴백 화면으로 보낸다.
        const catalog = await loadCatalog();
        const entry = (catalog.challenges || [])
          .find((c) => c.kit_id === route.kitId && c.challenge_id === route.challengeId);
        if (entry && entry.hidden) {
          await showMiss('지금은 열 수 없는 챌린지입니다.');
          return () => {};
        }
        // 57차 — 어느 화면을 여는지는 카탈로그의 mode 가 소유한다. 탐사(3)는 트랙도 랩도
        // 채점도 없어 달리기 화면과 공통점이 거의 없다. 그래서 화면을 통째로 가른다.
        if (entry && entry.mode === MODE.SCOUT) return await mountScout(root, route);
        return await mountChallenge(root, route);
      }
      await showMiss(`없는 주소입니다: ${escapeHtml(route.path)}`);
      return () => {};
    } catch (e) {
      await showMiss(`화면을 여는 데 실패했습니다.<br>${escapeHtml(e.message)}`);
      console.error(e);
      return () => {};
    }
  },
});

router.render();
