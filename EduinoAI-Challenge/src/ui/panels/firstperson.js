/**
 * ui/panels/firstperson.js — RC카 1인칭 의사 3D 뷰 (캔버스 2D).
 *
 * 3D 엔진을 쓰지 않는다. 코스 중심선을 앞쪽으로 잘게 잘라 카메라 좌표로 옮기고
 * 원근으로 눌러 그리는 고전 레이싱 게임 방식이다. 좌표는 시뮬이 쓰는 그 좌표 그대로라
 * 코너에서 도로가 휘는 것도, 오브젝트가 서 있는 자리도 저절로 맞는다.
 *
 * 읽기 전용이다 — sim 을 건드리지 않는다. 물리·랩타임·이탈 판정과는 아무 상관이 없다.
 */

import { nearestOnPath } from '../../engine/autopilot.js';
import { expectOf, signalColorOf } from '../../engine/decisions.js';
import { OBSTACLE, obstacleAt, obstacleState } from '../../engine/obstacles.js';

/**
 * 차단기 팔이 도는 축의 높이(mm). 팔은 여기서 노면을 가로지르거나 하늘로 선다.
 * 카메라가 90mm 높이라 이보다 너무 높으면 화면 위로 올라가 길을 막는 것으로 보이지 않는다.
 */
const GATE_PIVOT_MM = 140;
const GATE_ARM_MM = 45;      // 팔 두께

const SPRITE_URL = new URL('../../../assets/sprites/city/city.sprites.json', import.meta.url);

export const FPV = Object.freeze({
  cam_height_mm: 90,      // 실물 ESP32-CAM 이 붙는 높이
  fov_deg: 90,           // 90도 코너에서 꺾을 방향이 화면 안에 들어와야 한다. 렌더 전용 값이다.
  step_mm: 100,           // 도로 세그먼트 간격
  far_mm: 6000,           // 이만큼 앞까지 그린다
  near_mm: 60,            // 이보다 가까운 것은 그리지 않는다(투영이 발산한다)
  lane_near_mm: 300,      // 중앙선은 이보다 가까우면 덩어리로 번져 보인다 — 실제 차의 보닛에 가리는 자리다
  horizon: 0.42,          // 화면 높이 대비 지평선 위치
  hood: 0.13,             // 화면 아래를 덮는 차체 앞부분 높이(화면 높이 대비)
});

