/**
 * engine/sim.js — 결정론 시뮬레이션 상태 기계.
 *
 * 같은 코드 + 같은 매니페스트 = 항상 같은 결과.
 *  - 난수 없음, 실시간 시계 없음, 가변 timestep 없음.
 *  - 재생 속도나 프레임레이트는 결과에 영향을 주지 않는다.
 *    (렌더 루프는 누산기로 tick 수만 맞춰 호출할 뿐이다.)
 *
 * 한 tick 처리 순서(고정):
 *   1) 학생 프로그램을 다음 yield 까지 실행 (모터 상태가 여기서 바뀐다)
 *   2) 현재 모터 상태로 1 tick 물리 적분
 *   3) 이탈 판정 (진입/이탈 순간에만 이벤트)
 *   4) 체크포인트 · 랩 판정
 *   5) tick 증가, 한도 검사
 */

import { TICK_MS } from './clock.js';
import { EVENT, emit } from './events.js';
import { clampPwm, createVehicleState, deriveKitSteps, stepVehicle } from './vehicle.js';
import { buildTrack, crossedCheckpoint, isOffTrack } from './track.js';
import { steerAutopilot } from './autopilot.js';
import { createDecisions, decisionSummary, resetDecisions, stepDecisions } from './decisions.js';
import { createObstacles, obstacleSummary, resetObstacles, stepObstacles } from './obstacles.js';
import { createStopRun, isStopped } from './stop.js';

export const SIM_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  ENDED: 'ended',       // 규칙(이탈 누적)으로 시도가 끝난 상태
  FINISHED: 'finished',
});

const TRAIL_SAMPLE_EVERY = 2;
const TRAIL_MAX = 8000;

/**
 * 시리얼 출력 보관함. 화면에 찍기만 하는 곳이라 시뮬 상태에 영향을 주지 않는다 —
 * tick 도 소비하지 않고, 여기에 무엇이 쌓이든 랩타임과 물리는 그대로다.
 */
const SERIAL_MAX = 300;

function createSerialLog() {
  const lines = [];
  let dropped = 0;
  return {
    lines,
    get dropped() { return dropped; },
    push(row) {
      lines.push(row);
      while (lines.length > SERIAL_MAX) { lines.shift(); dropped += 1; }
    },
    clear() { lines.length = 0; dropped = 0; },
  };
}

export function createSim({ challenge, kit }) {
  const sim = {
    challenge,
    kit,
    track: buildTrack(challenge.scene),
    steps: deriveKitSteps(kit, challenge.motor_trim),
    maxTicks: challenge.limits.max_sim_ticks,
    rules: challenge.rules,
    ended: null,          // { reason, tick } — 시도 종료 사유
    tick: 0,
    status: SIM_STATUS.IDLE,
    error: null,
    vehicle: createVehicleState(challenge.scene.spawn),
    offtrack: { active: false, count: 0 },
    lap: {
      started: false,
      startTick: null,
      expectedIdx: 0,
      count: 0,
      lastTicks: null,
      bestTicks: null,
    },
    events: [],
    trail: [],
    program: null, // { gen, guard } — sandbox 가 주입
  };
  // 자율주행 챌린지에서만 켜진다. 켜지 않은 챌린지는 아래 두 훅이 아예 호출되지 않으므로
  // 기존 주행의 tick 수열은 한 tick도 달라지지 않는다.
  sim.autopilot = !!challenge.scene.autopilot;
  sim.kitSpeed = kit.drive.max_speed_mm_s;
  sim.decisions = createDecisions(challenge, kit, sim.track);
  sim.obstacles = createObstacles(challenge, sim.track);
  sim.serial = createSerialLog();
  resetSim(sim);
  return sim;
}

