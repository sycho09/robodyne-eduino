// eddieRig.js — 움직이는 EDDIE (관절 퍼펫).
// ① rig 9부위(머리/몸통/안테나/2단 팔×2/다리×2) → 관절 퍼펫(끄덕·팔흔들·안테나·통통)
// ② 실패 시 정지 히어로(eddie-hero) 폴백 — 단일 캐릭터로 일원화
// 모든 부위는 같은 1080 캔버스에 '제자리'로 렌더되어 inset:0 로 겹치면 정확히 조립된다.
// 회전축(transform-origin)은 CSS 에 캔버스 % 로 지정(관절 위치).

const RIG_BASE = '/brand/eddie/rig/';
// 셀렉터 → 파일명 (좌/우 팔은 래퍼 안에 상/하완)
const RIG_SRC = {
  '.er-leg-l': 'leg-l', '.er-leg-r': 'leg-r', '.er-body': 'body',
  '.er-arm-l > .er-aup': 'arm-l-up', '.er-arm-l .er-alow': 'arm-l-low',
  '.er-arm-r > .er-aup': 'arm-r-up', '.er-arm-r .er-alow': 'arm-r-low',
  '.er-head': 'head', '.er-antenna': 'antenna',
};
const FALLBACK = '/brand/eddie/eddie-hero.webp';

export function mountEddieRig(container, { hero } = {}) {
  const el = document.createElement('div');
  el.className = 'eddie-rig';

  // 방별 코스튬: hero 한 장만 둥실(리깅/포즈 건너뜀)
  if (hero) {
    el.innerHTML = `<img class="er-fallback" alt="EDDIE" />`;
    const himg = el.querySelector('.er-fallback');
    himg.onerror = () => { if (himg.src !== location.origin + FALLBACK) himg.src = FALLBACK; };  // 코스튬 누락 시 기본 히어로
    himg.src = hero;
    container.appendChild(el);
    return el;
  }

  el.innerHTML =
    // ① 관절 퍼펫 (뒤→앞 레이어 순서)
    `<img class="erp er-leg-l" alt="" />
     <img class="erp er-leg-r" alt="" />
     <div class="er-arm er-arm-l"><img class="erp er-aup" alt="" /><div class="er-fore er-fore-l"><img class="erp er-alow" alt="" /></div></div>
     <div class="er-arm er-arm-r"><img class="erp er-aup" alt="" /><div class="er-fore er-fore-r"><img class="erp er-alow" alt="" /></div></div>
     <img class="erp er-body" alt="" />
     <img class="erp er-head" alt="" />
     <img class="erp er-antenna" alt="" />` +
    // ② 폴백(리그 실패 시): 새 캐릭터 정지 히어로
    `<img class="er-fallback" alt="EDDIE" />`;
  container.appendChild(el);

  // ① rig 부위 로드 — 전부 성공해야 퍼펫(rig2) 활성. 실패하면 정지 히어로 폴백 유지.
  const sels = Object.keys(RIG_SRC);
  let need = sels.length, loaded = 0, failed = false;
  for (const sel of sels) {
    const img = el.querySelector(sel);
    img.onload = () => { if (failed) return; if (++loaded === need) el.classList.add('rig2'); };
    img.onerror = () => { failed = true; };
    img.src = RIG_BASE + RIG_SRC[sel] + '.webp';
  }

  // ② 폴백 정지 히어로(rig2 아닐 때 표시됨)
  el.querySelector('.er-fallback').src = FALLBACK;

  return el;
}
