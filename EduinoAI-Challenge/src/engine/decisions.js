/**
 * engine/decisions.js — 판단 지점 (자율주행 챌린지 전용).
 *
 * 지점 목록은 매니페스트(scene.decisions)가 소유한다. 이 파일은 개수도 순서도 모른다 —
 * 지점을 늘리거나 순서를 바꾸는 데 화면 코드나 엔진 코드를 고칠 일이 없다.
 *
 * 하는 일
 *   1) 중심선 위에서 차가 어디쯤인지 재고, 다음 지점까지 남은 거리를 낸다(화면 안내용).
 *   2) 판정 구간에 들어오는 순간의 mlClassify() 결과를 적어 둔다(분류가 맞았는지 채점).
 *   3) 구간 안에서 실제로 어떻게 달렸는지 재서 규칙을 지켰는지 판정한다.
 *
 * 판정은 전부 실측이다. 정지는 "구간 안에서 완전히 멈춘 시간", 서행은 "구간 안 최고 속도",
 * 진행은 "구간 안에서 멈춘 적이 있는지". 문장이나 점수를 지어내지 않는다.
 */

import { readMl } from './ml.js';
import { nearestOnPath } from './autopilot.js';
import { SIGNAL_EXPECT, createSignals, signalAt } from './signals.js';
import { obstacleAt, obstacleState, inCameraView } from './obstacles.js';
import { stopForViolation } from './stop.js';
import { createScriptRun, fireIfNear, elapsedOf, phaseAt } from './script.js';

/** 판정 구간에 들어온 뒤 '무엇으로 봤는가'를 세는 시간 (tick). 0.6초. */
const READ_WINDOW = 60;

export { inCameraView };

export const DECISION = Object.freeze({
  STOP: 'stop',
  SLOW: 'slow',
  GO: 'go',
});

/** 클래스 번호(1·2·3)와 규칙 이름의 대응. 매니페스트의 ml.classes 순서와 같다. */
export const CLASS_OF = Object.freeze({ stop: 1, slow: 2, go: 3 });

/**
 * 규칙 위반의 종류. 무엇을 어겼는지가 다르면 다른 잘못이다 —
 * 정지 요구를 무시한 것과 서행 구간에서 속도를 낸 것은 학생이 고쳐야 할 것이 다르다.
 * 종류별 페널티와 충돌 거리는 전부 매니페스트(rules.violations)가 소유한다.
 */
export const VIOLATION = Object.freeze({
  SIGNAL: 'signal_ignored',
  PEDESTRIAN: 'pedestrian_hit',
  GATE: 'gate_hit',
  SLOW: 'slow_violation',
  BLOCKED: 'blocked_pass',
});

/** 구간을 어긴 방식에서 종류를 정한다. 충돌은 여기가 아니라 장애물 쪽에서 센다. */
function violationKindOf(zone) {
  return zone.expect === DECISION.SLOW ? VIOLATION.SLOW : VIOLATION.SIGNAL;
}

function cumulative(points) {
  const acc = [0];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    acc.push(acc[i] + Math.hypot(bx - ax, by - ay));
  }
  return acc;
}

/** 지점의 좌표를 중심선 위의 진행 거리(s)로 바꾼다. 남은 거리 계산의 기준이다. */
function arcOf(points, acc, x, y) {
  const near = nearestOnPath(points, x, y);
  if (!near) return 0;
  const [ax, ay] = points[near.i];
  const [bx, by] = points[(near.i + 1) % points.length];
  return acc[near.i] + Math.hypot(bx - ax, by - ay) * near.t;
}

