/**
 * engine/track.js — 트랙 형상 · 이탈 판정 · 체크포인트 통과 판정.
 *
 * 좌표계(확정):
 *  - 단위는 mm. 1 unit = 1mm.
 *  - x 는 오른쪽(+), y 는 위(+). heading 0° = +x, 반시계(CCW)가 +.
 *  - 화면 좌표 변환(y 뒤집기)은 렌더러의 책임이며 엔진은 관여하지 않는다.
 *
 * 정사각 트랙:
 *  - center_side_mm 는 "중심선" 정사각형의 한 변. 중심은 원점.
 *  - width_mm 는 노면 폭. 중심선에서 ±width/2 안쪽이 노면이다.
 *  - 따라서 바깥 경계는 모서리가 자연스럽게 둥글고(반지름 = width/2),
 *    안쪽 경계는 각진 정사각형이 된다. 렌더러도 정확히 이 형상을 그린다.
 */

export function buildTrack(scene) {
  const t = scene.track;
  const halfWidth = t.width_mm / 2;
  const checkpoints = scene.checkpoints.map((cp) => {
    const rad = (cp.normal_deg * Math.PI) / 180;
    return {
      id: cp.id,
      x: cp.x,
      y: cp.y,
      nx: Math.cos(rad),
      ny: Math.sin(rad),
      halfSpan: cp.span_mm / 2,
    };
  });

  if (t.shape === 'square') {
    const half = t.center_side_mm / 2;
    return {
      shape: 'square',
      half,
      width: t.width_mm,
      halfWidth,
      outerHalf: half + halfWidth,
      innerHalf: half - halfWidth,
      // 미니 탑뷰·렌더러가 형상에 무관하게 쓸 수 있도록 중심선을 항상 함께 낸다.
      centerline: [[-half, -half], [half, -half], [half, half], [-half, half]],
      checkpoints,
      lap: scene.lap,
    };
  }

  if (t.shape === 'polyline') {
    const pts = t.points;
    if (!Array.isArray(pts) || pts.length < 3) {
      throw new Error('polyline 트랙은 점이 3개 이상이어야 합니다.');
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const reach = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs));
    return {
      shape: 'polyline',
      half: reach,
      width: t.width_mm,
      halfWidth,
      outerHalf: reach + halfWidth,
      innerHalf: Math.max(0, reach - halfWidth),
      centerline: pts.map((p) => [p[0], p[1]]),
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      checkpoints,
      lap: scene.lap,
    };
  }

  throw new Error(`지원하지 않는 트랙 형상: ${t.shape} (square 또는 polyline)`);
}

/** 선분 하나까지의 최단거리. */
function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + dx * u), y - (ay + dy * u));
}

/**
 * 중심선까지의 거리. 부호 없는 최단거리.
 *
 * square 는 box SDF 닫힌 식을 그대로 쓴다 — 기존 기록과 완전히 같은 값을 내야 하기 때문이다.
 * polyline 은 닫힌 고리의 각 선분까지 거리 중 최솟값이다. 8자처럼 스스로 교차해도 그대로 성립한다.
 */
export function distanceToCenterLine(track, x, y) {
  if (track.shape === 'polyline') {
    const pts = track.centerline;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const d = distanceToSegment(x, y, a[0], a[1], b[0], b[1]);
      if (d < best) best = d;
    }
    return best;
  }
  const qx = Math.abs(x) - track.half;
  const qy = Math.abs(y) - track.half;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return Math.abs(outside + inside);
}

export function isOffTrack(track, x, y) {
  return distanceToCenterLine(track, x, y) > track.halfWidth;
}

/**
 * 체크포인트 통과 판정.
 * 이전 위치가 평면 뒤(-), 현재 위치가 평면 앞(+)일 때만 통과로 본다.
 * 즉 지정된 진행 방향으로 지나갈 때만 인정된다. (역주행 통과 불인정)
 */
export function crossedCheckpoint(cp, prev, cur) {
  const sPrev = (prev.x - cp.x) * cp.nx + (prev.y - cp.y) * cp.ny;
  const sCur = (cur.x - cp.x) * cp.nx + (cur.y - cp.y) * cp.ny;
  if (!(sPrev < 0 && sCur >= 0)) return false;
  // 평면 위 횡방향 오프셋이 체크포인트 폭 안이어야 한다.
  const lat = -(cur.x - cp.x) * cp.ny + (cur.y - cp.y) * cp.nx;
  return Math.abs(lat) <= cp.halfSpan;
}
