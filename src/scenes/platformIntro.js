// platformIntro.js — 'Eduino AI' 플랫폼 인트로(아케이드 부트 + PRESS START).
// 미니멀 블랙 + 중앙 로고 리빌 + 페이드 인/아웃. (레퍼런스 컨셉 차용, 색은 자체 정체성)
// public/brand/eduino-ai-logo.webp 가 있으면 워드마크 대신 자동으로 그 로고를 사용한다.
import { sfx } from '../app/sfx.js';
import { overallCleared, overallTotal, overallPercent } from '../content/curriculum.js';

const HOLD_MS = 4600;    // 등장 후 유지(페이드아웃 전) — 천천히 감상
const OUT_MS = 1100;     // 페이드아웃
const SAFETY_MS = 9000;

const MARK = `
  <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="pi-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6fb7ff"/><stop offset="1" stop-color="#a78bfa"/>
      </linearGradient>
    </defs>
    <path d="M50 5 C57 33 67 43 95 50 C67 57 57 67 50 95 C43 67 33 57 5 50 C33 43 43 33 50 5 Z" fill="url(#pi-g)"/>
    <circle cx="80" cy="22" r="4.5" fill="#a78bfa"/>
  </svg>`;

export function showPlatformIntro(root, { onDone } = {}) {
  root.innerHTML = `
    <div class="platform-intro" id="pintro">
      <div class="pi-screen" id="pi-screen">
        <div class="pi-card" id="pi-card"></div>
        <div class="pi-scanlines"></div>
        <div class="pi-snow"></div>
        <div class="pi-grain"></div>
        <div class="pi-vignette"></div>
      </div>
      <div class="pi-bg" id="pi-bg"></div>
      <div class="pi-stage">
        <div class="pi-mark">${MARK}</div>
        <img class="pi-logo-img" id="pi-img" alt="Eduino AI" hidden />
        <h1 class="pi-word"><span class="pi-e">Eduino</span> <span class="pi-ai">AI</span></h1>
        <div class="pi-tag">AIoT LEARNING PLATFORM</div>
        <div class="pi-progress" id="pi-prog"></div>
      </div>
      <div class="pi-skip"><span class="pi-press">PRESS START</span><small>화면을 누르거나 아무 키나 ▶</small></div>
    </div>`;

  const el = root.querySelector('#pintro');

  // 로고와 함께 학습 진척 표시(돌아온 사용자)
  const oc = overallCleared(), ot = overallTotal(), op = overallPercent();
  if (oc > 0) el.querySelector('#pi-prog').innerHTML =
    `<div class="pi-prog-bar"><i style="width:${op}%"></i></div><span>학습 진척 ${oc} / ${ot} · ${op}%</span>`;

  // (카드 없을 때) 추상 배경 이미지가 있으면 적용
  const bgProbe = new Image();
  bgProbe.onload = () => { const bg = el.querySelector('#pi-bg'); bg.style.backgroundImage = `url(${bgProbe.src})`; bg.classList.add('has-img'); };
  bgProbe.src = '/brand/intro-bg.webp';

  // 실제 로고 이미지가 준비돼 있으면 워드마크 대신 사용
  const probe = new Image();
  probe.onload = () => {
    const img = el.querySelector('#pi-img');
    img.src = probe.src; img.hidden = false;
    el.querySelector('.pi-mark').hidden = true;
    el.querySelector('.pi-word').hidden = true;
    el.querySelector('.pi-tag').hidden = true;   // 로고에 이미 태그라인 포함
  };
  probe.src = '/brand/logo.webp';

  // 모드(카드 vs 로고)를 '먼저' 결정한 뒤에 화면을 띄운다.
  // → 로고 인트로가 떴다가 카드로 휙 바뀌는(이전 배경처럼 보이는) 전환 제거.
  // 결정 전에는 솔리드 검정만 보이므로 깔끔하다.
  let revealed = false;
  function reveal() {
    if (revealed) return; revealed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    // 자동 진행 없음 — PRESS START(키/클릭)로만 넘어감
  }

  let decided = false;
  const cardProbe = new Image();
  cardProbe.onload = () => {
    if (decided) return; decided = true;
    el.querySelector('#pi-card').style.backgroundImage = `url(${cardProbe.src})`;
    el.classList.add('card-mode');
    reveal();
  };
  cardProbe.onerror = () => { if (!decided) { decided = true; reveal(); } };   // 카드 없음 → 로고 모드
  cardProbe.src = '/brand/intro-card.webp';
  // 대용량 카드가 너무 느리게 로드되면 그때만 로고 모드로(드묾). 그래도 '검정→로고'라 이전 배경은 안 보임.
  const dT = setTimeout(() => { if (!decided) { decided = true; reveal(); } }, 3500);

  let done = false, t1 = null;
  const finish = () => {
    if (done) return; done = true;
    cleanup();
    // 다음 장면으로 '즉시' 교체(같은 #app을 덮어쓰므로 페이드아웃 동안의 빈 화면 갭이 없다).
    // 인트로가 사라지며 생기던 '남색+물방울' 비침 방지 — 다음 장면이 자기 진입 애니메이션으로 등장.
    el.remove(); onDone?.();
  };
  const onSkip = () => { try { sfx.start(); } catch (_) {} finish(); };
  window.addEventListener('keydown', onSkip);
  window.addEventListener('pointerdown', onSkip);
  function cleanup() { window.removeEventListener('keydown', onSkip); window.removeEventListener('pointerdown', onSkip); clearTimeout(dT); }
}
