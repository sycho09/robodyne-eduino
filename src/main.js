// main.js — Eduino AI : 미니게임천국
// 플로우: 플랫폼 인트로 → 기기 모드 → 상품 메인 → 로그인 → 사용환경 준비(보드 연결)
//   → 미니게임 광장(HUB) → 무대(챕터) 선택 → 미니게임 부스 → 복귀.

// 온보딩~허브까지(첫 화면에 필요한 경로)는 즉시 로드한다.
import { showPlatformIntro } from './scenes/platformIntro.js';
import { showModeSelect } from './scenes/modeSelect.js';
import { showProductMain } from './scenes/productMain.js';
import { showLogin } from './scenes/login.js';
import { showSetup } from './scenes/setup.js';
import { showHubSelect } from './scenes/hubSelect.js';
import { showChapterSelect } from './scenes/chapterSelect.js';
import { progress } from './app/progress.js';
import { bgm } from './app/bgm.js';
import { nav } from './app/nav.js';
import { DEV_TOOLS } from './app/flags.js';

// 게임 씬은 동적 import 로 분리한다 — 인트로~로그인 구간에 게임 코드를 받을 이유가 없다.
// 허브 진입 시 유휴 시간에 미리 받아두므로(prefetchGames) 실제 전환 지연은 거의 없다.
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

// 청크를 받는 동안 화면이 비어 보이지 않게 한다. 대개 즉시 끝나므로(캐시·프리페치)
// 220ms 넘게 걸릴 때만 표시해 깜빡임을 만들지 않는다.
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
function sceneSetup() { showSetup(app(), { onDone: () => { progress.mark('setup'); nav.push(sceneHub); } }); }   // CH1 클리어

function sceneHub() {
  prefetchGames();
  showHubSelect(app(), { onEnter: (chId) => nav.push(() => enterChapter(chId)), spawnAt: lastChapter });
}

function enterChapter(chId) {
  lastChapter = chId;
  showChapterSelect(app(), {
    chapter: chId,
    onRoom: (roomId) => nav.push(() => enterRoom(roomId)),
    onExit: () => nav.back(),
    onChapter: (id) => nav.push(() => enterChapter(id)),
    spawnAt: lastRoom,
  });
}

function enterRoom(roomId) {
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

// 다음 장면 배경을 미리 받아두면(인트로 4초 동안) 전환 시 '남색 물방울' 플레이스홀더가 안 보인다.
// ⚠️ public/brand 에 실존하는 파일만 넣을 것 — 없는 이름은 매 실행 404 를 낸다.
//    (basics-bg 는 미제작이라 제거했다. 배경을 만들면 다시 넣으면 된다.)
function preloadAssets() {
  ['main-bg', 'login-bg', 'setup-bg', 'hub-bg', 'stage-led-bg', 'game-led-cover', 'wiring-led']
    .forEach((n) => { const im = new Image(); im.src = `/brand/${n}.webp`; });
}

// 개발용 디버그 훅. DEV_TOOLS 는 프로덕션에서 false 상수로 치환되므로
// 아래 블록은 트리셰이킹으로 번들에서 통째로 사라진다(배포본엔 window.__dev 가 없다).
//   __dev.progress.reset()      진척 초기화
//   __dev.progress.mark('led')  특정 방 클리어 처리
if (DEV_TOOLS) {
  window.__dev = { progress, nav };
  console.info('[dev] window.__dev 사용 가능 — progress.reset() / progress.mark(id)');
}

window.addEventListener('DOMContentLoaded', () => { bgm.armAutostart(); preloadAssets(); nav.start(scenePlatformIntro); });