/** 시뮬레이션 상태만 초기화한다. 컴파일된 프로그램은 makeProgram 으로 다시 만든다. */
export function resetSim(sim, makeProgram = sim._makeProgram) {
  sim._makeProgram = makeProgram || null;
  sim.tick = 0;
  sim.error = null;
  sim.ended = null;
  sim.vehicle = createVehicleState(sim.challenge.scene.spawn);
  sim.offtrack = { active: false, count: 0 };
  sim.lap = { started: false, startTick: null, expectedIdx: 0, count: 0, lastTicks: null, bestTicks: null };
  sim.events = [];
  sim.progress = { x: sim.vehicle.x, y: sim.vehicle.y, sinceTick: 0 };
  sim.trail = [{ x: sim.vehicle.x, y: sim.vehicle.y }];
  sim.stopRun = createStopRun();
  if (sim.decisions) resetDecisions(sim);
  if (sim.obstacles) resetObstacles(sim);
  if (sim.serial) sim.serial.clear();
  sim.program = sim._makeProgram ? sim._makeProgram(sim) : null;
  sim.status = sim.program ? SIM_STATUS.RUNNING : SIM_STATUS.IDLE;
  // 시작 지점이 노면 밖일 수도 있으므로 초기 상태를 한 번 평가해 둔다.
  sim.offtrack.active = isOffTrack(sim.track, sim.vehicle.x, sim.vehicle.y);
  return sim;
}

/** 좌·우 모터 PWM 을 설정한다. 기본 계층과 심화 계층 모두 결국 이 함수로 들어온다. */
export function setMotorPwm(sim, left, right) {
  const max = sim.steps.pwmMax;
  sim.vehicle.pwmL = clampPwm(left, max);
  sim.vehicle.pwmR = clampPwm(right, max);
}

function endAttempt(sim, reason) {
  sim.ended = { reason, tick: sim.tick };
  sim.status = SIM_STATUS.ENDED;
  setMotorPwm(sim, 0, 0);
}

