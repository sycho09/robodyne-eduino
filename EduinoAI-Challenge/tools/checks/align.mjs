/**
 * 38차 파트2 — 정렬 검증. 픽셀 밝기를 보지 않는다. 월드 좌표 각도만 본다.
 *
 *  1) 결승선(체크포인트) 방향 vs 그 자리 중심선 접선 = 90° ± 2°
 *  2) 스폰 → 중심선 거리 ≤ 노면 폭의 10%
 *  3) 스폰 진행 방향 vs 접선 = 0° ± 2°
 *  같은 세 값을 판단 지점 전부에 대해서도 낸다.
 *
 * 기준 접선은 buildTrack 이 낸 중심선에서 직접 투영해 구한다.
 * 렌더러가 쓰는 방향은 렌더러가 실제로 부르는 함수(nearestOnPath / cp.nx,ny)에서 가져온다.
 * 둘을 비교하므로 세그먼트 인덱스가 하나 밀리거나 x·y 가 뒤바뀌면 여기서 걸린다.
 */
import { KIT, manifestPath, allChallengeIds } from './ids.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { nearestOnPath } = await import(`${ROOT}/src/engine/autopilot.js`);
const { buildTrack, distanceToCenterLine } = await import(`${ROOT}/src/engine/track.js`);

const DEG = 180 / Math.PI;
const norm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
/** 두 방향 사이 각(0~180). 부호 없는 선의 각이면 acute=true 로 0~90 으로 접는다. */
function ang(a, b, acute) {
  const [ax, ay] = norm(a); const [bx, by] = norm(b);
  let d = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by))) * DEG;
  if (acute && d > 90) d = 180 - d;
  return d;
}
/**
 * 기준 접선 — 점이 실제로 투영되는 중심선 구간의 방향.
 * centerline 배열의 나열 순서는 주행 방향과 반대일 수 있다(정사각 코스가 그렇다).
 * 합법 주행 방향은 체크포인트 법선이 쥐고 있으므로, 가장 가까운 체크포인트로 부호를 맞춘다.
 */
function refTangent(pts, x, y) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy; if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    const d = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
    if (!best || d < best.d) best = { d, dir: norm([dx, dy]) };
  }
  return best;
}

const kit = JSON.parse(readFileSync(`${ROOT}/src/kits/${KIT}.json`, 'utf8'));
// 폴더를 훑지 않고 목록에서 받는다. 매니페스트가 챌린지 폴더 안으로 들어가도
// 훑는 대상이 줄지 않는다(57-G).
const files = allChallengeIds().sort();
let fails = 0;
const rows = [];
// 57차 — 트랙이 없는 챌린지가 생겼다(스마트탐사). 이 검사는 "중심선과 방향이 맞는가" 를
// 보는 것이라 트랙이 없으면 볼 것이 없다. 조용히 빠지면 '통과' 로 읽히므로 이름을 찍는다.
const noTrack = [];
for (const f of files) {
  const c = JSON.parse(readFileSync(manifestPath(f), 'utf8'));
  if (!c.scene || !c.scene.track) { noTrack.push(c.challenge_id || f); continue; }
  const track = buildTrack(c.scene);
  const pts = track.centerline;
  const width = c.scene.track.width_mm;
  const tol = width * 0.10;
  /** 그 자리에서 합법 주행 방향으로 돌린 접선. */
  const travelAt = (x, y) => {
    const t = refTangent(pts, x, y).dir;
    let best = null;
    for (const cp of track.checkpoints) {
      const d = Math.hypot(cp.x - x, cp.y - y);
      if (!best || d < best.d) best = { d, cp };
    }
    const near = refTangent(pts, best.cp.x, best.cp.y).dir;
    const s = (near[0] * best.cp.nx + near[1] * best.cp.ny) >= 0 ? 1 : -1;
    return [t[0] * s, t[1] * s];
  };
  const put = (what, angleDeg, want, offMm) => {
    const okA = angleDeg === null || Math.abs(angleDeg - want) <= 2;
    const okD = offMm === null || offMm <= tol;
    if (!okA || !okD) fails += 1;
    rows.push([f.replace('.json', ''), what,
      angleDeg === null ? '—' : angleDeg.toFixed(2), want === null ? '—' : `${want}±2`,
      offMm === null ? '—' : offMm.toFixed(1), tol.toFixed(0), okA && okD ? 'OK' : 'NG']);
  };

  // 체크포인트 — 결승선은 접선의 법선이어야 한다.
  for (const cp of track.checkpoints) {
    const t = travelAt(cp.x, cp.y);
    const drawn = [-cp.ny, cp.nx];                 // 렌더러가 실제로 긋는 선의 방향
    const isFin = cp.id === track.lap.finish;
    put(`${isFin ? '결승선' : '체크선'} ${cp.id}`, ang(drawn, t, true), 90,
      distanceToCenterLine(track, cp.x, cp.y));
  }
  // 스폰
  const sp = c.scene.spawn;
  const st = travelAt(sp.x, sp.y);
  const hd = (sp.heading_deg * Math.PI) / 180;
  put('스폰', ang([Math.cos(hd), Math.sin(hd)], st, false), 0,
    distanceToCenterLine(track, sp.x, sp.y));

  // 판단 지점 — 렌더러가 쓰는 방향(nearestOnPath)과 기준 접선을 맞춰 본다.
  for (const d of (c.scene.decisions || [])) {
    const near = nearestOnPath(pts, d.x, d.y);
    const a = pts[near.i]; const b = pts[(near.i + 1) % pts.length];
    const along = norm([b[0] - a[0], b[1] - a[1]]);
    const left = [-along[1], along[0]];
    const t = travelAt(d.x, d.y);
    put(`지점 ${d.id} 진행`, ang(along, t, true), 0, distanceToCenterLine(track, d.x, d.y));
    put(`지점 ${d.id} 가로`, ang(left, t, true), 90, null);
  }
}
const w = [24, 18, 8, 8, 9, 8, 4];
const line = (r) => r.map((v, i) => String(v).padEnd(w[i])).join(' ');
console.log(line(['챌린지', '항목', '각도°', '기준', '이탈mm', '허용', '판정']));
for (const r of rows) console.log(line(r));
if (noTrack.length) console.log(`\n건너뜀(트랙 없음): ${noTrack.join(' · ')}`);
// 57차 보강2 — 잰 행이 하나도 없으면 통과가 아니다.
if (!rows.length) {
  console.log(`\n행 0 — 잰 것이 없습니다. 통과로 세지 않습니다. (트랙 없어 건너뛴 것 ${noTrack.length}종)`);
  process.exit(1);
}
console.log(`\n행 ${rows.length} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
