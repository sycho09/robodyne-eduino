/* ============================================================
   ▌ 영상처리 — 뼈대(포즈) 검출 (MoveNet 재사용, 학습 없음)
   ============================================================ */
const skel = { stream: null, raf: null, lastT: 0, minScore: 0.3 };
const skEls = {
  video: $('sk-webcam'), canvas: $('sk-canvas'), camOverlay: $('sk-cam-overlay'),
  camToggle: $('sk-cam-toggle'), status: $('sk-status'), fps: $('sk-fps'),
  count: $('sk-count'), confBar: $('sk-conf-bar'),
};
function skelInit() {
  skEls.camToggle.addEventListener('click', skelToggle);
  const m = document.getElementById('sk-min');
  if (m) m.addEventListener('input', () => { skel.minScore = (+m.value) / 100; const v = document.getElementById('sk-min-val'); if (v) v.textContent = m.value + '%'; });
}
async function skelToggle() {
  if (skel.stream) {
    skel.stream.getTracks().forEach((t) => t.stop());
    skel.stream = null; skEls.video.srcObject = null;
    if (skel.raf) cancelAnimationFrame(skel.raf); skel.raf = null;
    skEls.canvas.getContext('2d').clearRect(0, 0, skEls.canvas.width, skEls.canvas.height);
    skEls.camOverlay.style.display = 'grid';
    skEls.camToggle.textContent = '카메라 켜기 · 뼈대 시작';
    skEls.status.textContent = 'IDLE'; skEls.fps.textContent = '—'; skEls.count.textContent = '—';
    return;
  }
  try {
    skel.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    skEls.video.srcObject = skel.stream;
    await skEls.video.play().catch(() => {});
    skEls.camOverlay.style.display = 'none';
    skEls.camToggle.textContent = '카메라 끄기';
    skEls.status.textContent = pose.detector ? 'LIVE' : 'MODEL LOADING'; skel.lastT = performance.now();
    skelLoop();
  } catch (e) {
    skEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}
async function skelLoop() {
  if (!skel.stream) return;
  if (skEls.video.readyState >= 2 && pose.detector) {
    const vw = skEls.video.videoWidth, vh = skEls.video.videoHeight;
    skEls.canvas.width = vw; skEls.canvas.height = vh;
    try {
      const poses = await pose.detector.estimatePoses(skEls.video);
      const ctx = skEls.canvas.getContext('2d');
      ctx.clearRect(0, 0, vw, vh);
      let good = 0;
      if (poses[0]) {
        const kp = poses[0].keypoints;
        ctx.strokeStyle = '#0066ff'; ctx.lineWidth = 3;
        POSE_EDGES.forEach(([a, b]) => {
          if (kp[a].score > skel.minScore && kp[b].score > skel.minScore) {
            ctx.beginPath(); ctx.moveTo(kp[a].x, kp[a].y); ctx.lineTo(kp[b].x, kp[b].y); ctx.stroke();
          }
        });
        ctx.fillStyle = '#06b6d4';
        kp.forEach((p) => { if (p.score > skel.minScore) { good++; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); } });
      }
      skEls.status.textContent = 'LIVE';
      skEls.count.textContent = good + ' / 17';
      if (skEls.confBar) skEls.confBar.style.width = Math.round(good / 17 * 100) + '%';
      const now = performance.now();
      skEls.fps.textContent = (1000 / (now - skel.lastT)).toFixed(1); skel.lastT = now;
    } catch (e) { /* skip */ }
  }
  skel.raf = requestAnimationFrame(skelLoop);
}

