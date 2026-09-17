/**
 * engine/obstacles.js — 움직이는 장애물 (스마트시티 전용).
 *
 * 목록·주기·위치는 전부 매니페스트(scene.obstacles)가 소유한다. 이 파일은 개수도 종류별
 * 배치도 모른다 — 보행자를 늘리거나 차단기를 옮기는 데 엔진 코드를 고칠 일이 없다.
 *
 * 움직임은 전부 tick 하나로 정해진다. Date 도 Math.random 도 쓰지 않으므로
 * 같은 코드는 언제나 같은 tick 에서 같은 자리의 보행자를 만난다 — 랩타임이 흔들리지 않는다.
 *
 * 위반은 "막혀 있는 동안 그 지점을 지나갔는가" 하나로만 판정한다. 타일 안에 서서 기다리는 것은
 * 위반이 아니다 — 기다리라고 만든 자리이기 때문이다.
 *
 * 판단 지점이 지켜보는(watch) 장애물은 여기서 위반을 세지 않는다. 그 지점이 한 번만 채점한다 —
 * 같은 실수를 두 번 물리지 않기 위해서다. 지나간 사실만 기록해 두면 지점 쪽에서 읽어 간다.
 */

import { nearestOnPath } from './autopilot.js';
import { stopForViolation } from './stop.js';
import { createScriptRun, fireIfNear, elapsedOf } from './script.js';

/**
 * 그 장애물이 지금 카메라에 보이는가. 화면에 없는 것이 정답을 바꾸면 안 된다 —
 * 그래서 판정도 1인칭 렌더와 같은 화각·사거리를 쓴다.
 */
export function inCameraView(sim, x, y) {
  const view = sim.decisions && sim.decisions.view;
  if (!view) return true;
  const v = sim.vehicle;
  const dx = x - v.x;
  const dy = y - v.y;
  const dist = Math.hypot(dx, dy);
  if (dist > view.range_mm) return false;
  if (dist < 1) return true;
  const hd = (v.heading_mdeg / 1000) * (Math.PI / 180);
  let a = Math.atan2(dy, dx) - hd;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.abs(a) <= (view.fov_deg / 2) * (Math.PI / 180);
}


export const OBSTACLE = Object.freeze({
  PEDESTRIAN: 'pedestrian',
  GATE: 'crossing_gate',
});

/** 차단기 팔이 오르내리는 데 걸리는 tick. 그림에만 쓰인다 — 막힘 판정은 주기가 정한다. */
const ARM_TICKS = 40;

function cumulative(points) {
  const acc = [0];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    acc.push(acc[i] + Math.hypot(bx - ax, by - ay));
  }
  return acc;
}

function arcOf(points, acc, x, y) {
  const near = nearestOnPath(points, x, y);
  if (!near) return 0;
  const [ax, ay] = points[near.i];
  const [bx, by] = points[(near.i + 1) % points.length];
  return acc[near.i] + Math.hypot(bx - ax, by - ay) * near.t;
}

