/**
 * ui/pages/home.js — 허브 홈. 킷 카드 그리드.
 *
 * 화면은 카탈로그 두 개(kits/index.json, challenges/index.json)만 읽는다.
 * 킷이나 챌린지가 늘어도 이 파일은 그대로다.
 *
 * 킷이 하나뿐이면 "킷 고르기" 는 카드 하나를 누르는 빈 단계다(50차).
 * 그때는 첫 화면에서 바로 그 킷의 챌린지 목록을 보인다. 킷이 둘 이상이 되면
 * 카드 그리드가 저절로 돌아온다 — 개수를 코드에 박지 않고 카탈로그가 정한다.
 */

import { loadCatalog, loadKitCatalog } from '../../challenges/loader.js';
import { mountKit } from './kit.js';
import { loadAssets } from '../assets.js';
import { readSummary } from '../storage.js';
import { ENGINE_VERSION, SCORING_VERSION } from '../../engine/version.js';
import { formatTicks } from '../../engine/clock.js';

export async function mountHome(root) {
  const [kitCatalog, challengeCatalog] = await Promise.all([loadKitCatalog(), loadCatalog()]);
  const kits = kitCatalog.kits || [];
  if (kits.length === 1) return mountKit(root, { kitId: kits[0].kit_id, soleKit: true });
  const thumbSlots = kits.map((k) => (k.assets && k.assets.thumbnail ? k.assets.thumbnail.replace('slot:', '') : null)).filter(Boolean);
  const assets = await loadAssets({ only: thumbSlots });

  root.innerHTML = `
    <div class="page">
      <header class="shell__header">
        <!-- 54차 보강3 — 1행 브랜드는 챌린지 화면과 같은 글자다. 두 곳이 다르면 같은
             서비스로 안 읽힌다. 허브에는 [게시판 돌아가기] 가 필요 없어 오른쪽은 비운다. -->
        <div class="brand">EduinoAI 챌린지 게시판</div>
        <span class="chip">${kits.length}개 킷</span>
        <span class="chip">${challengeCatalog.challenges.filter((c) => !c.hidden).length}개 챌린지</span>
        <div class="header__spacer"></div>
      </header>
      <div class="hub">
        <header class="hub__head">
          <div class="hub__title">킷 고르기</div>
          <p class="hub__lede">킷을 고르면 그 킷으로 도전할 수 있는 챌린지가 나옵니다.</p>
        </header>
        <div class="cards" data-el="cards"></div>
      </div>
    </div>`;

  const cards = root.querySelector('[data-el="cards"]');
  if (kits.length === 0) {
    cards.innerHTML = '<div class="empty">등록된 킷이 없습니다. kits/index.json 에 킷을 한 줄 추가하면 여기 나타납니다.</div>';
    return () => {};
  }

  for (const kit of kits) {
    const mine = challengeCatalog.challenges.filter((c) => c.kit_id === kit.kit_id && !c.hidden);
    const summaries = mine.map((c) => readSummary(kit.kit_id, c.challenge_id,
      { engineVersion: ENGINE_VERSION, challengeVersion: c.challenge_version, scoringVersion: SCORING_VERSION }));
    const cleared = summaries.filter((s) => s.completed).length;
    const bests = summaries.map((s) => s.bestTicks).filter((t) => typeof t === 'number');
    const best = bests.length ? Math.min(...bests) : null;
    const thumb = assets.resolve(kit.assets && kit.assets.thumbnail);

    const card = document.createElement('a');
    card.className = 'card';
    card.href = `/kit/${kit.kit_id}`;
    card.setAttribute('data-link', `/kit/${kit.kit_id}`);
    card.innerHTML = `
      <div class="card__thumb">${thumb ? '' : '<span class="card__thumb-ph"></span>'}</div>
      <div class="card__body">
        <div class="card__title">${esc(kit.name)}</div>
        <div class="card__summary">${esc(kit.summary || '')}</div>
        <div class="card__stats">
          <span><b>${mine.length}</b> 챌린지</span>
          <span><b>${cleared}</b> 완주</span>
          <span>베스트 <b>${best === null ? '—' : formatTicks(best) + '초'}</b></span>
        </div>
      </div>`;
    if (thumb) {
      const img = new Image();
      img.src = thumb.src;
      img.alt = '';
      card.querySelector('.card__thumb').append(img);
    }
    cards.append(card);
  }

  return () => {};
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
