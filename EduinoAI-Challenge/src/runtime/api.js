/**
 * runtime/api.js — 시뮬 호환 API 레지스트리.
 *
 * 두 계층을 같은 물리 모델 위에 올린다. 어떤 계층으로 짜든 결과는 같아야 한다.
 *   basic  에듀이노 SDK — setMotor / stop / delay / moveForward 류
 *   pin    실물 그대로  — 바퀴마다 핀 두 개(analogWrite 조합). 핀 번호·극성은 킷 스펙이 소유
 *   ml     학습 모델 추론 — mlBegin / mlClassify / mlConfidence
 *
 * 어느 계층까지 열지는 챌린지 매니페스트의 allowed_api 가 정한다.
 */

export const API_REGISTRY = Object.freeze({
  // ── 기본 계층 ────────────────────────────────────────────────
  setMotor: {
    arity: [2, 2], blocking: false, layer: 'basic', sig: 'setMotor(left, right)',
    doc: '좌·우 모터 PWM. -255~255, 음수는 역회전',
  },
  stop: { arity: [0, 0], blocking: false, layer: 'basic', sig: 'stop()', doc: '양쪽 모터 정지 (setMotor(0,0) 과 같음)' },
  delay: { arity: [1, 1], blocking: true, layer: 'basic', sig: 'delay(ms)', doc: '현재 모터 상태를 ms 동안 유지 (10ms 단위)' },
  moveForward: { arity: [0, 1], blocking: false, layer: 'basic', sig: 'moveForward(speed)', doc: '양쪽 전진. speed 생략 시 기본 속도' },
  moveBackward: { arity: [0, 1], blocking: false, layer: 'basic', sig: 'moveBackward(speed)', doc: '양쪽 후진. speed 생략 시 기본 속도' },
  turnLeft: { arity: [0, 1], blocking: false, layer: 'basic', sig: 'turnLeft(speed)', doc: '제자리 좌회전 (좌 역회전 + 우 정회전)' },
  turnRight: { arity: [0, 1], blocking: false, layer: 'basic', sig: 'turnRight(speed)', doc: '제자리 우회전 (좌 정회전 + 우 역회전)' },

  // ── 카메라 계층 (모드2 색상인식) ─────────────────────────────
  cameraSetTarget: {
    arity: [3, 4], blocking: false, layer: 'camera', sig: 'cameraSetTarget(r, g, b, tolerance)',
    doc: '찾을 색을 지정한다 (각 0~255). tolerance 는 허용 오차이며 생략하면 기본값',
  },
  cameraFound: { arity: [0, 0], blocking: false, layer: 'camera', sig: 'cameraFound()', doc: '목표 색이 보이면 참' },
  cameraOffset: {
    arity: [0, 0], blocking: false, layer: 'camera', sig: 'cameraOffset()',
    doc: '화면 좌우 위치. -100(왼쪽) ~ 0(가운데) ~ +100(오른쪽). 못 찾으면 0',
  },
  cameraArea: {
    arity: [0, 0], blocking: false, layer: 'camera', sig: 'cameraArea()',
    doc: '화면에서 차지하는 크기 0~100. 가까울수록 커진다. 못 찾으면 0',
  },

  // ── ML 계층 (학습한 모델로 추론) ─────────────────────────────
  // 학습은 코드가 아니라 워크플로우 단계다(실물도 IDE 밖에서 한다). 코드에는 추론만 연다.
  mlBegin: {
    arity: [0, 0], blocking: false, layer: 'ml', sig: 'mlBegin()',
    doc: '학습한 모델 사용을 시작한다. setup() 에서 한 번 부른다',
  },
  mlClassify: {
    arity: [0, 0], blocking: false, layer: 'ml', sig: 'mlClassify()',
    doc: '지금 보이는 장면의 분류 결과. 0=모름 1=정지 2=서행 3=진행',
  },
  mlConfidence: {
    arity: [0, 0], blocking: false, layer: 'ml', sig: 'mlConfidence()',
    doc: '분류 결과를 얼마나 확신하는지 0~100. 모르면 0',
  },

  // ── 심화 계층 (실물 배선 그대로) ─────────────────────────────
  // 실물 키트는 바퀴 하나에 핀 두 개다. 두 핀 값의 조합이 방향과 세기를 정한다.
  // 핀 번호와 어느 핀이 전진인지는 킷 스펙(kit.pins, kit.wiring)이 소유한다.
  pinMode: { arity: [2, 2], blocking: false, layer: 'pin', sig: 'pinMode(pin, mode)', doc: '핀 모드 설정. 시뮬에서는 받아만 두고 동작에 영향이 없다' },
  analogWrite: {
    arity: [2, 2], blocking: false, layer: 'pin', sig: 'analogWrite(pin, value)',
    doc: '모터 핀에 0~255 를 준다. 같은 바퀴의 두 핀 중 한쪽만 올리면 그 방향으로 돈다',
  },
  digitalWrite: {
    arity: [2, 2], blocking: false, layer: 'pin', sig: 'digitalWrite(pin, value)',
    doc: 'HIGH 는 analogWrite(pin, 255), LOW 는 analogWrite(pin, 0) 과 같다',
  },

  // ── 시리얼 (모든 챌린지에서 열린다 — 디버깅 수단) ───────────
  'Serial.begin': { arity: [0, 1], blocking: false, layer: 'serial', sig: 'Serial.begin(speed)', doc: '시리얼 시작. 속도 값은 받아만 둔다' },
  'Serial.print': { arity: [1, 2], blocking: false, layer: 'serial', sig: 'Serial.print(값)', doc: '줄바꿈 없이 시리얼 모니터에 찍는다' },
  'Serial.println': { arity: [0, 2], blocking: false, layer: 'serial', sig: 'Serial.println(값)', doc: '줄바꿈까지 시리얼 모니터에 찍는다' },
});

