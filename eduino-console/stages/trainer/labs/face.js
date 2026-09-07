/* ============================================================
   ▌ 영상처리 — 얼굴 검출 (BlazeFace)
   ============================================================ */
const face = { model: null, stream: null, raf: null, lastT: 0 };
const fcEls = {
  video: $('fc-webcam'), boxes: $('fc-boxes'), camOverlay: $('fc-cam-overlay'),
  camToggle: $('fc-cam-toggle'), status: $('fc-status'), fps: $('fc-fps'),
  count: $('fc-count'), countBar: $('fc-count-bar'),
};
function faceInit() { fcEls.camToggle.addEventListener('click', faceToggle); }
async function faceToggle() {
  if (face.stream) {
    face.stream.getTracks().forEach((t) => t.stop());
    face.stream = null; fcEls.video.srcObject = null;
    if (face.raf) cancelAnimationFrame(face.raf); face.raf = null;
    fcEls.boxes.innerHTML = '';
    fcEls.camOverlay.style.display = 'grid';
    fcEls.camToggle.textContent = '카메라 켜기 · 검출 시작';
    fcEls.status.textContent = 'IDLE'; fcEls.fps.textContent = '—'; fcEls.count.textContent = '0';
    return;
  }
  // 카메라를 먼저 켜고(모델 로드 실패와 무관하게 화면 표시), 모델은 이후 로드
  try {
    face.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    fcEls.video.srcObject = face.stream;
    await fcEls.video.play().catch(() => {});
    fcEls.camOverlay.style.display = 'none';
    fcEls.camToggle.textContent = '카메라 끄기';
    fcEls.status.textContent = 'LOADING'; face.lastT = performance.now();
    faceLoop();
  } catch (e) {
    fcEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
    return;
  }
  try {
    if (!window.blazeface) { fcEls.status.textContent = '모델 없음'; return; }
    if (!face.model) face.model = await blazeface.load();
    fcEls.status.textContent = 'LIVE';
  } catch (e) { console.error('[face] model:', e); fcEls.status.textContent = 'MODEL ERROR'; }
}
// BlazeFace 반환 형태가 버전/차원에 따라 제각각(텐서/[x,y]/[[x1,y1,x2,y2]]/빈배열)이라
// topLeft+bottomRight를 깊게 평탄화해 앞 4개를 [x1,y1,x2,y2]로 사용. 실패 시 landmarks로 박스 생성.
function faceBox(p) {
  const flat = (v) => {
    if (v == null) return [];
    if (typeof v.arraySync === 'function') { try { v = v.arraySync(); } catch (e) { return []; } }
    const out = [];
    (function rec(a) { if (Array.isArray(a)) a.forEach(rec); else if (typeof a === 'number' && Number.isFinite(a)) out.push(a); })(v);
    return out;
  };
  const nums = flat(p.topLeft).concat(flat(p.bottomRight));
  if (nums.length >= 4) {
    const [x1, y1, x2, y2] = nums;
    const w = x2 - x1, h = y2 - y1;
    if (w > 0 && h > 0) return { x: x1, y: y1, w, h };
  }
  let lm = p.landmarks;
  if (lm && typeof lm.arraySync === 'function') { try { lm = lm.arraySync(); } catch (e) { lm = null; } }
  if (Array.isArray(lm) && lm.length) {
    const xs = lm.map(q => q[0]).filter(Number.isFinite), ys = lm.map(q => q[1]).filter(Number.isFinite);
    if (xs.length && ys.length) {
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      return { x: x0 - 25, y: y0 - 45, w: (x1 - x0) + 50, h: (y1 - y0) + 75 };
    }
  }
  return null;
}
async function faceLoop() {
  if (!face.stream || !face.model) { face.raf = requestAnimationFrame(faceLoop); return; }
  if (fcEls.video.readyState >= 2) {
    const vw = fcEls.video.videoWidth, vh = fcEls.video.videoHeight;
    // 표시 영역(컨테이너) 크기 기준으로 object-fit:cover 매핑 → HTML div 박스로 영상 위에 그림
    const W = fcEls.boxes.clientWidth || vw, H = fcEls.boxes.clientHeight || vh;
    try {
      const preds = await face.model.estimateFaces(fcEls.video, false, false, true);
      const scale = Math.max(W / vw, H / vh);
      const offX = (W - vw * scale) / 2, offY = (H - vh * scale) / 2;
      let html = '';
      preds.forEach((p) => {
        const box = faceBox(p);
        if (!box || !Number.isFinite(box.w) || box.w <= 0) return;
        const dw = box.w * scale, dh = box.h * scale;
        const dx = box.x * scale + offX, dy = box.y * scale + offY;
        const left = W - dx - dw; // 영상이 좌우 반전(scaleX(-1))이므로 X 반전
        const prob = Array.isArray(p.probability) ? p.probability[0] : (typeof p.probability === 'number' ? p.probability : 1);
        html += `<div class="det-box" style="left:${left.toFixed(1)}px;top:${dy.toFixed(1)}px;width:${dw.toFixed(1)}px;height:${dh.toFixed(1)}px"><span>FACE ${Math.round(prob * 100)}%</span></div>`;
      });
      fcEls.boxes.innerHTML = html;
      fcEls.count.textContent = preds.length;
      if (fcEls.countBar) fcEls.countBar.style.width = Math.min(100, preds.length * 25) + '%';
      const now = performance.now();
      fcEls.fps.textContent = (1000 / (now - face.lastT)).toFixed(1); face.lastT = now;
    } catch (e) { /* skip */ }
  }
  face.raf = requestAnimationFrame(faceLoop);
}

