// main.js — Eduino AI : 미니게임천국
// 플로우: 인트로 → 모드선택 → 메인 → 로그인 → 보드연결 → 허브 → 스테이지 → 미니게임.
import { showPlatformIntro } from './scenes/platformIntro.js';
import { showModeSelect } from './scenes/modeSelect.js';
import { showProductMain } from './scenes/productMain.js';
import { showLogin } from './scenes/login.js';
import { showSetup } from './scenes/setup.js';
import { showHubSelect } from './scenes/hubSelect.js';
import { showChapterSelect } from './scenes/chapterSelect.js';
import { showRecords, recordsEntry } from './scenes/records.js';
import { progress } from './app/progress.js';
import { bgm } from './app/bgm.js';
import { nav } from './app/nav.js';
import { DEV_TOOLS } from './app/flags.js';

// 게임 씬 동적 import (허브 진입 시 프리패치)
const GAME_SCENES = {
  basics:     () => import('./scenes/basics.js').then((m) => m.showBasics),
  sensorRoom: () => import('./scenes/sensorRoom.js').then((m) => m.showSensorRoom),
  lamp:       () => import('./scenes/lampGame.js').then((m) => m.showLampGame),
  bomb:       () => import('./scenes/bombGame.js').then((m) => m.showBombGame),
  final:      () => import('./scenes/finaleShow.js').then((m) => m.showFinaleShow),
};

const app = () => document.getElementById('app');

let lastChapter = null;   // HUB 복귀 시 들어갔던 게이트 앞
let lastRoom = null;      // 챕터 복귀 시 나온 방 앞

// 220ms 넘게 걸릴 때만 인디케이터를 띄운다 — 대개 캐시·프리페치라 즉시 끝나서 깜빡임만 남는다.
async function mountLazy(key, opts) {
  const host = app();
  let spinner = null;
  const t = setTimeout(() => {
    spinner = document.createElement('div');
    spinner.className = 'scene-loading';
    spinner.innerHTML = '<div class="scene-loading-dot"></div>';
    host.replaceChildren(spinner);
  }, 220);

  try {
    const show = await GAME_SCENES[key]();
    clearTimeout(t);
    if (spinner) spinner.remove();
    show(app(), opts);
  } catch (err) {
    clearTimeout(t);
    console.error(`[main] '${key}' 씬 로드 실패`, err);
    host.replaceChildren();
    nav.back();   // 빈 화면에 갇히지 않게 이전 화면으로
  }
}

