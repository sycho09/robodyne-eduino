/**
 * ui/panels/camera.js — 인식 결과 화면 (모드2).
 *
 * 실제 영상이 아니다. 엔진이 계산한 검출 결과를 도형과 숫자로만 보여준다.
 * 렌더러는 읽기 전용 — sim 을 바꾸지 않는다.
 *
 * 51차 — 이 화면 위에 "왜 그 방향인지" 를 겹쳐 그린다.
 *   가운데 세로 점선 · 덩어리의 테두리 상자와 중심 십자 ·
 *   중심에서 가운데선까지의 화살표와 어긋남 값 · 좌우 절반에 옅은 좌회전/우회전 안내.
 * 원본 화면은 1단이 따로 맡는다(웹캠 영상 또는 RC카가 보는 시뮬 화면).
 */

import { readCamera } from '../../engine/camera.js';
import { ML } from '../../engine/ml.js';

/**
 * 55차 보강4 4-3 — 이 파일은 원래 '색으로 조종하기' 의 인식 결과 화면이다.
 * 2단에 그리는 것이 색 마스크(흑백)와 좌우 어긋남(±값)이고, 그 둘은 색 추종에서만 뜻이 있다.
 * 분류로 판단하는 챌린지(스마트시티·표지판 실습)에 그대로 붙어 있어서, 학생이 "내 학습이
 * 맞았나" 를 확인해야 할 자리에 색 마스크가 떠 있었다.
 *
 * 그래서 2단을 챌린지별로 가른다. classNames 가 오면 분류 화면, 안 오면 지금까지의 색 화면이다.
 *   색 추종  1단 웹캠 원본 · 2단 색 마스크 + 어긋남 + 눈금자
 *   분류     1단 웹캠 원본 · 2단 같은 그림 + 무엇으로 읽었는지 · 확신도 · 모델이 읽는 아홉 칸
 * 값은 전부 추론기가 낸 것을 옮기기만 한다 — 이 파일은 아무것도 다시 세지 않는다.
 */
