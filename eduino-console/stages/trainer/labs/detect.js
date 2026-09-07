/* ============================================================
   ▌ 사전학습 추론 — 객체 탐지 (COCO-SSD)
   ============================================================ */
const detect = { model: null, stream: null, raf: null, lastT: 0, threshold: 0.5 };
const dEls = {
  video: $('d-webcam'), overlay: $('d-overlay'), camOverlay: $('d-cam-overlay'),
  camToggle: $('d-cam-toggle'), list: $('d-list'),
  status: $('d-status'), fps: $('d-fps'), count: $('d-count'),
};

async function detectInit() {
  dEls.camToggle.addEventListener('click', detectToggle);
  const thr = document.getElementById('d-thr');
  if (thr) thr.addEventListener('input', () => {
    detect.threshold = (+thr.value) / 100;
    const v = document.getElementById('d-thr-val'); if (v) v.textContent = thr.value + '%';
  });
}
async function detectToggle() {
  if (detect.stream) {
    detect.stream.getTracks().forEach(t => t.stop());
    detect.stream = null; dEls.video.srcObject = null;
    if (detect.raf) cancelAnimationFrame(detect.raf);
    dEls.camOverlay.style.display = 'grid';
    dEls.camToggle.textContent = '카메라 켜기 · 탐지 시작';
    dEls.status.textContent = 'IDLE'; dEls.fps.textContent = '—';
    dEls.list.innerHTML = ''; dEls.count.textContent = '0';
    const ctx = dEls.overlay.getContext('2d');
    ctx.clearRect(0, 0, dEls.overlay.width, dEls.overlay.height);
    return;
  }
  if (!window.cocoSsd) { console.error('[detect] cocoSsd missing'); return; }
  dEls.status.textContent = 'LOADING';
  try {
    if (!detect.model) detect.model = await cocoSsd.load();
    detect.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    dEls.video.srcObject = detect.stream;
    dEls.camOverlay.style.display = 'none';
    dEls.camToggle.textContent = '카메라 끄기';
    dEls.status.textContent = 'LIVE';
    detect.lastT = performance.now();
    detectLoop();
  } catch (e) { console.error('[detect] fail:', e); dEls.status.textContent = 'ERROR'; }
}
async function detectLoop() {
  if (!detect.stream || !detect.model) return;
  if (dEls.video.readyState >= 2) {
    const vw = dEls.video.videoWidth, vh = dEls.video.videoHeight;
    dEls.overlay.width = vw; dEls.overlay.height = vh;
    try {
      const preds = (await detect.model.detect(dEls.video)).filter((p) => p.score >= detect.threshold);
      const ctx = dEls.overlay.getContext('2d');
      ctx.clearRect(0, 0, vw, vh);
      ctx.font = 'bold 16px JetBrains Mono';
      preds.forEach(p => {
        const [x, y, w, h] = p.bbox;
        const mx = vw - x - w; // 비디오가 좌우 반전 표시되므로 박스 X 좌표만 반전(텍스트는 정상 유지)
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 3;
        ctx.strokeRect(mx, y, w, h);
        const label = `${p.class} ${Math.round(p.score*100)}%`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(mx, y - 20, tw + 10, 20);
        ctx.fillStyle = '#000'; ctx.fillText(label, mx + 5, y - 5);
      });
      dEls.count.textContent = preds.length;
      dEls.list.innerHTML = preds.slice(0, 8).map(p => {
        const pct = Math.round(p.score * 100);
        return `<div class="det-row">
          <div class="det-head"><span>${p.class}</span><span class="det-pct">${pct}%</span></div>
          <div class="gauge"><div class="gauge-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
      const now = performance.now();
      const fps = 1000 / (now - detect.lastT); detect.lastT = now;
      dEls.fps.textContent = fps.toFixed(1);
    } catch (e) { /* skip frame */ }
  }
  detect.raf = requestAnimationFrame(detectLoop);
}

