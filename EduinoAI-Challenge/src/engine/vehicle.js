/**
 * engine/vehicle.js — 2휠 차동구동 운동학.
 *
 * 실물과 같은 구조로 둔다. 좌·우 모터 PWM 이 곧 바퀴 속도이고,
 * 전진과 회전은 그 차이에서 나온다. 학생이 PWM 을 올리면 실제로 빨라진다.
 *
 *   vL, vR = pwm/255 x max_speed_mm_s      (데드존 미만은 0)
 *   전진속도 v = (vL + vR) / 2
 *   각속도  w = (vR - vL) / wheel_base     (반시계 +)
 *
 * 관성·미끄러짐은 넣지 않는다. 즉시 반응하는 이상화 모델이라 결정론과 단순성이 유지된다.
 * heading 은 milli-degree 정수로 누적한다. 매 tick 정수로 반올림하므로 부동소수 누적이 없다.
 */

import { TICK_MS } from './clock.js';

const MDEG_PER_DEG = 1000;
const FULL_TURN_MDEG = 360 * MDEG_PER_DEG;
const RAD_TO_DEG = 180 / Math.PI;

export function degToMdeg(deg) {
  return Math.round(deg * MDEG_PER_DEG);
}

export function mdegToRad(mdeg) {
  return (mdeg / MDEG_PER_DEG) * Math.PI / 180;
}

export function clampPwm(value, max = 255) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const v = Math.trunc(value);
  return Math.max(-max, Math.min(max, v));
}

/**
 * 킷 스펙 → tick 당 계산에 필요한 상수 (매 tick 재계산하지 않는다)
 *
 * trim 은 실물 DC 모터의 개체차다. 좌·우 바퀴 속도에 곱해지는 고정 계수이며
 * 매니페스트가 소유한다. 난수가 아니므로 같은 코드는 언제나 같은 궤적을 그린다.
 */
export function deriveKitSteps(kit, trim) {
  const d = kit.drive;
  return {
    trimL: trim && typeof trim.left === 'number' ? trim.left : 1,
    trimR: trim && typeof trim.right === 'number' ? trim.right : 1,
    maxSpeed: d.max_speed_mm_s,
    pwmMax: d.pwm_max || 255,
    deadzone: d.deadzone_pwm,
    defaultPwm: d.default_pwm,
    wheelBase: kit.body.wheel_base_mm,
    dt: TICK_MS / 1000,
  };
}

export function createVehicleState(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    heading_mdeg: degToMdeg(spawn.heading_deg),
    pwmL: 0,
    pwmR: 0,
  };
}

/** 데드존을 지나지 못한 PWM 은 실물처럼 아예 움직이지 않는다. */
function wheelSpeed(pwm, steps, trim) {
  if (Math.abs(pwm) < steps.deadzone) return 0;
  return (pwm / steps.pwmMax) * steps.maxSpeed * trim;
}

/** 한 tick 적분. v 를 제자리에서 갱신한다. */
export function stepVehicle(v, steps) {
  const vL = wheelSpeed(v.pwmL, steps, steps.trimL);
  const vR = wheelSpeed(v.pwmR, steps, steps.trimR);
  if (vL === 0 && vR === 0) return;

  const linear = (vL + vR) / 2;                       // mm/s
  const omegaDeg = ((vR - vL) / steps.wheelBase) * RAD_TO_DEG;  // deg/s

  const dHeadingMdeg = Math.round(omegaDeg * steps.dt * MDEG_PER_DEG);
  // 곡선 구간에서도 오차가 쌓이지 않게 이동은 회전 중간 방향으로 적분한다.
  const midRad = mdegToRad(v.heading_mdeg + dHeadingMdeg / 2);
  const dist = linear * steps.dt;
  v.x += Math.cos(midRad) * dist;
  v.y += Math.sin(midRad) * dist;

  v.heading_mdeg = ((v.heading_mdeg + dHeadingMdeg) % FULL_TURN_MDEG + FULL_TURN_MDEG) % FULL_TURN_MDEG;
}
