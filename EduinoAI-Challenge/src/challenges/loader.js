/**
 * challenges/loader.js — 매니페스트 로딩 + 계약 검사.
 *
 * challenge.schema.json 이 계약의 원본이다. 브라우저에 JSON Schema 검증기를 싣지 않으므로,
 * 여기서는 "틀리면 반드시 터져야 하는" 항목만 골라 직접 검사한다.
 * 잘못된 챌린지는 조용히 이상하게 도는 대신 로딩 단계에서 이유와 함께 실패해야 한다.
 */

import { API_REGISTRY } from '../runtime/api.js';
import { CAMERA } from '../engine/camera.js';
import { WEBCAM } from '../ui/webcam.js';
import { ML } from '../engine/ml.js';

/**
 * 챌린지의 성격. 카탈로그와 매니페스트가 같은 값을 쓰고, 라우터가 이 값으로 화면을 고른다.
 *   1 이동제어 · 2 색상/테마학습제어 · 3 스마트탐사(57차)
 */
export const MODE = Object.freeze({ DRIVE: 1, VISION: 2, SCOUT: 3 });

const CATALOG_URL = new URL('./index.json', import.meta.url);

const KITS_URL = new URL('../kits/index.json', import.meta.url);

/** 킷 목록. 허브 홈이 이걸로 카드 그리드를 만든다. */
export async function loadKitCatalog() {
  const res = await fetch(KITS_URL);
  if (!res.ok) throw new Error(`킷 목록을 불러오지 못했습니다. (HTTP ${res.status})`);
  return res.json();
}

export async function loadCatalog() {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`챌린지 목록을 불러오지 못했습니다. (HTTP ${res.status})`);
  return res.json();
}

export async function loadChallenge(entry) {
  const url = new URL(entry.path, CATALOG_URL);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`챌린지 매니페스트를 불러오지 못했습니다: ${entry.path} (HTTP ${res.status})`);
  const challenge = await res.json();
  if (entry.challenge_version && entry.challenge_version !== challenge.version) {
    throw new Error(`카탈로그의 challenge_version(${entry.challenge_version})과 매니페스트 version(${challenge.version})이 다릅니다.`);
  }
  const kit = await loadKit(challenge.kit_id);
  assertChallenge(challenge, kit);
  applyTemplates(challenge, kit);
  return { challenge, kit };
}

export async function loadKit(kitId) {
  const url = new URL(`../kits/${kitId}.json`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`킷 스펙을 불러오지 못했습니다: ${kitId} (HTTP ${res.status})`);
  return res.json();
}

/**
 * 매니페스트 안의 {{...}} 자리를 킷 스펙과 파생값으로 채운다.
 * 스타터 코드 주석의 속도·시간을 손으로 적으면 킷 값이 바뀔 때 반드시 어긋난다.
 * 수치는 한 곳(킷 스펙)에서만 나오게 한다.
 */
