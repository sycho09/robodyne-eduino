// style.js — 캔버스 공통 비주얼 헬퍼 (고급화: 깊이/조명/글래스/비네트)

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** 화면 비네트(중립 어둠) — onDrawOverlay 에서 호출 */
export function vignette(ctx, canvas, s = 0.5) {
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.38, canvas.width / 2, canvas.height * 0.5, canvas.height * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** 깊이 그라데이션 바닥 + 미세 격자 + 중앙 빛 */
export function floor(ctx, W, H, [c0, c1, c2] = ['#142036', '#172642', '#0e1828'], gridColor = 'rgba(130,170,255,0.045)') {
  const fg = ctx.createLinearGradient(0, 0, 0, H);
  fg.addColorStop(0, c0); fg.addColorStop(0.55, c1); fg.addColorStop(1, c2);
  ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  for (let x = 24; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 24; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const fl = ctx.createRadialGradient(W / 2, H * 0.46, 30, W / 2, H * 0.46, W * 0.52);
  fl.addColorStop(0, 'rgba(120,170,255,0.06)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H);
}

/** 그라데이션 벽 + 발광 베이스보드 (테두리) */
export function walls(ctx, W, H, t = 24, [a, b] = ['#30406a', '#1b2740']) {
  const seg = (x, y, w, h) => { const g = ctx.createLinearGradient(x, y, x, y + Math.min(h, 60)); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); };
  seg(0, 0, W, t); seg(0, H - t, W, t); seg(0, 0, t, H); seg(W - t, 0, t, H);
  ctx.fillStyle = 'rgba(120,180,255,0.18)'; ctx.fillRect(t, t - 2, W - t * 2, 2);
}

/** 글래스 발광 디스크 (구역/포인트) */
export function glowDisc(ctx, cx, cy, r, rgb, done = false) {
  const base = done ? '61,220,145' : rgb;
  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, r + 38);
  glow.addColorStop(0, `rgba(${base},0.5)`); glow.addColorStop(0.6, `rgba(${base},0.15)`); glow.addColorStop(1, `rgba(${base},0)`);
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r + 38, 0, 6.283); ctx.fill();
  const disc = ctx.createRadialGradient(cx, cy - r * 0.3, 4, cx, cy, r);
  disc.addColorStop(0, `rgba(${base},0.30)`); disc.addColorStop(1, 'rgba(10,18,30,0.55)');
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
  ctx.strokeStyle = `rgba(${base},0.85)`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy - 2, r - 5, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
}

/** 라운드 라벨 칩 (가독성) */
export function chip(ctx, cx, y, text, { fg = '#eaf2ff', bg = 'rgba(10,16,28,0.72)', font = '600 13px "Space Grotesk", sans-serif' } = {}) {
  ctx.font = font; ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = bg; roundRect(ctx, cx - w / 2, y, w, 22, 11); ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(text, cx, y + 15);
}

/** 천장 조명 풀 (빛 웅덩이) */
export function lightPool(ctx, x, y, r, rgb = '150,190,255', a = 0.1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
}
