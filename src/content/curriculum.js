// curriculum.js — 커리큘럼 단일 공급원 (4무대 · 10 미니게임)
// 학습 라벨(기초/응용) + 게임 서사(메달/왕관 수집). progress(localStorage) 연동.

import { progress } from '../app/progress.js';
import { results } from '../app/results.js';
import { UNLOCK_ALL } from '../app/flags.js';

// scene: 씬 식별자 (main.js enterRoom 매핑)
// status: 'ready' | 'soon'
const R = (id, chapter, name, icon, concept, mission, reward, scene = null) =>
  ({ id, chapter, name, icon, concept, mission, reward, scene, status: scene ? 'ready' : 'soon' });

export const ROOMS = {
  // (사전 준비) 보드 연결 — 광장 입장 전 온보딩. 어느 무대에도 속하지 않음.
  setup: R('setup', null, '보드 연결', '🔌', '사용환경 준비', '천국 입장 준비 — 보드 연결하고 첫 신호 켜기', '🎟️ 입장 티켓', 'setup'),

  // 🎪 시작의 천막 (피지컬 코딩 기초)
  basics: R('basics', 'ch1', '피지컬 코딩 기초', '📘', '피지컬 컴퓨팅 개념', '기초 이론 + 퀴즈 + 분류 미션', '🎓 기초 수료증', 'basics'),

  // 🏛️ 기초의 전당 (센서 개별 · 7) — 구성품 BOM 부품과 1:1 (LED/부저/RGB/조도/가변저항/택트2)
  led:    R('led', 'ch2', '반짝반짝 라이트쇼', '💡', '디지털 출력 · 타이밍', 'LED로 무대 조명 켜기·연주', '💡 조명 메달', 'led'),
  buzzer: R('buzzer', 'ch2', '멜로디 연주단', '🔊', 'tone · 주파수', '부저로 멜로디 연주', '🎵 리듬 메달', 'buzzer'),
  rgb:    R('rgb', 'ch2', '무지개 물감놀이', '🌈', 'PWM 색 혼합', '색을 섞어 정답 색 만들기', '🌈 무지개 메달', 'rgb'),
  cds:    R('cds', 'ch2', '손그림자 마술', '🔆', '아날로그 입력(빛)', '조도센서로 빛 가리기 반응', '🔆 햇살 메달', 'cds'),
  pot:    R('pot', 'ch2', '볼륨 다이얼쇼', '🎚️', '아날로그 입력', '가변저항 다이얼 맞추기', '🎚️ 다이얼 메달', 'pot'),
  button: R('button', 'ch2', '두더지 & 청기백기', '🔨', '디지털 입력(버튼 2개)', '두더지 잡기 → 청기백기 (택트 2개)', '🔨🚩 버튼 메달', 'button'),

  // 🎭 응용 대극장 (2종 조합 · 2) — BOM 부품만으로 신규 설계
  lamp:   R('lamp', 'ch3', '빛 마법 램프', '🪔', '조도센서 + RGB (입력→색 출력)', '손 그림자로 빛을 조절해 마법 램프 색 맞추기', '🪔 램프 스타', 'lamp'),
  bomb:   R('bomb', 'ch3', '폭탄 해체반', '💣', '가변저항 + LED (정밀 제어)', '다이얼로 주파수 맞춰 폭탄 해체', '💣 해체 스타', 'bomb'),

  // 🕌 마법의 돔 (종합)
  final: R('final', 'ch4', '나만의 인터랙티브 쇼', '🏆', '종합 프로젝트(다이얼·RGB·부저·버튼)', '배운 부품을 모아 빛·소리 인터랙티브 쇼 완성', '👑 천국의 왕관', 'final'),
};

export const CHAPTERS = [
  { id: 'ch1', no: 1, label: '스타트 게이트', short: '스타트 게이트', act: '피지컬 코딩 기초', icon: '🎪',
    rooms: ['basics'] },
  { id: 'ch2', no: 2, label: '비기너 아케이드', short: '비기너 아케이드', act: '센서 개별 체험', icon: '🕹️',
    rooms: ['led', 'buzzer', 'rgb', 'cds', 'pot', 'button'] },
  { id: 'ch3', no: 3, label: '마스터 아케이드', short: '마스터 아케이드', act: '2종 조합 응용', icon: '🎯',
    rooms: ['lamp', 'bomb'] },
  { id: 'ch4', no: 4, label: '챔피언 홀', short: '챔피언 홀', act: '종합 프로젝트', icon: '🏆',
    rooms: ['final'] },
];