export function createObstacles(challenge, track) {
  const raw = (challenge.scene && challenge.scene.obstacles) || [];
  if (!raw.length) return null;
  // 충돌로 볼 거리는 종류마다 매니페스트가 정한다. 값이 없으면 그 종류는 충돌을 세지 않는다 —
  // 코드가 기본값을 정해 버리면 매니페스트를 고쳐도 판정이 따라오지 않는다.
  const vr = (challenge.rules && challenge.rules.violations) || {};
  const hitRange = {
    [OBSTACLE.PEDESTRIAN]: (vr.pedestrian_hit || {}).distance_mm || 0,
    [OBSTACLE.GATE]: (vr.gate_hit || {}).distance_mm || 0,
  };
  const hitKind = { [OBSTACLE.PEDESTRIAN]: 'pedestrian_hit', [OBSTACLE.GATE]: 'gate_hit' };
  // 피할 기회. 노면 위에 이만큼도 있지 않다가 코앞에서 나온 것은 피할 수 없었던 것이다.
  // 값은 종류마다 매니페스트가 정한다 — 코드가 정하면 매니페스트를 고쳐도 판정이 따라오지 않는다.
  const seeTicks = {
    [OBSTACLE.PEDESTRIAN]: (vr.pedestrian_hit || {}).see_ticks | 0,
    [OBSTACLE.GATE]: (vr.gate_hit || {}).see_ticks | 0,
  };
  // 어느 장애물이 판단 지점에 딸려 있는가. 딸린 것은 그 지점이 채점한다.
  const watched = new Set();
  for (const d of (challenge.scene.decisions || [])) {
    for (const id of d.watch || []) watched.add(id);
  }
  const points = track.centerline;
  const acc = cumulative(points);
  const total = acc[acc.length - 1];
  const roadHalf = (track.width_mm || 360) / 2;

  // 충돌 거리를 장애물이 스스로 정할 수 있다. 0 이면 그 장애물과는 부딪히지 않는다 —
  // 길 저쪽을 건너는 사람처럼 '서행은 해야 하지만 치이지는 않는' 자리를 매니페스트가 표현한다.
  const rangeOf = (o) => (o.hit_mm !== undefined ? o.hit_mm : (hitRange[o.kind] || 0));
  const list = raw.map((o, i) => {
    const item = {
      script: o.script || null,      // 거리로 시작하는 대본. 없으면 지금까지처럼 제 주기로 돈다.
      requires: o.requires || null,  // 이 장애물이 요구하는 행동. 없으면 situation 표를 따른다.
      hitRange: rangeOf(o),          // 이 장애물과 부딪혔다고 볼 거리(mm)
      id: o.id || `o${i + 1}`,
      kind: o.kind,
      label: o.label || '',
      sprite: o.sprite || (o.kind === OBSTACLE.GATE ? 'barrier' : 'pedestrian'),
      zone_mm: o.zone_mm,
      phase: o.phase_ticks | 0,
      watched: watched.has(o.id || `o${i + 1}`),
    };
    if (o.kind === OBSTACLE.PEDESTRIAN) {
      item.from = o.from;
      item.to = o.to;
      item.period = o.period_ticks | 0;
      // 판정 지점은 왕복 구간이 중심선과 만나는 자리다. 매니페스트가 따로 적지 않아도 된다.
      item.x = (o.from[0] + o.to[0]) / 2;
      item.y = (o.from[1] + o.to[1]) / 2;
    } else {
      item.x = o.x;
      item.y = o.y;
      item.down = o.down_ticks | 0;
      item.up = o.up_ticks | 0;
      item.period = item.down + item.up;
    }
    return item;
  });
  for (const o of list) o.s = arcOf(points, acc, o.x, o.y);
  list.sort((a, b) => a.s - b.s);

  return { list, points, acc, total, roadHalf, hitRange, hitKind, seeTicks };
}

/**
 * tick 하나만 있으면 자리와 막힘 여부가 정해진다. 상태를 들고 있지 않다.
 *
 * 대본이 있는 장애물은 tick 대신 "대본이 시작된 뒤 흐른 시간" 으로 센다. 시작 전에는
 * 아직 아무 일도 일어나지 않은 자리(u=0)에 서 있다 — 멀리서 미리 움직이면 대본이 아니다.
 */
export function obstacleAt(cfg, o, tick, run) {
  const period = o.period > 0 ? o.period : 1;
  let base = tick;
  if (o.script) {
    const e = run && run.script ? elapsedOf(run.script, o.id, tick) : null;
    if (e === null) return startState(o);
    base = e;
  }
  const t = (((base + o.phase) % period) + period) % period;
  if (o.kind === OBSTACLE.PEDESTRIAN) {
    const half = period / 2;
    const u = t < half ? t / half : 2 - t / half;   // 0 → 1 → 0 왕복
    const x = o.from[0] + (o.to[0] - o.from[0]) * u;
    const y = o.from[1] + (o.to[1] - o.from[1]) * u;
    // 노면 위에 있는 동안만 길을 막는다. 인도로 물러나 있으면 지나가도 된다.
    const near = nearestOnPath(cfg.points, x, y);
    return { x, y, u, blocking: !!near && near.d <= cfg.roadHalf, arm: 0 };
  }
  const downing = t < o.down;
  // 팔이 내려가는 중·올라가는 중에도 막힌 것으로 본다. 반쯤 내려온 차단기 밑을 지날 수는 없다.
  const arm = downing
    ? Math.min(1, t / ARM_TICKS)
    : Math.max(0, 1 - (t - o.down) / ARM_TICKS);
  return { x: o.x, y: o.y, u: 0, blocking: downing, arm };
}

