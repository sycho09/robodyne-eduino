// icons.js — 이론관·크롬 UI 아이콘(인라인 SVG). 이모지는 기기마다 글립이 달라 원거리에서 뭉갠다.
// UI 크롬만 바꾸고 문장 속 장식 이모지·캔버스는 그대로 둔다 — 근거는 docs/THEORY-LEGIBILITY-PASS.md.
// 배포물에서 ISC·MIT 조건을 지키는 것은 public/THIRD-PARTY-LICENSES.txt 다 — 빌드가 아래 고지는 지운다.

/*! Lucide Icons — ISC License · Copyright (c) 2026 Lucide Icons and Contributors · https://lucide.dev
 *  일부 도형은 Feather 파생 — MIT License · Copyright (c) 2013-present Cole Bemis
 *  전문: public/THIRD-PARTY-LICENSES.txt */
const USE_SVG = true;   // false 로 두면 FALLBACK 이모지로 완전 복귀(A/B 비교용)

const STROKE = 2.3;          // 24 viewBox 기준 — 원거리에서 형태가 남는 최소 굵기
const DOT = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

// 도형 조각만 보관한다. 공통 svg 래퍼는 icon() 이 붙인다.
const PATHS = {
  // ── 탭 · 제목 ──
  'book-open': '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',

  // ── 흐름 · 개념 ──
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  // '생각'과 '보드'는 다른 개념인데 예전엔 같은 chip 하나를 돌려썼다. 게다가 사각형에 얇은 핀
  // 8개짜리 chip 은 작은 크기에서 핀이 뭉개져 꽃/별 덩어리로 보였다. 둘로 나누고 실루엣을 세운다.
  robot: '<path d="M12 2.8V5.4"/>' + DOT(12, 1.8, 1.3)
    + '<rect x="3.4" y="5.4" width="17.2" height="13.6" rx="4.2"/>'
    + '<path d="M3.4 10.8H1.7M20.6 10.8h1.7"/>'
    + DOT(8.8, 11.3, 1.6) + DOT(15.2, 11.3, 1.6)
    + '<path d="M9.6 15.4h4.8"/>',
  board: '<rect x="2.6" y="4.8" width="18.8" height="14.4" rx="2.4"/>'
    + '<rect x="8.6" y="9.2" width="6.8" height="5.6" rx="1.2"/>'
    + DOT(5.4, 7.6, 1) + DOT(5.4, 16.4, 1) + DOT(18.6, 7.6, 1) + DOT(18.6, 16.4, 1),
  // 슬라이드 제목은 '아두이노 = 작은 두뇌'(비유), 흐름도 노드는 '보드'(실물 이름)라
  // 성격이 다르다. 제목엔 두뇌를, 노드엔 기판을 써서 비유와 실물이 그림으로 연결되게 한다.
  // 뇌만 따로 그리면 29px 에서 주름이 메워져 까만 덩어리가 된다(실제로 렌더해서 확인했다).
  // 그래서 '머리 옆모습 + 안쪽 주름'으로 간다 — 실루엣이 머리라 구름·풍선과 헷갈릴 일이 없고,
  // 주름은 두개골 안을 채우기만 하면 되므로 작은 크기에서도 두 줄로 버틴다.
  // 목을 선으로 빼면 다리처럼 대롱거려서 닫힌 실루엣으로 했고, 안쪽을 원이나 나선으로 하면
  // 눈알·달팽이로 읽혀서 물결로 했다. 둘 다 렌더해보고 버린 안이다.
  brain: '<path d="M18.6 16.9C20.2 15 21.1 12.7 21.1 10.2 21.1 6 17.4 2.6 12.8 2.6'
    + ' 8.5 2.6 5 5.7 4.4 9.7 4.3 10.6 3.9 11.4 3.4 12.1 2.8 12.9 3.1 13.9 4.1 14.1'
    + 'L6.1 14.5V17C6.1 18.6 7.4 19.8 9.1 19.8H13.1C15.2 19.8 17.2 18.7 18.6 16.9Z"/>'
    + '<path d="M7.9 7.8C9.5 6 11.8 6 13.4 7.8 15 9.6 17.4 9.6 19 7.8"/>'
    + '<path d="M8.4 12.8C9.8 11.3 11.8 11.3 13.2 12.8 14.6 14.3 16.7 14.3 18.1 12.8"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  wave: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  // 높이가 다른 막대 3개는 '숫자/디지털'로 안 읽혔다(그래프처럼 보인다). 슬라이드가
  // '디지털 vs 아날로그'이고 본문 그림도 사각파를 그리므로, 제목 아이콘도 사각파로 맞춘다.
  digital: '<path d="M2.4 17.4V8.2h4.9v9.2h4.9V8.2h4.9v9.2h4.5"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',

  // ── 부품 ──
  // 원 위에 아래화살표는 열쇠구멍처럼 읽혔다. '누르는 손가락'은 이 세트에서 유일한 실루엣이라
  // 다른 아이콘과 헷갈릴 여지가 없다(동심원 계열은 target 과 충돌한다).
  press: '<path d="M10 12.4V5.8a2.1 2.1 0 0 1 4.2 0v6"/>'
    + '<path d="M14.2 11.2a1.9 1.9 0 0 1 3.8 0v.9"/>'
    + '<path d="M18 12.1a1.9 1.9 0 0 1 3.8 0v3.6a5.6 5.6 0 0 1-5.6 5.6h-1.9a5.2 5.2 0 0 1-3.7-1.5l-4.2-4.2a2 2 0 0 1 2.8-2.8l1.8 1.8"/>',
  thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  speaker: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  // 원형 화살표 + 가운데 점은 '새로고침'으로 읽혔다. 원본 이모지(⚙️)대로 기어로 간다.
  // 이 좌표는 손으로 찍은 게 아니라 7치 기어로 계산해서 뽑은 값이다(이가 삐뚤어지지 않게).
  motor: '<path d="M12 2.5A9.5 9.5 0 0 1 15.81 3.3L14.81 5.59A7 7 0 0 1 17.47 7.64L19.43 6.08A9.5 9.5 0 0 1 21.18 9.55L18.76 10.2A7 7 0 0 1 18.82 13.56L21.26 14.11A9.5 9.5 0 0 1 19.64 17.65L17.63 16.17A7 7 0 0 1 15.04 18.31L16.12 20.56A9.5 9.5 0 0 1 12.34 21.49L12.25 19A7 7 0 0 1 8.96 18.31L7.88 20.56A9.5 9.5 0 0 1 4.79 18.19L6.69 16.56A7 7 0 0 1 5.18 13.56L2.74 14.11A9.5 9.5 0 0 1 2.67 10.22L5.12 10.69A7 7 0 0 1 6.53 7.64L4.57 6.08A9.5 9.5 0 0 1 7.57 3.59L8.74 5.81A7 7 0 0 1 12 5L12 2.5Z"/>'
    + '<circle cx="12" cy="12" r="2.7"/>',
  pin: '<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>',

  // ── 제어 대시보드 ──
  sliders: '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  notes: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  joystick: '<path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z"/><path d="M6 15v-2"/><path d="M12 15V9"/><circle cx="12" cy="6" r="3"/>',
  sonar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',

  // ── 입력 / 출력 ──
  'arrow-in': '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
  'arrow-out': '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/>',

  // ── 피드백 ──
  check: '<path d="M20 6 9 17l-5-5"/>',
  'x-mark': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',

  // ── 서비스 크롬 — 음소거 · 보드 연결 · 모드 전환 ──
  'volume-off': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  usb: '<circle cx="10" cy="7" r="1"/><circle cx="4" cy="20" r="1"/><path d="M4.7 19.3 19 5"/><path d="m21 3-3 1 2 2Z"/><path d="M9.26 7.68 5 12l2 5"/><path d="m10 14 5 2 3.5-3.5"/><path d="m18 12 1-1 1 1-1 1Z"/>',
  tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/>',
  desktop: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
};

