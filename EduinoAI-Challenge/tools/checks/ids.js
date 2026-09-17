/**
 * tools/checks/ids.js — 검사가 훑을 챌린지 목록.
 *
 * 목록을 검사마다 손으로 적어 두면 챌린지를 올리고 내릴 때마다 여섯 곳을 고쳐야 하고,
 * 한 곳을 빠뜨리면 그 검사만 조용히 옛 목록을 본다. 목록은 index.json 하나가 소유한다.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * 52차 — 목록에서 내린 챌린지는 주소로도 열리지 않는다(파트F).
 * 검사가 그것을 열려고 하면 폴백 화면이 떠서 "화면이 없다" 로 잡힌다 — 정상 동작이다.
 * 훑을 대상은 학생에게 실제로 보이는 챌린지다.
 */
const ALLOW = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.allow.json'), 'utf8'));

/**
 * 57차 — 검사마다 건너뛰는 챌린지가 생겼다.
 *
 * 스마트탐사(scout-lab)는 트랙도 랩타임도 코드 에디터도 없고 실물 카메라가 있어야 돈다.
 * 브라우저 검사 일곱이 보는 화면 요소가 아예 없으므로 훑을 대상이 아니다. 검사를 새로
 * 만드는 대신 건너뛸 목록을 파일로 두었다 — brightness.allow.json 과 같은 방식이라
 * 무엇을 왜 건너뛰는지가 저장소에 남고 코드 리뷰에 보인다.
 *
 * check 를 주지 않으면 아무것도 빼지 않는다. 예외는 반드시 이름을 대고 받아 가야 한다.
 */
function challengeIds(check) {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/challenges/index.json'), 'utf8'));
  const shown = idx.challenges.filter((c) => !c.hidden).map((c) => c.challenge_id);
  const out = check ? skippedFor(check).map((e) => e.challenge_id) : [];
  const list = shown.filter((cid) => !out.includes(cid));
  // 57차 보강2 — 훑을 대상이 하나도 없으면 그 검사는 아무것도 재지 못한다. 그 상태로 끝나면
  // 종료 코드 0 이 나와 '통과' 로 읽힌다 — 세로 넘침이 그렇게 통과하고 있었다.
  // 잴 것이 없다는 사실 자체가 실패다. 여기서 멈춰 어느 검사가 왜 빈손인지 이름을 대게 한다.
  if (!list.length) {
    throw new Error(`[${check || '이름 없음'}] 훑을 챌린지가 0종입니다. `
      + `index.json 에 보이는 챌린지 ${shown.length}종 · 이 검사가 건너뛰기로 한 것 ${out.length}종. `
      + '잰 것이 없는 검사는 통과로 세지 않습니다.');
  }
  return list;
}

/** 이 검사가 건너뛰는 항목들. 검사가 출력에 사유를 한 줄씩 찍는 데 쓴다. */
function skippedFor(check) {
  return (ALLOW.excluded || []).filter((e) => (e.checks || []).includes(check));
}

/** 검사 끝에 찍을 한 줄. 건너뛴 것이 없으면 빈 문자열이다. */
function skipNote(check) {
  const rows = skippedFor(check);
  if (!rows.length) return '';
  return rows.map((e) => `건너뜀: ${e.challenge_id} — ${e.why}`).join('\n');
}

/**
 * 57-F — 챌린지가 어디 있는지를 아는 곳도 여기 하나다.
 *
 * 지금까지는 검사 열 곳이 `/challenge/esp32cam-2wd/<id>` 와
 * `/src/challenges/esp32cam-2wd/<id>.json` 을 각자 문자열로 적고 있었다.
 * 매니페스트를 다른 자리로 옮기려면 그 열 곳을 빠짐없이 같이 고쳐야 하고,
 * 한 곳을 빠뜨리면 그 검사만 조용히 옛 자리를 본다 — 목록을 index.json 하나로 모은 것과
 * 같은 이유로 주소도 한곳에서만 만든다.
 *
 * 킷이 둘 이상이 되면 챌린지마다 kit_id 를 읽어 여기서 갈라 주면 된다.
 * 검사는 그때도 한 줄도 고치지 않는다.
 */
const KIT = 'esp32cam-2wd';

/** 브라우저가 여는 주소. 서버 포트는 부르는 쪽이 안다. */
function challengeUrl(port, cid, query = '') {
  return `http://127.0.0.1:${port}/challenge/${KIT}/${cid}${query}`;
}

/**
 * 매니페스트가 실제로 놓인 자리. **모양을 여기서 짐작하지 않는다** —
 * index.json 의 path 가 그 챌린지의 파일이 어디 있는지를 소유한다.
 * 그래서 매니페스트를 옮길 때 고치는 곳은 index.json 한 줄뿐이고,
 * 검사는 한 줄도 고치지 않는다. 열 종을 한꺼번에 옮기지 않아도 된다 —
 * 옮긴 것과 안 옮긴 것이 섞여 있어도 각자 제 자리를 댄다.
 */
/**
 * 목록에 있는 모든 챌린지 id. 내려 둔 것(hidden)까지 포함한다 —
 * 파일을 훑는 검사(정렬처럼)는 화면에 안 뜨는 챌린지도 봐야 한다.
 * 폴더를 훑지 않는다. 매니페스트가 폴더 안으로 들어가면 폴더 훑기는
 * 그 챌린지를 조용히 빠뜨리고 통과한다 — 잰 것이 줄어든 줄도 모른다.
 */
function allChallengeIds() {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/challenges/index.json'), 'utf8'));
  return idx.challenges.map((c) => c.challenge_id);
}

function catalogPath(cid) {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/challenges/index.json'), 'utf8'));
  const row = idx.challenges.find((c) => c.challenge_id === cid);
  if (!row || !row.path) {
    throw new Error(`index.json 에 ${cid} 의 path 가 없습니다. 매니페스트가 어디 있는지는 목록이 압니다.`);
  }
  return row.path;
}

/** 페이지 안에서 fetch 할 매니페스트 주소. */
function manifestUrl(cid) {
  return `/src/challenges/${catalogPath(cid)}`;
}

/** 페이지 안에서 fetch 할 킷 스펙 주소. */
function kitUrl() {
  return `/src/kits/${KIT}.json`;
}

/** 검사가 fs 로 읽을 매니페스트 경로. */
function manifestPath(cid) {
  return path.join(ROOT, 'src', 'challenges', catalogPath(cid));
}

/** 이 챌린지의 브라우저 저장소 열쇠. */
function storageKey(cid) {
  return `dtc:v1:${KIT}:${cid}`;
}

module.exports = {
  ROOT, KIT, challengeIds, skippedFor, skipNote,
  challengeUrl, manifestUrl, kitUrl, manifestPath, storageKey, catalogPath, allChallengeIds,
};
