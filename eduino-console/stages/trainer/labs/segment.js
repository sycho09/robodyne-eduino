/* ============================================================
   ▌ 사전학습 추론 — 인물 분리 (BodyPix)
   ============================================================ */
const seg = { net: null, stream: null, raf: null, mode: 'remove', lastT: 0 };
const sEls = {
  video: $('s-webcam'), canvas: $('s-canvas'), camOverlay: $('s-cam-overlay'),
  camToggle: $('s-cam-toggle'), modeToggle: $('s-mode-toggle'),
  status: $('s-status'), fps: $('s-fps'),
  personPx: $('s-person-px'), ratio: $('s-ratio'), ratioBar: $('s-ratio-bar'),
};
async function segmentInit() {
  sEls.camToggle.addEventListener('click', segmentToggle);
  sEls.modeToggle.addEventListener('click', () => {
    seg.mode = seg.mode === 'remove' ? 'highlight' : 'remove';
    // 버튼은 '전환하면 될 모드'를 표시 (현재 모드와 반대)
    sEls.modeToggle.textContent = seg.mode === 'remove' ? '인물 강조로 전환' : '배경 제거로 전환';
  });
}
async function segmentToggle() {
  if (seg.stream) {
    seg.stream.getTracks().forEach(t => t.stop());
    seg.stream = null; sEls.video.srcObject = null;
    if (seg.raf) cancelAnimationFrame(seg.raf);
    sEls.camOverlay.style.display = 'grid';
    sEls.camToggle.textContent = '카메라 켜기 · 분리 시작';
    sEls.status.textContent = 'IDLE';
    const ctx = sEls.canvas.getContext('2d');
    ctx.clearRect(0, 0, sEls.canvas.width, sEls.canvas.height);
    return;
  }
  if (!window.bodyPix) { console.error('[seg] bodyPix missing'); return; }
  sEls.status.textContent = 'LOADING';
  try {
    if (!seg.net) seg.net = await bodyPix.load({ architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75 });
    seg.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    sEls.video.srcObject = seg.stream;
    await sEls.video.play().catch(() => {});
    sEls.camOverlay.style.display = 'none';
    sEls.camToggle.textContent = '카메라 끄기';
    sEls.status.textContent = 'LIVE';
    seg.lastT = performance.now();
    segmentLoop();
  } catch (e) { console.error('[seg] fail:', e); sEls.status.textContent = 'ERROR'; }
}
async function segmentLoop() {
  if (!seg.stream || !seg.net) return;
  if (sEls.video.readyState >= 2) {
    const vw = sEls.video.videoWidth, vh = sEls.video.videoHeight;
    sEls.canvas.width = vw; sEls.canvas.height = vh;
    try {
      const segmentation = await seg.net.segmentPerson(sEls.video, { internalResolution: 'medium', segmentationThreshold: 0.6 });
      const ctx = sEls.canvas.getContext('2d');
      const mask = segmentation.data;
      // 비디오를 배경 레이어로 그대로 노출하고 캔버스는 투명 오버레이로만 사용한다.
      // (가려진 비디오를 drawImage 하면 일부 브라우저에서 검은 프레임이 나오는 문제 회피)
      const img = ctx.createImageData(vw, vh);
      const data = img.data;
      let personPx = 0;
      for (let i = 0; i < mask.length; i++) {
        const o = i * 4;
        if (mask[i] === 1) {
          personPx++;
          if (seg.mode === 'highlight') {
            // 인물에 진한 시안 틴트 (배경은 투명 → 원본 영상 노출)
            data[o] = 0; data[o+1] = 220; data[o+2] = 255; data[o+3] = 205;
          }
          // remove 모드: 인물은 투명 → 뒤 비디오가 그대로 보임
        } else if (seg.mode === 'remove') {
          // 배경을 선명한 그린(크로마키 느낌)으로 완전히 덮어 분리를 명확히 표시
          data[o] = 16; data[o+1] = 185; data[o+2] = 129; data[o+3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const total = mask.length;
      const ratioPct = personPx * 100 / total;
      sEls.personPx.textContent = personPx.toLocaleString();
      sEls.ratio.textContent = ratioPct.toFixed(1) + '%';
      if (sEls.ratioBar) sEls.ratioBar.style.width = ratioPct.toFixed(1) + '%';
      const now = performance.now();
      const fps = 1000 / (now - seg.lastT); seg.lastT = now;
      sEls.fps.textContent = fps.toFixed(1);
    } catch (e) { /* skip */ }
  }
  seg.raf = requestAnimationFrame(segmentLoop);
}