export function applyTemplates(c, kit) {
  // 57차 — 탐사(모드3)는 트랙도 랩도 채점도 없다. 파생값을 낼 자리가 아예 없으므로
  // 여기서 일찍 돌아간다. 아래 표는 전부 트랙·랩·규칙에서 나오는 값이다.
  if (c.mode === MODE.SCOUT) return c;
  const pwm = kit.drive.default_pwm;
  const wheelSpeed = (p) => (p / kit.drive.pwm_max) * kit.drive.max_speed_mm_s;   // mm/s
  const toTick10 = (ms) => Math.round(ms / 10) * 10;                              // 10ms 단위로 떨어뜨린다

  const v = wheelSpeed(pwm);
  const omegaDeg = ((2 * v) / kit.body.wheel_base_mm) * (180 / Math.PI);          // 제자리 스핀 각속도
  const table = {
    'kit.drive.max_speed_mm_s': kit.drive.max_speed_mm_s,
    'kit.drive.deadzone_pwm': kit.drive.deadzone_pwm,
    'kit.drive.default_pwm': pwm,
    'kit.drive.pwm_max': kit.drive.pwm_max,
    'kit.body.width_mm': kit.body.width_mm,
    'kit.body.wheel_base_mm': kit.body.wheel_base_mm,
    // 실물 배선. 핀 번호는 킷 스펙에서만 나온다 — 스타터 주석에 손으로 적지 않는다.
    'kit.pins.MOTOR_R_PIN_1': (kit.pins || {}).MOTOR_R_PIN_1,
    'kit.pins.MOTOR_R_PIN_2': (kit.pins || {}).MOTOR_R_PIN_2,
    'kit.pins.MOTOR_L_PIN_1': (kit.pins || {}).MOTOR_L_PIN_1,
    'kit.pins.MOTOR_L_PIN_2': (kit.pins || {}).MOTOR_L_PIN_2,
    'scene.track.width_mm': c.scene.track.width_mm,
    'rules.offtrack.max_events': c.rules.offtrack.max_events,
    'derived.turn90_ms': toTick10((90 / omegaDeg) * 1000),
    'derived.timeout_s': Math.round(c.rules.timeout.sim_ticks / 100),
  };
  // 전속(PWM 최대)으로 달릴 때의 시간. 해답 코드가 쓰는 값이라 여기서만 낸다.
  const vFull = wheelSpeed(kit.drive.pwm_max);
  const omegaFullDeg = ((2 * vFull) / kit.body.wheel_base_mm) * (180 / Math.PI);
  table['derived.full_pwm'] = kit.drive.pwm_max;
  table['derived.turn90_full_ms'] = toTick10((90 / omegaFullDeg) * 1000);
  if (c.scene.track.shape === 'square') {
    table['scene.track.center_side_mm'] = c.scene.track.center_side_mm;
    table['derived.side_ms'] = toTick10((c.scene.track.center_side_mm / v) * 1000);
    table['derived.side_full_ms'] = toTick10((c.scene.track.center_side_mm / vFull) * 1000);
  } else {
    // 구간 길이가 제각각인 트랙. 구간마다 직진 시간을 따로 낸다 — 손으로 적지 않는다.
    const pts = c.scene.track.points;
    let total = 0;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      total += len;
      table[`derived.seg${i + 1}_ms`] = toTick10((len / v) * 1000);
      table[`derived.seg${i + 1}_full_ms`] = toTick10((len / vFull) * 1000);
      table[`derived.seg${i + 1}_mm`] = Math.round(len);
    });
    table['derived.track_total_mm'] = Math.round(total);
    table['derived.segment_count'] = pts.length;
  }
  // 모드2: 코너에서 마커가 화면에 차지하는 크기. 카메라 스펙과 마커 배치로만 정해진다.
  const markers = c.scene.markers || [];
  if (markers.length) {
    // 코너에 닿았을 때 마커가 얼마나 멀리 있는가. 코스 모양을 가리지 않으려면 중심선의
    // 꼭짓점 가운데 그 마커에 가장 가까운 것을 코너로 본다 — 정사각형 전용 식은 변 길이가
    // 제각각인 코스에서 엉뚱한 값을 낸다(49차).
    const corners = c.scene.track.shape === 'square'
      ? (() => { const h = c.scene.track.center_side_mm / 2; return [[h, h], [h, -h], [-h, h], [-h, -h]]; })()
      : c.scene.track.points;
    const frameHalf = Math.tan(((CAMERA.fov_deg / 2) * Math.PI) / 180);
    let near = Infinity;
    let size = 0;
    for (const mk of markers) {
      let d = Infinity;
      for (const [cx, cy] of corners) d = Math.min(d, Math.hypot(mk.x - cx, mk.y - cy));
      if (d < near) { near = d; size = mk.size_mm; }
    }
    // 코너에 닿기 직전에 돌기 시작하도록 트리거 거리에 5% 여유를 준다.
    // 여유가 없으면 회전 오차가 조금만 쌓여도 마커를 지나쳐 버린다.
    table['derived.marker_near_area'] = Math.round((size / (near * 1.05) / (2 * frameHalf)) * 100);
    table['derived.marker_ahead_mm'] = Math.round(near);
    table['derived.camera_range_mm'] = CAMERA.range_mm;
    table['derived.camera_fov_deg'] = CAMERA.fov_deg;
  }
  // 제자리 90도가 10ms 격자에 가장 정확히 떨어지는 PWM. 회전을 코너마다 반복하면
  // 1도 미만의 오차도 몇 바퀴 지나면 코스를 벗어날 만큼 쌓인다. 킷 스펙만으로 정해진다.
  let spinPwm = pwm;
  let spinErr = Infinity;
  for (let p = Math.max(kit.drive.deadzone_pwm + 1, pwm - 20); p <= Math.min(kit.drive.pwm_max, pwm + 40); p++) {
    const w = ((2 * wheelSpeed(p)) / kit.body.wheel_base_mm) * (180 / Math.PI);
    const t = (90 / w) * 1000;
    const err = Math.abs(t - toTick10(t));
    if (err < spinErr - 1e-9) { spinErr = err; spinPwm = p; }
  }
  table['derived.spin_pwm'] = spinPwm;
  table['derived.spin90_ms'] = toTick10((90 / (((2 * wheelSpeed(spinPwm)) / kit.body.wheel_base_mm) * (180 / Math.PI))) * 1000);

  // 편차 챌린지 스타터에 넣는 '한 번 눌러 볼 값'. 정답(정확한 보정폭)과는 일부러 다르게 낸다.
  const trim = c.motor_trim;
  if (trim) {
    const need = (t) => Math.round(pwm / t) - pwm;      // 느린 쪽 바퀴를 맞추는 정확한 보정폭
    const exact = [need(trim.left), need(trim.right)].filter((n) => n > 0);
    let nudge = Math.max(1, Math.round(pwm * 0.01));
    while (exact.includes(nudge) && nudge > 1) nudge -= 1;
    while (exact.includes(nudge)) nudge += 1;
    table['derived.pwm_nudge'] = nudge;
    // 느린 쪽 바퀴를 정확히 맞춘 PWM. 해답 코드가 쓰는 값이다.
    table['derived.trim_left_pwm'] = Math.round(pwm / trim.left);
    table['derived.trim_right_pwm'] = Math.round(pwm / trim.right);
  }
  // 웹캠 조종 챌린지: 조종 계수도 킷 스펙과 카메라 스펙에서 낸다.
  // 51차 — 카메라 카드 1단(원본 화면)에 무엇이 오는지를 매니페스트가 정한다.
  //   webcam → 실물 웹캠 영상 / sim → RC카가 보는 시뮬 화면
  if (c.camera_source !== undefined && !['webcam', 'sim'].includes(c.camera_source)) {
    fail(`camera_source 는 "webcam" 또는 "sim" 이어야 합니다. (받은 값: ${c.camera_source})`);
  }
  if (c.camera_source === 'sim' && !(c.scene.markers || []).length) {
    fail('camera_source 가 "sim" 이면 scene.markers 가 있어야 합니다. (1단에 보일 것이 마커다)');
  }
  if (c.camera_source === 'webcam') {
    const mk = (c.scene.markers || [])[0];
    const color = (mk && mk.color) || [220, 60, 60];
    table['derived.camera_r'] = color[0];
    table['derived.camera_g'] = color[1];
    table['derived.camera_b'] = color[2];
    table['derived.camera_tol'] = CAMERA.tolerance;
    // 최대로 꺾었을 때 안쪽 바퀴가 겨우 도는 지점(데드존)까지 내려가는 크기
    table['derived.camera_gain'] = Math.max(1, pwm - kit.drive.deadzone_pwm);
    // 화면에서 8픽셀쯤 흔들리는 것은 무시한다
    table['derived.camera_dead'] = Math.max(1, Math.round((100 / (WEBCAM.width / 2)) * 8));
  }
  // 자율주행 챌린지: 도시 규칙과 그것을 지키기 위한 값. 전부 킷·규칙에서만 나온다.
  const dec = c.rules.decision;
  if (dec) {
    const limit = dec.slow_limit_mm_s;
    table['derived.slow_limit_mm_s'] = limit;
    // 서행 제한의 70% 로 달리도록 잡은 PWM. 데드존 위에서 여유 있게 지나간다.
    table['derived.slow_pwm'] = Math.max(kit.drive.deadzone_pwm + 5,
      Math.round((kit.drive.pwm_max * (limit * 0.7)) / kit.drive.max_speed_mm_s));
    table['derived.stop_hold_ms'] = dec.stop_hold_ticks * 10 + 300;
    const sig = c.scene.signals && c.scene.signals.cycle;
    if (sig) {
      table['derived.signal_green_s'] = Math.round(sig.green_ticks / 100);
      table['derived.signal_yellow_s'] = Math.round(sig.yellow_ticks / 100);
      table['derived.signal_red_s'] = Math.round(sig.red_ticks / 100);
    }
    table['derived.stop_hold_s'] = Math.round(dec.stop_hold_ticks / 100);
    table['derived.penalty_s'] = Math.round(dec.penalty_ticks / 100);
    table['derived.decision_count'] = (c.scene.decisions || []).length;
  }
  if (c.rules.no_progress) {
    table['derived.no_progress_s'] = Math.round(c.rules.no_progress.sim_ticks / 100);
  }
  // 이탈 페널티는 전 챌린지 공통이다. 값은 매니페스트가 소유하고 여기서는 초로 바꿔 쓸 뿐이다.
  const pen = c.scoring.penalty;
  if (pen) table['derived.offtrack_penalty_s'] = Math.round(pen.offtrack_ticks / 100);
  if (c.scene.obstacles) {
    table['derived.obstacle_count'] = c.scene.obstacles.length;
    const walkers = c.scene.obstacles.filter((o) => o.kind === 'pedestrian');
    const gates = c.scene.obstacles.filter((o) => o.kind === 'crossing_gate');
    table['derived.pedestrian_count'] = walkers.length;
    table['derived.gate_count'] = gates.length;
  }
  const fill = (text) => String(text).replace(/\{\{([a-z0-9_.]+)\}\}/gi, (m, key) => {
    if (!(key in table)) throw new Error(`매니페스트 템플릿에 알 수 없는 값이 있습니다: {{${key}}}`);
    return String(table[key]);
  });
  c.starter_code.source = fill(c.starter_code.source);
  // 해답도 같은 자리표시자를 쓴다. 손으로 적은 수치가 매니페스트에 들어오지 않게 한다.
  if (c.solution_code) c.solution_code.source = fill(c.solution_code.source);
  if (c.description) c.description = fill(c.description);
  return c;
}

