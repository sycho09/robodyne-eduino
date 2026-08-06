// login.js — 플레이어 입장(접속 코드). 구매 시 이메일로 받은 6자리 코드를 입력해 입장.
// 데모: 아무 코드나(또는 빈칸) 입장 가능. 메인과 동일 완성도(배지·사운드·말풍선·인터랙션).
import { mountEddieRig } from '../app/eddieRig.js';
import { sfx } from '../app/sfx.js';

const LINES = ['구매 후 받은 6자리 접속 코드를 입력해줘!', '코드를 모르면 고객센터로 문의해줘 📞', '코드 입력하면 바로 출발! 🚀', '천국에서 만나자! 🎮'];

export function showLogin(root, { onDone } = {}) {
  root.innerHTML = `
    <div class="lg scene-fade">
      <div class="pm-bg" id="lg-bg"></div>
      <div class="pm-blobs"><span></span><span></span><span></span><span></span></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <div class="lg-inner">
        <div class="lg-card">
          <div class="lg-brand"><span class="brand-dot"></span>EDUINO AI · 미니게임천국</div>
          <h2 class="lg-title">플레이어 입장 🎮</h2>
          <p class="lg-sub">구매 시 <b>이메일로 받은 6자리 접속 코드</b>를 입력하세요.<br/><span class="lg-demo">데모 버전 — 아무 코드나 입장할 수 있어요</span></p>
          <label class="lg-label">접속 코드 (6자리)</label>
          <div class="code-inputs" id="code-inputs">
            ${[0, 1, 2, 3, 4, 5].map((i) => `${i === 3 ? '<span class="code-sep">·</span>' : ''}<input class="code-box" inputmode="numeric" maxlength="1" data-i="${i}" aria-label="코드 ${i + 1}번째" />`).join('')}
          </div>
          <button class="btn primary lg-go" id="lf-login">입장하기 ▶</button>
          <a class="lg-help" id="lf-help" href="https://eduino.kr/shopinfo/customer.html?board_no=3" target="_blank" rel="noopener">접속 코드가 없으신가요? · 고객센터 문의</a>
        </div>
        <div class="lg-hero" id="lg-hero">
          <div class="lg-speech" id="lg-speech" hidden></div>
        </div>
      </div>
    </div>`;

  // 배경(있으면 컨셉 배경 recede 적용)
  const bgProbe = new Image();
  bgProbe.onload = () => { const b = root.querySelector('#lg-bg'); b.style.backgroundImage = `url(${bgProbe.src})`; b.classList.add('has-img'); };
  bgProbe.src = '/brand/login-bg.webp';

  const rig = mountEddieRig(root.querySelector('#lg-hero'));

  // EDDIE 말풍선 순환 + 클릭 반응
  const say = root.querySelector('#lg-speech');
  let li = 0, sayTimer = null;
  const show = (n) => { say.textContent = LINES[n % LINES.length]; say.hidden = false; say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop'); };
  setTimeout(() => { show(0); sayTimer = setInterval(() => show(++li), 4200); }, 700);
  rig.addEventListener('click', () => { sfx.pop(); show(++li); });

  // 6자리 코드 입력(자동 이동·백스페이스·붙여넣기)
  const boxes = [...root.querySelectorAll('.code-box')];
  boxes.forEach((b, idx) => {
    b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(0, 1); b.classList.toggle('filled', !!b.value); if (b.value) { sfx.hover(); if (idx < 5) boxes[idx + 1].focus(); } });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && idx > 0) boxes[idx - 1].focus();
      if (e.key === 'Enter') go();
    });
    b.addEventListener('paste', (e) => {
      e.preventDefault();
      const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      d.split('').forEach((ch, k) => { if (boxes[k]) { boxes[k].value = ch; boxes[k].classList.add('filled'); } });
      if (d.length) boxes[Math.min(d.length, 5)].focus();
    });
  });
  setTimeout(() => boxes[0]?.focus(), 200);

  // 사운드 토글
  const snd = root.querySelector('#snd-toggle');
  snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; if (!m) sfx.click(); };

  // 입장 (데모: 무조건 통과)
  const go = () => { sfx.start(); onDone?.(); };
  const login = root.querySelector('#lf-login');
  login.onclick = go;
  login.addEventListener('mouseenter', () => sfx.hover());
  root.querySelector('#lf-help').addEventListener('click', () => sfx.click());   // 링크는 새 탭으로 고객센터 이동

  // 정리
  const lg = root.querySelector('.lg');
  const obs = new MutationObserver(() => { if (!document.body.contains(lg)) { clearInterval(sayTimer); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