// USE_SVG=false 일 때 되돌아갈 원본 이모지.
const FALLBACK = {
  'book-open': '📚', book: '📘', question: '❓', flag: '🎯',
  eye: '👀', robot: '🤖', board: '🧠', brain: '🧠', bulb: '💡', wave: '🔁', digital: '🔢', code: '⌨️',
  press: '🔘', thermometer: '🌡️', sun: '🔆', speaker: '🔊', motor: '⚙️', pin: '🔌',
  sliders: '🎚️', palette: '🎨', notes: '🎹', joystick: '🕹️', sonar: '📡', chart: '📈', ruler: '📏', monitor: '📟', power: '🔌', timer: '⏱️',
  'arrow-in': '⬇️', 'arrow-out': '⬆️',
  check: '⭕', 'x-mark': '❌',
  'volume-off': '🔇', usb: '🔌', tablet: '📱', desktop: '🖥️',
};

/**
 * 아이콘 HTML 문자열을 만든다. 텍스트 라벨 옆에 붙는 장식이므로 aria-hidden —
 * 의미는 항상 옆의 글자가 전달한다.
 * @param {string} name  PATHS 의 키
 * @param {number} size  픽셀 크기(가로=세로)
 * @param {string} cls   추가 클래스
 */
export function icon(name, size = 22, cls = '') {
  if (!USE_SVG || !PATHS[name]) return FALLBACK[name] || '';
  return `<svg class="ic-svg${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24"`
    + ` fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round"`
    + ` stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

// 색면 원판 + 실루엣. 원거리에서는 글립보다 색면이 먼저 읽히므로,
// 크게 쓰는 자리(이론 흐름도 등)는 이 형태를 쓴다. tone: read|think|act|in|out
export function iconOrb(name, tone, size = 44) {
  return `<span class="ic-orb ic-${tone}">${icon(name, size)}</span>`;
}
