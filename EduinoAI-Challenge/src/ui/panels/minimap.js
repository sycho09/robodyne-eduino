/**
 * ui/panels/minimap.js — 미니 탑뷰.
 *
 * 아이소메트릭에서는 잘 안 보이는 미세한 휘어짐을 위에서 내려다보며 확인하는 창이다.
 * 읽기 전용 — sim 을 바꾸지 않는다. 형상은 track.centerline 하나로 처리하므로
 * 사각이든 8자든 같은 코드가 그린다.
 */

import { frameIndexFor } from './track.js';

// 54차 — 여백은 mm 가 아니라 화면 px 로 잡는다. mm 로 잡으면 창이 작아질수록
// 여백까지 같이 줄어 트랙이 테두리에 닿는다. 사방 26px 고정.
const PAD_PX = 26;

export function createMinimap({ canvas, assets }) {
  const ctx = canvas.getContext('2d');
  // 레이아웃이 아직 잡히기 전에 그려도 캔버스가 손도 안 댄 기본 크기(300x150)로 남지 않게 한다.
  // 크기를 못 재면 부모 폭과 CSS 높이를 그대로 쓴다.
  const FALLBACK = [300, 176];
  function box() {
    const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || FALLBACK[0];
    const h = canvas.clientHeight || FALLBACK[1];
    return [w, h];
  }

  function draw(sim) {
    const dpr = window.devicePixelRatio || 1;
    const [w, h] = box();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(ctx, sim, w, h, assets, themeOf());
  }

  /**
   * 색은 캔버스가 놓인 자리에서 읽는다(54차).
   * 루트에서만 읽으면 오른쪽 관제 칸이 자기 색을 덮어써도 그림은 옛 색 그대로다 —
   * 실제로 그렇게 됐다. 없는 값은 빈 문자열이라 아래에서 루트 기본값으로 떨어진다.
   */
  function themeOf() {
    const cs = getComputedStyle(canvas);
    const g = (name) => cs.getPropertyValue(name).trim();
    return {
      bg: g('--c-minimap-bg'),
      band: g('--c-minimap-band'),
      edge: g('--c-minimap-edge'),
      center: g('--c-minimap-center'),
      trail: g('--c-trail'),
    };
  }
  return { draw };
}

