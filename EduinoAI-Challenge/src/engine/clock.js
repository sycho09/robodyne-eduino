/**
 * engine/clock.js — 결정론 시계.
 *
 * TICK_MS 는 엔진 상수다. 매니페스트에서 바꿀 수 없다.
 * (바꾸면 과거에 기록된 랩타임과 비교가 불가능해진다.)
 * 시뮬레이션 시간은 오직 tick 카운터로만 흐른다.
 * Date/performance/Math.random 은 engine/ 안에서 절대 사용하지 않는다.
 */

export const TICK_MS = 10;
export const TICKS_PER_SECOND = 1000 / TICK_MS; // 100

/** delay(ms) → tick 수. 반올림이므로 10ms 미만은 0 tick이 된다. */
export function msToTicks(ms) {
  return Math.round(ms / TICK_MS);
}

export function ticksToMs(ticks) {
  return ticks * TICK_MS;
}

/** 1234 tick → "12.340". 값이 없으면 0.000 (대시 표기는 세그먼트처럼 보여 쓰지 않는다) */
export function formatTicks(ticks) {
  if (ticks === null || ticks === undefined) return '0.000';
  const ms = ticksToMs(ticks);
  const sec = Math.floor(ms / 1000);
  const rem = ms % 1000;
  return `${sec}.${String(rem).padStart(3, '0')}`;
}
