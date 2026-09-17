/**
 * ui/panels/cityiso.js — 아이소메트릭 메인 화면 위에 얹는 살아 있는 도시 레이어.
 *
 * 배경(iso-smartcity.jpg)에는 움직이지 않는 것만 구워져 있다. 색이 바뀌는 신호등,
 * 걸어 다니는 보행자, 오르내리는 차단기는 여기서 프리렌더 스프라이트로 얹는다.
 *
 * 그림은 전부 에셋이다 — 도형을 코드로 그리지 않는다. 에셋이 아직 없으면 점선 자리표시자만
 * 남기고 렌더는 계속한다(한 장이 없다고 프레임이 멈추면 안 된다).
 *
 * 자리·색·자세는 모두 엔진이 tick 하나로 낸 값에서 나온다. 난수도 벽시계도 쓰지 않는다.
 * 읽기 전용이다 — sim 을 건드리지 않는다.
 */

import { expectOf, signalColorOf } from '../../engine/decisions.js';
import { OBSTACLE, obstacleAt, obstacleState } from '../../engine/obstacles.js';
import { nearestOnPath } from '../../engine/autopilot.js';


/** 걷기 두 프레임을 몇 tick 마다 바꾸는가. tick 으로만 세므로 배속을 올려도 같은 걸음이다. */
const WALK_TICKS = 22;

/**
 * 이름표 기준값. 몇 개까지 붙일지와 얼마나 먼 것까지 붙일지는 매니페스트가 소유한다.
 * 매니페스트에 없으면 지금까지의 값 그대로다 — 다른 챌린지는 달라지지 않는다.
 */
const CHIP_FALLBACK = Object.freeze({ max: 2, range_mm: 2200, ahead_only: true });
function chipRule(sim) {
  const own = (sim.challenge.scene.ui && sim.challenge.scene.ui.chips) || {};
  return { ...CHIP_FALLBACK, ...own };
}

/** 이름표를 띄우는 높이(mm). 신호등 함체 위다 — 투영은 배경과 같은 식으로 낸다. */
const CHIP_Z_MM = 740;

/**
 * @param {object} assets loadAssets() 결과. 시트 주소는 에셋 슬롯 대장이 소유한다 —
 *   파일명에 내용 해시가 박혀 있어 코드가 경로를 알고 있으면 안 된다.
 */
