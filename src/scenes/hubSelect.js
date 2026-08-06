// hubSelect.js — 미니게임 광장(HUB)도 아케이드 카루셀로. 4개 스테이지(챕터)를 가로 진열·포커스 줌·▶입장.
//   기초의 전당(chapterSelect)과 동일한 .chsel UI 재사용. 챕터 카드는 컬러 스테이지 패널(아이콘·진척·잠금).
import { sfx } from '../app/sfx.js';
import { mountCurriculumHeader } from '../app/curriculumHeader.js';
import { CHAPTERS, chapterUnlocked, chapterDone, chapterClearedCount, chapterTotal } from '../content/curriculum.js';

const PAL = ['255,170,60', '255,110,170', '90,170,255', '150,130,255', '90,210,150'];

export function showHubSelect(root, { onEnter, spawnAt } = {}) {
  root.innerHTML = `
    <div class="chsel scene-fade">
      <div class="chsel-bg" id="cs-bg"></div>
      <div class="chsel-shade"></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="chsel-body">
        <button class="chsel-arw chsel-prev" id="cs-prev" aria-label="이전">◀</button>
        <div class="chsel-viewport"><div class="chsel-track" id="cs-track">
          ${CHAPTERS.map((c, i) => cardHtml(c, i)).join('')}
        </div></div>
        <button class="chsel-arw chsel-next" id="cs-next" aria-label="다음">▶</button>
      </div>
      <div class="chsel-foot">
        <div class="chsel-meta" id="cs-meta"></div>
        <button class="chsel-play" id="cs-play">▶ 입장하기</button>
        <div class="chsel-dots" id="cs-dots">${CHAPTERS.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      </div>
    </div>`;

  const scene = root.querySelector('.chsel');
  mountCurriculumHeader(scene, { active: null, crumb: '미니게임 광장' });

  const bg = root.querySelector('#cs-bg');
  const bgImg = new Image();
  bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/hub-bg.png'; } };
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  bgImg.src = '/brand/hub-bg.webp';

  const track = root.querySelector('#cs-track');
  const cards = [...track.querySelectorAll('.cs-card')];
  const dots = [...root.querySelectorAll('#cs-dots i')];
  const metaEl = root.querySelector('#cs-meta');
  const playBtn = root.querySelector('#cs-play');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { snd.textContent = sfx.toggle() ? '🔇' : '🔊'; };

  let focus = CHAPTERS.findIndex((c) => c.id === spawnAt);
  if (focus < 0) focus = 0;   // 기본 초기 포커스 = STAGE 1(베이직)

  function layout() {
    const vp = track.parentElement.clientWidth;
    const card = cards[focus]; if (!card) return;
    track.style.transform = `translateX(${vp / 2 - (card.offsetLeft + card.offsetWidth / 2)}px)`;
    cards.forEach((c, i) => c.classList.toggle('is-focus', i === focus));
    dots.forEach((d, i) => d.classList.toggle('on', i === focus));
    const c = CHAPTERS[focus], acc = PAL[focus % PAL.length];
    scene.style.setProperty('--cs-acc', acc);
    const locked = !chapterUnlocked(c.id), done = chapterDone(c.id), cc = chapterClearedCount(c.id), tt = chapterTotal(c.id);
    // 카드에 이미 스테이지명이 크게 있으므로 메타엔 부제(act)+진척만 — 중복 제거로 자연스럽게
    metaEl.innerHTML = `<span class="cs-ico">${c.icon}</span>
      <span class="cs-concept">${c.act}</span>
      <span class="cs-status ${done ? 'done' : locked ? 'soon' : 'go'}">${done ? '🏆 완료' : locked ? '🔒 잠김' : `${cc}/${tt} 클리어`}</span>`;
    playBtn.textContent = locked ? '이전 스테이지를 먼저 🔒' : '▶ 입장하기';
    playBtn.classList.toggle('soon', locked);
  }
  function go(i) { const n = Math.max(0, Math.min(CHAPTERS.length - 1, i)); if (n === focus) return; focus = n; sfx.pop(); layout(); }
  function enter() {
    const c = CHAPTERS[focus];
    if (!chapterUnlocked(c.id)) { sfx.no(); playBtn.classList.add('shake'); setTimeout(() => playBtn.classList.remove('shake'), 400); return; }
    sfx.start(); cleanup(); onEnter?.(c.id);
  }

  root.querySelector('#cs-prev').onclick = () => go(focus - 1);
  root.querySelector('#cs-next').onclick = () => go(focus + 1);
  playBtn.onclick = enter;
  cards.forEach((c, i) => c.onclick = () => (i === focus ? enter() : go(i)));
  dots.forEach((d, i) => d.onclick = () => go(i));

  const onKey = (e) => {
    if (!scene.isConnected) { cleanup(); return; }   // 씬이 떠났으면(뒤로 등) 무시+정리
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(focus - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(focus + 1); }
    else if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); enter(); }
  };
  window.addEventListener('keydown', onKey);
  const onResize = () => { if (!scene.isConnected) { cleanup(); return; } layout(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => requestAnimationFrame(layout));
  setTimeout(layout, 120);

  function cleanup() { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); }
}

function cardHtml(c, i) {
  const locked = !chapterUnlocked(c.id), done = chapterDone(c.id);
  const cc = chapterClearedCount(c.id), tt = chapterTotal(c.id), pct = tt ? Math.round(cc / tt * 100) : 0;
  return `<button class="cs-card cs-stage${locked ? ' is-locked' : ''}" data-i="${i}" style="--cs-acc:${PAL[i % PAL.length]}">
    <div class="cs-cab cs-stage-cab">
      <div class="cs-stage-inner">
        <div class="cs-stage-no">STAGE ${c.no}</div>
        <div class="cs-stage-ico">${c.icon}</div>
        <div class="cs-stage-name">${c.label}</div>
        <div class="cs-stage-prog"><div class="cs-stage-prog-fill" style="width:${pct}%"></div></div>
        <div class="cs-stage-count">${cc} / ${tt} 클리어</div>
      </div>
      ${done ? '<span class="cs-badge">🏆</span>' : ''}
      ${locked ? '<div class="cs-lock"></div><span class="cs-locktag">🔒</span>' : ''}
    </div>
    <div class="cs-cap"><span class="cs-cap-ico">${c.icon}</span>${c.label}</div>
  </button>`;
}