export function stepSim(sim) {
  if (sim.status !== SIM_STATUS.RUNNING) return sim.status;

  // 1) 학생 프로그램
  if (sim.program) {
    sim.program.guard.reset();
    try {
      const r = sim.program.gen.next();
      if (r.done) {
        // 정상 구조에서는 도달하지 않는다(loop 는 무한). 방어적으로 처리.
        sim.status = SIM_STATUS.FINISHED;
        setMotorPwm(sim, 0, 0);
        return sim.status;
      }
    } catch (e) {
      sim.status = SIM_STATUS.ERROR;
      sim.error = { message: e && e.message ? e.message : String(e), line: e && e.line, col: e && e.col };
      emit(sim, EVENT.ERROR, { message: sim.error.message });
      setMotorPwm(sim, 0, 0);
      return sim.status;
    }
  }

  // 1.5) 자율주행 조향 — 속도는 학생이, 좌우 차이는 엔진이 정한다
  if (sim.autopilot) steerAutopilot(sim);

  const prev = { x: sim.vehicle.x, y: sim.vehicle.y };

  // 2) 물리
  // 55차 마감 D' — 규칙을 어겨 서 있는 동안은 바퀴 값이 무엇이든 나아가지 않는다.
  // 학생 프로그램은 그대로 돈다(멈춘 것은 차이지 프로그램이 아니다). tick 도 계속 오르므로
  // 선 시간은 기록에 그대로 흐른다 — 늦어지는 것이 곧 벌이다.
  const stopped = isStopped(sim);
  if (stopped) sim.stopRun.ticks += 1;
  else stepVehicle(sim.vehicle, sim.steps);
  const cur = { x: sim.vehicle.x, y: sim.vehicle.y };

  // 2.5) 판단 지점 · 움직이는 장애물 (읽기만 한다 — 랩타임·이탈 판정에 손대지 않는다)
  if (sim.decisions) stepDecisions(sim);
  if (sim.obstacles) stepObstacles(sim);

  // 3) 이탈 (이벤트 + 카운터만. 페널티/시도 종료 없음 — 1차 지시서 확정)
  const off = isOffTrack(sim.track, cur.x, cur.y);
  if (off && !sim.offtrack.active) {
    sim.offtrack.active = true;
    sim.offtrack.count += 1;
    emit(sim, EVENT.OFFTRACK_ENTER, { x: cur.x, y: cur.y, count: sim.offtrack.count });
    // 이탈은 즉시 실패가 아니다. 누적 횟수가 규칙에 도달했을 때만 시도가 끝난다.
    const maxEvents = sim.rules && sim.rules.offtrack ? sim.rules.offtrack.max_events : null;
    if (maxEvents && sim.offtrack.count >= maxEvents) {
      sim.tick += 1;
      endAttempt(sim, 'offtrack');
      return sim.status;
    }
  } else if (!off && sim.offtrack.active) {
    sim.offtrack.active = false;
    emit(sim, EVENT.OFFTRACK_EXIT, { x: cur.x, y: cur.y });
  }

  // 4) 체크포인트 · 랩
  updateLap(sim, prev, cur);

  // 5) tick
  sim.tick += 1;
  if (sim.trail.length < TRAIL_MAX && sim.tick % TRAIL_SAMPLE_EVERY === 0) {
    sim.trail.push({ x: cur.x, y: cur.y });
  }
  // 5-1) 정체 규칙 (모드2). rules.no_progress 가 없는 챌린지에서는 아무 일도 하지 않는다.
  const noProgress = sim.rules ? sim.rules.no_progress : null;
  if (noProgress) {
    const moved = Math.hypot(cur.x - sim.progress.x, cur.y - sim.progress.y);
    if (moved >= (noProgress.min_move_mm || 50)) {
      sim.progress = { x: cur.x, y: cur.y, sinceTick: sim.tick };
    } else if (stopped) {
      // 55차 마감 D' — 벌로 서 있는 것은 정체가 아니다. 정체 규칙은 "학생 코드가 차를
      // 못 움직이고 있다" 를 잡는 것이라, 규칙이 세운 시간까지 세면 벌이 시도 종료가 된다.
      // 서 있는 동안은 시계를 함께 밀어 둔다.
      sim.progress.sinceTick += 1;
    } else if (sim.tick - sim.progress.sinceTick >= noProgress.sim_ticks) {
      emit(sim, EVENT.NO_PROGRESS, { ticks: sim.tick });
      endAttempt(sim, 'no_progress');
      return sim.status;
    }
  }

  const ruleTimeout = sim.rules && sim.rules.timeout ? sim.rules.timeout.sim_ticks : null;
  if (ruleTimeout && sim.tick >= ruleTimeout) {
    emit(sim, EVENT.TIMEOUT, { ticks: sim.tick });
    endAttempt(sim, 'timeout');
  } else if (sim.tick >= sim.maxTicks) {
    sim.status = SIM_STATUS.TIMEOUT;
    emit(sim, EVENT.TIMEOUT, { ticks: sim.tick });
  }
  return sim.status;
}

function updateLap(sim, prev, cur) {
  const order = sim.track.lap.order;
  const requireAll = sim.track.lap.require_all !== false;
  const expectedId = requireAll ? order[sim.lap.expectedIdx] : sim.track.lap.finish;
  const cp = sim.track.checkpoints.find((c) => c.id === expectedId);
  if (!cp || !crossedCheckpoint(cp, prev, cur)) return;

  emit(sim, EVENT.CHECKPOINT, { id: cp.id });

  const isFinish = cp.id === sim.track.lap.finish;
  if (isFinish) {
    if (!sim.lap.started) {
      // 아웃랩 종료: 여기서부터 1랩 계측을 시작한다.
      sim.lap.started = true;
      sim.lap.startTick = sim.tick;
    } else {
      const lapTicks = sim.tick - sim.lap.startTick;
      sim.lap.lastTicks = lapTicks;
      sim.lap.count += 1;
      if (sim.lap.bestTicks === null || lapTicks < sim.lap.bestTicks) sim.lap.bestTicks = lapTicks;
      sim.lap.startTick = sim.tick;
      emit(sim, EVENT.LAP, {
        lap: sim.lap.count,
        ticks: lapTicks,
        ms: lapTicks * TICK_MS,
        offtrack: sim.offtrack.count,
      });
    }
  }

  if (requireAll) {
    sim.lap.expectedIdx = (sim.lap.expectedIdx + 1) % order.length;
  }
}

