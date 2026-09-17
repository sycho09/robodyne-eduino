/**
 * tools/checks/catalog.mjs — 만들어 둔 챌린지가 허브에 뜨는가.
 *
 * 왜 있는가:
 *   49차에 드러난 것 — color-follow-basic · color-follow-blue · ml-sign-lab 세 종이
 *   index.json 에 hidden: true 로 남아 있어 허브 목록에 뜨지 않았다. 파일도 있고 검사도
 *   전부 통과했는데 학생에게만 안 보였다. 그 상태로 여러 차수가 지났고, 검사 일곱 가운데
 *   어느 것도 이것을 보지 않았다 — 모두 index.json 을 목록의 정답으로 믿었기 때문이다.
 *
 * 무엇을 보는가:
 *   src/challenges/<kit>/ 아래 매니페스트 파일과, 허브 목록에 실제로 뜨는 챌린지를 맞춘다.
 *     · 파일은 있는데 카탈로그에 없다        → 실패
 *     · 카탈로그에 있는데 파일이 없다        → 실패
 *     · 카탈로그에 있지만 hidden 이라 안 뜬다 → 실패
 *   일부러 내린 것은 catalog.allow.json 에 이유와 함께 적어 두고 예외로 둔다.
 *   예외 목록도 저장소에 있으므로, 무엇을 왜 내렸는지가 코드 리뷰에 남는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CH_DIR = path.join(ROOT, 'src', 'challenges');

const index = JSON.parse(fs.readFileSync(path.join(CH_DIR, 'index.json'), 'utf8'));
const allow = JSON.parse(fs.readFileSync(path.join(HERE, 'catalog.allow.json'), 'utf8'));
const excused = new Map((allow.excluded || []).map((e) => [e.challenge_id, e.why]));

/** 카탈로그가 가리키는 경로. 파일 이름이 아니라 카탈로그의 path 를 따른다. */
const listed = new Map(index.challenges.map((c) => [c.challenge_id, c]));

/**
 * 디스크에 있는 매니페스트. 이 검사만은 목록을 믿지 않고 파일을 직접 훑는다 —
 * "만들어 두고 목록에 안 올린 챌린지" 를 잡는 것이 이 검사의 일이기 때문이다.
 *
 * 57-G — 매니페스트가 두 모양으로 놓인다. 둘 다 봐야 한다.
 *   <킷>/<id>.json                옛 모양
 *   <킷>/<id>/challenge.json      챌린지 폴더
 * 한쪽만 보면 옮긴 챌린지가 "디스크에 없는 것" 이 되어 조용히 빠진다.
 */
const onDisk = new Map();
for (const kitDir of fs.readdirSync(CH_DIR, { withFileTypes: true })) {
  if (!kitDir.isDirectory()) continue;
  for (const e of fs.readdirSync(path.join(CH_DIR, kitDir.name), { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.json')) {
      onDisk.set(e.name.slice(0, -5), path.posix.join(kitDir.name, e.name));
    } else if (e.isDirectory()) {
      const inner = path.join(CH_DIR, kitDir.name, e.name, 'challenge.json');
      if (fs.existsSync(inner)) onDisk.set(e.name, path.posix.join(kitDir.name, e.name, 'challenge.json'));
    }
  }
}

const rows = [];
for (const [id, rel] of [...onDisk].sort()) {
  const entry = listed.get(id);
  if (!entry) rows.push({ id, where: rel, why: '카탈로그(index.json)에 없음' });
  else if (entry.hidden) rows.push({ id, where: rel, why: 'hidden: true — 허브 목록에서 내려가 있음' });
}
for (const [id, entry] of [...listed].sort()) {
  const p = path.join(CH_DIR, entry.path);
  if (!fs.existsSync(p)) rows.push({ id, where: entry.path, why: '카탈로그에 있는데 매니페스트 파일이 없음' });
}

// 52차 — 네 곳의 집합이 모두 같아야 한다.
//   ① 디스크 매니페스트  ② 허브 카드  ③ 라우터가 여는 주소  ④ 폴백 목록
// 49차에는 ①과 ②만 맞췄더니, 목록에서 내린 챌린지가 주소로는 그대로 열리고
// 폴백 목록("지금 열 수 있는 챌린지")에도 8개째로 나와 있었다.
// 화면 코드를 읽어 확인한다 — 셋 다 index.json 의 hidden 하나를 근거로 삼아야 한다.
const uiSrc = {
  '허브 카드': fs.readFileSync(path.join(ROOT, 'src/ui/pages/kit.js'), 'utf8'),
  '라우터가 여는 주소': fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8'),
  '폴백 목록': fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8'),
};
const GATE = {
  // 각 자리에서 hidden 을 실제로 거르는지. 표현이 바뀌면 여기도 함께 고친다.
  '허브 카드': /filter\(\([^)]*\)\s*=>[^)]*!c\.hidden/,
  '라우터가 여는 주소': /entry\s*&&\s*entry\.hidden/,
  '폴백 목록': /filter\(\([^)]*\)\s*=>\s*!c\.hidden\)/,
};
const gateRows = [];
for (const [where, re] of Object.entries(GATE)) {
  const on = re.test(uiSrc[where]);
  gateRows.push({ where, on });
  if (!on) rows.push({ id: '(전체)', where, why: `${where} 가 hidden 을 거르지 않습니다` });
}

// 57차 보강2 — 디스크에서 매니페스트를 하나도 못 찾았으면 비교한 것이 없다. 통과가 아니다.
if (!onDisk.size) {
  console.error('매니페스트를 0개 찾았습니다. 비교한 것이 없으므로 통과로 세지 않습니다.');
  process.exit(1);
}

const bad = rows.filter((r) => !excused.has(r.id));
const ok = rows.filter((r) => excused.has(r.id));

const shown = index.challenges.filter((c) => !c.hidden).length;
console.log(`매니페스트 ${onDisk.size}개 · 카탈로그 ${listed.size}개 · 허브에 뜨는 것 ${shown}개\n`);
console.log('노출 경로            hidden 을 거르는가');
for (const g of gateRows) console.log(`${g.where.padEnd(20)} ${g.on ? '예' : '아니오'}`);
console.log('');

if (bad.length) {
  console.log('챌린지                 자리                                   빠진 이유');
  for (const r of bad) console.log(`${r.id.padEnd(22)} ${r.where.padEnd(38)} ${r.why}`);
  console.log('');
}
if (ok.length) {
  console.log('일부러 내린 것 (catalog.allow.json)');
  for (const r of ok) console.log(`  ${r.id.padEnd(22)} ${excused.get(r.id)}`);
  console.log('');
}
for (const id of excused.keys()) {
  if (!rows.some((r) => r.id === id)) {
    console.log(`※ 예외 목록에 적혀 있지만 지금은 멀쩡히 뜹니다: ${id} — catalog.allow.json 에서 지워도 됩니다.`);
  }
}

console.log(`빠진 챌린지 ${bad.length}건 · 기준: 만든 챌린지는 예외 목록에 적힌 것 말고 전부 허브에 뜰 것`);
process.exit(bad.length ? 1 : 0);