export function createFirstPerson({ canvas, challenge }) {
  const ctx = canvas.getContext('2d');
  const sprites = new Map();     // key → { img, height_mm, width_mm }
  let ready = false;

  // 스프라이트는 없어도 화면이 도록 만든다 — 도착하면 그때부터 쓴다.
  fetch(SPRITE_URL).then((r) => (r.ok ? r.json() : null)).then((meta) => {
    if (!meta) return;
    for (const [key, info] of Object.entries(meta.sprites || {})) {
      const img = new Image();
      img.src = new URL(info.image, SPRITE_URL).href;
      sprites.set(key, { img, height_mm: info.height_mm, width_mm: info.width_mm, lamp_y: info.lamp_y });
    }
    ready = true;
  }).catch(() => { /* 에셋이 없으면 형상만으로 그린다 */ });

  // 이번 프레임에 그린 마커 판의 자리(0~1 로 정규화). 2단이 읽어 간다.
  let plates = [];
  const city = (challenge.scene && challenge.scene.city) || [];
  // 51차 — 색 추적 챌린지의 1단이 이 화면이다. 코너에 선 색 마커가 보여야
  // "카메라가 무엇을 보고 도는지" 가 화면에서 읽힌다. 자리·크기·색은 매니페스트가 소유한다.
  const markers = (challenge.scene && challenge.scene.markers) || [];
  // 원경 도시 실루엣을 그릴지. 테마가 도시일 때만 그린다 — 테마는 매니페스트가 소유한다.
  const skyline = (challenge.scene && challenge.scene.theme) !== 'warehouse';
  // 화각은 매니페스트가 소유한다. 상황 판단(engine/decisions.js)도 같은 값을 본다 —
  // 그래야 "화면에 보이는 순간" 과 "정답이 바뀌는 순간" 이 어긋나지 않는다.
  const fovDeg = (challenge.scene && challenge.scene.camera_view && challenge.scene.camera_view.fov_deg) || FPV.fov_deg;

  function box() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 360;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  function draw(sim) {
    plates = [];                    // 프레임마다 새로 모은다
    const [W, H] = box();
    const v = sim.vehicle;
    const hd = (v.heading_mdeg / 1000) * (Math.PI / 180);
    const cos = Math.cos(hd);
    const sin = Math.sin(hd);
    const focal = (W / 2) / Math.tan((fovDeg / 2) * (Math.PI / 180));
    const horizon = H * FPV.horizon;
    const cx = W / 2;

    /** 월드 좌표 → 카메라 좌표(앞·옆). 앞이 양수여야 화면에 있다. */
    const toCam = (x, y) => {
      const dx = x - v.x;
      const dy = y - v.y;
      return [dx * cos + dy * sin, -dx * sin + dy * cos];
    };
    /** 카메라 좌표 → 화면. z 는 앞 거리(mm), zh 는 지면에서의 높이(mm). */
    // lat 은 카메라 왼쪽이 양수, 화면 x 는 오른쪽이 양수 — 부호를 뒤집어야 좌우가 맞는다.
    const project = (fwd, lat, zh) => [cx - (focal * lat) / fwd, horizon + (focal * (FPV.cam_height_mm - zh)) / fwd];

    // ── 하늘과 원경 ────────────────────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, css('--c-fpv-sky-top') || '#2b3a52');
    sky.addColorStop(1, css('--c-fpv-sky-bottom') || '#6b7d95');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);

    // 원경 실루엣은 헤딩에 따라 천천히 흐른다 — 가까운 것보다 느려야 깊이가 산다.
    // 51차: 도시 실루엣이므로 도시 씬에서만 그린다. 물류창고에 도시가 서 있으면
    // "RC카가 보는 화면" 이 어느 공간인지 어긋나 읽힌다.
    const drift = ((-hd / (2 * Math.PI)) * W * 2) % (W / 3);
    ctx.fillStyle = css('--c-fpv-far') || '#3d4a5e';
    for (let i = -2; i < 8 && skyline; i++) {
      const bx = drift + i * (W / 3);
      const bw = W / 9;
      const bh = 18 + ((i % 3) + 1) * 14;
      ctx.fillRect(bx, horizon - bh, bw, bh);
      ctx.fillRect(bx + bw * 1.25, horizon - bh * 0.6, bw * 0.7, bh * 0.6);
    }

    ctx.fillStyle = css('--c-fpv-ground') || '#20262f';
    ctx.fillRect(0, horizon, W, H - horizon);

    const track = sim.track;
    const pts = track.centerline || [];
    if (!pts.length) return;

    // ── 도로 ───────────────────────────────────────────────────
    const near = nearestOnPath(pts, v.x, v.y);
    const half = track.width_mm ? track.width_mm / 2 : 180;
    const walk = half + 180;
    const acc = [0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = acc[acc.length - 1];
    const segLen = (i) => acc[i + 1] - acc[i];
    const s0 = near ? acc[near.i] + segLen(near.i) * near.t : 0;

    /** 진행 거리 s 가 어느 구간의 어디인지. */
    const locate = (s) => {
      let t = ((s % total) + total) % total;
      let i = 0;
      while (i < pts.length - 1 && t > segLen(i)) { t -= segLen(i); i += 1; }
      return [i, t];
    };
    /** 구간 i 의 t 지점에서의 중심점과 좌우 법선. */
    const atSeg = (i, t) => {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      return { x: a[0] + ux * t, y: a[1] + uy * t, nx: -uy, ny: ux };
    };
    /** 진행 거리 s 에서의 중심점과 좌우 법선. */
    const at = (s) => { const [i, t] = locate(s); return atSeg(i, t); };

    // 도로는 구간을 따라 잘라 붙인다. 꼭짓점에서는 법선이 90도 꺾이므로
    // 들어오는 쪽 법선으로 한 번, 나가는 쪽 법선으로 한 번 — 두 번 끊어야 면이 뒤틀리지 않는다.
    const road = [];
    const sample = (i, t, s) => {
      const p = atSeg(i, t);
      const rows = [];
      for (const w of [-walk, -half, half, walk]) rows.push(toCam(p.x + p.nx * w, p.y + p.ny * w));
      road.push({ rows, fwd: toCam(p.x, p.y)[0], s, seg: i });
    };
    let prev = null;
    for (let d = 0; d <= FPV.far_mm; d += FPV.step_mm) {
      const s = s0 + d;
      const [i, t] = locate(s);
      if (prev && i !== prev.i) {
        const vs = prev.s + (segLen(prev.i) - prev.t);   // 꼭짓점까지의 거리
        sample(prev.i, segLen(prev.i), vs);
        sample(i, 0, vs);
      }
      sample(i, t, s);
      prev = { i, t, s };
    }

    // 카메라 뒤로 넘어간 꼭짓점을 그대로 투영하면 화면 반대편으로 튄다 — 근평면에서 잘라 낸다.
    const clipNear = (poly, nearAt = FPV.near_mm) => {
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        const ain = a[0] > nearAt;
        const bin = b[0] > nearAt;
        if (ain) out.push(a);
        if (ain !== bin) {
          const f = (nearAt - a[0]) / (b[0] - a[0]);
          out.push([nearAt, a[1] + (b[1] - a[1]) * f]);
        }
      }
      return out;
    };

    const quad = (a, b, ia, ib, fill) => {
      const poly = clipNear([a.rows[ia], a.rows[ia + 1], b.rows[ib + 1], b.rows[ib]]);
      if (poly.length < 3) return;
      ctx.beginPath();
      poly.forEach(([fwd, lat], k) => {
        const [px, py] = project(fwd, lat, 0);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const walkA = css('--c-fpv-walk') || '#3a4250';
    const roadA = css('--c-fpv-road') || '#c9d2df';
    const roadB = css('--c-fpv-road-2') || '#bfc8d6';
    // 멀리서부터 그려 가까운 것이 위에 오게 한다.
    for (let i = road.length - 2; i >= 0; i--) {
      const a = road[i];
      const b = road[i + 1];
      quad(a, b, 0, 0, walkA);   // 왼쪽 인도
      quad(a, b, 2, 2, walkA);   // 오른쪽 인도
      quad(a, b, 1, 1, (i & 1) ? roadA : roadB);
    }

    // 판단 구간 노면 색 — 어느 구역인지 멀리서도 안다.
    const cfg = sim.decisions;
    if (cfg) {
      for (const dcn of cfg.list) {
        for (let i = road.length - 2; i >= 0; i--) {
          const a = road[i];
          const b = road[i + 1];
          let gap = ((a.s % total) + total) % total - dcn.s;
          if (gap > total / 2) gap -= total;
          if (gap < -total / 2) gap += total;
          if (Math.abs(gap) > dcn.zone_mm / 2) continue;
          quad(a, b, 1, 1, zoneFill(expectOf(sim, dcn, sim.tick)));
        }
      }
    }

    // 중앙선 — 폭 26mm 의 띠를 도로와 같은 방식으로 잘라 그린다.
    ctx.fillStyle = css('--c-fpv-lane') || '#0d1117';
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i];
      const b = road[i + 1];
      if (b.s === a.s || b.seg !== a.seg) continue;   // 꼭짓점을 걸친 표본은 중앙선을 잇지 않는다
      if (Math.floor(a.s / 240) % 2) continue;
      const la = (a.rows[1][1] + a.rows[2][1]) / 2;
      const lb = (b.rows[1][1] + b.rows[2][1]) / 2;
      const poly = clipNear([[a.fwd, la - 13], [a.fwd, la + 13], [b.fwd, lb + 13], [b.fwd, lb - 13]], FPV.lane_near_mm);
      if (poly.length < 3) continue;
      ctx.beginPath();
      poly.forEach(([fwd, lat], k) => {
        const [px, py] = project(fwd, lat, 0);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }

    // ── 오브젝트 ───────────────────────────────────────────────
    const items = [];
    for (const o of city) {
      const [fwd, lat] = toCam(o.x, o.y);
      if (fwd > FPV.near_mm && fwd < FPV.far_mm * 1.4) items.push({ fwd, lat, key: o.sprite, scale: o.scale || 1 });
    }
    if (cfg) {
      for (const dcn of cfg.list) {
        const color = signalColorOf(sim, dcn, sim.tick);
        if (!color) continue;
        // 신호등은 진행 방향 오른쪽 인도에 선다. 위치는 지점 좌표에서 나온다.
        const p = at(dcn.s);
        const [fwd, lat] = toCam(p.x + p.nx * -(half + 120), p.y + p.ny * -(half + 120));
        if (fwd > FPV.near_mm && fwd < FPV.far_mm * 1.4) items.push({ fwd, lat, key: `signal.${color}`, scale: 1, glow: color });
      }
    }

    // 움직이는 장애물 — 자리도 막힘 여부도 엔진이 tick 하나로 낸 값을 그대로 쓴다.
    const obs = sim.obstacles;
    if (obs) {
      const side = half + 120;
      for (const o of obs.list) {
        const state = obstacleAt(obs, o, sim.tick, obstacleState(sim));
        if (o.kind === OBSTACLE.GATE) {
          // 기둥은 길가에 서고 팔이 노면을 가로지른다. 방향은 그 자리의 중심선 법선에서 나온다.
          const p = at(o.s);
          const post = [p.x + p.nx * -side, p.y + p.ny * -side];
          const [fwd, lat] = toCam(post[0], post[1]);
          if (fwd <= FPV.near_mm || fwd >= FPV.far_mm * 1.4) continue;
          items.push({ fwd, lat, key: o.sprite, scale: 1, blocking: state.blocking });
          items.push({ fwd, gate: { post, nx: p.nx, ny: p.ny, span: side * 2, arm: state.arm, blocking: state.blocking } });
          continue;
        }
        const [fwd, lat] = toCam(state.x, state.y);
        if (fwd <= FPV.near_mm || fwd >= FPV.far_mm * 1.4) continue;
        items.push({ fwd, lat, key: o.sprite, scale: 1, blocking: state.blocking });
      }
    }
    items.sort((a, b) => b.fwd - a.fwd);
    // 색 마커 — 판 하나를 세워 그린다. 색은 매니페스트의 값 그대로다(코드가 색을 고르지 않는다).
    for (const mk of markers) {
      const [fwd, lat] = toCam(mk.x, mk.y);
      if (fwd <= FPV.near_mm || fwd > FPV.far_mm * 1.4) continue;
      items.push({ fwd, lat, marker: mk });
    }

    items.sort((a, b) => b.fwd - a.fwd);   // 멀리 있는 것부터 — 가까운 것이 위에 온다
    for (const it of items) drawSprite(it);

    // ── 차체 앞부분 ────────────────────────────────────────────
    // 중앙선을 코앞부터 그리지 않는 것이 실수로 보이지 않게, 실제 차처럼 보닛으로 덮는다.
    drawHood(ctx, W, H);

    function drawSprite(it) {
      if (it.gate) { drawGateArm(it.gate); return; }
      if (it.marker) { drawMarker(it); return; }
      const sp = sprites.get(it.key);
      const hmm = (sp ? sp.height_mm : 600) * it.scale;
      const wmm = (sp ? sp.width_mm : 600) * it.scale;
      const [bx, by] = project(it.fwd, it.lat, 0);
      const [, ty] = project(it.fwd, it.lat, hmm);
      const h = by - ty;
      const w = (h * wmm) / hmm;
      if (h < 2 || bx < -w || bx > W + w) return;
      if (sp && sp.img.complete && sp.img.naturalWidth) {
        ctx.drawImage(sp.img, bx - w / 2, ty, w, h);
      } else {
        // 에셋이 아직 없다 — 자리만 표시하고 그리기는 계속한다. 프레임을 멈추지 않는다.
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = css('--c-fpv-far') || '#3d4a5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - w / 4, ty, w / 2, h);
        ctx.restore();
      }
      if (it.glow) {
        // 멀리서도 색이 읽히도록 등 위에 발광 점을 하나 얹는다.
        const r = Math.max(2.5, h * 0.055);
        const ly = sp && sp.lamp_y != null ? sp.lamp_y : 0.14;   // 등 위치는 스프라이트가 알려 준다
        ctx.beginPath();
        ctx.arc(bx, ty + h * ly, r, 0, Math.PI * 2);
        ctx.fillStyle = glowOf(it.glow);
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /** 색 마커 한 장. 기둥 위에 판이 서 있고, 판은 늘 카메라를 마주 본다. */
    function drawMarker(it) {
      const mk = it.marker;
      const size = mk.size_mm || 200;
      const postH = 120;                       // 판 아래 기둥 높이(mm)
      const [bx, by] = project(it.fwd, it.lat, 0);
      const [, py] = project(it.fwd, it.lat, postH);
      const [, ty] = project(it.fwd, it.lat, postH + size);
      const h = py - ty;
      const w = h;                              // 판은 정사각이다
      if (h < 2 || bx < -w || bx > W + w) return;
      // 53차 — 인식 결과 화면(2단)이 같은 자리에 덩어리를 놓을 수 있게 판의 자리를 남긴다.
      // 투영식은 여기 하나뿐이다. 2단은 이 값을 따라갈 뿐 스스로 투영하지 않는다.
      plates.push({ cx: bx / W, cy: (ty + h / 2) / H, w: w / W, h: h / H });
      ctx.fillStyle = '#2b3038';
      ctx.fillRect(bx - Math.max(1, w * 0.06), ty + h, Math.max(2, w * 0.12), by - py);
      const [r, g, b] = mk.color || [200, 60, 60];
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(bx - w / 2, ty, w, h);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - w / 2 + 0.5, ty + 0.5, w - 1, h - 1);
    }

    /**
     * 차단기 팔. 0=올라감(수직), 1=내려감(노면을 가로지름).
     * 두 끝점을 3차원에서 잡아 각각 투영한다 — 각도를 화면에서 흉내 내지 않는다.
     */
    function drawGateArm(g) {
      const [pf, pl] = toCam(g.post[0], g.post[1]);
      if (pf <= FPV.near_mm) return;
      // 내려가면 노면을 가로질러, 올라가면 기둥 위로. 그 사이는 선형으로 오간다.
      const tip = [g.post[0] + g.nx * g.span * g.arm, g.post[1] + g.ny * g.span * g.arm];
      const tipZ = GATE_PIVOT_MM + g.span * (1 - g.arm);
      const [tf, tl] = toCam(tip[0], tip[1]);
      if (tf <= FPV.near_mm) return;
      const a = project(pf, pl, GATE_PIVOT_MM);
      const b = project(tf, tl, tipZ);
      const thick = Math.max(2, (focal * GATE_ARM_MM) / pf);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineWidth = thick;
      ctx.lineCap = 'round';
      ctx.strokeStyle = g.blocking ? '#e0483a' : '#d8dde6';
      ctx.stroke();
    }
  }

  return {
    draw,
    /** 이번 프레임에 그린 마커 판들. 0~1 로 정규화된 자리다. */
    plates: () => plates,
    get ready() { return ready; },
  };
}

/** 보닛 실루엣. 화면 아래를 완만한 곡선으로 덮는다 — 시야가 어디서 끝나는지가 의도로 읽힌다. */
function drawHood(ctx, W, H) {
  const top = H * (1 - FPV.hood);
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, top + H * 0.05);
  ctx.quadraticCurveTo(W / 2, top - H * 0.03, W, top + H * 0.05);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = css('--c-fpv-hood') || '#161b23';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, top + H * 0.05);
  ctx.quadraticCurveTo(W / 2, top - H * 0.03, W, top + H * 0.05);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css('--c-fpv-hood-edge') || '#2b323d';
  ctx.stroke();
}

function zoneFill(expect) {
  if (expect === 'stop') return 'rgba(214, 62, 52, 0.55)';
  if (expect === 'slow') return 'rgba(226, 160, 40, 0.55)';
  return 'rgba(42, 176, 110, 0.45)';
}

function glowOf(color) {
  if (color === 'red') return '#ff5a4a';
  if (color === 'yellow') return '#ffcc4d';
  return '#3ce398';
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
