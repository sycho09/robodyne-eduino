// chapterSelect.js — 아케이드 캐비닛 셀렉트(A안). 게임을 가로로 진열 → ◀▶로 포커스 줌 → ▶입장.
//   · 가운데 포커스 카드 확대 + 커버 프리뷰  · 키보드 ←/→·Enter  · 좌우 카드 클릭으로 포커스
//   · 메달(클리어)·잠금(준비중) 표시  · 상단 커리큘럼 스텝퍼  · 배경 stage-{chapter}-bg
import { sfx } from '../app/sfx.js';
import { mountCurriculumHeader } from '../app/curriculumHeader.js';
import { getChapter, chapterRooms, isRoomCleared } from '../content/curriculum.js';

const PAL = ['255,170,60', '255,110,170', '90,170,255', '150,130,255', '90,210,150', '255,140,90'];

export function showChapterSelect(root, { chapter, onRoom, onExit, onChapter, spawnAt } = {}) {
  const ch = getChapter(chapter);
  const rooms = chapterRooms(chapter);

  root.innerHTML = `
    <div class="chsel chsel--poster scene-fade">
      <div class="chsel-bg" id="cs-bg"></div>
      <div class="chsel-shade"></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="chsel-body">
        <button class="chsel-arw chsel-prev" id="cs-prev" aria-label="이전">◀</button>
        <div class="chsel-viewport"><div class="chsel-track" id="cs-track">
          ${rooms.map((r, i) => cardHtml(r, i)).join('')}
        </div></div>
        <button class="chsel-arw chsel-next" id="cs-next" aria-label="다음">▶</button>
      </div>
      <div class="chsel-foot">
        <div class="cs-medals" id="cs-medals"></div>
        <div class="chsel-meta" id="cs-meta"></div>
        <button class="chsel-play" id="cs-play">▶ 입장하기</button>
        <div class="chsel-dots" id="cs-dots">${rooms.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
      </div>
    </div>`;

  const scene = root.querySelector('.chsel');
  mountCurriculumHeader(scene, {
    active: chapter, crumb: `${ch.short} · ${ch.act}`,
    onChapter: (id) => { if (id !== chapter) { cleanup(); (onChapter || (() => onExit?.()))(id); } },
  });

  const bg = root.querySelector('#cs-bg');
  const bgImg = new Image();
  bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = `/brand/stage-${chapter}-bg.png`; } };
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  bgImg.src = `/brand/stage-${chapter}-bg.webp`;

  const track = root.querySelector('#cs-track');
  const cards = [...track.querySelectorAll('.cs-card')];
  // 커버 로딩(webp → png 폴백)
  track.querySelectorAll('.cs-screen').forEach((sc) => {
    const id = sc.dataset.cover, im = new Image();
    im.onload = () => { sc.style.backgroundImage = `url(${im.src})`; };
    im.onerror = () => { if (!im._p) { im._p = 1; im.src = `/brand/game-${id}-cover.png`; } };
    im.src = `/brand/game-${id}-cover.webp`;
  });
  const dots = [...root.querySelectorAll('#cs-dots i')];
  const metaEl = root.querySelector('#cs-meta');
  const playBtn = root.querySelector('#cs-play');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { snd.textContent = sfx.toggle() ? '🔇' : '🔊'; };

  // 메달 현황(이 챕터에서 딴 메달 수) — 흰색 이탤릭 텍스트
  const medalTot = rooms.length, medalGot = rooms.filter((r) => isRoomCleared(r.id)).length;
  const medalsEl = root.querySelector('#cs-medals');
  if (medalsEl) medalsEl.innerHTML = `🏅 <b>${medalGot}</b> <span>/ ${medalTot} CLEAR</span>`;

  let focus = Math.max(0, rooms.findIndex((r) => r.id === spawnAt));
  if (focus < 0) focus = Math.max(0, rooms.findIndex((r) => r.status === 'ready'));

  function layout() {
    const vp = track.parentElement.clientWidth;
    const card = cards[focus]; if (!card) return;
    const center = card.offsetLeft + card.offsetWidth / 2;
    track.style.transform = `translateX(${vp / 2 - center}px)`;
    cards.forEach((c, i) => c.classList.toggle('is-focus', i === focus));
    dots.forEach((d, i) => d.classList.toggle('on', i === focus));
    const r = rooms[focus], acc = PAL[focus % PAL.length];
    scene.style.setProperty('--cs-acc', acc);
    const cleared = isRoomCleared(r.id), soon = r.status !== 'ready';
    metaEl.innerHTML = `<span class="cs-ico">${r.icon}</span><b>${r.name}</b>
      <span class="cs-concept">${r.concept}</span>
      <span class="cs-status ${cleared ? 'done' : soon ? 'soon' : 'go'}">${cleared ? '🏅 클리어' : soon ? '🔒 준비중' : '플레이 가능'}</span>`;
    playBtn.textContent = soon ? '곧 만나요 🔒' : cleared ? '다시 플레이 ▶' : '▶ 입장하기';
    playBtn.classList.toggle('soon', soon);
  }
  function go(i) { const n = Math.max(0, Math.min(rooms.length - 1, i)); if (n === focus) return; focus = n; sfx.pop(); layout(); }
  function play() {
    const r = rooms[focus];
    if (r.status !== 'ready') { sfx.no(); playBtn.classList.add('shake'); setTimeout(() => playBtn.classList.remove('shake'), 400); return; }
    sfx.start(); cleanup(); onRoom?.(r.id);
  }

  root.querySelector('#cs-prev').onclick = () => go(focus - 1);
  root.querySelector('#cs-next').onclick = () => go(focus + 1);
  playBtn.onclick = play;
  cards.forEach((c, i) => c.onclick = () => (i === focus ? play() : go(i)));
  dots.forEach((d, i) => d.onclick = () => go(i));

  const onKey = (e) => {
    if (!scene.isConnected) { cleanup(); return; }   // 씬이 떠났으면(뒤로 등) 무시+정리
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(focus - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(focus + 1); }
    else if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); play(); }
  };
  window.addEventListener('keydown', onKey);
  const onResize = () => { if (!scene.isConnected) { cleanup(); return; } layout(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(() => requestAnimationFrame(layout));
  setTimeout(layout, 120);   // 폰트/이미지 로드 후 보정

  function cleanup() { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); }
}

function cardHtml(r, i) {
  const cleared = isRoomCleared(r.id), soon = r.status !== 'ready';
  const stTxt = cleared ? '🏅 클리어 · 다시 플레이' : soon ? '🔒 준비중' : '▶ 플레이 가능';
  const stCls = cleared ? 'done' : soon ? 'soon' : 'go';
  // 콘솔 게임 포스터: 커버 위에 게임 정보(태그·제목·한줄설명·상태) 오버레이.
  //   클리어한 게임은 흰색 이탤릭 'CLEAR' 스탬프(비스듬) 표시.
  return `<button class="cs-card${soon ? ' is-soon' : ''}${cleared ? ' is-clear' : ''}" data-i="${i}" style="--i:${i}">
    <div class="cs-cab">
      <div class="cs-screen" data-cover="${r.id}"></div>
      ${cleared ? '<div class="cs-clear">CLEAR</div>' : ''}
      ${soon ? '<span class="cs-badge">🔒</span><div class="cs-lock"></div>' : ''}
      <div class="cs-info">
        <div class="cs-tag">${r.icon} ${r.concept}</div>
        <div class="cs-title">${r.name}</div>
        <div class="cs-sub">${r.mission}</div>
        <div class="cs-status ${stCls}">${stTxt}</div>
      </div>
    </div>
  </button>`;
}
