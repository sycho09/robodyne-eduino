/* ============================================================
   ▌ 영상처리 — 색상 추적 (RGB 임계값, tf.fromPixels 읽기 + 투명 오버레이)
   ============================================================ */
const ct = { stream: null, raf: null, lastT: 0, target: { r: 220, g: 50, b: 50 }, tol: 140 };
const ctEls = {
  video: $('ct-webcam'), canvas: $('ct-canvas'), camOverlay: $('ct-cam-overlay'),
  camToggle: $('ct-cam-toggle'), status: $('ct-status'), fps: $('ct-fps'),
  meta: $('ct-meta'), matchBar: $('ct-match-bar'),
};
function ctInit() {
  ctEls.camToggle.addEventListener('click', ctToggle);
  document.querySelectorAll('.ct-color').forEach((b) => b.addEventListener('click', () => {
    ct.target = { r: +b.dataset.r, g: +b.dataset.g, b: +b.dataset.b };
    document.querySelectorAll('.ct-color').forEach((x) => x.classList.toggle('active', x === b));
  }));
  const tol = document.getElementById('ct-tol');
  if (tol) tol.addEventListener('input', () => { ct.tol = +tol.value; const v = document.getElementById('ct-tol-val'); if (v) v.textContent = tol.value; });
  // 직접 색 입력 → 입력한 색을 추적 대상으로 (프리셋 선택 해제)
  const pick = document.getElementById('ct-pick');
  if (pick) pick.addEventListener('input', () => {
    const h = pick.value;
    ct.target = { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
    document.querySelectorAll('.ct-color').forEach((x) => x.classList.remove('active'));
  });
}
async function ctToggle() {
  if (ct.stream) {
    ct.stream.getTracks().forEach((t) => t.stop());
    ct.stream = null; ctEls.video.srcObject = null;
    if (ct.raf) cancelAnimationFrame(ct.raf); ct.raf = null;
    ctEls.canvas.getContext('2d').clearRect(0, 0, ctEls.canvas.width, ctEls.canvas.height);
    ctEls.camOverlay.style.display = 'grid';
    ctEls.camToggle.textContent = '카메라 켜기 · 추적 시작';
    ctEls.status.textContent = 'IDLE'; ctEls.fps.textContent = '—'; ctEls.meta.textContent = '—';
    return;
  }
  try {
    ct.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    ctEls.video.srcObject = ct.stream;
    await ctEls.video.play().catch(() => {});
    ctEls.camOverlay.style.display = 'none';
    ctEls.camToggle.textContent = '카메라 끄기';
    ctEls.status.textContent = 'LIVE'; ct.lastT = performance.now();
    ctLoop();
  } catch (e) {
    ctEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}
async function ctLoop() {
  if (!ct.stream) return;
  if (ctEls.video.readyState >= 2 && window.tf) {
    const W = 160, H = 120;
    try {
      const t = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(ctEls.video), [H, W]));
      const d = await t.data(); t.dispose();
      ctEls.canvas.width = W; ctEls.canvas.height = H;
      const ctx = ctEls.canvas.getContext('2d');
      const img = ctx.createImageData(W, H);
      const tg = ct.target; let matched = 0;
      for (let i = 0; i < W * H; i++) {
        const dist = Math.abs(d[i * 3] - tg.r) + Math.abs(d[i * 3 + 1] - tg.g) + Math.abs(d[i * 3 + 2] - tg.b);
        const o = i * 4;
        if (dist < ct.tol) { matched++; /* 매칭 → 투명(뒤 비디오 노출) */ }
        else { img.data[o] = 8; img.data[o + 1] = 10; img.data[o + 2] = 16; img.data[o + 3] = 195; }
      }
      ctx.putImageData(img, 0, 0);
      const pct = matched * 100 / (W * H);
      ctEls.meta.textContent = pct.toFixed(1) + '%';
      if (ctEls.matchBar) ctEls.matchBar.style.width = Math.min(100, pct * 4).toFixed(0) + '%';
      const now = performance.now();
      ctEls.fps.textContent = (1000 / (now - ct.lastT)).toFixed(1); ct.lastT = now;
    } catch (e) { /* skip */ }
  }
  ct.raf = requestAnimationFrame(ctLoop);
}

