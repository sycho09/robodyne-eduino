// modeSelect.js — 인트로 직후 PC/태블릿 모드 선택 화면
import { setMode } from '../app/device.js';
import { sfx } from '../app/sfx.js';

export function showModeSelect(root, { onDone } = {}) {
  root.innerHTML = `
    <div class="mode-select scene-fade">
      <div class="ms-aurora"></div>
      <div class="ms-inner">
        <div class="ms-head">
          <div class="ms-bot"><img src="/brand/eddie/eddie-hero.webp" alt="EDDIE" /></div>
          <h1>어떤 기기로 접속했나요?</h1>
          <p class="ms-sub">기기에 맞춰 조작 방식을 자동으로 맞춰드려요.<br/>게임 중 화면 버튼으로 언제든 바꿀 수 있어요.</p>
        </div>
        <div class="ms-opts">
          <button class="ms-opt" data-m="pc">
            <div class="ms-art" id="ms-art-pc"></div>
            <div class="ms-screen ms-pc"><div class="ms-scr-glow"></div><span>🖥️</span></div>
            <b>PC 모드</b>
            <span class="ms-desc">키보드 <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> 로 이동</span>
          </button>
          <button class="ms-opt" data-m="tablet">
            <div class="ms-art" id="ms-art-tab"></div>
            <div class="ms-screen ms-tab"><div class="ms-scr-glow"></div><span>📱</span></div>
            <b>태블릿 모드</b>
            <span class="ms-desc">화면 <b>조이스틱</b>으로 터치 이동 🕹️</span>
          </button>
        </div>
        <p class="ms-foot">아두이노 연결은 데스크톱급 브라우저(Chrome·Edge)에서 동작해요</p>
      </div>
    </div>`;
  // 실제 일러스트가 있으면 카드 배경에 풀블리드로 적용(없으면 CSS 디바이스 목업 유지)
  [['pc', 'ms-art-pc'], ['tab', 'ms-art-tab']].forEach(([id, el]) => {
    const im = new Image();
    im.onload = () => { const a = root.querySelector('#' + el); if (!a) return; a.style.backgroundImage = `url(${im.src})`; a.closest('.ms-opt')?.classList.add('has-art'); };
    im.src = `/brand/ms-${id}.webp`;
  });

  const pick = (m) => { sfx.ok(); setMode(m); root.querySelector('.mode-select')?.classList.add('ms-leave'); setTimeout(() => onDone?.(), 240); };
  root.querySelectorAll('.ms-opt').forEach((b) => b.onclick = () => pick(b.dataset.m));
}