/**
 * 기록 = 주행 시간 + 페널티. 페널티 폭은 전부 매니페스트가 소유한다 — 여기에 숫자는 없다.
 *   이탈 페널티: scoring.penalty.offtrack_ticks x 이탈 횟수
 *   위반 페널티: rules.decision.penalty_ticks x (판단 지점 위반 + 장애물 위반)
 */
export function scoreRun(sim, lapTicks) {
  const pen = (sim.challenge.scoring && sim.challenge.scoring.penalty) || {};
  const offEach = pen.offtrack_ticks | 0;
  const offtrack = sim.offtrack.count * offEach;

  const d = decisionSummary(sim);
  const o = obstacleSummary(sim);

  // 종류별로 모은다. 무엇을 어겼는지에 따라 벌이 다르다 — 값은 전부 매니페스트가 소유한다.
  const byKind = { ...((d && d.by_kind) || {}) };
  if (o) {
    for (const h of o.hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
    // 판단 지점이 지켜보지 않는 장애물을 막힌 채 지나간 것. 종류가 따로 없으니 옛 규칙대로 센다.
    if (o.violations) byKind.blocked_pass = (byKind.blocked_pass || 0) + o.violations;
  }
  const rules = (sim.challenge.rules && sim.challenge.rules.violations) || null;
  const legacyEach = sim.decisions ? sim.decisions.penaltyTicks : 0;
  let violations = 0;
  let violationTicks = 0;
  const kinds = [];
  for (const [kind, count] of Object.entries(byKind)) {
    if (!count) continue;
    const spec = (rules && rules[kind]) || null;
    const each = spec && spec.penalty_ticks !== undefined ? spec.penalty_ticks : legacyEach;
    violations += count;
    violationTicks += count * each;
    kinds.push({ kind, label: (spec && spec.label) || kind, count, each_ticks: each, ticks: count * each });
  }
  kinds.sort((a, b) => b.ticks - a.ticks || a.kind.localeCompare(b.kind));

  const penalty = offtrack + violationTicks;
  return {
    drive_ticks: lapTicks,
    penalty_ticks: penalty,
    offtrack_ticks: offtrack,
    violation_ticks: violationTicks,
    offtrack_count: sim.offtrack.count,
    offtrack_each_ticks: offEach,
    violations,
    // 종류별 내역. 계기에는 합만 보이고 결과·과제물이 이 목록을 쓴다.
    violation_kinds: kinds,
    // 55차 마감 D' — 규칙을 어겨 서 있던 시간. 페널티가 아니라 주행 시간 안에 이미 흐른
    // 값이다. 그래서 total_ticks 에 더하지 않는다 — 더하면 한 번 늦은 것을 두 번 벌한다.
    violation_stop_ticks: sim.stopRun ? sim.stopRun.ticks : 0,
    // 무엇을 어겨 얼마나 섰는가. 결과·과제물이 이 목록을 읽는다.
    violation_stops: sim.stopRun ? sim.stopRun.log.slice() : [],
    violation_each_ticks: legacyEach,
    total_ticks: lapTicks + penalty,
  };
}

/** 진행 중인 랩의 경과 tick (아웃랩 중이면 null) */
export function currentLapTicks(sim) {
  if (!sim.lap.started) return null;
  return sim.tick - sim.lap.startTick;
}
