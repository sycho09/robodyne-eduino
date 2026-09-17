/**
 * tools/checks/laptime.mjs — 랩 tick 기준값 대조.
 *
 * 왜 필요한가:
 *   화면·문구·레이아웃을 고치는 차수에도 물리가 딸려 바뀔 수 있다. 그때 눈으로 표를 비교하면
 *   놓친다. 기준값은 "정답" 이 아니라 "의도치 않게 바뀌면 안 되는 값" 이다.
 *
 * 무엇을 하는가:
 *   index.json 의 챌린지마다 기본 코드와 해답 코드를 헤드리스로 돌려 랩 tick · 페널티 ·
 *   이탈 · 규칙 위반을 재고, laptime.baseline.json 과 대조한다. 하나라도 다르면 실패다.
 *
 * 값을 바꿔야 하는 차수에는:
 *   node tools/checks/laptime.mjs --update   로 기준값을 다시 적고, 그 사실을 회신에 밝힌다.
 *
 * 웹캠이 있어야 도는 챌린지는 헤드리스에서 잴 수 없어 기준에서 뺀다(camera_source: webcam).
 * 스스로 도는 챌린지는 카메라가 없어도 끝까지 가므로 기준에 넣는다(scene.autopilot).
 */
import { KIT } from './ids.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BASELINE = path.join(HERE, 'laptime.baseline.json');

const { createSim, stepSim, resetSim, scoreRun, SIM_STATUS } = await import(`${ROOT}/src/engine/sim.js`);
const { compileProgram } = await import(`${ROOT}/src/runtime/sandbox.js`);
const { applyTemplates, assertChallenge } = await import(`${ROOT}/src/challenges/loader.js`);

const kit = JSON.parse(fs.readFileSync(`${ROOT}/src/kits/${KIT}.json`, 'utf8'));
const index = JSON.parse(fs.readFileSync(`${ROOT}/src/challenges/index.json`, 'utf8'));

/** 한 번 돌려 나온 값. 전부 엔진이 낸 수치이고 이 파일은 세지 않는다. */
function runOne(ch, source) {
  const c = compileProgram(source, { allowedApi: ch.allowed_api, limits: ch.limits, kit });
  if (!c.ok) return { error: `컴파일 실패: ${JSON.stringify(c.errors)}` };
  const sim = createSim({ challenge: ch, kit });
  resetSim(sim, (s) => c.makeProgram(s));
  let lap = null;
  for (let i = 0; i < ch.limits.max_sim_ticks && sim.status === SIM_STATUS.RUNNING; i++) {
    stepSim(sim);
    if (sim.lap.count > 0) { lap = sim.lap.lastTicks; break; }
  }
  const sc = scoreRun(sim, lap ?? sim.tick);
  return {
    finished: lap !== null,
    end: sim.ended ? sim.ended.reason : null,
    drive_ticks: lap !== null ? sc.drive_ticks : null,
    penalty_ticks: sc.penalty_ticks,
    total_ticks: lap !== null ? sc.total_ticks : null,
    offtrack: sim.offtrack.count,
    violations: sc.violations,
  };
}

const rows = {};
const skipped = [];
// 목록에서 내린 챌린지. 기준값 행은 지우지 않고 남기되(하드삭제 금지) 재지 않으므로
// '사라짐' 으로 세지 않는다 — 파일이 그대로 있어 언제든 다시 올릴 수 있다.
const dropped = new Set();
for (const entry of index.challenges) {
  const cid = entry.challenge_id;
  const ch = JSON.parse(fs.readFileSync(`${ROOT}/src/challenges/${entry.path}`, 'utf8'));
  // 51차 — 목록에서 내린 챌린지는 기준에서도 뺀다. 학생에게 안 보이는 것을 지키느라
  // 기준값이 늘어나면, 정작 보이는 챌린지가 바뀌었을 때 표가 길어 눈에 덜 띈다.
  // 파일은 그대로 있으므로 다시 올리면 그때 기준도 함께 돌아온다.
  if (entry.hidden) { skipped.push(`${cid}(목록에서 내림)`); dropped.add(cid); continue; }
  // 웹캠 입력이 있어야 도는 챌린지는 헤드리스에 카메라가 없어 기준을 잡을 수 없다.
  // 다만 스스로 도는 챌린지(scene.autopilot)는 카메라 없이도 끝까지 가므로 기준에 넣는다.
  if (ch.camera_source === 'webcam' && !ch.scene.autopilot) { skipped.push(`${cid}(카메라 없음)`); continue; }
  assertChallenge(ch, kit);
  applyTemplates(ch, kit);
  for (const [tag, src] of [['기본', ch.starter_code.source], ['해답', ch.solution_code && ch.solution_code.source]]) {
    if (!src) continue;
    rows[`${cid}/${tag}`] = runOne(ch, src);
  }
}