export function createCityIso(assets) {
  const images = new Map();     // 파일명 → Image
  let meta = null;

  // 에셋은 화면보다 늦게 도착한다. 붙을 때까지 매 프레임 한 번씩 물어보고,
  // 붙기 전에는 자리표시자만 그린다 — 시트 한 장 때문에 프레임이 멈추면 안 된다.
  function adopt() {
    if (meta) return true;
    const sheet = assets && assets.resolve('slot:city.iso');
    if (!sheet || sheet.kind !== 'sheet') return false;
    meta = sheet.meta;
    for (const set of Object.values(meta.sets || {})) {
      for (const f of set.frames || []) {
        const img = new Image();
        img.src = new URL(f.file, sheet.url).href;
        // 시트의 file 에는 내용 해시 폴더가 앞에 붙는다. 찾을 때 쓰는 이름은
        // 언제나 파일명 하나뿐이므로 폴더를 떼고 넣는다.
        images.set(f.file.split('/').pop(), img);
      }
    }
    return true;
  }

  const ready = (file) => {
    const img = images.get(file);
    return img && img.complete && img.naturalWidth ? img : null;
  };

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} sim
   * @param {(x:number,y:number,z?:number)=>number[]} toScreen 배경과 같은 투영
   * @param {number} fit    배경 이미지에 적용된 배율
   * @param {number} bgMmPerPx 배경 1px 이 덮는 mm
   * @param {number[]} css [가로, 세로] 화면 크기(CSS px). 이름표를 화면 안으로 당기는 데 쓴다.
   * @param {number[][]} reserved 이미 자리를 잡은 이름표 사각형. 그 위에는 겹쳐 쓰지 않는다.
   * @param {number} rtick 화면이 그릴 시각. tick 사이의 소수점까지 온다 —
   *   보행자·차단기 자리는 tick 하나의 함수라 소수점을 넣으면 그대로 부드러워진다.
   *   판정에는 쓰이지 않는다(렌더 전용).
   * @param {object} pose 보간된 RC카 자세. 이름표를 붙일 거리를 잴 때 쓴다.
   */
  function draw(ctx, sim, toScreen, fit, bgMmPerPx, css = [0, 0], reserved = [],
    rtick = undefined, pose = undefined) {
    const tick = rtick === undefined ? sim.tick : rtick;
    adopt();
    const pts = sim.track.centerline || [];
    if (!pts.length) return;
    const half = (sim.track.width_mm || 360) / 2;

    // ── 판정 구간 노면 색 — 지금의 정답 그대로. 배경에는 색 없는 판만 구워져 있다.
    const cfg = sim.decisions;
    if (cfg) {
      for (const d of cfg.list) {
        const dir = roadDirAt(pts, d.x, d.y);
        if (!dir) continue;
        const [ax, ay] = dir.along;
        const [nx, ny] = dir.left;
        const hl = d.zone_mm / 2;
        const corners = [
          [d.x + ax * hl + nx * half, d.y + ay * hl + ny * half],
          [d.x + ax * hl - nx * half, d.y + ay * hl - ny * half],
          [d.x - ax * hl - nx * half, d.y - ay * hl - ny * half],
          [d.x - ax * hl + nx * half, d.y - ay * hl + ny * half],
        ].map(([x, y]) => toScreen(x, y));
        ctx.beginPath();
        corners.forEach(([sx, sy], i) => (i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy)));
        ctx.closePath();
        ctx.fillStyle = zoneFill(expectOf(sim, d, sim.tick));
        ctx.fill();
      }
    }

    // ── 서 있는 것·움직이는 것을 한데 모아 화면 안쪽부터 그린다(뒤에 있는 것이 먼저).
    const items = [];
    if (cfg) {
      for (const d of cfg.list) {
        const color = signalColorOf(sim, d, sim.tick);
        if (!color) continue;
        const dir = roadDirAt(pts, d.x, d.y);
        if (!dir) continue;
        // 신호등은 진행 방향 오른쪽 인도에 선다.
        const off = half + 150;
        const x = d.x - dir.left[0] * off;
        const y = d.y - dir.left[1] * off;
        // 등이 화면을 향하는 방위는 0도와 270도 둘뿐이다. 그 밖을 고르면 뒤통수만 보여
        // 회색 기둥이 된다 — 도로 축에 맞는 쪽을 그 둘 중에서 고른다.
        const face = Math.abs(dir.along[0]) > 0.5 ? 270 : 0;
        items.push({
          x, y, tag: 'signal', color,
          file: `signal-${color}-${String(face).padStart(3, '0')}.png`,
          label: chipText(sim, d, color),
          s: d.s,                       // 코스를 따라 잰 자리. 앞뒤를 가리는 데 쓴다.
        });
      }
    }
    // ── 배경 보행자. 인도 위를 오갈 뿐 판정에는 전혀 닿지 않는다 —
    // 엔진이 이들을 모르고, 자리도 tick 하나에서만 나오므로 기록이 흔들릴 여지가 없다.
    // 수·경로·속도는 전부 매니페스트(scene.city.ambient)가 소유한다.
    for (const a of (sim.challenge.scene.ambient || [])) {
      const p2 = walkAt(a, tick);
      const nx2 = walkAt(a, tick + 1);
      const deg = ((Math.atan2(nx2[1] - p2[1], nx2[0] - p2[0]) * 180) / Math.PI + 360) % 360;
      const dirIdx = Math.round(deg / 45) % 8;
      const step = Math.floor((tick + (a.phase_ticks || 0)) / WALK_TICKS) % 2;
      items.push({
        x: p2[0], y: p2[1], tag: 'ped',
        file: `ped-${String(dirIdx * 45).padStart(3, '0')}-${step}.png`,
      });
    }

    const obs = sim.obstacles;
    if (obs && meta) {
      for (const o of obs.list) {
        const st = obstacleAt(obs, o, tick, obstacleState(sim));
        if (o.kind === OBSTACLE.GATE) {
          const set = meta.sets.crossing_gate;
          const steps = set.steps;
          const idx = Math.max(0, Math.min(steps - 1, Math.round(st.arm * (steps - 1))));
          const dir = roadDirAt(pts, o.x, o.y);
          const off = half + 120;
          // 기둥은 노면 한쪽 밖에 서고, 팔은 노면을 가로질러 반대쪽으로 뻗어야 한다.
          // 그 방향이 곧 left 다. 55차 보강5 이전에는 방위가 한 가지뿐이라, 도로가 어느 쪽으로
          // 나 있든 팔이 늘 같은 화면 방향으로 뻗어 길을 막는 것으로 보이지 않았다.
          const x = dir ? o.x - dir.left[0] * off : o.x;
          const y = dir ? o.y - dir.left[1] * off : o.y;
          if (set.dirs && dir) {
            const deg = ((Math.atan2(dir.left[1], dir.left[0]) * 180) / Math.PI + 360) % 360;
            const step = Math.round(deg / (360 / set.dirs)) % set.dirs;
            items.push({ x, y, file: `gate-${String(step * (360 / set.dirs)).padStart(3, '0')}-${idx}.png`, tag: 'gate' });
          } else {
            items.push({ x, y, file: `gate-${idx}.png`, tag: 'gate' });
          }
          continue;
        }
        // 보행자의 방위는 다음 tick 의 자리에서 나온다 — 왕복이 뒤집히는 순간도 저절로 맞는다.
        const next = obstacleAt(obs, o, tick + 1, obstacleState(sim));
        const deg = ((Math.atan2(next.y - st.y, next.x - st.x) * 180) / Math.PI + 360) % 360;
        const dirIdx = Math.round(deg / 45) % 8;
        const step = Math.floor(sim.tick / WALK_TICKS) % 2;
        // 대본 보행자가 노면에 들어온 순간에는 이름표를 붙인다. 배경 보행자에게는 붙지 않으므로
        // 학생이 "지금 판정에 걸리는 사람" 을 한눈에 가려낼 수 있다.
        const owner = cfg && st.blocking
          ? cfg.list.find((d) => (d.watch || []).includes(o.id))
          : null;
        items.push({
          x: st.x, y: st.y, tag: 'ped',
          file: `ped-${String(dirIdx * 45).padStart(3, '0')}-${step}.png`,
          label: owner ? `${owner.chip || owner.label} — 지금 지나는 중` : null,
          lead: !!owner,
          s: owner ? owner.s : undefined,
        });
      }
    }

    for (const it of items) it.screen = toScreen(it.x, it.y);
    items.sort((a, b) => a.screen[1] - b.screen[1]);
    const k = meta ? (meta.mm_per_px / bgMmPerPx) * fit : 0;
    for (const it of items) {
      const img = ready(it.file);
      if (!img || !meta) { placeholder(ctx, it.screen); continue; }
      const w = meta.frame_px * k;
      ctx.drawImage(img,
        it.screen[0] - meta.pivot_px[0] * k,
        it.screen[1] - meta.pivot_px[1] * k,
        w, w);
    }
    // 어느 신호를 보는 지점인지 등 위에 붙인다. 구간 라벨은 화면 가장자리라 읽히지 않는다.
    // 열 곳을 다 붙이면 이름표가 화면을 덮는다 — 다가오는 것만 붙인다.
    // 코스를 따라 '앞으로 얼마나 남았는가' 로 고른다. 지나친 지점은 붙이지 않는다 —
    // 직선거리로 고르면 방금 지나친 지점이 여전히 가까워 화면에 남는다.
    const rule = chipRule(sim);
    const run = sim.decisionRun;
    const total = cfg ? cfg.total : 0;
    const aheadOf = (it) => {
      if (!rule.ahead_only || !run || run.lastS === null || !total || it.s === undefined) {
        const v0 = pose || sim.vehicle;
        return Math.hypot(it.x - v0.x, it.y - v0.y);
      }
      let gap = it.s - run.lastS;
      if (gap < 0) gap += total;
      return gap;
    };
    const named = items
      .filter((it) => it.label)
      .map((it) => ({ it, gap: aheadOf(it) }))
      .filter((x) => x.gap <= rule.range_mm)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, Math.max(0, rule.max | 0));
    const taken = reserved.slice();
    // 55차 보강8 G — 이름표는 캔버스에 그려지므로 검사가 글자를 읽을 수 없다.
    // 그린 글을 캔버스 요소에 그대로 적어 둔다. 바뀔 때만 쓴다(매 프레임 DOM 을 건드리지 않는다).
    const drawn = [];
    for (let i = 0; i < named.length; i++) {
      const it = named[i].it;
      drawn.push(it.label);
      // 맨 앞의 하나가 지금 판단이 필요한 지점이다 — 크게·진하게 둔다.
      const lead = i === 0;
      // 높이는 mm 로 주고 투영에 맡긴다. 스프라이트 배율(k)로 화면 픽셀을 밀면
      // 배율이 바뀔 때마다 이름표가 신호등에서 떨어져 허공에 뜬다.
      const top = toScreen(it.x, it.y, CHIP_Z_MM);
      const box = chip(ctx, top[0], top[1], it.label, it.color, css, taken, lead);
      if (box) taken.push(box);
    }
    const joined = drawn.join(' | ');
    if (ctx.canvas.dataset.chips !== joined) ctx.canvas.dataset.chips = joined;
  }

  return { draw, get ready() { return !!meta; } };
}

