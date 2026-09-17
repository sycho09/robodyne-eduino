/**
 * engine/camera.js — 모드2 색상 카메라 센서.
 *
 * 결정론: 난수도 시계도 쓰지 않는다. 같은 tick 의 같은 차량 자세와 같은 마커 배치면 언제나 같은 값이 나온다.
 * 물리에는 관여하지 않는다 — 차량 상태를 읽어 화면 좌표로 환산할 뿐이다.
 *
 * 실물 ESP32-CAM 을 흉내내되 색 판정은 아주 관대하게 잡았다(대상 연령).
 * "색을 아예 못 잡는" 좌절을 막는 쪽이 정확한 색 분별보다 우선한다.
 */

export const CAMERA = Object.freeze({
  fov_deg: 60,        // 좌우 시야각
  range_mm: 1200,     // 이보다 멀면 못 본다 (한 변 길이와 같다)
  tolerance: 90,      // RGB 채널당 허용 오차 (0~255)
});

const HALF_FOV = ((CAMERA.fov_deg / 2) * Math.PI) / 180;
const FRAME_HALF = Math.tan(HALF_FOV);   // 거리 1 에서의 화면 반폭

/** 카메라 상태는 sim 에 얹되, 쓰지 않는 챌린지에는 아예 만들지 않는다. */
export function cameraState(sim) {
  if (!sim.camera) sim.camera = { target: null, tick: -1, found: false, offset: 0, area: 0, external: null };
  return sim.camera;
}

/**
 * 바깥(실제 웹캠)에서 들어온 관측값을 얹는다.
 *
 * 이 경로를 쓰는 챌린지는 결정론이 성립하지 않는다 — 실물 카메라가 입력이기 때문이다.
 * 값을 얹지 않은 챌린지는 아래 마커 검출 경로를 그대로 쓰므로 모드1·2의 결정론은 그대로다.
 */
export function setExternalCamera(sim, reading) {
  const c = cameraState(sim);
  c.external = reading ? { found: !!reading.found, offset: reading.offset | 0, area: reading.area | 0 } : null;
  c.tick = -1;
}

export function resetCamera(sim) {
  const c = cameraState(sim);
  c.target = null; c.tick = -1; c.found = false; c.offset = 0; c.area = 0;
  // external 은 지우지 않는다 — 카메라 연결은 시도와 무관하게 유지된다.
}

export function setCameraTarget(sim, r, g, b, tolerance) {
  const c = cameraState(sim);
  c.target = [byte(r), byte(g), byte(b)];
  c.tolerance = tolerance === undefined ? CAMERA.tolerance : Math.max(1, Math.min(255, Math.trunc(Number(tolerance) || 0)));
  c.tick = -1;
}

function byte(v) {
  const n = Math.trunc(Number(v) || 0);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function matches(target, color, tolerance) {
  if (!Array.isArray(color)) return false;
  const tol = tolerance || CAMERA.tolerance;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(byte(color[i]) - target[i]) > tol) return false;
  }
  return true;
}

/**
 * 이번 tick 의 관측값. 같은 tick 안에서는 몇 번을 물어도 같은 값을 돌려준다.
 * 못 찾으면 found=false, offset=0, area=0 — found 검사를 빠뜨려도 "직진"으로 읽히게 한 규약이다.
 */
export function readCamera(sim) {
  const c = cameraState(sim);
  if (c.external) {                       // 실제 웹캠이 붙어 있으면 그 값이 곧 관측값이다
    c.found = c.external.found;
    c.offset = c.external.offset;
    c.area = c.external.area;
    return c;
  }
  if (c.tick === sim.tick) return c;
  c.tick = sim.tick;
  c.found = false; c.offset = 0; c.area = 0;
  if (!c.target) return c;

  const markers = (sim.challenge.scene && sim.challenge.scene.markers) || [];
  const v = sim.vehicle;
  const rad = ((v.heading_mdeg / 1000) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let best = null;
  for (const m of markers) {
    if (!matches(c.target, m.color, c.tolerance)) continue;
    const dx = m.x - v.x;
    const dy = m.y - v.y;
    const forward = dx * cos + dy * sin;         // 진행 방향 성분
    if (forward <= 1) continue;                  // 뒤에 있으면 안 보인다
    const right = dx * sin - dy * cos;           // 오른쪽 성분
    const dist = Math.hypot(dx, dy);
    if (dist > CAMERA.range_mm) continue;
    const u = right / (forward * FRAME_HALF);    // -1(화면 왼쪽 끝) ~ +1(오른쪽 끝)
    if (u < -1 || u > 1) continue;
    if (!best || dist < best.dist) best = { dist, u, size: m.size_mm || 100 };
  }
  if (!best) return c;

  c.found = true;
  c.offset = Math.max(-100, Math.min(100, Math.round(best.u * 100)));
  c.area = Math.max(0, Math.min(100, Math.round((best.size / best.dist / (2 * FRAME_HALF)) * 100)));
  return c;
}
