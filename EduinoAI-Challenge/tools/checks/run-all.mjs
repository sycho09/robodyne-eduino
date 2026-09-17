/**
 * tools/checks/run-all.mjs — 회귀 검사 진입점.
 *
 * 왜 한곳에 모으는가:
 *   45차에서 고친 버그(기록 패널이 자격 규칙 선언 전에 첫 렌더를 부름)는 기록이 하나라도
 *   있어야 드러나서 두 차수를 통과했다. 그때 만든 검사가 스크래치에만 있으면 다음 차수에
 *   또 없다. 검사가 저장소에 있어야 다음 사람이 돌린다.
 *
 * 무엇을 하는가:
 *   정적 파일 서버를 한 번 띄우고, 검사를 차례로 돌려 통과·실패를 표로 낸다.
 *   하나라도 실패하면 종료 코드가 1 이다.
 *
 * 차례가 중요한 곳이 하나 있다: '렌더' 가 색 기준값을 만들고 '콜드 캐시' 가 그것을 읽는다.
 *
 *   node tools/checks/run-all.mjs            전부
 *   node tools/checks/run-all.mjs 렌더 콜드   이름으로 골라서
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PORT = Number(process.env.PORT || 8123);

/** 검사 하나 = 이름 · 실행기 · 파일 · 브라우저가 필요한가. */
const CHECKS = [
  { name: '선언 순서', cmd: 'python3', file: 'decl-order.py', browser: false,
    what: '끌어올려진 함수가 아직 선언되지 않은 const/let 을 읽는 자리' },
  { name: '목록', cmd: 'node', file: 'catalog.mjs', browser: false,
    what: '만들어 둔 챌린지가 빠짐없이 허브 목록에 뜨는가' },
  { name: '밝기', cmd: 'python3', file: 'brightness.py', browser: false,
    what: '노면이 화면에서 가장 밝은 면인가 — 평균 비와 코스 밖 최대' },
  { name: '정렬', cmd: 'node', file: 'align.mjs', browser: false,
    what: '결승선·판단 지점이 중심선과 이루는 각도, 스폰 위치' },
  { name: '랩 tick', cmd: 'node', file: 'laptime.mjs', browser: false,
    what: '기본·해답 코드의 랩 tick·페널티·이탈·규칙 위반이 기준값 그대로인가' },
  { name: '렌더', cmd: 'node', file: 'render.js', browser: true,
    what: '9종이 배경으로 그려지는가(캔버스 색 가짓수)' },
  { name: '콜드 캐시', cmd: 'node', file: 'cold.js', browser: true,
    what: '에셋이 늦게 와도 도착 후 화면이 제 색을 되찾는가' },
  { name: '학습→화면', cmd: 'node', file: 'mlsee.js', browser: true,
    what: '가짜 카메라로 담기·학습을 거친 뒤 "지금 보는 것" 이 장면을 따라 바뀌는가' },
  { name: '화면', cmd: 'node', file: 'screen.js', browser: true,
    what: '남은 챌린지의 화면 구성과 콘솔 오류 · 1행 브랜드' },
  { name: '세로 넘침', cmd: 'node', file: 'fit.js', browser: true,
    what: '네 크기에서 세 칸 어느 것도 스크롤이 생기지 않는가' },
  { name: '기록 있는 상태', cmd: 'node', file: 'record.js', browser: true,
    what: '저장된 기록이 있는 채로 9종을 열었을 때' },
  { name: '2단 정렬', cmd: 'node', file: 'camalign.mjs', browser: true,
    what: '카메라 1단 마커와 2단 검출 박스의 세로 중심이 맞는가' },
  { name: '첫 진입 상태', cmd: 'node', file: 'first.js', browser: true,
    what: 'resize 를 한 번도 주지 않은 채 연 뒤 카메라 두 칸의 크기' },
  { name: '옛 코드 있는 상태', cmd: 'node', file: 'oldcode.js', browser: true,
    what: '브라우저에 옛 스타터가 저장돼 있을 때 — 손대지 않았으면 새 판으로, 손댔으면 그대로' },
  { name: '안내 짚기', cmd: 'node', file: 'guide.js', browser: true,
    what: '안내 단계가 짚는 코드 줄과 화면 요소가 실제로 있는가' },
];

const pick = process.argv.slice(2);
const todo = pick.length ? CHECKS.filter((c) => pick.some((p) => c.name.includes(p) || c.file.startsWith(p))) : CHECKS;
if (!todo.length) {
  console.error(`고른 검사가 없습니다. 있는 이름: ${CHECKS.map((c) => c.name).join(' · ')}`);
  process.exit(2);
}

const alive = () => new Promise((ok) => {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/index.html' }, (r) => { r.resume(); ok(r.statusCode === 200); });
  req.on('error', () => ok(false));
  req.setTimeout(700, () => { req.destroy(); ok(false); });
});

let server = null;
if (todo.some((c) => c.browser) && !(await alive())) {
  server = spawn('node', [join(HERE, 'serve.js'), ROOT, String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 250));
  if (!(await alive())) { console.error(`서버가 뜨지 않았습니다 (포트 ${PORT}).`); process.exit(2); }
}

const run = (c) => new Promise((done) => {
  const t0 = Date.now();
  const p = spawn(c.cmd, [join(HERE, c.file)], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
  p.on('close', (code) => done({ ...c, code, sec: Math.round((Date.now() - t0) / 1000) }));
});

const results = [];
for (const c of todo) {
  console.log(`\n───── ${c.name} — ${c.what}`);
  results.push(await run(c));
}
if (server) server.kill();

console.log('\n═════ 검사 요약');
console.log('검사              걸린 시간  판정');
// 54차 — 잴 대상이 없는 검사는 ok 가 아니라 skip 이다. ok 로 적으면 깨져도 통과처럼 읽힌다.
// 검사가 스스로 종료 코드 2 로 알린다.
const SKIP = 2;
for (const r of results) {
  const mark = r.code === 0 ? 'ok' : (r.code === SKIP ? 'skip (대상 없음)' : '실패');
  console.log(`${r.name.padEnd(17)} ${String(r.sec + '초').padStart(7)}   ${mark}`);
}
const bad = results.filter((r) => r.code !== 0 && r.code !== SKIP).length;
const skipped = results.filter((r) => r.code === SKIP).length;
console.log(`\n실패 ${bad}/${results.length}${skipped ? ` · skip ${skipped}` : ''}`);
process.exit(bad ? 1 : 0);