/** 지금 신호 색을 학생 말로. 색 이름은 UI 라벨이라 여기서 정한다. */
const COLOR_WORD = { red: '빨강', yellow: '노랑', green: '초록' };
/** 지금 요구하는 행동. expectOf 가 낸 결론을 그대로 옮긴다 — 여기서 다시 판단하지 않는다. */
const ACT_WORD = { stop: '정지', slow: '서행', go: '진행' };

/**
 * 이름표 글. 번호가 아니라 "무엇이 · 지금 어떤 상태고 · 무엇을 해야 하는지" 를 적는다.
 * 이름(앞 신호·횡단보도·건널목)은 매니페스트가 소유하고, 상태와 행동은 엔진이 낸 값이다.
 */
function chipText(sim, d, color) {
  const state = [];
  if (color) state.push(COLOR_WORD[color] || color);
  // 55차 보강8 C — 무엇을 해야 하는지는 지점 앞에서 알려 주지 않는다. 매니페스트가 정한다.
  // 이름·신호 색·장애물 상태는 남긴다 — 스프라이트로 이미 보이는 것이라 글자가 정보를 더하지
  // 않는다. 빼는 것은 expectOf() 가 낸 낱말(정지·서행·진행) 하나뿐이다.
  const reveal = !!((sim.challenge.scene.ui || {}).reveal_expect);
  // 지켜보는 장애물이 지금 길을 막고 있으면 그것도 함께 알린다.
  const obs = sim.obstacles;
  if (obs && d.watch && d.watch.length) {
    for (const o of obs.list) {
      if (!d.watch.includes(o.id)) continue;
      if (!obstacleAt(obs, o, sim.tick, obstacleState(sim)).blocking) continue;
      state.push(o.kind === OBSTACLE.GATE ? '차단기 내려감' : '사람 건넘');
      break;
    }
  }
  if (reveal) state.push(ACT_WORD[expectOf(sim, d, sim.tick)] || '');
  const parts = state.filter(Boolean);
  const name = d.chip || d.display || d.label;
  return parts.length ? `${name} — ${parts.join(' · ')}` : name;
}