export function createDecisions(challenge, kit, track) {
  const list = (challenge.scene.decisions || []).map((d, i) => ({
    id: d.id || `d${i + 1}`,
    x: d.x,
    y: d.y,
    expect: d.expect,
    zone_mm: d.zone_mm,
    marker: d.marker || 'signal',
    // 55차 보강9 — 이름은 한 벌이다. 예전에는 label(기록용)과 display(화면용)가 따로 있었고,
    // display 가 "곧 빨강" 처럼 앞일을 예고해 정답을 흘렸다. 두 벌을 두면 어긋나도 아무도
    // 못 잡으므로 display 를 없앴다. id 는 그대로다 — 기준값·results·로그가 쓴다.
    label: d.label || '',
    // 지도 위 이름표에 쓰는 짧은 이름. 긴 이름이 스프라이트를 덮지 않게만 나눈다.
    chip: d.chip || d.label || '',
    // 신호등 지점은 정답이 고정이 아니다 — 그 순간의 신호가 정답이다.
    offset: d.signal_offset_ticks | 0,
    // 주기를 지점마다 다르게 둘 수 있다. 전부 같으면 학생이 한 번 외우면 끝난다.
    cycle: d.signal_cycle ? createSignals({ scene: { signals: { cycle: d.signal_cycle } } }) : null,
    // 거리로 시작하는 대본. 있으면 주기 시계 대신 이쪽을 쓴다.
    script: d.script || null,
    // 신호등이 서 있는 지점인가. 0 도 유효한 위상이라 값의 유무로 판단한다.
    hasSignal: d.expect === 'signal' || d.signal_offset_ticks !== undefined
      || !!(d.script && d.script.signal),
    // 이 지점이 지켜보는 장애물. 상황 판단(situation)이 여기서 나온다.
    watch: Array.isArray(d.watch) ? d.watch.slice() : [],
    base: d.base || null,
  }));
  if (!list.length) return null;

  const points = track.centerline;
  const acc = cumulative(points);
  const total = acc[acc.length - 1];
  for (const d of list) d.s = arcOf(points, acc, d.x, d.y);
  list.sort((a, b) => a.s - b.s);

  const rule = (challenge.rules && challenge.rules.decision) || {};
  const signals = createSignals(challenge);
  return {
    list,
    signals,
    total,
    points,
    acc,
    // 합성 규칙(무엇이 무엇보다 강한가, 무엇이 어떤 행동을 요구하는가)은 매니페스트가 소유한다.
    situation: challenge.scene.situation || null,
    // 카메라가 지금 무엇을 볼 수 있는지. 1인칭 렌더도 같은 값을 쓴다.
    view: challenge.scene.camera_view || null,
    stopHoldTicks: rule.stop_hold_ticks || 100,
    // 요구가 바뀐 직후 학생 코드가 반응할 시간. loop 의 delay 만큼은 이전 속도가 남는다.
    reactTicks: rule.react_ticks | 0,
    slowLimit: rule.slow_limit_mm_s || 210,
    penaltyTicks: rule.penalty_ticks || 300,
  };
}

/** 우선순위 표에서 더 강한 쪽. 표는 매니페스트가 소유한다(엔진에 순서를 적지 않는다). */
function strongerOf(situation, a, b) {
  const order = (situation && situation.priority) || [];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia <= ib ? a : b;
}


/**
 * 이 챌린지에서 채점되는 자리의 수. 판단 지점 + 지점이 지켜보지 않는 장애물.
 * 계기판·결과 카드·제출 보고서가 모두 이 하나를 쓴다 — 두 곳에서 따로 세면 값이 갈린다.
 */
export function judgedPointsOf(challenge) {
  const decisions = (challenge.scene && challenge.scene.decisions) || [];
  const obstacles = (challenge.scene && challenge.scene.obstacles) || [];
  const watched = new Set(decisions.flatMap((d) => d.watch || []));
  return decisions.length + obstacles.filter((o) => !watched.has(o.id)).length;
}

export function decisionState(sim) {
  if (!sim.decisions) return null;
  if (!sim.decisionRun) {
    sim.decisionRun = {
      lastS: null,
      inZone: null,
      zone: null,
      results: [],
      violations: 0,
      byKind: {},
      correct: 0,
      seenTotal: 0,
      next: null,       // { id, label, expect, remain_mm }
      active: null,     // { id, label, expect } — 지금 판정 중
      script: createScriptRun(),
    };
  }
  return sim.decisionRun;
}

export function resetDecisions(sim) {
  sim.decisionRun = null;
  decisionState(sim);
}

function speedOf(sim) {
  const v = sim.vehicle;
  return Math.abs(((v.pwmL + v.pwmR) / 2) / 255) * (sim.kitSpeed || 0);
}

/** 그 순간의 신호 색. 대본이 있으면 대본이, 없으면 주기 시계가 정한다. */
export function colorOf(sim, d, tick) {
  if (d.script && d.script.signal) {
    const run = sim.decisionRun;
    const e = run ? elapsedOf(run.script, d.id, tick) : null;
    const step = phaseAt(d.script.signal, { color: d.script.before || 'green' }, e);
    return step.color;
  }
  return signalAt(d.cycle || sim.decisions.signals, d.offset, tick);
}