/** 멤버 호출을 허용하는 객체. 이 목록에 없는 `x.y` 는 파서가 막는다. */
export const MEMBER_OBJECTS = Object.freeze(['Serial']);

/** allowed_api 와 무관하게 언제나 열려 있는 API. 디버깅 수단은 챌린지가 막지 않는다. */
export const ALWAYS_OPEN = Object.freeze(['Serial.begin', 'Serial.print', 'Serial.println']);

/** 아두이노 기본 상수. 핀 번호는 킷 스펙(kit.pins)에서 주입된다. */
export const BASE_CONSTANTS = Object.freeze({ HIGH: 1, LOW: 0, OUTPUT: 1, INPUT: 0, INPUT_PULLUP: 2 });

export function constantsFor(kit, allowedApi) {
  const usesPins = allowedApi.some((name) => API_REGISTRY[name] && API_REGISTRY[name].layer === 'pin');
  if (!usesPins) return {};
  return { ...BASE_CONSTANTS, ...(kit.pins || {}) };
}

/** setup/loop 는 API 가 아니라 진입점이다. 학생이 직접 호출할 수 없다. */
export const ENTRY_POINTS = Object.freeze(['setup', 'loop']);

/** 실물 .ino 에는 있지만 시뮬에서 지원하지 않는 API. 왜 막혔는지 에디터에서 바로 알려준다. */
export const BLOCKED_API = Object.freeze({
  WiFi: 'Wi-Fi 는 모드1 범위 밖입니다.',
  HTTPClient: '네트워크 통신은 모드1 범위 밖입니다.',
  WebServer: '네트워크 통신은 모드1 범위 밖입니다.',
  SD: '파일 IO 는 모드1 범위 밖입니다.',
  SD_MMC: '파일 IO 는 모드1 범위 밖입니다.',
  SPIFFS: '파일 IO 는 모드1 범위 밖입니다.',
  File: '파일 IO 는 모드1 범위 밖입니다.',
  esp_camera_init: '카메라 초기화는 시뮬이 대신합니다. cameraSetTarget(r, g, b) 부터 쓰세요.',
  camera_fb_get: '프레임 버퍼 대신 cameraFound() / cameraOffset() / cameraArea() 를 씁니다.',
  digitalRead: '입력 핀은 아직 지원하지 않습니다.',
  analogRead: '입력 핀은 아직 지원하지 않습니다.',
  ledcSetup: 'ESP32 LEDC 대신 analogWrite 를 사용하세요.',
  ledcAttachPin: 'ESP32 LEDC 대신 analogWrite 를 사용하세요.',
  ledcWrite: 'ESP32 LEDC 대신 analogWrite 를 사용하세요.',
  millis: '시뮬 시간은 엔진 tick 이 관리합니다. delay(ms) 를 사용하세요.',
  micros: '시뮬 시간은 엔진 tick 이 관리합니다. delay(ms) 를 사용하세요.',
  delayMicroseconds: '엔진 최소 단위는 10ms 입니다. delay(ms) 를 사용하세요.',
  random: '결정론 시뮬레이터라 난수를 지원하지 않습니다.',
  randomSeed: '결정론 시뮬레이터라 난수를 지원하지 않습니다.',
});

export function apiInfo(name) {
  return Object.prototype.hasOwnProperty.call(API_REGISTRY, name) ? API_REGISTRY[name] : null;
}