/** 대본이 시작되기 전의 자리. 보행자는 출발점에, 차단기는 올라가 있다. */
function startState(o) {
  if (o.kind === OBSTACLE.PEDESTRIAN) {
    return { x: o.from[0], y: o.from[1], u: 0, blocking: false, arm: 0 };
  }
  return { x: o.x, y: o.y, u: 0, blocking: false, arm: 0 };
}

export function obstacleState(sim) {
  if (!sim.obstacles) return null;
  if (!sim.obstacleRun) {
    sim.obstacleRun = {
      lastS: null, results: [], violations: 0, passes: 0, near: null, blocked: [],
      // 충돌은 닿아 있는 동안 계속 세면 한 번 부딪힌 것이 수십 건이 된다.
      // 닿기 시작한 순간에만 한 건 남기고, 떨어질 때까지 다시 세지 않는다.
      hits: [], touching: new Set(), blockingSince: {},
      script: createScriptRun(),
    };
  }
  return sim.obstacleRun;
}

export function resetObstacles(sim) {
  sim.obstacleRun = null;
  obstacleState(sim);
}


/** 진행 방향으로 a → b 사이에 지점 p 를 지났는가. 한 바퀴를 넘어가는 경우도 본다. */
function crossed(a, b, p, total) {
  let d = b - a;
  if (d < -total / 2) d += total;           // 결승선을 넘어 한 바퀴 돌았다
  if (d <= 0 || d > total / 2) return false;
  let g = p - a;
  if (g < 0) g += total;
  return g > 0 && g <= d;
}

/**
 * 한 tick 분 갱신. stepSim 의 물리 뒤, 이탈 판정 앞에서 불린다.
 * 사이드이펙트는 sim.obstacleRun 안에서만 일어난다 — 랩타임·이탈 판정에 손대지 않는다.
 */