export function createCameraView({ root, canvas, readout, toggle, body, raw, rawCell, webcam, plates,
  classNames, reading }) {
  const classifies = Array.isArray(classNames) && classNames.length > 0;
  const rawCtx = raw ? raw.getContext('2d') : null;
  const ctx = canvas.getContext('2d');
  let open = true;

  function syncToggle() {
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-role="mark"]').textContent = open ? '접기' : '펼치기';
  }
  toggle.addEventListener('click', () => { open = !open; syncToggle(); });
  syncToggle();

  /**
   * 웹캠 원본 화면 — 중앙 기준선과 덩어리 위치를 겹쳐 그린다.
   * 카메라가 아직 안 붙었어도 칸은 남긴다 — 1단이 통째로 사라지면 2단 구조가 보이지 않는다.
   */
  function drawRaw() {
    if (!rawCtx) return;
    if (!webcam || !webcam.active) { drawRawIdle(); return; }
    const dpr = window.devicePixelRatio || 1;
    const w = raw.clientWidth || 1;
    const h = raw.clientHeight || 1;
    if (raw.width !== Math.round(w * dpr) || raw.height !== Math.round(h * dpr)) {
      raw.width = Math.round(w * dpr); raw.height = Math.round(h * dpr);
    }
    rawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rawCtx.fillStyle = css('--c-camview-bg');
    rawCtx.fillRect(0, 0, w, h);
    const [vw, vh] = webcam.size;
    const k = Math.min(w / vw, h / vh);
    const dw = vw * k;
    const dh = vh * k;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    // 거울 모드로 이미 뒤집힌 프레임을 그대로 쓴다(마스크 캔버스와 같은 좌표계).
    rawCtx.save();
    rawCtx.translate(ox, oy);
    rawCtx.scale(-1, 1);
    rawCtx.drawImage(webcam.videoEl, -dw, 0, dw, dh);
    rawCtx.restore();
    const blob = webcam.blob;
    if (blob) {
      rawCtx.strokeStyle = css('--c-marker');
      rawCtx.lineWidth = 2;
      rawCtx.strokeRect(ox + blob.x0 * k, oy + blob.y0 * k, (blob.x1 - blob.x0) * k, (blob.y1 - blob.y0) * k);
    }
    rawCtx.beginPath();
    rawCtx.moveTo(w / 2, 0); rawCtx.lineTo(w / 2, h);
    rawCtx.setLineDash([4, 4]); rawCtx.lineWidth = 1;
    rawCtx.strokeStyle = css('--c-camview-guide');
    rawCtx.stroke(); rawCtx.setLineDash([]);
  }

  /** 카메라가 꺼져 있을 때의 1단. 무엇을 기다리는 칸인지 한 줄로 적는다. */
  function drawRawIdle() {
    const dpr = window.devicePixelRatio || 1;
    const w = raw.clientWidth || 1;
    const h = raw.clientHeight || 1;
    if (raw.width !== Math.round(w * dpr) || raw.height !== Math.round(h * dpr)) {
      raw.width = Math.round(w * dpr); raw.height = Math.round(h * dpr);
    }
    rawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rawCtx.fillStyle = css('--c-camview-bg');
    rawCtx.fillRect(0, 0, w, h);
    rawCtx.fillStyle = css('--c-text-faint');
    rawCtx.font = `600 12px ${css('--font-ui') || 'sans-serif'}`;
    rawCtx.textAlign = 'center';
    rawCtx.textBaseline = 'middle';
    rawCtx.fillText('카메라를 켜면 여기에 보입니다', w / 2, h / 2);
  }

  const RULER_PX = 18;

  /**
   * 인식 결과 위에 겹쳐 그리는 것들. 마스크 경로와 도형 경로가 같은 것을 쓴다 —
   * 두 곳에 따로 그리면 웹캠과 시뮬에서 화면이 달라 보인다.
   *
   * box 는 화면 좌표(px)로 받은 덩어리의 테두리다. 없으면 안내만 그린다.
   */
  function drawOverlay(ctx, w, fh, cam, box) {
    // 좌우 절반 안내. 옅게 깔아 두어 어느 쪽이 어느 회전인지 늘 보이게 한다.
    // 아래쪽에 둔다 — 위는 칸 이름표가 덮는다.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = css('--c-text-faint');
    ctx.font = `600 10px ${css('--font-ui') || 'sans-serif'}`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('왼쪽 = 좌회전', 6, fh - 5);
    ctx.textAlign = 'right';
    ctx.fillText('오른쪽 = 우회전', w - 6, fh - 5);
    ctx.restore();

    // 가운데 세로 점선
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, fh);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = css('--c-camview-guide');
    ctx.stroke();
    ctx.setLineDash([]);

    if (!cam.found || !box) return;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const mark = css('--c-marker');

    // 테두리 상자
    ctx.strokeStyle = mark;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    // 중심 십자
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
    ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 중심에서 가운데선까지의 화살표. 이 길이가 곧 어긋남이다.
    const mid = w / 2;
    if (Math.abs(cx - mid) > 2) {
      const dir = cx > mid ? -1 : 1;      // 가운데로 되돌리는 방향
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(mid, cy);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mid, cy);
      ctx.lineTo(mid - dir * 6, cy - 4);
      ctx.lineTo(mid - dir * 6, cy + 4);
      ctx.closePath();
      ctx.fillStyle = mark;
      ctx.fill();
    }

    // 어긋남 값. 화살표 위에 붙여 화면 안에서 값이 어디서 나왔는지 잇는다.
    const label = `${cam.offset > 0 ? '+' : ''}${cam.offset}`;
    ctx.font = `700 12px ${css('--font-gauge') || css('--font-ui') || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tx = Math.min(w - 18, Math.max(18, (cx + mid) / 2));
    ctx.lineWidth = 3;
    ctx.strokeStyle = css('--c-camview-bg');
    ctx.strokeText(label, tx, cy - 8);
    ctx.fillStyle = mark;
    ctx.fillText(label, tx, cy - 8);
  }

  /** 인식 영역 — 임계값을 통과한 픽셀만. 아래 18px 은 오프셋 눈금자 자리다. */
  function drawMask(cam) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--c-camview-bg');
    ctx.fillRect(0, 0, w, h);
    const fh = h - RULER_PX;
    const [vw, vh] = webcam.size;
    const k = Math.min(w / vw, fh / vh);
    const dw = vw * k;
    const dh = vh * k;
    const ox = (w - dw) / 2;
    const oy = (fh - dh) / 2;
    ctx.drawImage(webcam.maskCanvas, ox, oy, dw, dh);
    const blob = webcam.blob;
    const box = blob
      ? { x: ox + blob.x0 * k, y: oy + blob.y0 * k, w: (blob.x1 - blob.x0) * k, h: (blob.y1 - blob.y0) * k }
      : null;
    drawOverlay(ctx, w, fh, cam, box);
    drawOffsetRuler(ctx, w, fh, RULER_PX, cam);
  }

  /**
   * 분류 화면. 1단과 같은 그림 위에 판단을 얹는다 —
   * 무엇으로 읽었는지 · 확신도 · 세 후보의 막대 · 모델이 실제로 읽는 아홉 칸의 색.
   * 아홉 칸은 특징 벡터(extractFeature)가 낸 값 그대로다. 여기서 다시 세지 않는다.
   */
  function drawClassify() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--c-camview-bg');
    ctx.fillRect(0, 0, w, h);
    const [vw, vh] = webcam.size;
    const k = Math.min(w / vw, h / vh);
    const dw = vw * k;
    const dh = vh * k;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    // 1단과 같은 좌표계(거울 모드)로 그린다. 두 칸이 어긋나면 대응이 흐려진다.
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(webcam.videoEl, -dw, 0, dw, dh);
    ctx.restore();
    // 판단이 잘 보이도록 그림을 살짝 눌러 둔다. 원본은 1단이 맡는다.
    ctx.fillStyle = 'rgba(10, 14, 20, .42)';
    ctx.fillRect(ox, oy, dw, dh);

    const r = reading ? reading() : null;
    const g = ML.grid;
    const f = r && Array.isArray(r.feature) ? r.feature : null;
    // 모델이 읽는 아홉 칸. 격자와, 칸마다 그 칸의 평균색 동그라미.
    ctx.strokeStyle = 'rgba(233, 240, 250, .28)';
    ctx.lineWidth = 1;
    for (let i = 1; i < g; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + (dw * i) / g, oy); ctx.lineTo(ox + (dw * i) / g, oy + dh);
      ctx.moveTo(ox, oy + (dh * i) / g); ctx.lineTo(ox + dw, oy + (dh * i) / g);
      ctx.stroke();
    }
    if (f) {
      const rad = Math.max(3, Math.min(dw / g, dh / g) * 0.16);
      for (let cy = 0; cy < g; cy++) {
        for (let cx = 0; cx < g; cx++) {
          const cell = cy * g + cx;
          // 거울 모드로 그린 그림 위에 얹으므로 칸도 좌우를 뒤집어 놓는다.
          const px = ox + dw - (dw * (cx + 0.5)) / g;
          const py = oy + (dh * (cy + 0.5)) / g;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${f[cell * 3] | 0}, ${f[cell * 3 + 1] | 0}, ${f[cell * 3 + 2] | 0})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(8, 12, 20, .7)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    const name = r && r.label ? (classNames[r.label - 1] || '?') : '모름';
    const conf = r ? r.confidence : 0;
    // 글자는 아홉 칸 위에 그대로 얹으면 읽히지 않는다. 어두운 판을 깔고 그 위에 적는다.
    const plate = (x, y, pw, ph) => {
      ctx.fillStyle = 'rgba(8, 12, 20, .74)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 6); ctx.fill(); }
      else ctx.fillRect(x, y, pw, ph);
    };
    ctx.font = `800 17px ${css('--font-ui') || 'sans-serif'}`;
    const nameW = ctx.measureText(name).width;
    ctx.font = `700 11px ${css('--font-gauge') || css('--font-ui') || 'monospace'}`;
    const confText = `확신도 ${conf}%`;
    const headW = Math.max(nameW, ctx.measureText(confText).width) + 16;
    plate(ox + 6, oy + 6, Math.min(headW, dw - 12), 42);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 17px ${css('--font-ui') || 'sans-serif'}`;
    ctx.fillStyle = r && r.label ? css('--c-marker') : css('--c-text-faint');
    ctx.fillText(name, ox + 14, oy + 11);
    ctx.font = `700 11px ${css('--font-gauge') || css('--font-ui') || 'monospace'}`;
    ctx.fillStyle = css('--c-text-dim');
    ctx.fillText(confText, ox + 14, oy + 32);

    // 세 후보 막대. 값은 추론기가 낸 점수 그대로다.
    const scores = r && Array.isArray(r.scores) ? r.scores : [];
    const bh = 7;
    const gap = 5;
    ctx.font = `700 10px ${css('--font-ui') || 'sans-serif'}`;
    const keyW = Math.max(...classNames.map((n) => ctx.measureText(n).width));
    const bw = Math.max(38, Math.min(96, dw - keyW - 34));
    const blockW = keyW + bw + 20;
    const blockH = classNames.length * (bh + gap) + gap;
    const blockX = ox + dw - 6 - blockW;
    const blockY = oy + dh - 6 - blockH;
    plate(blockX, blockY, blockW, blockH);
    let by = blockY + gap;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < classNames.length; i++) {
      const v = Math.max(0, Math.min(100, Number(scores[i]) || 0));
      const bx = blockX + 10 + keyW + 6;
      ctx.fillStyle = 'rgba(233, 240, 250, .18)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = (r && r.label === i + 1) ? css('--c-marker') : 'rgba(233, 240, 250, .5)';
      ctx.fillRect(bx, by, (bw * v) / 100, bh);
      ctx.textAlign = 'right';
      ctx.fillStyle = css('--c-text-dim');
      ctx.fillText(classNames[i], bx - 6, by + bh / 2);
      by += bh + gap;
    }
  }

  function update(sim) {
    const cam = readCamera(sim);
    if (readout.isConnected) {
      // 분류 챌린지에서는 어긋남·크기가 뜻이 없다. 무엇으로 읽었는지를 적는다.
      if (classifies) {
        const r = reading ? reading() : null;
        const name = r && r.label ? (classNames[r.label - 1] || '?') : '모름';
        readout.textContent = r && r.label ? `${name} · 확신도 ${r.confidence}%` : '아직 모름';
        readout.classList.toggle('camview__read--on', !!(r && r.label));
      } else {
        readout.textContent = cam.found
          ? `offset ${cam.offset > 0 ? '+' : ''}${cam.offset} · area ${cam.area}`
          : '검출 없음 · 0 · 0';
        readout.classList.toggle('camview__read--on', cam.found);
      }
    }
    if (!open) return;
    if (webcam) drawRaw();
    if (webcam && webcam.active) {
      if (classifies) drawClassify(); else drawMask(cam);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 아래 16px 은 오프셋 눈금자. 나머지가 '화면'이다.
    const RULER = 18;
    const fh = h - RULER;
    ctx.fillStyle = css(cam.found ? '--c-camview-bg-on' : '--c-camview-bg');
    ctx.fillRect(0, 0, w, fh);
    ctx.lineWidth = 1;
    ctx.strokeStyle = css(cam.found ? '--c-marker' : '--c-camview-guide');
    ctx.strokeRect(0.5, 0.5, w - 1, fh - 1);

    let box = null;
    if (cam.found) {
      // 덩어리: 가로 위치는 offset, 한 변은 area 에서만 나온다.
      const size = Math.max(8, (cam.area / 100) * w);
      const cx = w / 2 + (cam.offset / 100) * (w / 2);
      // 53차 — 세로는 1단(RC카가 보는 화면)이 마커를 그린 자리를 그대로 따른다.
      // 2단은 스스로 투영하지 않는다. 투영식은 1단 하나뿐이고, 여기서 또 계산하면
      // 두 화면이 어긋난다 — 51차에 그렇게 39~67px 이 어긋나 있었다.
      // 어느 판인지는 엔진이 낸 offset 으로 고른다(고르는 규칙을 여기서 다시 짜지 않는다).
      const drawn = plates ? plates() : [];
      let cy = fh / 2;
      if (drawn.length) {
        const wantX = 0.5 + (cam.offset / 100) / 2;
        const near = drawn.reduce((a, b) => (Math.abs(a.cx - wantX) <= Math.abs(b.cx - wantX) ? a : b));
        cy = near.cy * fh;
      }
      box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
      ctx.fillStyle = css('--c-marker');
      ctx.globalAlpha = 0.42;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = css('--c-text-faint');
      ctx.font = `600 11px ${css('--font-ui') || 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('색 없음', w / 2, fh / 2);
    }

    drawOverlay(ctx, w, fh, cam, box);
    drawOffsetRuler(ctx, w, fh, RULER, cam);
  }

  return {
    show(on) { root.hidden = !on; },
    update,
  };
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}


/** -100 ~ +100 눈금자와 현재 오프셋 표시. 시뮬·웹캠 두 경로가 같은 것을 쓴다. */
function drawOffsetRuler(ctx, w, fh, ruler, cam) {
  const ry = fh + ruler / 2;
  ctx.beginPath();
  ctx.moveTo(2, ry);
  ctx.lineTo(w - 2, ry);
  ctx.strokeStyle = css('--c-camview-guide');
  ctx.lineWidth = 1;
  ctx.stroke();
  for (const t of [-100, 0, 100]) {
    const x = w / 2 + (t / 100) * (w / 2 - 2);
    ctx.beginPath();
    ctx.moveTo(x, ry - 3);
    ctx.lineTo(x, ry + 3);
    ctx.stroke();
  }
  if (cam.found) {
    const x = w / 2 + (cam.offset / 100) * (w / 2 - 2);
    ctx.beginPath();
    ctx.moveTo(x, ry - 6);
    ctx.lineTo(x - 4, ry - 1);
    ctx.lineTo(x + 4, ry - 1);
    ctx.closePath();
    ctx.fillStyle = css('--c-marker');
    ctx.fill();
  }
}