// 허브에 도착하면 게임 청크를 유휴 시간에 미리 받아둔다(실패는 무시 — 진입 시 다시 받는다).
let prefetched = false;
function prefetchGames() {
  if (prefetched) return;
  prefetched = true;
  const run = () => Object.values(GAME_SCENES).forEach((load) => load().catch(() => {}));
  (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(run);
}

// 모든 전환은 nav 를 통과 → 기기/브라우저 뒤로·ESC·통일 버튼이 한 단계씩 되돌아감.
function scenePlatformIntro() { showPlatformIntro(app(), { onDone: () => nav.push(sceneModeSelect) }); }     // ① 플랫폼 스튜디오 인트로(로고)
function sceneModeSelect() { showModeSelect(app(), { onDone: () => nav.push(sceneProductMain) }); }   // ①-b 기기 모드 선택
function sceneProductMain() { showProductMain(app(), { onDone: () => nav.push(sceneLogin) }); }                // ② 상품 메인페이지 → 바로 입장
function sceneLogin() { showLogin(app(), { onDone: () => nav.push(sceneSetup) }); }                            // (호환 키트 안내 페이지는 전용 신제품 출시로 제외)
function sceneSetup() { recordsEntry.hide(); showSetup(app(), { onDone: () => { progress.mark('setup'); nav.push(sceneHub, { name: 'hub' }); } }); }   // CH1 클리어

// 기록실 — 지금까지의 등급·세부기록 보관함. 카드의 '다시 도전'은 그 방으로 바로 들어간다.
function sceneRecords() {
  recordsEntry.hide();
  showRecords(app(), { onPlay: (roomId) => pushRoom(roomId) });
}

function sceneHub() {
  prefetchGames();
  recordsEntry.show({ onOpen: () => nav.push(sceneRecords, { name: 'records' }) });   // 기록실 입구는 허브에서만
  showHubSelect(app(), { onEnter: (chId) => pushChapter(chId), spawnAt: lastChapter });
}

const pushChapter = (id) => nav.push(() => enterChapter(id), { name: 'chapter', params: { id } });
const pushRoom = (id) => nav.push(() => enterRoom(id), { name: 'room', params: { id } });

function enterChapter(chId) {
  recordsEntry.show({ onOpen: () => nav.push(sceneRecords, { name: 'records' }) });
  lastChapter = chId;
  showChapterSelect(app(), {
    chapter: chId,
    onRoom: (roomId) => pushRoom(roomId),
    onExit: () => nav.back(),
    onChapter: (id) => pushChapter(id),
    spawnAt: lastRoom,
  });
}

function enterRoom(roomId) {
  recordsEntry.hide();
  lastRoom = roomId;
  const back = () => nav.back();
  switch (roomId) {
    case 'basics': mountLazy('basics', { onExit: back, onComplete: back }); break;
    case 'led': case 'buzzer': case 'rgb': case 'cds': case 'pot': case 'button':
      mountLazy('sensorRoom', { id: roomId, onExit: back }); break;
    case 'lamp': mountLazy('lamp', { onExit: back }); break;
    case 'bomb': mountLazy('bomb', { onExit: back }); break;
    case 'final': mountLazy('final', { onExit: back }); break;
    case 'setup': showSetup(app(), { onDone: () => { progress.mark('setup'); back(); } }); break;
    default: back();   // 준비중(scene:null) 방은 챕터에서 막으므로 안전망
  }
}

// 배경 이미지 사전 로드 (404 방지)
function preloadAssets() {
  ['main-bg', 'login-bg', 'setup-bg', 'hub-bg', 'stage-led-bg', 'game-led-cover', 'wiring-led']
    .forEach((n) => { const im = new Image(); im.src = `/brand/${n}.webp`; });
}

// 개발용 디버그 훅 (production에서 트리셰이킹)
if (DEV_TOOLS) {
  window.__dev = { progress, nav };
  console.info('[dev] window.__dev 사용 가능 — progress.reset() / progress.mark(id)');
}

// ── 새로고침 복원 ────────────────────────────────────────────────────────────
// 화면 함수는 클로저라 저장할 수 없어 '이름 + 인자' 만 남기고 여기서 다시 만든다(sessionStorage).
const ROUTE_KEY = 'eduino.route.v1';
const ROUTES = {
  hub: () => sceneHub(),
  records: () => sceneRecords(),
  chapter: (p) => enterChapter(p.id),
  room: (p) => enterRoom(p.id),
};

nav.onChange((trail) => {
  try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(trail)); } catch (_) {}
});

function readTrail() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ROUTE_KEY) || '[]');
    return Array.isArray(v) && v[0]?.name === 'hub' ? v : [];   // 허브에서 시작한 기록만 되살린다
  } catch { return []; }
}

function boot() {
  // 온보딩(인트로~보드 연결)을 아직 안 끝냈으면 복원하지 않는다 — 순서를 건너뛰면 안 되는 구간이다.
  const trail = progress.isCleared('setup') ? readTrail() : [];
  if (!trail.length) { nav.start(scenePlatformIntro); return; }

  // 카루셀이 마지막에 보던 칸을 잡도록, 복원 렌더보다 먼저 채운다.
  lastChapter = trail.find((r) => r.name === 'chapter')?.params?.id ?? null;
  lastRoom = trail.find((r) => r.name === 'room')?.params?.id ?? null;

  // 스택 맨 밑에 '보드 연결' 한 칸만 깐다 — 허브를 루트로 세우면 뒤로 버튼만 사라진다.
  const entries = [{ fn: sceneSetup }];     // route 없음 = 복원 대상 아님(nav.trail 이 걸러낸다)
  for (const r of trail) {
    const make = ROUTES[r.name];
    if (!make) break;                       // 모르는 이름(옛 버전 등)이 나오면 거기까지만
    entries.push({ fn: () => make(r.params || {}), route: r });
  }
  nav.restore(entries);
}

window.addEventListener('DOMContentLoaded', () => { bgm.armAutostart(); preloadAssets(); boot(); });
