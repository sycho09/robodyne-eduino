// finale.js — 모든 학습 완료 시 폭죽(컨페티) + 안내 오버레이.
export function showFinale({ onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'finale';
  el.innerHTML = `
    <canvas class="finale-canvas"></canvas>
    <div class="finale-msg">
      <div class="fm-emoji">🎉</div>
      <h1>학습 완료!</h1>
      <p>모든 방을 클리어했어요!<br/>EDDIE와 함께 스타터 키트를 완성했어요. 🤖✨</p>
      <button class="btn primary lg" id="fin-close">계속하기 ▶</button>
    </div>`;
  document.body.appendChild(el);

  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#ff6b6b', '#ffd11a', '#3ddc91', '#6fb7ff', '#a78bfa', '#ff7aa8'];
  const parts = [];
  function burst(x, y) {
    for (let i = 0; i < 36; i++) {
      const a = (Math.PI * 2 * i) / 36, sp = 2 + Math.random() * 4;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, g: 0.06, life: 90 + Math.random() * 40,
        c: COLORS[(Math.random() * COLORS.length) | 0], s: 3 + Math.random() * 4, rot: Math.random() * 6 });
    }
  }
  let frame = 0, raf = 0, running = true;
  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (frame % 28 === 0) burst(cv.width * (0.2 + Math.random() * 0.6), cv.height * (0.2 + Math.random() * 0.3));
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; p.rot += 0.2;
      if (p.life <= 0 || p.y > cv.height + 20) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6);
      ctx.restore();
    }
    frame++;
    raf = requestAnimationFrame(loop);
  }
  burst(cv.width / 2, cv.height * 0.35);
  loop();

  el.querySelector('#fin-close').onclick = () => {
    running = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    el.remove(); onClose?.();
  };
}
