/**
 * engine/events.js — 엔진이 발생시키는 이벤트 종류.
 *
 * 1차 범위에서 이탈은 "이벤트 + 카운터"가 전부다.
 * 페널티/시도 종료/실패 판정 로직은 여기에도, 어디에도 넣지 않는다. (미확정)
 */

export const EVENT = Object.freeze({
  OFFTRACK_ENTER: 'offtrack_enter',
  NO_PROGRESS: 'no_progress',
  OFFTRACK_EXIT: 'offtrack_exit',
  CHECKPOINT: 'checkpoint',
  LAP: 'lap',
  TIMEOUT: 'timeout',
  ERROR: 'error',
});

export function emit(sim, type, data = {}) {
  sim.events.push({ tick: sim.tick, type, ...data });
  if (sim.events.length > 512) sim.events.shift();
}
