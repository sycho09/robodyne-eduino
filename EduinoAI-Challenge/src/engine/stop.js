/**
 * engine/stop.js — 규칙을 어기면 그 자리에 선다 (55차 마감 D').
 *
 * 왜 이렇게 하는가:
 *   예전에는 어긴 만큼 페널티 tick 을 기록에 더했다. 학생 눈에는 주행이 그대로 흐르고
 *   끝난 뒤 숫자만 늘어 있어서, 무엇 때문에 늦었는지가 화면에 없었다.
 *   이제 벌은 하나뿐이다 — 실제로 늦어지는 것. 어기면 그 자리에 서고, 선 시간은
 *   기록에 그대로 흐른다. 페널티 tick 은 전부 0 이다.
 *
 *   부딪힘 하나에만 멈춤을 걸면 부딪히지 않고 신호만 무시하는 코드가 그대로 빠져나간다.
 *   그래서 세 가지 전부에 건다 — 부딪힘 · 막힌 채 지나감 · 판단 지점 위반.
 *
 * 결정론:
 *   언제까지 서는지는 tick 하나의 함수다. 난수도 실시간 시계도 끼지 않는다.
 *   서 있는 동안에도 학생 프로그램은 그대로 돌고 tick 도 오른다 — 멈춘 것은 차이지
 *   프로그램이 아니다.
 *
 * 값은 매니페스트가 소유한다(rules.violation_stop_ms). 코드에 초를 박지 않는다.
 *   숫자 하나        모든 종류에 같은 값
 *   { default, … }   종류마다 다른 값. 없는 종류는 default 를 쓴다
 * 값을 적지 않은 챌린지는 0 이라 한 tick도 서지 않는다 — 지금까지와 같다.
 */

import { TICK_MS } from './clock.js';

export function createStopRun() {
  return {
    until: 0,      // 이 tick 전까지는 서 있다
    ticks: 0,      // 실제로 서 있던 tick 수 (엔진이 센다)
    last: null,    // 마지막으로 무엇을 어겨서 섰는가 — 화면이 그대로 옮긴다
    log: [],       // 선 사유 전부. 결과·과제물이 읽어 간다
  };
}

/** 그 종류를 어겼을 때 서는 시간(tick). 매니페스트가 없으면 0 이다. */
export function stopTicksOf(challenge, kind) {
  const spec = (challenge.rules || {}).violation_stop_ms;
  if (spec === undefined || spec === null) return 0;
  const ms = typeof spec === 'number'
    ? spec
    : (spec[kind] !== undefined ? spec[kind] : spec.default);
  return Math.round((Number(ms) || 0) / TICK_MS);
}

/**
 * 한 건 어겼다. 어긴 그 tick 은 이미 움직인 tick 이므로 다음 tick 부터 선다.
 * 겹치면 더 늦은 쪽까지 선다 — 두 번 어겼는데 한 번만 서면 두 번째가 공짜가 된다.
 */
export function stopForViolation(sim, kind, label) {
  const run = sim.stopRun;
  if (!run) return;
  const ticks = stopTicksOf(sim.challenge, kind);
  if (ticks <= 0) return;
  run.until = Math.max(run.until, sim.tick + 1 + ticks);
  run.last = { kind, label: label || '', ticks, tick: sim.tick };
  run.log.push(run.last);
}

/** 지금 이 tick 에 차가 서 있는가. */
export function isStopped(sim) {
  return !!(sim.stopRun && sim.stopRun.until > sim.tick);
}
