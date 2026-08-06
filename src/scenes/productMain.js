// productMain.js — 상품 메인(타이틀 스크린) 'Eduino AI : 미니게임천국'.
// 완성도 패스: 요소 stagger 등장 · CTA 인터랙션 · EDDIE 말풍선/클릭 반응 · 미세 패럴랙스 · 사운드 토글.
import { mountEddieRig } from '../app/eddieRig.js';
import { sfx } from '../app/sfx.js';

const EDDIE_LINES = [
  '같이 미니게임천국으로 가자! 🎮',
  '센서로 노는 게 이렇게 재밌다고?!',
  '모든 미션 클리어, 가보자고! 🚀',
  '준비됐어? 시작 버튼 눌러줘!',
];

export function showProductMain(root, { onDone } = {}) {
  root.innerHTML = `
    <div class="pm scene-fade">
      <div class="pm-bg" id="pm-bg"></div>
      <div class="pm-blobs"><span></span><span></span><span></span><span></span></div>
      <div class="pm-scrim"></div>
      <div class="pm-vig"></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <div class="pm-inner">
        <div class="pm-copy">
          <h1 class="pm-title">미니게임<span class="pm-heaven">천국</span></h1>
          <p class="pm-sub">다양한 <b>센서</b>를 게임으로 배우고, 모든 미션을 클리어해 <b>진척 100%</b>를 달성하라!</p>
          <button class="btn primary lg pm-cta" id="pm-go">시작하기 <span class="pm-cta-arrow">▶</span></button>
        </div>
        <div class="pm-hero" id="pm-hero">
          <div class="pm-eddie-say" id="pm-eddie-say" hidden></div>
        </div>
      </div>
    </div>`;

  const pm = root.querySelector('.pm');

  // 배경 이미지
  const bgProbe = new Image();
  bgProbe.onload = () => { const bg = root.querySelector('#pm-bg'); bg.style.backgroundImage = `url(${bgProbe.src})`; bg.classList.add('has-img'); pm.classList.add('has-bg'); };
  bgProbe.src = '/brand/main-bg.webp';

  // 움직이는 EDDIE
  const hero = root.querySelector('#pm-hero');
  const rig = mountEddieRig(hero);

  // EDDIE 말풍선 — 한마디씩 순환 + 클릭 반응
  const say = root.querySelector('#pm-eddie-say');
  let li = 0, sayTimer = null;
  const showLine = (i) => { say.textContent = EDDIE_LINES[i % EDDIE_LINES.length]; say.hidden = false; say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop'); };
  setTimeout(() => { showLine(0); sayTimer = setInterval(() => showLine(++li), 4200); }, 900);
  rig.addEventListener('click', () => { sfx.pop(); showLine(++li); });

  // CTA 인터랙션(사운드)
  const go = root.querySelector('#pm-go');
  go.addEventListener('mouseenter', () => sfx.hover());
  go.addEventListener('click', () => { sfx.start(); onDone?.(); });

  // 사운드 토글
  const snd = root.querySelector('#snd-toggle');
  snd.addEventListener('click', () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; if (!m) sfx.click(); });

  // 미세 패럴랙스(마우스 따라 살짝) — 모션 최소화 설정 존중
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  const onMove = (e) => {
    if (reduce) return;
    const r = pm.getBoundingClientRect();
    const dx = e.clientX / r.width - 0.5, dy = e.clientY / r.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const bg = root.querySelector('#pm-bg');
      if (bg) bg.style.transform = `scale(1.06) translate(${dx * -14}px, ${dy * -10}px)`;
      hero.style.transform = `translate(${dx * 20}px, ${dy * 12}px)`;
    });
  };
  pm.addEventListener('pointermove', onMove);

  // 정리(씬 전환 시)
  const cleanup = () => { clearInterval(sayTimer); cancelAnimationFrame(raf); pm.removeEventListener('pointermove', onMove); };
  const obs = new MutationObserver(() => { if (!document.body.contains(pm)) { cleanup(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
