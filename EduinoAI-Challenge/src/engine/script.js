/**
 * engine/script.js — 코스 대본 (자율주행 챌린지 전용).
 *
 * 왜 필요한가:
 *   신호와 장애물이 제 주기로 도는 시계이면, 같은 코드로 같은 속도를 내도 통과 시각에 따라
 *   빨강을 만나기도 하고 초록을 만나기도 한다. 그러면 학습하지 않고 빨리 달려 운 좋게
 *   초록만 만나는 쪽이 이긴다 — 학습 챌린지인데 카메라를 켜지 않는 것이 최적 전략이 된다.
 *
 * 무엇을 바꾸는가:
 *   상황이 벌어지는 시점을 tick 이 아니라 "RC카가 얼마나 가까이 왔는가" 로 정한다.
 *   거리로 정하면 속도를 바꿔도 같은 자리에서 같은 상황이 벌어진다.
 *
 *   다만 시작만 거리로 정하고, 시작한 뒤에는 tick 으로 흐른다. 그러지 않으면 멈춰 선 학생
 *   앞에서 보행자가 얼어붙어 영원히 건너지 않는다.
 *
 * 대본은 전부 매니페스트가 소유한다. 이 파일은 무슨 상황이 몇 개 있는지 모른다.
 */

/** 대본 진행 상태. 주행마다 새로 만든다 — 되돌리면 같은 자리에서 같은 일이 다시 일어난다. */
export function createScriptRun() {
  return { firedAt: {} };
}

/**
 * 접근 거리를 보고 대본을 시작시킨다.
 * 한 번 시작한 대본은 그 주행이 끝날 때까지 되돌리지 않는다 — 지나친 뒤에도 상태가 이어져야
 * 구역 안에서 판정이 흔들리지 않는다.
 *
 * @param {object} run   createScriptRun() 결과
 * @param {string} id    대본을 가진 것의 id
 * @param {number} gap   지금 남은 거리(mm). 지나쳤으면 음수.
 * @param {number} trigger 시작할 거리(mm)
 * @param {number} tick  지금 tick
 */
export function fireIfNear(run, id, gap, trigger, tick) {
  if (run.firedAt[id] !== undefined) return;
  if (!(trigger > 0)) return;
  if (gap <= trigger) run.firedAt[id] = tick;
}

/** 대본이 시작된 뒤 흐른 tick. 아직 시작 전이면 null. */
export function elapsedOf(run, id, tick) {
  const at = run.firedAt[id];
  return at === undefined ? null : tick - at;
}

/**
 * 시간표에서 지금 단계를 고른다.
 * 각 단계는 `ticks` 만큼 이어지고, `ticks` 가 없는 마지막 단계는 끝까지 이어진다.
 * 시작 전이면 `before` 를 돌려준다.
 */
export function phaseAt(steps, before, elapsed) {
  if (elapsed === null || !Array.isArray(steps) || !steps.length) return before;
  let acc = 0;
  for (const step of steps) {
    if (step.ticks === undefined) return step;
    acc += step.ticks;
    if (elapsed < acc) return step;
  }
  return steps[steps.length - 1];
}
