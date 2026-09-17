/**
 * ui/webcam.js — 학생의 실제 웹캠으로 색 물체를 찾는다.
 *
 * 개인정보: 프레임은 브라우저 안에서만 처리한다. 어디에도 저장하지 않고 어디로도 보내지 않는다.
 * 남는 것은 임계값과 인식률 같은 수치뿐이다. 이 파일에는 업로드·저장 경로가 존재하지 않는다.
 *
 * 결정론: 이 경로를 쓰는 챌린지는 결정론이 성립하지 않는다. 실물 카메라가 입력이기 때문이며,
 * 그것이 이 챌린지의 목적이다. 마커를 쓰는 기존 챌린지는 이 파일을 거치지 않는다.
 */

const W = 160;                 // 다운샘플 해상도 — 30fps 에 여유가 있고 작은 물체도 잡힌다
const H = 120;
const RATE_WINDOW = 60;        // 인식률 구간 ≈ 2초
const MIN_PIXELS = 24;         // 이보다 적게 맞으면 잡음으로 본다

export const WEBCAM = Object.freeze({ width: W, height: H, rate_window: RATE_WINDOW, min_pixels: MIN_PIXELS });

export function createWebcamVision() {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';

  const work = document.createElement('canvas');
  work.width = W;
  work.height = H;
  const wctx = work.getContext('2d', { willReadFrequently: true });

  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext('2d');
  const maskData = mctx.createImageData(W, H);

  let stream = null;
  let raf = null;
  let active = false;
  const threshold = { r: 220, g: 60, b: 60, tolerance: 70 };
  let reading = { found: false, offset: 0, area: 0 };
  let blob = null;                       // { x0, y0, x1, y1 } — 마스크 좌표
  const hits = [];
  let frames = 0;

  async function start() {
    if (active) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, reason: '이 브라우저는 웹캠을 지원하지 않습니다.' };
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      return { ok: false, reason: denied ? '웹캠 사용을 허용하지 않았습니다.' : '웹캠을 열 수 없습니다.' };
    }
    document.body.append(video);
    video.srcObject = stream;
    try { await video.play(); } catch (_) { /* 자동재생 차단은 무시 — 프레임은 들어온다 */ }
    active = true;
    loop();
    return { ok: true };
  }

  function stop() {
    active = false;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null;
    video.remove();
  }

  function loop() {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    if (!video.videoWidth) return;
    sample();
  }

  /** 한 프레임 분석. 거울 모드 — 물체를 오른쪽으로 옮기면 화면에서도 오른쪽이다. */
  function sample() {
    wctx.save();
    wctx.translate(W, 0);
    wctx.scale(-1, 1);
    wctx.drawImage(video, 0, 0, W, H);
    wctx.restore();

    const src = wctx.getImageData(0, 0, W, H).data;
    const dst = maskData.data;
    const { r, g, b, tolerance } = threshold;
    const limit = tolerance * tolerance * 3;      // 채널당 평균 오차가 tolerance 이내
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;

    for (let i = 0, px = 0; i < src.length; i += 4, px++) {
      const dr = src[i] - r;
      const dg = src[i + 1] - g;
      const db = src[i + 2] - b;
      const hit = dr * dr + dg * dg + db * db <= limit;
      if (hit) {
        const x = px % W;
        const y = (px / W) | 0;
        count++; sumX += x; sumY += y;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255;
      } else {
        dst[i] = 12; dst[i + 1] = 16; dst[i + 2] = 24; dst[i + 3] = 255;
      }
    }
    mctx.putImageData(maskData, 0, 0);

    const found = count >= MIN_PIXELS;
    if (found) {
      const cx = sumX / count;
      reading = {
        found: true,
        offset: Math.max(-100, Math.min(100, Math.round(((cx / (W - 1)) * 2 - 1) * 100))),
        area: Math.max(0, Math.min(100, Math.round((count / (W * H)) * 100))),
      };
      blob = { x0, y0, x1, y1, cx, cy: sumY / count };
    } else {
      // 놓친 프레임에서는 마지막 값을 유지하지 않는다 — 안 보이면 안 보이는 것이다.
      reading = { found: false, offset: 0, area: 0 };
      blob = null;
    }
    hits.push(found ? 1 : 0);
    while (hits.length > RATE_WINDOW) hits.shift();
    frames++;
  }

  return {
    get active() { return active; },
    get reading() { return reading; },
    get blob() { return blob; },
    get frames() { return frames; },
    get threshold() { return { ...threshold }; },
    /** 최근 RATE_WINDOW 프레임 중 검출된 비율(%) */
    get detectionRate() {
      if (!hits.length) return 0;
      return Math.round((hits.reduce((a, v) => a + v, 0) / hits.length) * 100);
    },
    setThreshold(next) {
      for (const k of ['r', 'g', 'b', 'tolerance']) {
        if (typeof next[k] === 'number') threshold[k] = Math.max(0, Math.min(255, Math.round(next[k])));
      }
      threshold.tolerance = Math.max(1, threshold.tolerance);
    },
    /** 지금 보이는 한 프레임의 픽셀. 학습용 특징 추출에만 쓰고 밖으로 내보내지 않는다. */
    frame() {
      if (!active || !video.videoWidth) return null;
      return { data: wctx.getImageData(0, 0, W, H).data, width: W, height: H };
    },
    /** 화면에 띄울 미리보기 한 장(메모리 전용). 저장·전송하지 않는다. */
    snapshotUrl() {
      if (!active || !video.videoWidth) return null;
      return work.toDataURL('image/jpeg', 0.5);
    },
    get running() { return active && !!video.videoWidth; },
    maskCanvas: mask,
    videoEl: video,
    size: [W, H],
    start,
    stop,
  };
}