export const getChapter = (id) => CHAPTERS.find((c) => c.id === id);
export const chapterRooms = (id) => (getChapter(id)?.rooms || []).map((rid) => ROOMS[rid]);

// 클리어(메달) — 방마다 '전 단계 통과' 같은 고유 조건을 만족해야 progress 에 찍힌다.
export const isRoomCleared = (id) => progress.isCleared(id);
export const chapterClearedCount = (id) => (getChapter(id)?.rooms || []).filter((rid) => progress.isCleared(rid)).length;
export const chapterTotal = (id) => getChapter(id)?.rooms.length || 0;
export const chapterDone = (id) => chapterTotal(id) > 0 && chapterClearedCount(id) === chapterTotal(id);

// 방마다 몇 단계인가 — 각 게임 씬의 GAMES/ACTS 길이이자 finishAll() 의 클리어 조건 수다.
// 단계 '이름' 은 여기로 안 옮긴다(문구를 다듬을 때마다 바뀌어 어긋난다) — 이름은 게임이
// 매판 results 로 넘기므로 화면이 거기서 받아 쓴다. button 은 씬이 둘인 방이라 합쳐 2단계.
const ROOM_STAGES = {
  basics: 1,
  led: 2, buzzer: 2, rgb: 2, cds: 2, pot: 2, button: 2,
  lamp: 3, bomb: 3,
  final: 3,
};

// 누적 클리어 — 모든 단계를 '언젠가' A등급 이상으로 통과했으면 메달이다(한 방문 안일 필요 없다).
// 화면이 단계별 최고 기록을 나열하니 보상도 그 합집합이어야 말이 맞는다.
// 각 게임의 finishAll() 이 이 함수로 판정한다 — 그 시점엔 이번 판 결과까지 저장돼 있다.
export const roomCleared = (id) => {
  const st = roomStages(id);
  return st.length > 0 && st.every((s) => s?.passed);
};

// 방의 단계별 현황 — 길이는 그 방의 단계 수, 기록 없는 칸은 null.
// 순서는 results 에 처음 기록된 순서 = 플레이 순서 = 단계 번호다.
export function roomStages(id) {
  const done = Object.entries(results.get(id)?.stages || {})
    .map(([name, s]) => ({ name, grade: s.grade, passed: s.passed }));
  const total = Math.max(ROOM_STAGES[id] || 0, done.length);
  return Array.from({ length: total }, (_, i) => done[i] || null);
}

export const chapterPlayedCount = (id) => (getChapter(id)?.rooms || []).filter((rid) => results.has(rid)).length;
export const chapterPlayed = (id) => chapterTotal(id) > 0 && chapterPlayedCount(id) === chapterTotal(id);

// 잠금 규칙: 첫 무대는 항상 개방, 이후 무대는 직전 무대를 모두 '플레이'하면 개방.
// 통과가 아니라 플레이 기준인 이유 — 한 판 못 넘겼다고 뒤가 다 막히면 학습자가 포기한다.
// 메달은 여전히 통과해야 주므로, 잠금을 풀어도 난이도 목표 자체는 남는다.
// 개발 서버에선 전체 해제, 프로덕션 빌드에선 순차 잠금 — app/flags.js 가 결정한다.
export { UNLOCK_ALL };
export function chapterUnlocked(id) {
  if (UNLOCK_ALL) return true;
  const idx = CHAPTERS.findIndex((c) => c.id === id);
  if (idx <= 0) return true;
  return chapterPlayed(CHAPTERS[idx - 1].id);
}

export const allRoomIds = () => CHAPTERS.flatMap((c) => c.rooms);
export const overallTotal = () => allRoomIds().length;                 // 10
export const overallCleared = () => allRoomIds().filter((id) => progress.isCleared(id)).length;
export const overallPercent = () => Math.round((overallCleared() / overallTotal()) * 100);
export const allDone = () => overallCleared() >= overallTotal();
