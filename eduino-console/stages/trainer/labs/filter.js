/* ============================================================
   ▌ 영상처리 — 영상 필터 (CSS 필터) + 모션 감지 (프레임 차분)
   ============================================================ */
const ff = { stream: null, raf: null, mode: 'none', prev: null, lastT: 0, params: { bright: 100, contrast: 100, blur: 0 } };
const ffEls = {
  video: $('ff-webcam'), canvas: $('ff-canvas'), camOverlay: $('ff-cam-overlay'),
  camToggle: $('ff-cam-toggle'), status: $('ff-status'), fps: $('ff-fps'),
  motion: $('ff-motion'), motionBar: $('ff-motion-bar'), modeName: $('ff-mode-name'),
};
const FF_CSS = { none: '', gray: 'grayscale(1)', invert: 'invert(1)', contrast: 'grayscale(1) contrast(4) brightness(1.1)', blur: 'blur(6px)' };
const FF_LABEL = { none: '원본', gray: '흑백', invert: '색 반전', contrast: '고대비', blur: '블러', motion: '모션 감지' };

/* 모드 프리셋 + 사용자 파라미터(밝기/대비/블러)를 합성한 CSS 필터 문자열 */
function ffBuildCSS() {
  const p = ff.params;
  const preset = ff.mode === 'motion' ? '' : (FF_CSS[ff.mode] || '');
  return `${preset} brightness(${p.bright}%) contrast(${p.contrast}%) blur(${p.blur}px)`.trim();
}
function ffApply() {
  if (ff.mode !== 'motion') ffEls.video.style.filter = ffBuildCSS();
}
function ffClearCanvas() {
  const ctx = ffEls.canvas.getContext('2d');
  ctx.clearRect(0, 0, ffEls.canvas.width, ffEls.canvas.height);
}
function ffResetMotion() {
  ff.prev = null;
  if (ffEls.motion) ffEls.motion.textContent = '—';
  if (ffEls.motionBar) ffEls.motionBar.style.width = '0%';
}

function setFilterMode(mode) {
  if (!FF_LABEL[mode]) return;
  ff.mode = mode;
  document.querySelectorAll('.ff-mode').forEach((b) => b.classList.toggle('active', b.dataset.fmode === mode));
  ffEls.modeName.textContent = FF_LABEL[mode];
  const mr = document.getElementById('ff-motion-row'); if (mr) mr.style.display = (mode === 'motion') ? '' : 'none';
  if (mode === 'motion') {
    ffEls.video.style.filter = '';
    ffClearCanvas();
    if (ff.stream) { if (ff.raf) cancelAnimationFrame(ff.raf); motionLoop(); }
  } else {
    if (ff.raf) cancelAnimationFrame(ff.raf);
    ff.raf = null;
    ffEls.video.style.filter = ffBuildCSS();
    ffClearCanvas();
    ffResetMotion();
  }
}

async function filterToggle() {
  if (ff.stream) {
    ff.stream.getTracks().forEach((t) => t.stop());
    ff.stream = null; ffEls.video.srcObject = null;
    if (ff.raf) cancelAnimationFrame(ff.raf); ff.raf = null;
    ffEls.video.style.filter = '';
    ffClearCanvas(); ffResetMotion();
    ffEls.camOverlay.style.display = 'grid';
    ffEls.camToggle.textContent = '카메라 켜기';
    ffEls.status.textContent = 'IDLE'; ffEls.fps.textContent = '—';
    return;
  }
  try {
    ff.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    ffEls.video.srcObject = ff.stream;
    await ffEls.video.play().catch(() => {});
    ffEls.camOverlay.style.display = 'none';
    ffEls.camToggle.textContent = '카메라 끄기';
    ffEls.status.textContent = 'LIVE';
    setFilterMode(ff.mode); // 현재 모드 적용 (CSS 필터 or 모션 루프 시작)
  } catch (e) {
    ffEls.camOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">CAMERA DENIED</div><div class="ph-msg">브라우저 카메라 권한을 확인하세요</div></div>';
  }
}

/* 모션 감지: tf.browser.fromPixels 로 프레임을 읽어(가려진 비디오에서도 안전한 WebGL 경로)
   이전 프레임과의 밝기 차이가 큰 픽셀을 빨갛게 오버레이로 표시. */
async function motionLoop() {
  if (ff.mode !== 'motion' || !ff.stream) return;
  if (ffEls.video.readyState >= 2 && window.tf) {
    const W = 160, H = 120;
    try {
      const gray = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(ffEls.video), [H, W]).mean(2));
      const cur = await gray.data(); gray.dispose();
      if (ff.prev && ff.prev.length === cur.length) {
        ffEls.canvas.width = W; ffEls.canvas.height = H;
        const ctx = ffEls.canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        let moved = 0;
        for (let i = 0; i < cur.length; i++) {
          const o = i * 4;
          if (Math.abs(cur[i] - ff.prev[i]) > 22) {
            moved++;
            img.data[o] = 255; img.data[o + 1] = 40; img.data[o + 2] = 70; img.data[o + 3] = 160;
          }
        }
        ctx.putImageData(img, 0, 0);
        const pct = moved * 100 / cur.length;
        ffEls.motion.textContent = pct.toFixed(1) + '%';
        ffEls.motionBar.style.width = Math.min(100, pct * 3).toFixed(0) + '%';
      }
      ff.prev = cur;
      const now = performance.now();
      ffEls.fps.textContent = (1000 / (now - ff.lastT)).toFixed(1); ff.lastT = now;
    } catch (e) { /* skip frame */ }
  }
  ff.raf = requestAnimationFrame(motionLoop);
}

function filterInit() {
  ffEls.camToggle.addEventListener('click', filterToggle);
  document.querySelectorAll('.ff-mode').forEach((b) => {
    b.addEventListener('click', () => setFilterMode(b.dataset.fmode));
  });
  // 파라미터 슬라이더 — 실시간으로 효과 합성
  const bind = (id, key, unit) => {
    const el = document.getElementById(id), val = document.getElementById(id + '-val');
    if (!el) return;
    el.addEventListener('input', () => {
      ff.params[key] = +el.value;
      if (val) val.textContent = el.value + unit;
      ffApply();
    });
  };
  bind('ff-bright', 'bright', '%');
  bind('ff-contrast', 'contrast', '%');
  bind('ff-blur', 'blur', 'px');
  // 원본 비교 — 누르는 동안 필터 해제
  const cmp = document.getElementById('ff-compare');
  if (cmp) {
    const showOrig = () => { if (ff.mode !== 'motion') ffEls.video.style.filter = ''; };
    const restore = () => ffApply();
    cmp.addEventListener('mousedown', showOrig);
    cmp.addEventListener('touchstart', (e) => { e.preventDefault(); showOrig(); });
    cmp.addEventListener('mouseup', restore);
    cmp.addEventListener('mouseleave', restore);
    cmp.addEventListener('touchend', restore);
  }
}