export function assertChallenge(c, kit) {
  const fail = (msg) => { throw new Error(`매니페스트 오류 [${c.challenge_id || '?'}]: ${msg}`); };
  const need = (obj, path) => {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v === undefined || v === null) fail(`필수 항목이 없습니다: ${path}`);
    return v;
  };

  // 57차 — 탐사(모드3)는 계약이 다르다. 트랙·랩·채점·규칙이 없고 대신 안전과 탐사 상수가 있다.
  // 같은 함수에서 갈라 두어야 "모드1·2 의 계약" 이 느슨해지지 않는다.
  if (c.mode === MODE.SCOUT) return assertScout(c, kit, fail, need);

  for (const k of ['kit_id', 'challenge_id', 'version', 'mode', 'title', 'scene', 'mission', 'starter_code', 'allowed_api', 'limits', 'scoring', 'rules', 'record']) {
    need(c, k);
  }
  // 57-C — 챌린지가 끝날 때 무엇을 남길지는 매니페스트가 정한다. 코드에 분기를 박지 않는다.
  // 구간 시간을 내지 않는 챌린지(판단 지점 방식)는 lap_splits 를 빼면 그만이다.
  const RECORD_FIELDS = ['lap_total', 'lap_splits', 'path_image'];
  if (!Array.isArray(c.record.fields) || !c.record.fields.length) fail('record.fields 가 비어 있습니다.');
  for (const f of c.record.fields) {
    if (!RECORD_FIELDS.includes(f)) fail(`record.fields 에 모르는 항목이 있습니다: ${f} (${RECORD_FIELDS.join(' · ')})`);
  }
  if (c.record.fields.includes('lap_splits') && (c.rules.decision)) {
    fail('판단 지점 챌린지는 구간 시간을 내지 않습니다. record.fields 에서 lap_splits 를 빼십시오.');
  }
  if (c.mode !== MODE.DRIVE && c.mode !== MODE.VISION) fail(`mode ${c.mode} 은 아직 지원하지 않습니다. (모드1·2·3만 구현)`);
  if (c.scene.units !== 'mm') fail(`scene.units 는 "mm" 고정입니다. (받은 값: ${c.scene.units})`);
  const shape = c.scene.track.shape;
  if (shape !== 'square' && shape !== 'polyline') fail(`지원하지 않는 트랙 형상입니다: ${shape} (square 또는 polyline)`);
  if (!(c.scene.track.width_mm > 0)) fail('track.width_mm 는 0보다 커야 합니다.');
  if (shape === 'square') {
    if (!(c.scene.track.center_side_mm > 0)) fail('track.center_side_mm 는 0보다 커야 합니다.');
    if (c.scene.track.width_mm >= c.scene.track.center_side_mm) fail('트랙 폭이 코스 크기보다 큽니다.');
  } else {
    const pts = c.scene.track.points;
    if (!Array.isArray(pts) || pts.length < 3) fail('polyline 트랙은 points 가 3개 이상이어야 합니다.');
    // 곡선 금지 — 모든 구간이 축에 평행해야 한다(개루프 주행에서 난이도가 급등하지 않도록).
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a[0] !== b[0] && a[1] !== b[1]) fail(`polyline 구간 ${i} 가 축에 평행하지 않습니다. 직각 구간만 허용합니다.`);
      if (a[0] === b[0] && a[1] === b[1]) fail(`polyline 구간 ${i} 의 길이가 0 입니다.`);
    }
  }

  const trim = c.motor_trim;
  if (trim !== undefined) {
    for (const side of ['left', 'right']) {
      if (!(trim[side] > 0 && trim[side] <= 2)) fail(`motor_trim.${side} 는 0 초과 2 이하여야 합니다.`);
    }
  }

  // 모드1 규칙: 트랙 폭 = 차폭 × 3
  if (kit) {
    const expected = kit.body.width_mm * 3;
    if (Math.abs(c.scene.track.width_mm - expected) > 1e-6) {
      fail(`트랙 폭은 차폭의 3배여야 합니다. 기대 ${expected}mm, 매니페스트 ${c.scene.track.width_mm}mm (킷 ${kit.kit_id} 차폭 ${kit.body.width_mm}mm)`);
    }
    if (c.kit_id !== kit.kit_id) fail(`kit_id 불일치: 매니페스트 ${c.kit_id} vs 킷 파일 ${kit.kit_id}`);
  }

  const ids = new Set();
  for (const cp of need(c, 'scene.checkpoints')) {
    if (ids.has(cp.id)) fail(`체크포인트 id 가 중복됩니다: ${cp.id}`);
    ids.add(cp.id);
    if (!(cp.span_mm > 0)) fail(`체크포인트 ${cp.id} 의 span_mm 이 잘못되었습니다.`);
  }
  const lap = need(c, 'scene.lap');
  if (!Array.isArray(lap.order) || lap.order.length < 2) fail('scene.lap.order 는 2개 이상이어야 합니다.');
  for (const id of lap.order) if (!ids.has(id)) fail(`lap.order 에 없는 체크포인트가 있습니다: ${id}`);
  if (!ids.has(lap.finish)) fail(`lap.finish 가 체크포인트에 없습니다: ${lap.finish}`);
  if (lap.order[0] !== lap.finish) fail('lap.order 의 첫 항목은 lap.finish 여야 합니다. (결승선에서 랩이 시작하고 끝난다)');

  // 모드2 색상 마커. 없으면 그냥 없는 것이다(모드1 은 이 블록을 통째로 건너뛴다).
  const markers = c.scene.markers;
  if (markers !== undefined) {
    if (!Array.isArray(markers) || markers.length === 0) fail('scene.markers 는 비어 있지 않은 배열이어야 합니다.');
    const seen = new Set();
    for (const mk of markers) {
      if (seen.has(mk.id)) fail(`마커 id 가 중복됩니다: ${mk.id}`);
      seen.add(mk.id);
      if (!Array.isArray(mk.color) || mk.color.length !== 3) fail(`마커 ${mk.id} 의 color 는 [r, g, b] 여야 합니다.`);
      if (!(mk.size_mm > 0)) fail(`마커 ${mk.id} 의 size_mm 이 잘못되었습니다.`);
    }
  }

  for (const name of c.allowed_api) {
    if (!API_REGISTRY[name]) fail(`allowed_api 에 알 수 없는 API 가 있습니다: ${name}`);
    if (API_REGISTRY[name].layer === 'camera' && !markers) {
      fail(`카메라 API(${name})를 열려면 scene.markers 가 있어야 합니다.`);
    }
    if (API_REGISTRY[name].layer === 'ml' && !c.ml) {
      fail(`ML API(${name})를 열려면 매니페스트에 ml 설정이 있어야 합니다.`);
    }
  }

  const rules = need(c, 'rules');
  if (!(rules.offtrack.max_events > 0)) fail('rules.offtrack.max_events 가 잘못되었습니다.');
  if (!(rules.timeout.sim_ticks > 0)) fail('rules.timeout.sim_ticks 가 잘못되었습니다.');
  if (rules.no_progress && !(rules.no_progress.sim_ticks > 0)) {
    fail('rules.no_progress.sim_ticks 가 잘못되었습니다.');
  }
  if (rules.timeout.sim_ticks > c.limits.max_sim_ticks) {
    fail('rules.timeout.sim_ticks 는 limits.max_sim_ticks 보다 클 수 없습니다.');
  }
  for (const k of ['max_sim_ticks', 'max_catchup_ms', 'max_code_bytes', 'max_ops_per_tick']) {
    if (!(c.limits[k] > 0)) fail(`limits.${k} 가 잘못되었습니다.`);
  }

  if (c.starter_code.language !== 'ino-subset') fail(`starter_code.language 는 "ino-subset" 이어야 합니다.`);
  // 52-1차 — 스타터 판 번호. 브라우저에 저장된 코드가 어느 판에서 나왔는지 가릴 근거다.
  // 글자 비교만으로는 "옛 판에서 손댄 코드" 를 알 수 없다.
  if (!(Number.isInteger(c.starter_code.version) && c.starter_code.version >= 1)) {
    fail('starter_code.version 은 1 이상의 정수여야 합니다.');
  }
  // 판단 지점. 개수·순서·정답 클래스는 매니페스트가 소유한다 — 엔진도 화면도 개수를 모른다.
  if (c.scene.decisions !== undefined) {
    if (!Array.isArray(c.scene.decisions) || !c.scene.decisions.length) fail('scene.decisions 는 비어 있지 않은 배열이어야 합니다.');
    const seen = new Set();
    for (const d of c.scene.decisions) {
      if (d.id && seen.has(d.id)) fail(`판단 지점 id 가 중복됩니다: ${d.id}`);
      if (d.id) seen.add(d.id);
      if (!['stop', 'slow', 'go', 'signal', 'situation'].includes(d.expect)) {
        fail(`판단 지점 ${d.id || '?'} 의 expect 는 stop·slow·go·signal·situation 중 하나여야 합니다.`);
      }
      // 신호는 주기 시계(scene.signals.cycle) 아니면 대본(script.signal) 중 하나가 정한다.
      const hasClock = !!(c.scene.signals && c.scene.signals.cycle);
      const hasScript = !!(d.script && Array.isArray(d.script.signal) && d.script.signal.length);
      if (d.expect === 'signal' && !hasClock && !hasScript) {
        fail(`판단 지점 ${d.id || '?'} 가 신호등인데 주기(scene.signals.cycle)도 대본(script.signal)도 없습니다.`);
      }
      if (d.script && !(d.script.trigger_mm > 0)) {
        fail(`판단 지점 ${d.id || '?'} 의 script.trigger_mm 는 0보다 커야 합니다.`);
      }
      if (d.expect === 'situation') {
        if (!c.scene.situation) fail(`판단 지점 ${d.id || '?'} 가 situation 인데 scene.situation 이 없습니다.`);
        if (d.signal_offset_ticks !== undefined && !(c.scene.signals && c.scene.signals.cycle)) {
          fail(`판단 지점 ${d.id || '?'} 에 신호 위상이 있는데 scene.signals.cycle 이 없습니다.`);
        }
        for (const id of d.watch || []) {
          if (!(c.scene.obstacles || []).some((o) => o.id === id)) {
            fail(`판단 지점 ${d.id || '?'} 가 없는 장애물을 지켜봅니다: ${id}`);
          }
        }
      }
      if (!(d.zone_mm > 0)) fail(`판단 지점 ${d.id || '?'} 의 zone_mm 이 잘못되었습니다.`);
      if (typeof d.x !== 'number' || typeof d.y !== 'number') fail(`판단 지점 ${d.id || '?'} 의 좌표가 없습니다.`);
    }
    const rule = c.rules.decision;
    if (!rule) fail('scene.decisions 가 있으면 rules.decision 이 있어야 합니다.');
    for (const k of ['stop_hold_ticks', 'slow_limit_mm_s']) {
      if (!(rule[k] > 0)) fail(`rules.decision.${k} 가 잘못되었습니다.`);
    }
    // 55차 마감 D' — 벌이 '실제로 늦어지는 것' 하나가 되면서 페널티 tick 은 0 이 될 수 있다.
    // 다만 적지 않고 넘어가면 안 된다. 값이 있어야 하고, 0 이어도 된다.
    if (!(rule.penalty_ticks >= 0)) fail('rules.decision.penalty_ticks 가 잘못되었습니다.');
    if (!c.scene.autopilot) fail('판단 지점이 있는 챌린지는 scene.autopilot 이 켜져 있어야 합니다. (조향은 엔진이 맡는다)');
  }

  // 이탈 페널티. 전 챌린지 공통 규칙이라 매니페스트마다 값을 적어야 한다(코드에 기본값을 두지 않는다).
  if (!c.scoring.penalty || !(c.scoring.penalty.offtrack_ticks >= 0)) {
    fail('scoring.penalty.offtrack_ticks 가 없습니다. (이탈 1회당 더할 tick)');
  }

  // 움직이는 장애물. 종류·주기·위치는 매니페스트가 소유한다 — 엔진은 개수를 모른다.
  if (c.scene.obstacles !== undefined) {
    if (!Array.isArray(c.scene.obstacles)) fail('scene.obstacles 는 배열이어야 합니다.');
    const seenO = new Set();
    for (const o of c.scene.obstacles) {
      const who = o.id || o.kind || '?';
      if (o.id && seenO.has(o.id)) fail(`장애물 id 가 중복됩니다: ${o.id}`);
      if (o.id) seenO.add(o.id);
      if (!['pedestrian', 'crossing_gate'].includes(o.kind)) {
        fail(`장애물 ${who} 의 kind 는 pedestrian·crossing_gate 중 하나여야 합니다.`);
      }
      if (!(o.zone_mm > 0)) fail(`장애물 ${who} 의 zone_mm 이 잘못되었습니다.`);
      if (o.kind === 'pedestrian') {
        for (const k of ['from', 'to']) {
          const p = o[k];
          if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
            fail(`보행자 ${who} 의 ${k} 는 [x, y] 여야 합니다.`);
          }
        }
        if (!(o.period_ticks > 0)) fail(`보행자 ${who} 의 period_ticks 가 잘못되었습니다. (왕복 한 번에 걸리는 tick)`);
      } else {
        if (typeof o.x !== 'number' || typeof o.y !== 'number') fail(`차단기 ${who} 의 좌표가 없습니다.`);
        if (!(o.down_ticks > 0)) fail(`차단기 ${who} 의 down_ticks 가 잘못되었습니다.`);
        if (!(o.up_ticks > 0)) fail(`차단기 ${who} 의 up_ticks 가 잘못되었습니다.`);
      }
    }
    if (!c.scene.autopilot) fail('장애물이 있는 챌린지는 scene.autopilot 이 켜져 있어야 합니다.');
    // 위반 페널티 폭은 rules.decision 이 소유한다. 그것 없이 장애물만 두면 위반이 0초짜리가 된다.
    if (c.scene.obstacles.length && !c.rules.decision) {
      fail('장애물이 있는 챌린지는 rules.decision 이 있어야 합니다. (위반 페널티 폭)');
    }
  }

  // 카메라가 지금 무엇을 볼 수 있는가. 1인칭 렌더·전체뷰 부채꼴·상황 판단이 모두 이 값을 쓴다.
  if (c.scene.camera_view !== undefined) {
    const cv = c.scene.camera_view;
    if (!(cv.fov_deg > 0 && cv.fov_deg < 180)) fail('scene.camera_view.fov_deg 가 잘못되었습니다.');
    if (!(cv.range_mm > 0)) fail('scene.camera_view.range_mm 가 잘못되었습니다.');
  }
  // 추적 카메라. 회전은 하지 않고 배율도 고정이라, 화면이 보는 폭만 정하면 된다.
  if (c.scene.chase !== undefined) {
    const ch = c.scene.chase;
    if (!(ch.view_width_mm > 0)) fail('scene.chase.view_width_mm 가 잘못되었습니다.');
    if (!(ch.ahead_mm >= 0)) fail('scene.chase.ahead_mm 가 잘못되었습니다.');
    if (!(ch.aim_y > 0 && ch.aim_y < 1)) fail('scene.chase.aim_y 는 0과 1 사이여야 합니다.');
  }
  if (c.scene.layout === 'dashboard' && !c.scene.camera_view) {
    fail('scene.layout 이 dashboard 면 scene.camera_view 가 있어야 합니다. (화각·사거리)');
  }

  // 상황 합성 규칙. 무엇이 무엇보다 강한지, 장애물이 무엇을 요구하는지 전부 여기서 정한다.
  if (c.scene.situation !== undefined) {
    const st = c.scene.situation;
    if (!Array.isArray(st.priority) || !st.priority.length) {
      fail('scene.situation.priority 는 강한 순서대로 나열한 배열이어야 합니다.');
    }
    for (const name of st.priority) {
      if (!['stop', 'slow', 'go'].includes(name)) fail(`scene.situation.priority 에 알 수 없는 값이 있습니다: ${name}`);
    }
    if (!st.signal) fail('scene.situation.signal (신호 색 → 행동) 이 없습니다.');
    for (const k of ['green', 'yellow', 'red']) {
      if (!st.priority.includes(st.signal[k])) fail(`scene.situation.signal.${k} 가 priority 에 없는 값입니다.`);
    }
    if (!st.obstacle) fail('scene.situation.obstacle (장애물 종류 → 행동) 이 없습니다.');
    for (const [k, v] of Object.entries(st.obstacle)) {
      if (!['pedestrian', 'crossing_gate'].includes(k)) fail(`scene.situation.obstacle 에 알 수 없는 종류가 있습니다: ${k}`);
      if (!st.priority.includes(v)) fail(`scene.situation.obstacle.${k} 가 priority 에 없는 값입니다.`);
    }
    if (st.base && !st.priority.includes(st.base)) fail('scene.situation.base 가 priority 에 없는 값입니다.');
  }

  // 신호등 주기. tick 으로만 세므로 결정론이 유지된다.
  if (c.scene.signals !== undefined) {
    const cy = c.scene.signals.cycle;
    if (!cy) fail('scene.signals.cycle 이 없습니다.');
    for (const k of ['green_ticks', 'yellow_ticks', 'red_ticks']) {
      if (!(cy[k] > 0)) fail(`scene.signals.cycle.${k} 가 잘못되었습니다.`);
    }
  }

  // 도시 오브젝트. 종류·위치는 매니페스트가 소유한다.
  if (c.scene.city !== undefined) {
    if (!Array.isArray(c.scene.city)) fail('scene.city 는 배열이어야 합니다.');
    for (const o of c.scene.city) {
      if (typeof o.sprite !== 'string' || !o.sprite) fail('scene.city 항목에 sprite 가 없습니다.');
      if (typeof o.x !== 'number' || typeof o.y !== 'number') fail(`도시 오브젝트 ${o.sprite} 의 좌표가 없습니다.`);
    }
  }

  // ML 학습 설정. 클래스 이름은 매니페스트가 소유한다(엔진은 개수만 안다).
  if (c.ml !== undefined) {
    if (!Array.isArray(c.ml.classes) || c.ml.classes.length !== ML.classes) {
      fail(`ml.classes 는 ${ML.classes}개여야 합니다. (정지·서행·진행)`);
    }
    for (const name of c.ml.classes) {
      if (typeof name !== 'string' || !name.trim()) fail('ml.classes 의 이름이 비어 있습니다.');
    }
    if (c.camera_source !== 'webcam') fail('ml 챌린지는 camera_source 가 "webcam" 이어야 합니다. (실제 카메라가 입력이다)');
    // 주행 후 피드백 문구도 매니페스트가 소유한다. 화면이 문장을 지어내지 않는다.
    if (c.ml.feedback !== undefined) {
      for (const k of ['none', 'weak', 'overfit', 'good']) {
        if (typeof c.ml.feedback[k] !== 'string' || !c.ml.feedback[k].trim()) fail(`ml.feedback.${k} 가 비어 있습니다.`);
      }
    }
  }

  // 가이드 퀘스트 단계. 선택 항목이고, 문구와 대상은 매니페스트가 소유한다.
  if (c.guide !== undefined) {
    if (!Array.isArray(c.guide)) fail('guide 는 배열이어야 합니다.');
    for (const step of c.guide) {
      if (!step || typeof step.text !== 'string' || !step.text.trim()) fail('guide 단계에 text 가 없습니다.');
      const t = step.target;
      if (!t || (t.el === undefined && t.anchor === undefined)) fail(`guide 단계 "${step.text}" 의 target 이 잘못되었습니다. (el 또는 anchor)`);
      // 57-E — 주석 마커 대신 코드 문자열로 짚는다. 옛 code(section·match)는 받지 않는다 —
      // 스타터에 주석이 없어 조용히 아무 데도 못 짚던 것이 그 방식이다.
      if (t.anchor !== undefined) {
        if (typeof t.anchor.find !== 'string' || !t.anchor.find.trim()) {
          fail(`guide 단계 "${step.text}" 의 anchor.find 가 비어 있습니다.`);
        }
        if (t.anchor.nth !== undefined && (!Number.isInteger(t.anchor.nth) || t.anchor.nth < 1)) {
          fail(`guide 단계 "${step.text}" 의 anchor.nth 는 1 이상의 정수여야 합니다.`);
        }
      }
    }
  }
  // 해답 코드는 선택 항목이다. 두었다면 스타터와 같은 언어여야 한다.
  if (c.solution_code !== undefined) {
    if (c.solution_code.language !== 'ino-subset') fail(`solution_code.language 는 "ino-subset" 이어야 합니다.`);
    if (typeof c.solution_code.source !== 'string' || !c.solution_code.source.trim()) fail('solution_code.source 가 비어 있습니다.');
  }
  return true;
}

