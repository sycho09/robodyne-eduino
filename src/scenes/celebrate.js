// celebrate.js — 방 미션 클리어 공통 마무리 (폭죽 + "학습을 마쳤습니다" 모달).
// 모든 학습방에서 미션을 클리어하면 이걸 띄워 통일감 있게 마무리한다.
// onExit: "방 나가기" 버튼을 누르면 호출(복도로 복귀 등).

const COLORS = ['#ff6b6b', '#ffd11a', '#3ddc91', '#6fb7ff', '#a78bfa', '#ff7aa8'];

export function celebrateRoom({ title = '학습을 마쳤습니다', message = '', exitLabel = '방 나가기 ▶', onExit } = {}) {
  const el = document.createElement('div');
  el.className = 'finale celebrate';
  el.innerHTML = `
    <canvas class="finale-canvas"></canvas>
    <div class="finale-msg celebrate-msg">
      <div class="fm-emoji">🎉</div>
      <h1>${title}</h1>
      ${message ? `<p>${message}</p>` : ''}
      <button class="cel-go" id="cel-exit">${exitLabel}</button>
    </div>`;
  document.body.appendChild(el);

  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  const parts = [];
  function burst(x, y) {
    for (let i = 0; i < 34; i++) {
      const a = (Math.PI * 2 * i) / 34, sp = 2 + Math.random() * 4;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, g: 0.06, life: 90 + Math.random() * 40,
        c: COLORS[(Math.random() * COLORS.length) | 0], s: 3 + Math.random() * 4, rot: Math.random() * 6 });
    }
  }
  let frame = 0, raf = 0, running = true;
  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // 결과 박스 뒤(중앙)에서 터져 가장자리로 퍼지는 느낌
    if (frame % 26 === 0) burst(cv.width / 2 + (Math.random() - 0.5) * 160, cv.height * 0.46 + (Math.random() - 0.5) * 70);
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
  burst(cv.width / 2, cv.height * 0.46);
  loop();

  el.querySelector('#cel-exit').onclick = () => {
    running = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    el.remove(); onExit?.();
  };
}