/** 신호 색이 요구하는 행동. 대응표는 매니페스트가 있으면 그쪽을 쓴다. */
function signalExpect(sim, d, tick) {
  const cfg = sim.decisions;
  const color = colorOf(sim, d, tick);
  const table = (cfg.situation && cfg.situation.signal) || SIGNAL_EXPECT;
  return table[color] || 'go';
}

/**
 * 지금 이 지점이 요구하는 행동.
 *   expect:"stop"|"slow"|"go" — 고정
 *   expect:"signal"           — 그 순간의 신호 색
 *   expect:"situation"        — 신호 색과 '지금 카메라에 보이는' 장애물을 합쳐 더 강한 쪽
 * 합성 순서도 장애물별 요구 행동도 매니페스트(scene.situation)가 소유한다.
 */
export function expectOf(sim, d, tick) {
  const cfg = sim.decisions;
  if (d.expect === 'signal') return signalExpect(sim, d, tick);
  if (d.expect !== 'situation') return d.expect;
  const rule = cfg.situation;
  let out = d.base || (rule && rule.base) || 'go';
  if (d.hasSignal) out = strongerOf(rule, out, signalExpect(sim, d, tick));
  const obs = sim.obstacles;
  if (obs && rule && rule.obstacle) {
    for (const id of d.watch) {
      const o = obs.list.find((x) => x.id === id);
      if (!o) continue;
      const st = obstacleAt(obs, o, tick, obstacleState(sim));
      if (!st.blocking) continue;
      // 화면에 보이지 않는 장애물은 정답을 바꾸지 않는다. 못 본 것을 틀렸다고 할 수 없다.
      if (!inCameraView(sim, st.x, st.y)) continue;
      // 그 장애물이 스스로 요구하는 행동이 있으면 그것을 따른다(건너는 중인 사람 = 서행 등).
      const want = o.requires || rule.obstacle[o.kind];
      if (want) out = strongerOf(rule, out, want);
    }
  }
  return out;
}

/** 화면이 쓰는 신호 색. 판정에 쓰는 값과 같은 함수에서 나온다. */
export function signalColorOf(sim, d, tick) {
  const cfg = sim.decisions;
  if (!cfg || !d.hasSignal) return null;
  if (!d.script && !cfg.signals) return null;
  return colorOf(sim, d, tick === undefined ? sim.tick : tick);
}

/**
 * 구간을 빠져나갈 때 실제 주행으로 규칙을 지켰는지 판정한다.
 *
 * 장애물이 딸린 지점은 "몇 초 멈췄나" 가 아니라 "막혀 있는 동안 지나갔나" 로 본다.
 * 보행자는 정해진 시간이 아니라 길을 비킬 때까지 기다려야 하는 것이라, 시간으로 재면
 * 규칙을 다 지키고도 위반이 되는 경우가 생긴다.
 */
function judge(cfg, zone) {
  // 막힌 채로 지나갔더라도, 구역 안에서 화면이 한 번도 정지를 요구한 적이 없었다면
  // 학생이 볼 수 없었던 것이다 — 못 본 것을 틀렸다고 하지 않는다.
  if (zone.passedBlocked && zone.liveStop) return false;
  if (zone.expect === DECISION.STOP) {
    if (zone.watching) return true;         // 보이는데도 막힌 채로 지나가지 않았다면 지킨 것이다
    // 충분히 서 있었거나, 서 있는 동안 신호가 풀렸다면 지킨 것이다.
    return zone.stoppedTicks >= cfg.stopHoldTicks || zone.liveGo;
  }
  // 서행 — 속도는 '서행을 요구하는 동안' 낸 것만 본다. 도중에 초록으로 바뀐 뒤의 가속은 정상이다.
  if (zone.expect === DECISION.SLOW) return zone.maxSpeedRequired <= cfg.slowLimit;
  // 진행 — 멈춘 적이 없어야 한다. 다만 구역 안에서 신호가 정지를 요구한 적이 있다면
  // 그때 멈춘 것은 위반이 아니다. 정답은 들어갈 때의 신호로 굳지만, 보고 멈춘 것을 벌하지는 않는다.
  return zone.stoppedTicks === 0 || zone.liveStop;
}

