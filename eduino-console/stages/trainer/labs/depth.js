/* ============================================================
   ▌ 사전학습 추론 — 깊이 추정 (AR Portrait Depth)
   ============================================================ */
const depth = { estimator: null, stream: null, raf: null, lastT: 0 };
const zEls = {
  video: $('z-webcam'), canvas: $('z-canvas'), camOverlay: $('z-cam-overlay'),
  camToggle: $('z-cam-toggle'),
  status: $('z-status'), fps: $('z-fps'), min: $('z-min'), max: $('z-max'),
};
async function depthInit() {
  zEls.camToggle.addEventListener('click', depthToggle);
}
async function depthToggle() {
  if (depth.stream) {
    depth.stream.getTracks().forEach(t => t.stop());
    depth.stream = null; zEls.video.srcObject = null;
    if (depth.raf) cancelAnimationFrame(depth.raf);
    zEls.camOverlay.style.display = 'grid';
    zEls.camToggle.textContent = '카메라 켜기 · 깊이 시작';
    zEls.status.textContent = 'IDLE';
    const ctx = zEls.canvas.getContext('2d');
    ctx.clearRect(0, 0, zEls.canvas.width, zEls.canvas.height);
    return;
  }
  if (!window.depthEstimation) { console.error('[depth] depthEstimation missing'); zEls.status.textContent = 'NOT AVAILABLE'; return; }
  zEls.status.textContent = 'LOADING';
  try {
    if (!depth.estimator) {
      depth.estimator = await depthEstimation.createEstimator(
        depthEstimation.SupportedModels.ARPortraitDepth,
        { minDepth: 0, maxDepth: 1 }
      );
    }
    depth.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    zEls.video.srcObject = depth.stream;
    zEls.camOverlay.style.display = 'none';
    zEls.camToggle.textContent = '카메라 끄기';
    zEls.status.textContent = 'LIVE';
    depth.lastT = performance.now();
    depthLoop();
  } catch (e) { console.error('[depth] fail:', e); zEls.status.textContent = 'ERROR'; }
}
async function depthLoop() {
  if (!depth.stream || !depth.estimator) return;
  if (zEls.video.readyState >= 2) {
    const vw = zEls.video.videoWidth, vh = zEls.video.videoHeight;
    zEls.canvas.width = vw; zEls.canvas.height = vh;
    try {
      const d = await depth.estimator.estimateDepth(zEls.video, { minDepth: 0, maxDepth: 1 });
      const depthCanvas = await d.toCanvasImageSource();
      const ctx = zEls.canvas.getContext('2d');
      ctx.drawImage(depthCanvas, 0, 0, vw, vh);
      const now = performance.now();
      const fps = 1000 / (now - depth.lastT); depth.lastT = now;
      zEls.fps.textContent = fps.toFixed(1);
      zEls.min.textContent = '0.0 (가까움)';
      zEls.max.textContent = '1.0 (멈)';
    } catch (e) { /* skip */ }
  }
  depth.raf = requestAnimationFrame(depthLoop);
}