/**
 * 57차 — 탐사(모드3)의 계약.
 *
 * 왜 따로인가:
 *   이 챌린지에는 트랙도 랩도 채점도 없다. 모드1·2 의 필수 항목을 그대로 들이대면
 *   "없어서" 터지고, 그렇다고 모드1·2 쪽을 느슨하게 하면 정작 지켜야 할 챌린지들이
 *   조용히 빠져나간다. 그래서 요구 목록을 아예 갈랐다.
 *
 * 무엇을 반드시 보는가:
 *   화면과 규칙이 매니페스트를 읽어 도는 챌린지라, 값이 하나만 없어도 화면이 조용히
 *   기본값으로 도는 일이 생긴다. 안전 넷은 특히 그렇다 — 없으면 "안전이 꺼진 채로" 돈다.
 */
function assertScout(c, kit, fail, need) {
  for (const k of ['kit_id', 'challenge_id', 'version', 'mode', 'title', 'camera_source',
                   'scene', 'mission', 'scout', 'drive', 'safety', 'controls', 'stages',
                   'log', 'path', 'submit', 'allowed_api', 'limits']) {
    need(c, k);
  }
  if (c.kit_id !== kit.kit_id) fail(`kit_id 불일치: 매니페스트 ${c.kit_id} vs 킷 파일 ${kit.kit_id}`);
  if (c.scene.units !== 'mm') fail(`scene.units 는 "mm" 고정입니다. (받은 값: ${c.scene.units})`);
  // 소스는 매니페스트가 고른다. 코드에 기본값을 두지 않으므로 여기서 값이 맞는지만 본다.
  // device 와 sim 은 자리만 있고 아직 구현이 없다 — 어댑터가 그 사실을 화면에 말한다.
  if (!SCOUT_SOURCES.includes(c.camera_source)) {
    fail(`camera_source 는 ${SCOUT_SOURCES.join(' · ')} 중 하나여야 합니다. (받은 값: ${c.camera_source})`);
  }
  // 학생이 고를 수 있는 소스. 처음 값(camera_source)은 그 목록 안에 있어야 한다.
  const srcs = c.camera_sources || [c.camera_source];
  if (!Array.isArray(srcs) || !srcs.length) fail('camera_sources 가 비어 있습니다.');
  for (const id of srcs) {
    if (!SCOUT_SOURCES.includes(id)) fail(`camera_sources 에 알 수 없는 소스가 있습니다: ${id}`);
    if (!(c.source_labels || {})[id]) fail(`source_labels 에 ${id} 가 없습니다. 학생이 무엇을 고르는지 이름이 있어야 합니다.`);
  }
  if (!srcs.includes(c.camera_source)) {
    fail(`camera_source(${c.camera_source})가 camera_sources 목록에 없습니다.`);
  }
  // 실물 연결 규격. 주소만 학생이 적고 나머지는 전부 매니페스트가 갖는다.
  if (srcs.includes('device')) {
    const dv = need(c, 'device');
    for (const k of ['stream_port', 'speed_pwm', 'resend_ms', 'connect_timeout_ms', 'frame_timeout_ms']) {
      if (!(dv[k] > 0)) fail(`device.${k} 가 잘못되었습니다.`);
    }
    for (const k of ['stream_path', 'capture_path', 'cmd_path', 'status_path',
                     'host_label', 'host_placeholder', 'connect_label', 'hint']) {
      if (!dv[k]) fail(`device.${k} 가 없습니다.`);
    }
    // 펌웨어 데드맨보다 자주 보내야 누르고 있는 동안 계속 간다. 값이 뒤집히면 차가 끊긴다.
    if (!(dv.resend_ms < 500)) fail(`device.resend_ms(${dv.resend_ms})는 펌웨어 데드맨(500ms)보다 짧아야 합니다.`);
    // 왜 안 되는지 네 갈래를 전부 말할 수 있어야 한다. 하나라도 없으면 학생이 막힌다.
    for (const k of ['mixed_content', 'network', 'cors', 'no_frame']) {
      if (!(dv.errors || {})[k]) fail(`device.errors.${k} 가 없습니다. 연결 실패 사유 넷은 전부 있어야 합니다.`);
    }
    if (dv.host !== undefined) fail('device.host 를 매니페스트에 두지 않습니다. 주소는 화면에서 학생이 적습니다.');
  }
  if (c.scoring !== undefined || c.rules !== undefined) {
    fail('탐사 챌린지에는 scoring·rules 를 두지 않습니다. 채점도 랩타임도 순위도 없습니다.');
  }

  const quad = need(c, 'scene.ui.quad');
  if (!Array.isArray(quad.slots) || quad.slots.length !== 4) fail('scene.ui.quad.slots 는 네 칸이어야 합니다.');
  const ids = new Set((quad.options || []).map((o) => o.id));
  if (ids.size !== (quad.options || []).length) fail('scene.ui.quad.options 의 id 가 중복됩니다.');
  for (const id of quad.slots) if (!ids.has(id)) fail(`quad.slots 에 없는 화면이 있습니다: ${id}`);
  for (const o of quad.options || []) {
    if (!o.label) fail(`quad.options ${o.id} 에 label 이 없습니다.`);
    if (!o.sensor) fail(`quad.options ${o.id} 에 sensor 가 없습니다. 어느 센서가 필요한지가 "센서 없음" 표시를 정합니다.`);
  }
  need(c, 'scene.ui.quad.no_sensor_label');

  const s = c.scout;
  if (!(s.classes.max >= 2)) fail('scout.classes.max 는 2 이상이어야 합니다.');
  if (!(s.classes.min_samples >= 1)) fail('scout.classes.min_samples 가 잘못되었습니다.');
  if (!(s.sharpness_min >= 0)) fail('scout.sharpness_min 이 잘못되었습니다.');
  if (!(s.confidence_min > 0 && s.confidence_min <= 1)) fail('scout.confidence_min 은 0 초과 1 이하여야 합니다.');
  if (!(s.spread_factor > 0)) fail('scout.spread_factor 가 잘못되었습니다.');
  if (!(s.knn_k >= 1)) fail('scout.knn_k 가 잘못되었습니다.');
  if (s.grid * s.grid * 3 + s.hist_bins !== s.feature_len) {
    fail(`scout.feature_len(${s.feature_len}) 이 격자·빈 수와 맞지 않습니다. `
      + `${s.grid}x${s.grid} 칸 평균 RGB ${s.grid * s.grid * 3} + 밝기 ${s.hist_bins} 빈 = ${s.grid * s.grid * 3 + s.hist_bins}`);
  }
  if (!Array.isArray(s.palette) || s.palette.length < s.classes.max) {
    fail('scout.palette 는 클래스 최대 개수만큼 있어야 합니다.');
  }

  const d = c.drive;
  for (const k of ['forward_mm_s', 'reverse_mm_s', 'turn_rad_s']) {
    if (!(d[k] > 0)) fail(`drive.${k} 가 잘못되었습니다.`);
  }
  if (d.forward_mm_s > kit.drive.max_speed_mm_s) {
    fail(`drive.forward_mm_s(${d.forward_mm_s})가 킷 최고 속도(${kit.drive.max_speed_mm_s})를 넘습니다.`);
  }

  // 안전은 선택이 아니다. 넷 중 하나라도 없으면 실물을 붙이지 않는다.
  const safe = c.safety;
  for (const k of ['deadman_ms', 'estop_key', 'max_speed_pct', 'link_loss_ms']) {
    if (safe[k] === undefined || safe[k] === null || safe[k] === '') {
      fail(`safety.${k} 가 없습니다. 안전 넷(데드맨 · 비상정지 · 속도 상한 · 통신 끊김)은 전부 있어야 합니다.`);
    }
  }
  if (!(safe.deadman_ms > 0)) fail('safety.deadman_ms 는 0보다 커야 합니다.');
  if (!(safe.link_loss_ms > 0)) fail('safety.link_loss_ms 는 0보다 커야 합니다.');
  if (!(safe.max_speed_pct > 0 && safe.max_speed_pct <= 100)) fail('safety.max_speed_pct 는 0 초과 100 이하여야 합니다.');

  for (const act of ['forward', 'back', 'left', 'right', 'observe', 'stop']) {
    const keys = c.controls[act];
    if (!Array.isArray(keys) || !keys.length) fail(`controls.${act} 에 키가 없습니다.`);
  }

  const st = c.stages;
  if (!Array.isArray(st.order) || st.order.length !== 3) fail('stages.order 는 세 단계여야 합니다.');
  for (const id of st.order) if (!st.labels[id]) fail(`stages.labels 에 ${id} 가 없습니다.`);
  need(c, 'stages.otherwise_row');
  // ②의 표에 "그 밖에" 줄이 고정으로 있고, 그것이 ③에서 else 가 된다. 둘이 어긋나면 안 된다.
  need(c, 'stages.otherwise.code');
  if (st.otherwise.label !== st.otherwise_row) {
    fail(`stages.otherwise.label(${st.otherwise.label})과 stages.otherwise_row(${st.otherwise_row})가 다릅니다. `
      + '표의 마지막 줄과 코드의 else 는 같은 것을 가리켜야 합니다.');
  }
  if (!Array.isArray(st.actions) || !st.actions.length) fail('stages.actions 가 비어 있습니다.');
  const actIds = new Set();
  for (const a of st.actions) {
    if (!a.id || !a.label || !a.code) fail(`stages.actions 항목에 id·label·code 가 모두 있어야 합니다: ${JSON.stringify(a)}`);
    if (actIds.has(a.id)) fail(`stages.actions id 가 중복됩니다: ${a.id}`);
    actIds.add(a.id);
  }
  if (!actIds.has(st.table.defaults.action)) fail(`stages.table.defaults.action 이 actions 에 없습니다: ${st.table.defaults.action}`);
  need(c, 'stages.code.classify_call');
  need(c, 'stages.code.var');

  // ③의 코드가 부르는 것은 전부 allowed_api 안에 있어야 한다 — 문서에 없는 API 를 만들지 않는다.
  const calls = new Set();
  const grab = (text) => { for (const m of String(text).matchAll(/([A-Za-z][A-Za-z0-9]*)\s*\(/g)) calls.add(m[1]); };
  st.actions.forEach((a) => grab(a.code));
  grab(st.otherwise.code);
  grab(st.code.classify_call);
  if (st.code.begin_call) grab(st.code.begin_call);
  for (const name of calls) {
    if (!c.allowed_api.includes(name)) {
      fail(`③의 코드가 부르는 ${name}() 이 allowed_api 에 없습니다. 코드는 문서에 있는 API 만 씁니다.`);
    }
  }

  need(c, 'log.empty');
  need(c, 'log.unknown');
  need(c, 'log.no_image');
  // 경로는 추정값이다. 화면이 그렇게 말하지 않으면 학생은 측정한 위치로 읽는다.
  need(c, 'path.note');
  need(c, 'path.explain');

  const sub = c.submit;
  need(c, 'submit.nickname_default');
  need(c, 'submit.badge');
  need(c, 'submit.no_photo');
  if (!Array.isArray(sub.fields) || !sub.fields.length) fail('submit.fields 가 비어 있습니다.');
  const fieldIds = new Set();
  for (const f of sub.fields) {
    if (!f.id || !f.label || !f.kind) fail(`submit.fields 항목에 id·label·kind 가 모두 있어야 합니다: ${JSON.stringify(f)}`);
    if (fieldIds.has(f.id)) fail(`submit.fields id 가 중복됩니다: ${f.id}`);
    fieldIds.add(f.id);
  }
  // 실명 입력을 유도하지 않는다. 이름 칸은 표시 이름 하나뿐이어야 한다.
  if (fieldIds.has('name') || fieldIds.has('real_name')) {
    fail('submit.fields 에 실명 칸을 두지 않습니다. 표시 이름(nickname)만 받습니다.');
  }

  for (const name of c.allowed_api) {
    if (!API_REGISTRY[name]) fail(`allowed_api 에 알 수 없는 API 가 있습니다: ${name}`);
  }
  for (const k of ['max_source_bytes', 'max_statements', 'camera_hz', 'detect_hz']) {
    if (!(c.limits[k] > 0)) fail(`limits.${k} 가 잘못되었습니다.`);
  }
  return c;
}

/** 탐사가 받아들이는 카메라 소스. webcam 만 구현했고 나머지는 자리다. */
export const SCOUT_SOURCES = Object.freeze(['webcam', 'device', 'sim']);
