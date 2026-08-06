// kits.js — 호환 키트 안내 페이지.
// 특정 키트 기준이 아니라, 아래 키트들이 있으면 누구나 그대로 즐길 수 있음을 안내한다.
// 제품 사진은 public/brand/kits/<id>.webp 자동 교체형(없으면 📦 플레이스홀더).
import { sfx } from '../app/sfx.js';

const KITS = [
  { id: 'easy', name: '스타터 키트 [이지 커넥트편] · 50종', note: '납땜 없이 케이블만 꽂으면 끝!' },
  { id: 'intro', name: '스타터 키트 [입문편]', note: '핵심 부품으로 입문' },
  { id: 'comprehensive', name: '스타터 키트 [종합편]', note: '부품 풀세트' },
  { id: 'sensor', name: '센서 마스터편 · 45종', note: '다양한 센서 집중' },
];

export function showKits(root, { onDone } = {}) {
  root.innerHTML = `
    <div class="kits scene-fade">
      <div class="kits-bg" id="kits-bg"></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <div class="kits-inner">
        <div class="kits-head">
          <div class="kits-kicker"><span class="brand-dot"></span>호환 키트 안내</div>
          <h1 class="kits-title"><span class="grad">미니게임천국</span>은 이런 제품과 호환됩니다!</h1>
          <p class="kits-sub"><b>납땜·저항 없이 케이블만 쏙</b> 꽂으면 끝! 아래 키트가 있으면 <b>누구나 그대로 즐길 수 있어요</b> 👍</p>
        </div>
        <div class="kits-grid">
          ${KITS.map((k) => `
            <div class="kit-card" data-id="${k.id}">
              <div class="kit-img" id="kit-${k.id}"><span class="kit-ph">📦</span></div>
              <div class="kit-name">${k.name}</div>
              <div class="kit-note">${k.note}</div>
            </div>`).join('')}
        </div>
        <button class="btn primary lg kits-go" id="kits-go">계속하기 ▶</button>
      </div>
    </div>`;

  // 배경 컨셉 통일(메인 카니발 있으면 recede로 깔기)
  const bgProbe = new Image();
  bgProbe.onload = () => { const b = root.querySelector('#kits-bg'); b.style.backgroundImage = `url(${bgProbe.src})`; b.classList.add('has-img'); };
  bgProbe.src = '/brand/main-bg.webp';

  // 제품 사진 자동 적용
  KITS.forEach((k) => {
    const probe = new Image();
    probe.onload = () => { const box = root.querySelector('#kit-' + k.id); box.style.backgroundImage = `url(${probe.src})`; box.classList.add('has-img'); };
    probe.src = `/brand/kits/${k.id}.webp`;
  });

  const goBtn = root.querySelector('#kits-go');
  goBtn.addEventListener('mouseenter', () => sfx.hover());
  goBtn.addEventListener('click', () => { sfx.start(); onDone?.(); });
  root.querySelectorAll('.kit-card').forEach((c) => c.addEventListener('click', () => sfx.pop()));

  const snd = root.querySelector('#snd-toggle');
  snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; if (!m) sfx.click(); };
}