/**
 * 한 tick 분 갱신. stepSim 의 물리 뒤에 불린다.
 * 사이드이펙트는 sim.decisionRun 안에서만 일어난다 — 랩타임·이탈 판정에 손대지 않는다.
 */
export function stepDecisions(sim) {
  const cfg = sim.decisions;
  if (!cfg) return;
  const st = decisionState(sim);
  const near = nearestOnPath(cfg.points, sim.vehicle.x, sim.vehicle.y);
  if (!near) return;
  const [ax, ay] = cfg.points[near.i];
  const [bx, by] = cfg.points[(near.i + 1) % cfg.points.length];
  const s = cfg.acc[near.i] + Math.hypot(bx - ax, by - ay) * near.t;
  st.lastS = s;

  // 대본 시작 — 얼마나 가까이 왔는지로 정한다. 속도를 바꿔도 같은 자리에서 같은 일이 벌어진다.
  for (const d of cfg.list) {
    if (!d.script) continue;
    // 앞으로 남은 거리다. -총길이/2 로 접으면 저 멀리 앞에 있는 것이 '방금 지나간 것' 으로
    // 읽혀 출발하자마자 대본이 시작된다.
    let gap = (d.s - s) % cfg.total;
    if (gap < 0) gap += cfg.total;
    fireIfNear(st.script, d.id, gap, d.script.trigger_mm, sim.tick);
  }

  // 지금 어느 구간 안에 있나
  let inside = null;
  for (const d of cfg.list) {
    let gap = s - d.s;
    if (gap > cfg.total / 2) gap -= cfg.total;
    if (gap < -cfg.total / 2) gap += cfg.total;
    if (Math.abs(gap) <= d.zone_mm / 2) { inside = d; break; }
  }

  const speed = speedOf(sim);
  if (inside && (!st.zone || st.zone.id !== inside.id)) {
    // 진입 — 이 순간의 분류 결과가 그 지점의 답이다.
    // 진입하는 순간의 신호가 이 지점의 정답으로 굳는다. 이후 색이 바뀌어도 채점 기준은 그대로다.
    const resolved = expectOf(sim, inside, sim.tick);
    const ost = obstacleState(sim);
    st.zone = {
      id: inside.id, expect: resolved, label: inside.label,
      entrySeen: readMl(sim).label, seenTicks: [0, 0, 0, 0], zoneTicks: 0,
      stoppedTicks: 0, maxSpeed: 0,
      // 이 지점이 지켜보는 장애물과, 구간에 들어온 시점의 '막힌 채 지나감' 기록 길이
      watching: inside.watch.length > 0,
      watch: inside.watch,
      obsMark: ost ? ost.blocked.length : 0,
      hitMark: ost ? ost.hits.length : 0,
      passedBlocked: false,
      liveStop: false,
      liveGo: false,
      maxSpeedRequired: 0,
      requiredSince: null,
    };
    st.active = { id: inside.id, label: inside.label, expect: resolved };
  }
  if (inside && st.zone && st.zone.id === inside.id) {
    // 신호등은 진입 순간의 색으로 굳는다(31차 확정). 상황 지점은 구간 안에서 계속 다시 본다 —
    // 보행자가 들어온 뒤에 멈춘 학생이 위반이 되면 안 되기 때문이다. 요구는 더 강한 쪽으로만 올라간다.
    // 구역 안에서 지금 이 순간 무엇을 요구하는지. 신호가 바뀌면 여기서 바뀐다.
    const liveNow = expectOf(sim, inside, sim.tick);
    if (liveNow === DECISION.STOP) st.zone.liveStop = true;
    if (liveNow === DECISION.GO) st.zone.liveGo = true;
    // 서행·정지를 요구하기 시작한 시점. 반응 시간이 지난 뒤의 속도만 본다.
    if (liveNow === DECISION.GO) st.zone.requiredSince = null;
    else if (st.zone.requiredSince === null) st.zone.requiredSince = sim.tick;
    if (st.zone.requiredSince !== null
      && sim.tick - st.zone.requiredSince >= cfg.reactTicks
      && speed > st.zone.maxSpeedRequired) {
      st.zone.maxSpeedRequired = speed;
    }
    if (inside.expect === 'situation') {
      const merged = strongerOf(cfg.situation, st.zone.expect, liveNow);
      if (merged !== st.zone.expect) {
        st.zone.expect = merged;
        st.active.expect = merged;
      }
    }
    if (speed < 1) st.zone.stoppedTicks += 1;
    if (speed > st.zone.maxSpeed) st.zone.maxSpeed = speed;
    // 들어온 직후 잠깐(READ_WINDOW) 동안 무엇으로 보였는지 센다.
    // 한 순간만 보면 프레임 흔들림에 휘둘리고, 구간 전체를 보면 지나간 뒤의 화면까지 섞인다.
    st.zone.zoneTicks += 1;
    if (st.zone.watching) {
      const ost = obstacleState(sim);
      const fresh = ost ? ost.blocked.slice(st.zone.obsMark) : [];
      if (fresh.some((b) => st.zone.watch.includes(b.id))) st.zone.passedBlocked = true;
    }
    if (st.zone.zoneTicks <= READ_WINDOW) {
      const lab = readMl(sim).label;
      if (lab >= 0 && lab <= 3) st.zone.seenTicks[lab] += 1;
    }
  }
  if (!inside && st.zone) {
    // 이탈 — 여기서 한 번만 채점한다.
    const ok = judge(cfg, st.zone);
    const expectClass = CLASS_OF[st.zone.expect] || 0;
    // 가장 오래 보인 클래스. 동점이면 번호가 작은 쪽(0=모름 포함).
    let seen = 0;
    for (let c = 1; c <= 3; c++) if (st.zone.seenTicks[c] > st.zone.seenTicks[seen]) seen = c;
    st.zone.seen = seen;
    // 이 구간 안에서 지켜보던 장애물과 실제로 부딪혔다면, 그 충돌이 이미 한 건으로 세어졌다.
    // 같은 한 번의 잘못을 구간 위반으로 또 세면 벌이 두 배가 된다.
    const ost2 = obstacleState(sim);
    // 피할 수 없었던 접촉은 위반으로 세지 않았으므로, 그것 때문에 구간 위반을 지우면 안 된다.
    const hitHere = ost2
      ? ost2.hits.slice(st.zone.hitMark).some((h) => h.avoidable && st.zone.watch.includes(h.id))
      : false;
    const kind = ok ? null : violationKindOf(st.zone);
    st.results.push({
      id: st.zone.id, expect: st.zone.expect, seen, entry_seen: st.zone.entrySeen,
      ok, kind, double_counted: !ok && hitHere,
      classified_ok: st.zone.seen === expectClass,
      stopped_ticks: st.zone.stoppedTicks, max_speed: Math.round(st.zone.maxSpeed),
      passed_blocked: st.zone.passedBlocked,
    });
    st.seenTotal += 1;
    if (ok) {
      st.correct += 1;
    } else if (!hitHere) {
      st.violations += 1;
      st.byKind[kind] = (st.byKind[kind] || 0) + 1;
      // 어겼으면 그 자리에 선다(55차 마감 D'). 그 구간에서 이미 부딪혀 선 경우(hitHere)는
      // 여기까지 오지 않는다 — 같은 한 번의 잘못으로 두 번 서지 않는다.
      stopForViolation(sim, kind, st.zone.label);
    }
    st.zone = null;
    st.active = null;
  }

  // 다음 지점까지 남은 거리 (화면 안내용)
  let bestGap = Infinity;
  let bestD = null;
  for (const d of cfg.list) {
    let gap = d.s - s;
    if (gap < 0) gap += cfg.total;
    if (gap < bestGap) { bestGap = gap; bestD = d; }
  }
  st.next = bestD
    ? { id: bestD.id, label: bestD.label, expect: expectOf(sim, bestD, sim.tick), remain_mm: Math.round(bestGap) }
    : null;
}

/** 주행 결과 요약. 기록에 남고 제출물에도 들어간다. */
export function decisionSummary(sim) {
  const cfg = sim.decisions;
  if (!cfg) return null;
  const st = decisionState(sim);
  const total = st.seenTotal;
  const classified = st.results.filter((r) => r.classified_ok).length;
  return {
    total,
    correct: st.correct,
    violations: st.violations,
    by_kind: { ...st.byKind },
    perfect: total > 0 && st.violations === 0,
    penalty_ticks: st.violations * cfg.penaltyTicks,
    classify_correct: classified,
    classify_rate: total ? Math.round((classified * 100) / total) : 0,
    results: st.results.slice(),
  };
}