/**
 * 배경 보행자의 자리. from ↔ to 를 왕복한다. tick 하나만 있으면 정해지므로
 * 되감아도 같은 자리에 선다 — 난수도 벽시계도 쓰지 않는다.
 */
function walkAt(a, tick) {
  const period = (a.period_ticks | 0) > 0 ? a.period_ticks : 1;
  const t = (((tick + (a.phase_ticks | 0)) % period) + period) % period;
  const half = period / 2;
  const u = t < half ? t / half : 2 - t / half;
  return [a.from[0] + (a.to[0] - a.from[0]) * u, a.from[1] + (a.to[1] - a.from[1]) * u];
}

/** 그 자리 도로의 진행 방향과 왼쪽 법선. 코스에서 나오므로 매니페스트에 적지 않는다. */
function roadDirAt(pts, x, y) {
  const near = nearestOnPath(pts, x, y);
  if (!near) return null;
  const a = pts[near.i];
  const b = pts[(near.i + 1) % pts.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  return { along: [ux, uy], left: [-uy, ux] };
}

/**
 * 신호등 위에 붙는 이름표. 지금 색을 함께 보여 준다.
 * 화면 가장자리에 있는 신호등의 이름표가 잘리지 않도록 캔버스 안쪽으로 당긴다 —
 * 반쯤 잘린 이름표는 없는 것만 못하다.
 */
function chip(ctx, x, y, text, color, [vw, vh] = [0, 0], taken = []) {
  ctx.save();
  ctx.font = `700 11px ${cssVar('--font-ui') || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 22;
  let cx = x;
  let cy = y;
  if (vw > 0) cx = Math.min(Math.max(x, w / 2 + 4), vw - w / 2 - 4);
  if (vh > 0) cy = Math.min(Math.max(y, 13), vh - 13);
  // 54차 보강6-4 — 이미 자리를 잡은 사각형(체크포인트 이름표 · 시뮬 위 계기 카드)을 피한다.
  // 예전에는 겹치면 그냥 지웠는데, 그러면 "앞 신호" 를 알려 줄 것이 아예 사라진다.
  // 신호등 기둥을 따라 위아래로 몇 칸 옮겨 보고, 그래도 자리가 없을 때만 접는다.
  const overlaps = (b) => taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
  let box = null;
  for (const dy of [0, -24, 24, -48, 48, -72]) {
    const y2 = vh > 0 ? Math.min(Math.max(cy + dy, 13), vh - 13) : cy + dy;
    const cand = [cx - w / 2, y2 - 10, cx + w / 2, y2 + 10];
    if (!overlaps(cand)) { box = cand; cy = y2; break; }
  }
  if (!box) { ctx.restore(); return null; }
  ctx.fillStyle = 'rgba(8, 12, 20, .78)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - 9, w, 18, 9);
    ctx.fill();
  } else {
    ctx.fillRect(cx - w / 2, cy - 9, w, 18);
  }
  ctx.beginPath();
  ctx.arc(cx - w / 2 + 9, cy, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = lampOf(color);
  ctx.fill();
  ctx.fillStyle = '#eaf1fa';
  ctx.fillText(text, cx + 5, cy);
  ctx.restore();
  return box;
}

function lampOf(color) {
  if (color === 'red') return '#ff5a4a';
  if (color === 'yellow') return '#ffcc4d';
  return '#3ce398';
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 판정 구간 노면 색. 노면에 칠한 페인트로 읽혀야 한다 —
 * 채도 낮은 초록을 옅게 깔면 아스팔트 위의 잔디로 보인다. 그래서 진행 색은
 * 풀빛에서 먼 청록으로 두고 세 색 모두 같은 진하기로 맞춘다.
 */
function zoneFill(expect) {
  // 불투명도를 낮춰 배경에 구워진 횡단보도 줄무늬가 비쳐 보이게 한다.
  // 색은 그 구간이 요구하는 행동(정지·서행·진행)을 뜻하므로 없애지 않는다.
  if (expect === 'stop') return 'rgba(224, 58, 46, 0.26)';
  if (expect === 'slow') return 'rgba(236, 164, 34, 0.26)';
  return 'rgba(28, 214, 220, 0.24)';
}

/** 에셋이 아직 없을 때. 자리만 알리고 넘어간다 — 프레임을 멈추지 않는다. */
function placeholder(ctx, [sx, sy]) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(220, 226, 236, .55)';
  ctx.strokeRect(sx - 10, sy - 34, 20, 34);
  ctx.restore();
}