export function stepObstacles(sim) {
  const cfg = sim.obstacles;
  if (!cfg) return;
  const st = obstacleState(sim);
  const s = arcOf(cfg.points, cfg.acc, sim.vehicle.x, sim.vehicle.y);

  // 대본 시작 — 얼마나 가까이 왔는지로 정한다. tick 으로 정하면 속도를 바꿀 때마다 상황이 달라진다.
  for (const o of cfg.list) {
    if (!o.script) continue;
    // 앞으로 남은 거리다. -총길이/2 로 접으면 저 멀리 앞에 있는 것이 '방금 지나간 것' 으로
    // 읽혀 출발하자마자 대본이 시작된다.
    let gap = (o.s - s) % cfg.total;
    if (gap < 0) gap += cfg.total;
    fireIfNear(st.script, o.id, gap, o.script.trigger_mm, sim.tick);
  }

  if (st.lastS !== null) {
    for (const o of cfg.list) {
      if (!crossed(st.lastS, s, o.s, cfg.total)) continue;
      const state = obstacleAt(cfg, o, sim.tick, st);
      st.passes += 1;
      if (!state.blocking) continue;
      // 막힌 채로 지나간 사실은 언제나 남긴다. 판단 지점이 딸려 있으면 채점은 그쪽이 한다.
      st.blocked.push({ id: o.id, kind: o.kind, label: o.label, tick: sim.tick });
      if (o.watched) continue;
      st.violations += 1;
      st.results.push({ id: o.id, kind: o.kind, label: o.label, tick: sim.tick, ok: false });
      // 막힌 채로 지나간 것도 위반이다. 어겼으면 선다(55차 마감 D').
      // 판단 지점이 지켜보는 장애물은 여기서 세지 않으므로 그쪽에서 한 번만 선다.
      stopForViolation(sim, 'blocked_pass', o.label);
    }
  }
  st.lastS = s;

  // ── 충돌 ─────────────────────────────────────────────
  // 지나갔는지와는 별개다. 막힌 곳을 그냥 지나간 것과 사람을 치고 지나간 것은 다른 잘못이다.
  for (const o of cfg.list) {
    const range = o.hitRange || 0;
    if (!range) continue;
    const state = obstacleAt(cfg, o, sim.tick, st);
    // 노면 위에 있는 것만 부딪힐 수 있다. 인도로 물러난 보행자 옆을 지나는 것은 충돌이 아니고,
    // 올라간 차단기 밑을 지나는 것도 충돌이 아니다. 둘 다 blocking 이 그대로 답을 준다.
    const solid = state.blocking;
    // 멈춰 선 차에 보행자가 다가온 것은 충돌이 아니다. 규칙을 지켜 선 학생을 벌하면 안 된다.
    const moving = Math.abs(sim.vehicle.pwmL) + Math.abs(sim.vehicle.pwmR) > 0;
    // 노면 위에 계속 있기 시작한 순간. 여기서부터가 '피할 기회가 있던 시간'이다.
    if (!solid) delete st.blockingSince[o.id];
    else if (st.blockingSince[o.id] === undefined) st.blockingSince[o.id] = sim.tick;
    const near = solid && moving
      && Math.hypot(sim.vehicle.x - state.x, sim.vehicle.y - state.y) <= range;
    if (near && !st.touching.has(o.id)) {
      st.touching.add(o.id);
      // 보이고 나서 피할 시간이 있었을 때만 위반으로 센다. 코앞에서 갑자기 나온 것을
      // 틀렸다고 하면, 규칙을 다 지킨 학생이 벌을 받는다(34차 확정 원칙).
      const since = st.blockingSince[o.id];
      const avoidable = since !== undefined && sim.tick - since >= (cfg.seeTicks[o.kind] || 0);
      st.hits.push({
        id: o.id, kind: cfg.hitKind[o.kind], label: o.label, tick: sim.tick, avoidable,
      });
      // 멈추는 것은 피할 수 있었던 충돌뿐이다. 코앞에서 갑자기 나온 것은 위반이 아니므로
      // 서지도 않는다(34차 확정 원칙) — 규칙을 다 지킨 학생을 늦추면 그것이 곧 벌이 된다.
      if (avoidable) stopForViolation(sim, cfg.hitKind[o.kind], o.label);
    } else if (!near) {
      st.touching.delete(o.id);
    }
  }

  // 화면 안내용 — 다음 장애물까지 남은 거리와 지금 막혀 있는지.
  let bestGap = Infinity;
  let bestO = null;
  for (const o of cfg.list) {
    let gap = o.s - s;
    if (gap < 0) gap += cfg.total;
    if (gap < bestGap) { bestGap = gap; bestO = o; }
  }
  st.near = bestO
    ? {
      id: bestO.id, kind: bestO.kind, label: bestO.label,
      remain_mm: Math.round(bestGap),
      blocking: obstacleAt(cfg, bestO, sim.tick, st).blocking,
      in_zone: bestGap <= (bestO.zone_mm || 0) / 2,
    }
    : null;
}

/** 주행 결과 요약. 기록에 남고 제출물에도 들어간다. */
export function obstacleSummary(sim) {
  const cfg = sim.obstacles;
  if (!cfg) return null;
  const st = obstacleState(sim);
  return {
    total: cfg.list.length,
    // 판단 지점이 지켜보지 않는 장애물만 여기서 채점된다. 0 이면 보여 줄 것이 없다.
    judged: cfg.list.filter((o) => !o.watched).length,
    passes: st.passes,
    violations: st.violations,
    blocked_passes: st.blocked.length,
    // 피할 수 없었던 접촉은 기록에는 남기되 위반으로 세지 않는다.
    hits: st.hits.filter((h) => h.avoidable),
    hits_unavoidable: st.hits.filter((h) => !h.avoidable).length,
    results: st.results.slice(),
  };
}