/** 화면용과 내보내기용이 같은 그림을 내도록 그리기 본체는 하나만 둔다. */
export function drawMinimap(ctx, sim, w, h, assets, theme) {
    const paint = theme || {};
    ctx.fillStyle = paint.bg || css('--c-minimap-bg');
    ctx.fillRect(0, 0, w, h);

    const track = sim.track;
    const pts = track.centerline || [];
    if (!pts.length) return;
    // 트랙 바깥 테두리에 딱 맞춘다. 담는 것은 코스뿐이고 여백은 사방 26px 이다.
    const reach = track.outerHalf;
    const scale = Math.min(
      Math.max(w - PAD_PX * 2, 1) / (2 * reach),
      Math.max(h - PAD_PX * 2, 1) / (2 * reach),
    );
    const toPx = (x, y) => [w / 2 + x * scale, h / 2 - y * scale];   // y 위쪽(+)

    // 대역: 중심선을 굵은 선으로 한 번에 긋는다(모서리·교차부가 저절로 메워진다)
    const line = () => {
      ctx.beginPath();
      const a = toPx(pts[0][0], pts[0][1]);
      ctx.moveTo(a[0], a[1]);
      for (let i = 1; i < pts.length; i++) {
        const p = toPx(pts[i][0], pts[i][1]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    line();
    ctx.lineWidth = track.width * scale;
    ctx.strokeStyle = paint.band || css('--c-minimap-band');
    ctx.stroke();
    // 대역 테두리 — 주행 전에도 코스 모양이 또렷하게 보여야 한다.
    line();
    ctx.lineWidth = track.width * scale + 3;
    ctx.strokeStyle = paint.edge || css('--c-minimap-edge');
    ctx.globalCompositeOperation = 'destination-over';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    line();
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = paint.center || css('--c-minimap-center');
    ctx.stroke();
    ctx.setLineDash([]);

    // 체크포인트 — 결승선은 굵게, 나머지는 점선. 주행 여부와 무관하게 항상 그린다.
    for (const cp of track.checkpoints) {
      const tx = -cp.ny;
      const ty = cp.nx;
      const isFinish = cp.id === track.lap.finish;
      const a = toPx(cp.x + tx * cp.halfSpan, cp.y + ty * cp.halfSpan);
      const b = toPx(cp.x - tx * cp.halfSpan, cp.y - ty * cp.halfSpan);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineWidth = isFinish ? 2.5 : 1.5;
      ctx.setLineDash(isFinish ? [] : [4, 4]);
      ctx.strokeStyle = isFinish ? css('--c-finish') : css('--c-checkpoint');
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 궤적 — 여기가 이 창의 존재 이유다. 미세한 휘어짐이 그대로 드러난다.
    if (sim.trail.length >= 2) {
      ctx.beginPath();
      const first = toPx(sim.trail[0].x, sim.trail[0].y);
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < sim.trail.length; i++) {
        const p = toPx(sim.trail[i].x, sim.trail[i].y);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = (paint && paint.trail) || css('--c-trail');
      ctx.stroke();
      // 진행 방향 화살표. 시뮬 화면과 같은 규칙이다 — 간격은 거리(mm)이고
      // 출발점부터 누적한다. 같은 코드를 두 번 돌리면 같은 자리에 찍힌다.
      const stepMm = sim.challenge && sim.challenge.scene
        ? (sim.challenge.scene.trail_arrow_mm | 0) : 0;
      if (stepMm > 0) drawTrailArrows(ctx, sim.trail, stepMm, toPx, paint);
    }

    drawCar(ctx, sim, toPx, scale, assets, paint);

    // 지금 자리. 차 그림 위에 흰 점 하나를 얹는다 — 작게 그려도 어디 있는지는 보여야 한다.
    const here = toPx(sim.vehicle.x, sim.vehicle.y);
    ctx.beginPath();
    ctx.arc(here[0], here[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
}

/** 지나간 길 위의 진행 방향 화살표. 거리 기준이라 시간과 무관하다(54차 파트E). */
function drawTrailArrows(ctx, trail, stepMm, toPx, paint) {
  let acc = 0;
  let next = stepMm;
  ctx.fillStyle = (paint && paint.trail) || css('--c-trail');
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= 0) continue;
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      const p = toPx(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      const q = toPx(b.x, b.y);
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      next += stepMm;
      if (len < 0.001) continue;
      const ux = dx / len;
      const uy = dy / len;
      const H = 5;
      const W = 3;
      ctx.beginPath();
      ctx.moveTo(p[0] + ux * H, p[1] + uy * H);
      ctx.lineTo(p[0] - ux * H * 0.4 - uy * W, p[1] - uy * H * 0.4 + ux * W);
      ctx.lineTo(p[0] - ux * H * 0.4 + uy * W, p[1] - uy * H * 0.4 - ux * W);
      ctx.closePath();
      ctx.fill();
    }
    acc += seg;
  }
}

// 차량은 11차 이전 탑뷰 에셋을 그대로 쓴다. 없으면 삼각형으로 폴백한다.
function drawCar(ctx, sim, toPx, scale, assets, paint) {
    const v = sim.vehicle;
    const [cx, cy] = toPx(v.x, v.y);
    const art = assets && assets.resolve(sim.kit.assets && sim.kit.assets.car);
    if (art && art.kind === 'frames' && art.meta) {
      const drawW = art.meta.frame_px * art.meta.mm_per_px * scale;
      if (drawW >= 6) {
        const idx = frameIndexFor(v.heading_mdeg, art.meta);
        const k = drawW / art.meta.frame_px;
        const px = cx - (art.meta.pivot_px ? art.meta.pivot_px[0] : art.meta.frame_px / 2) * k;
        const py = cy - (art.meta.pivot_px ? art.meta.pivot_px[1] : art.meta.frame_px / 2) * k;
        if (art.frames[idx]) {
          ctx.drawImage(art.frames[idx], px, py, drawW, drawW);
          return;
        }
      }
    }
    const rad = (v.heading_mdeg / 1000) * Math.PI / 180;
    const r = Math.max(4, sim.kit.body.width_mm * 0.6 * scale);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r, cy - Math.sin(rad) * r);
    ctx.lineTo(cx + Math.cos(rad + 2.5) * r * 0.8, cy - Math.sin(rad + 2.5) * r * 0.8);
    ctx.lineTo(cx + Math.cos(rad - 2.5) * r * 0.8, cy - Math.sin(rad - 2.5) * r * 0.8);
    ctx.closePath();
    ctx.fillStyle = sim.offtrack.active ? css('--c-car-off') : ((paint && paint.car) || css('--c-minimap-car'));
    ctx.fill();
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
