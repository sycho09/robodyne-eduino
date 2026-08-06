// curriculum.js — Eduino AI : 미니게임천국 커리큘럼 단일 공급원(4무대 · 10 미니게임 부스).
// 학습 라벨(기초/응용 등)을 메인으로, '미니게임천국' 서사(무대 퍼포먼스)를 스토리 레이어로 얹는다.
// 스토리: EDDIE가 4개 무대를 돌며 미니게임을 성공시켜 메달·티켓·별을 모으고,
//         모두 모으면 👑 '천국의 왕관' = 학습 100% 완료(졸업).
// 진척은 progress(localStorage)를 읽어 무대/전체 집계를 계산한다.

import { progress } from '../app/progress.js';

// scene: 셸이 실제로 띄울 씬 키 ('setup'|'house'|'dht11'|'relay'|'game'|null=준비중)
// status: 'ready'(구현됨) | 'soon'(준비중) — 준비중은 입장 시 안내만
// concept=학습 개념 / mission=미니게임 한 줄 / reward=모으는 보상(메달·티켓·별)
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
export const getRoom = (id) => ROOMS[id] || null;
export const chapterRooms = (id) => (getChapter(id)?.rooms || []).map((rid) => ROOMS[rid]);

export const isRoomCleared = (id) => progress.isCleared(id);
export const chapterClearedCount = (id) => (getChapter(id)?.rooms || []).filter((rid) => progress.isCleared(rid)).length;
export const chapterTotal = (id) => getChapter(id)?.rooms.length || 0;
export const chapterDone = (id) => chapterTotal(id) > 0 && chapterClearedCount(id) === chapterTotal(id);

// 잠금 규칙: 첫 무대는 항상 개방, 이후 무대는 직전 무대를 모두 클리어해야 개방.
// ⚠️ 테스트용: 전체 잠금 해제 (출시 시 false 로 변경)
export const UNLOCK_ALL = true;
export function chapterUnlocked(id) {
  if (UNLOCK_ALL) return true;
  const idx = CHAPTERS.findIndex((c) => c.id === id);
  if (idx <= 0) return true;
  return chapterDone(CHAPTERS[idx - 1].id);
}

export const allRoomIds = () => CHAPTERS.flatMap((c) => c.rooms);
export const overallTotal = () => allRoomIds().length;                 // 10
export const overallCleared = () => allRoomIds().filter((id) => progress.isCleared(id)).length;
export const overallPercent = () => Math.round((overallCleared() / overallTotal()) * 100);
export const allDone = () => overallCleared() >= overallTotal();
