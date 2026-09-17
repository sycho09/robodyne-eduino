/**
 * ui/panels/overview.js — 관제용 전체뷰.
 *
 * 1인칭만 보면 지금 어디쯤인지 모른다. 코스 전체를 위에서 내려다보며
 * RC카 위치·진행 방향, 각 신호등의 색, 움직이는 장애물의 자리를 한 화면에 보여 준다.
 *
 * 시야 부채꼴은 1인칭이 지금 보고 있는 범위 그대로다 — 화각은 FPV 상수를 그대로 참조하고
 * 사거리는 매니페스트가 소유한다. 부채꼴 안에 든 것은 밝게, 밖은 흐리게 그려
 * "화면에 안 보이는 것"과 "거기 없는 것"을 구분한다.
 *
 * 읽기 전용이다 — sim 을 건드리지 않는다. 물리·판정·기록과는 아무 상관이 없다.
 */

import { signalColorOf } from '../../engine/decisions.js';
import { OBSTACLE, obstacleAt, obstacleState } from '../../engine/obstacles.js';
import { nearestOnPath } from '../../engine/autopilot.js';
import { FPV } from './firstperson.js';

const PAD_MM = 400;

export function createOverview({ canvas, challenge }) {
  const ctx = canvas.getContext('2d');
  // 화각·사거리는 매니페스트가 소유한다 — 1인칭 렌더도 상황 판단도 같은 값을 본다.
  const view = (challenge && challenge.scene && challenge.scene.camera_view) || null;
  const viewRange = view ? view.range_mm : 0;

  function draw(sim) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 172;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pts = (sim.track && sim.track.centerline) || [];
    if (!pts.length) return;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const spanX = maxX - minX + PAD_MM * 2;
    const spanY = maxY - minY + PAD_MM * 2;
    const scale = Math.min(w / spanX, h / spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toPx = (x, y) => [w / 2 + (x - cx) * scale, h / 2 - (y - cy) * scale];

    const v = sim.vehicle;
    const hd = (v.heading_mdeg / 1000) * (Math.PI / 180);
    const halfFov = ((view ? view.fov_deg : FPV.fov_deg) / 2) * (Math.PI / 180);
    /** 지금 1인칭 화면 안에 들어와 있는가. 밝기만 정한다 — 판정과는 무관하다. */
    const inView = (x, y) => {
      if (!viewRange) return true;
      const dx = x - v.x;
      const dy = y - v.y;
      const dist = Math.hypot(dx, dy);
      if (dist > viewRange) return false;
      if (dist < 1) return true;
      let a = Math.atan2(dy, dx) - hd;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return Math.abs(a) <= halfFov;
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const a0 = toPx(pts[0][0], pts[0][1]);
    ctx.moveTo(a0[0], a0[1]);
    for (let i = 1; i < pts.length; i++) {
      const p = toPx(pts[i][0], pts[i][1]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.strokeStyle = css('--c-minimap-band') || '#cfd8e6';
    ctx.lineWidth = Math.max(4, (sim.track.width_mm || 360) * scale);
    ctx.stroke();

    // 지나간 길
    const trail = sim.trail || [];
    if (trail.length > 1) {
      ctx.beginPath();
      const t0 = toPx(trail[0].x, trail[0].y);
      ctx.moveTo(t0[0], t0[1]);
      for (let i = 1; i < trail.length; i++) {
        const p = toPx(trail[i].x, trail[i].y);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.strokeStyle = css('--c-trail') || '#0f6fd1';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // 시야 부채꼴 — 1인칭과 같은 화각, 사거리는 매니페스트가 정한다.
    const [vx, vy] = toPx(v.x, v.y);
    if (viewRange) {
      const r = viewRange * scale;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.arc(vx, vy, r, -hd - halfFov, -hd + halfFov);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 220, 150, 0.16)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 220, 150, 0.42)';
      ctx.stroke();
    }

    // 판단 지점 — 신호등이면 지금 색으로 찍는다.
    const cfg = sim.decisions;
    if (cfg) {
      for (const d of cfg.list) {
        const [px, py] = toPx(d.x, d.y);
        const color = signalColorOf(sim, d, sim.tick);
        ctx.globalAlpha = inView(d.x, d.y) ? 1 : 0.4;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color ? dotOf(color) : '#8a9cb6';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(10,16,26,.7)';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 움직이는 장애물 — 보행자는 점, 차단기는 막대. 막혀 있으면 붉게.
    const obs = sim.obstacles;
    if (obs) {
      for (const o of obs.list) {
        const st = obstacleAt(obs, o, sim.tick, obstacleState(sim));
        const [px, py] = toPx(st.x, st.y);
        ctx.globalAlpha = inView(st.x, st.y) ? 1 : 0.4;
        ctx.fillStyle = st.blocking ? '#ff5a4a' : '#e7ecf4';
        ctx.strokeStyle = 'rgba(10,16,26,.75)';
        ctx.lineWidth = 1;
        if (o.kind === OBSTACLE.GATE) {
          // 차단기는 길을 가로지르는 막대다 — 그 자리 도로 방향에 직각으로 세운다.
          const near = nearestOnPath(pts, st.x, st.y);
          const a = pts[near.i];
          const b = pts[(near.i + 1) % pts.length];
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(-ang);
          ctx.beginPath();
          ctx.rect(-2, -8, 4, 16);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // RC카 — 화살표 + 펄스
    const pulse = 6 + 4 * (0.5 + 0.5 * Math.sin(sim.tick / 8));
    ctx.beginPath();
    ctx.arc(vx, vy, pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 143, 122, 0.22)';
    ctx.fill();

    ctx.save();
    ctx.translate(vx, vy);
    ctx.rotate(-hd);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, 4.5);
    ctx.lineTo(-5, -4.5);
    ctx.closePath();
    ctx.fillStyle = css('--c-gauge-stage') || '#ff8f7a';
    ctx.fill();
    ctx.restore();
  }

  return { draw };
}

function dotOf(color) {
  if (color === 'red') return '#ff5a4a';
  if (color === 'yellow') return '#ffcc4d';
  return '#3ce398';
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
