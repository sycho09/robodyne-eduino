/**
 * ui/words.js — 화면에 쓰는 말.
 *
 * 같은 값을 두 곳에서 다르게 부르면 학생은 다른 값으로 읽는다.
 * 계기·결과·과제물이 같은 말을 쓰도록 한곳에서 고른다.
 *
 * 챌린지마다 다르게 부를 수 있어야 하므로 매니페스트(scene.ui.words)가 소유한다.
 * 매니페스트에 없으면 지금까지 쓰던 말 그대로다 — 다른 챌린지는 한 글자도 달라지지 않는다.
 */

const FALLBACK = Object.freeze({
  offtrack: '코스 벗어남',
  laps: '돈 바퀴',
  violations: '규칙 위반',
});

export function wordsOf(challenge) {
  const own = (challenge && challenge.scene && challenge.scene.ui && challenge.scene.ui.words) || {};
  return (key) => own[key] || FALLBACK[key] || key;
}

/**
 * 목표 시간을 화면에 적는 방식(50차).
 *
 * 기록은 tick 단위라 소수 셋째 자리까지 뜻이 있다 — 15.820초는 15.82초와 다른 값이다.
 * 목표는 사람이 고른 둥근 수라 뒤에 붙는 0 이 뜻을 더하지 않는다. 그런데 같은 15초를
 * 목표 배너는 "15초", 허브 카드와 결과 모달은 "15.000초" 로 적고 있었다.
 * 목표는 어디서나 같은 모양으로 적는다 — 소수점 뒤의 0 만 떼고 기록 표기는 건드리지 않는다.
 */
export function formatGoal(formatted) {
  return String(formatted).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}