const update = process.argv.includes('--update');
if (update) {
  // 55차 마감 — 이번에 잰 것만 덮어쓰고 나머지는 그대로 둔다.
  // 통째로 다시 적으면 목록에서 내린 챌린지의 기준값 행이 사라진다(하드삭제). 이 파일 스스로
  // "행은 지우지 않고 남긴다" 고 적어 두었는데 --update 가 그 반대로 하고 있었다.
  // 남겨 두어야 그 챌린지를 다시 올렸을 때 옛 기록과 대조할 수 있다.
  const prev = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { rows: {} };
  const merged = { ...(prev.rows || {}), ...rows };
  const kept = Object.keys(merged).length - Object.keys(rows).length;
  // 55차 보강8 A — 행이 줄어들면 쓰지 않고 멈춘다. 어느 키가 사라지는지 찍는다.
  // 55차에 --update 가 하차 챌린지 네 종의 기준값을 통째로 지웠다. 고친 것으로 끝내지 않고
  // 다시 그렇게 되면 여기서 멈추게 한다 — 지워진 기준값은 되찾을 데가 없다.
  const lost = Object.keys(prev.rows || {}).filter((k) => merged[k] === undefined);
  if (lost.length) {
    console.error(`기준값 행이 줄어듭니다 (${lost.length}줄). 쓰지 않고 멈춥니다:`);
    for (const k of lost) console.error(`  - ${k}`);
    process.exit(1);
  }
  // 어떤 행을 들고 있어야 하는지 파일이 스스로 적어 둔다. 나중에 누가 손으로 한 줄을 지워도
  // 검사가 그 키를 이름으로 짚을 수 있다 — rows 만 보면 '없는 것' 은 보이지 않는다.
  const rowKeys = Object.keys(merged).sort();
  fs.writeFileSync(BASELINE, `${JSON.stringify({ note: '48차 파트9 — 의도치 않게 바뀌면 안 되는 값. 바꿔야 하는 차수에는 --update 로 다시 적고 회신에 밝힌다.', skipped, row_keys: rowKeys, rows: merged }, null, 2)}\n`);
  console.log(`기준값을 다시 적었습니다: ${path.relative(ROOT, BASELINE)}`
    + ` (이번에 잰 ${Object.keys(rows).length}줄 · 재지 않아 그대로 둔 ${kept}줄)`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`기준값 파일이 없습니다. 먼저 만들어 두세요: node tools/checks/laptime.mjs --update`);
  process.exit(2);
}
const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const keys = [...new Set([...Object.keys(base.rows), ...Object.keys(rows)])].sort();
const FIELDS = ['finished', 'end', 'drive_ticks', 'penalty_ticks', 'total_ticks', 'offtrack', 'violations'];

console.log('챌린지 / 코드              결과      주행     페널티    최종     이탈  위반  판정');
let bad = 0;
for (const k of keys) {
  const now = rows[k];
  const was = base.rows[k];
  let verdict = 'ok';
  if (!now) { verdict = dropped.has(k.split('/')[0]) ? '하차 (기준 보존)' : '사라짐'; }
  else if (!was) { verdict = '기준 없음'; }
  else {
    const diff = FIELDS.filter((f) => JSON.stringify(now[f]) !== JSON.stringify(was[f]));
    if (diff.length) verdict = `다름(${diff.map((f) => `${f} ${was[f]}→${now[f]}`).join(' · ')})`;
  }
  if (verdict !== 'ok' && !verdict.startsWith('하차')) bad++;
  const r = now || was || {};
  const s = (v) => (typeof v === 'number' ? `${(v / 100).toFixed(2)}초` : '—');
  console.log(k.padEnd(26), String(r.finished ? '완주' : (r.end || '미완주')).padEnd(8),
    s(r.drive_ticks).padStart(8), s(r.penalty_ticks).padStart(9), s(r.total_ticks).padStart(8),
    String(r.offtrack ?? '—').padStart(5), String(r.violations ?? '—').padStart(5), '  ', verdict);
}
if (skipped.length) console.log(`\n기준에서 뺀 챌린지: ${skipped.join(' · ')}`);
// 55차 보강8 A — 기준값 행이 줄지 않았는가. 하차한 챌린지의 행은 남아 있어야 한다 —
// 다시 올렸을 때 옛 기록과 대조할 데가 그것뿐이다.
const baseKeys = Object.keys(base.rows);
const preserved = baseKeys.filter((k) => rows[k] === undefined);
const gone = preserved.filter((k) => !dropped.has(k.split('/')[0]));
if (gone.length) bad += gone.length;
// 파일이 적어 둔 목록과 대조한다. 행이 사라지면 여기서 이름으로 잡힌다.
const wantKeys = Array.isArray(base.row_keys) ? base.row_keys : null;
const lostKeys = wantKeys ? wantKeys.filter((k) => base.rows[k] === undefined) : [];
if (lostKeys.length) bad += lostKeys.length;
console.log(`\n기준값 행 ${baseKeys.length}줄 — 이번에 잰 ${Object.keys(rows).length}줄 · `
  + `하차라 그대로 둔 ${preserved.length - gone.length}줄`
  + `${gone.length ? ` · 잴 수도 없는데 남아 있는 ${gone.length}줄 (${gone.join(' · ')})` : ''}`
  + `${lostKeys.length ? ` · **사라진 행 ${lostKeys.length}줄 (${lostKeys.join(' · ')})**`
    : (wantKeys ? ' · 줄어든 행 없음' : ' · (row_keys 없음 — --update 한 번 돌리면 이 대조가 켜진다)')}`);
// 57차 보강2 — 이번에 실제로 잰 행이 0이면 대조한 것이 없다. 통과로 세지 않는다.
if (!Object.keys(rows).length) {
  console.log(`\n이번에 잰 행 0줄 — 대조한 것이 없습니다. 통과로 세지 않습니다. (기준값 ${baseKeys.length}줄)`);
  process.exit(1);
}
console.log(`\n실패 ${bad}/${keys.length} · 기준: laptime.baseline.json 과 한 값도 다르지 않을 것 · 기준값 행이 줄지 않을 것 · 잰 행이 0이 아닐 것`);
process.exit(bad ? 1 : 0);
