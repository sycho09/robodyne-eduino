// main.js — Eduino AI : 미니게임천국
// 플로우: 플랫폼 인트로 → 상품 메인 → 호환 키트 → 로그인 → 사용환경 준비(시작의 천막)
//   → 미니게임 광장(HUB) → 무대 입구 → 미니게임 부스 → 복귀.

import { showPlatformIntro } from './scenes/platformIntro.js';
import { showModeSelect } from './scenes/modeSelect.js';
import { showProductMain } from './scenes/productMain.js';
import { showLogin } from './scenes/login.js';
import { showSetup } from './scenes/setup.js';
import { showBasics } from './scenes/basics.js';
import { showSensorRoom } from './scenes/sensorRoom.js';
import { showHubSelect } from './scenes/hubSelect.js';
import { showChapterSelect } from './scenes/chapterSelect.js';
import { showDhtCoding } from './scenes/dhtCoding.js';
import { showDht11Room } from './scenes/dht11room.js';
import { showDht11 } from './scenes/dht11.js';
import { showRelay } from './scenes/relay.js';
import { showEscapeRoom } from './scenes/escapeRoom.js';
import { showLampGame } from './scenes/lampGame.js';
import { showBombGame } from './scenes/bombGame.js';
import { showFinaleShow } from './scenes/finaleShow.js';
import { progress } from './app/progress.js';
import { getRoom } from './content/curriculum.js';
import { bgm } from './app/bgm.js';
import { nav } from './app/nav.js';

const app = () => document.getElementById('app');

let lastChapter = null;   // HUB 복귀 시 들어갔던 게이트 앞
let lastRoom = null;      // 챕터 복귀 시 나온 방 앞

// 모든 전환은 nav 를 통과 → 기기/브라우저 뒤로·ESC·통일 버튼이 한 단계씩 되돌아감.
function scenePlatformIntro() { showPlatformIntro(app(), { onDone: () => nav.push(sceneModeSelect) }); }     // ① 플랫폼 스튜디오 인트로(로고)
function sceneModeSelect() { showModeSelect(app(), { onDone: () => nav.push(sceneProductMain) }); }   // ①-b 기기 모드 선택
function sceneProductMain() { showProductMain(app(), { onDone: () => nav.push(sceneLogin) }); }                // ② 상품 메인페이지 → 바로 입장
function sceneLogin() { showLogin(app(), { onDone: () => nav.push(sceneSetup) }); }                            // (호환 키트 안내 페이지는 전용 신제품 출시로 제외)
function sceneSetup() { showSetup(app(), { onDone: () => { progress.mark('setup'); nav.push(sceneHub); } }); }   // CH1 클리어

function sceneHub() { showHubSelect(app(), { onEnter: (chId) => nav.push(() => enterChapter(chId)), spawnAt: lastChapter }); }

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
    case 'basics': showBasics(app(), { onExit: back, onComplete: back }); break;
    case 'led': case 'buzzer': case 'rgb': case 'cds': case 'pot': case 'button':
      showSensorRoom(app(), { id: roomId, onExit: back }); break;
    case 'dht11': showDhtCoding(app(), { onDone: () => nav.push(dhtRoomRender), onExit: back }); break;
    case 'relay': showRelay(app(), { onExit: back }); break;
    case 'lamp': showLampGame(app(), { onExit: back }); break;
    case 'bomb': showBombGame(app(), { onExit: back }); break;
    case 'final': showFinaleShow(app(), { onExit: back }); break;
    case 'setup': showSetup(app(), { onDone: () => { progress.mark('setup'); back(); } }); break;
    default:
      // 미니게임 부스(rgb·buzzer·keypad·seg …)은 탑다운 환경 → 장치 작동 → 미션
      if (getRoom(roomId)?.scene === 'game') showEscapeRoom(app(), { roomId, onExit: back });
      else back();   // 준비중 방은 챕터에서 막으므로 안전망
  }
}

// DHT-11 하위 플로우: 코딩 → (실행) 모니터링 방 → (플레이) 미니게임.
//  코딩은 dht11 방 프레임 그 자체, 모니터링/게임은 그 위로 push → 뒤로가 한 단계씩 자연스럽게.
function dhtRoomRender() { showDht11Room(app(), { onPlay: () => nav.push(dhtGameRender), onExit: () => nav.back(2), onCode: () => nav.back() }); }
function dhtGameRender() { showDht11(app(), { onQuit: () => nav.back() }); }

// 다음 장면 배경을 미리 받아두면(인트로 4초 동안) 전환 시 '남색 물방울' 플레이스홀더가 안 보인다.
function preloadAssets() {
  ['main-bg', 'login-bg', 'setup-bg', 'hub-bg', 'basics-bg', 'stage-led-bg', 'game-led-cover', 'wiring-led']
    .forEach((n) => { const im = new Image(); im.src = `/brand/${n}.webp`; });
}

window.addEventListener('DOMContentLoaded', () => { bgm.armAutostart(); preloadAssets(); nav.start(scenePlatformIntro); });
