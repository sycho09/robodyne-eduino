/**
 * engine/autopilot.js — 코스를 따라가는 조향 (자율주행 챌린지 전용).
 *
 * 매니페스트가 scene.autopilot 을 켠 챌린지에서만 돈다. 켜지 않은 챌린지는
 * 이 파일이 아예 호출되지 않으므로 기존 주행의 tick 수열은 한 tick도 달라지지 않는다.
 *
 * 하는 일은 하나다 — 학생이 정한 '속도'는 그대로 두고 '좌우 차이'만 다시 쓴다.
 *   기본 속도 = (좌 + 우) / 2   ← 학생 코드가 정한다
 *   좌우 차이 = 중심선을 따라가기 위해 엔진이 정한다
 * 그래서 학생은 회전 시간을 재지 않고 무엇을 보고 얼마나 빨리 갈지에만 집중한다.
 *
 * 난수 없음. 모든 값은 정수로 떨어뜨려 같은 입력이면 같은 tick 수열이 나온다.
 */

const LOOKAHEAD_MM = 240;     // 이만큼 앞의 중심선을 본다. 코너를 미리 돌기 시작한다.
const TURN_GAIN = 26;         // 각도 오차 1도당 좌우 PWM 차이
const MAX_TURN = 120;         // 좌우 차이 상한

function normDeg(mdeg) {
  let v = mdeg;
  while (v > 180000) v -= 360000;
  while (v < -180000) v += 360000;
  return v;
}

/** 중심선 위에서 pos 에 가장 가까운 지점의 (구간 번호, 구간 내 진행 비율, 거리). */
export function nearestOnPath(points, x, y) {
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (!len2) continue;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { i, t, d, px, py };
  }
  return best;
}

/** 중심선을 따라 s(mm)만큼 더 간 지점. 코너를 넘어가도 이어서 센다. */
function advance(points, seg, t, ahead) {
  let i = seg;
  let rest = ahead;
  let [ax, ay] = points[i];
  let [bx, by] = points[(i + 1) % points.length];
  let segLen = Math.hypot(bx - ax, by - ay);
  let cur = segLen * t;
  for (let guard = 0; guard < points.length + 2; guard++) {
    if (cur + rest <= segLen) {
      const k = (cur + rest) / (segLen || 1);
      return [ax + (bx - ax) * k, ay + (by - ay) * k];
    }
    rest -= segLen - cur;
    cur = 0;
    i = (i + 1) % points.length;
    [ax, ay] = points[i];
    [bx, by] = points[(i + 1) % points.length];
    segLen = Math.hypot(bx - ax, by - ay);
  }
  return [ax, ay];
}

/**
 * 학생이 준 좌우 PWM 을 읽어 속도만 남기고 조향을 다시 쓴다.
 * 멈춰 있으라고 했으면(속도 0) 그대로 둔다 — 정지는 학생의 판단이다.
 */
export function steerAutopilot(sim) {
  const v = sim.vehicle;
  const base = Math.round((v.pwmL + v.pwmR) / 2);
  if (base === 0) return;

  const points = sim.track.centerline;
  if (!points || points.length < 2) return;

  const near = nearestOnPath(points, v.x, v.y);
  if (!near) return;
  const [tx, ty] = advance(points, near.i, near.t, LOOKAHEAD_MM);

  const aimDeg = Math.atan2(ty - v.y, tx - v.x) * (180 / Math.PI);
  const err = normDeg(Math.round(aimDeg * 1000) - v.heading_mdeg) / 1000;   // 도 단위
  const dir = base >= 0 ? 1 : -1;
  let turn = Math.round((err * TURN_GAIN) / 1) * dir;
  turn = Math.max(-MAX_TURN, Math.min(MAX_TURN, turn));

  const clamp = (n) => Math.max(-255, Math.min(255, n));
  v.pwmL = clamp(base - turn);
  v.pwmR = clamp(base + turn);
}
