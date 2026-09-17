/**
 * runtime/sandbox.js — 컴파일 파이프라인과 실행 컨텍스트.
 *
 *   소스 → parse → validate(allowed_api) → transpile → new Function
 *
 * 실행 컨텍스트에는 엔진이 넘겨준 API 객체(__rt)와 루프 가드(__guard),
 * 그리고 지금 실행 중인 줄을 적어 두는 __at 만 들어간다.
 * 검증 단계에서 선언되지 않은 모든 식별자를 잘라내므로 학생 코드는 브라우저 전역에 닿을 수 없다.
 */

import { msToTicks } from '../engine/clock.js';
import { setMotorPwm } from '../engine/sim.js';
import { readCamera, resetCamera, setCameraTarget } from '../engine/camera.js';
import { mlBegin, readMl, resetMl } from '../engine/ml.js';
import { API_REGISTRY, constantsFor } from './api.js';
import { RuntimeError } from './errors.js';
import { parse } from './parser.js';
import { validate } from './validate.js';
import { transpile } from './transpile.js';

/**
 * `#define 이름 숫자` 와 킷 헤더 한 줄만 처리한다. 실물 키트 코드가 핀 번호를 #define 으로
 * 적어 두고, 실제 스케치는 맨 위에 킷 헤더를 부르기 때문이다(57-C 파트5 스타터 양식).
 * 줄 수가 어긋나면 오류 위치가 밀리므로 지운 자리에 빈 줄을 남긴다.
 * 헤더는 `kit.h` 한 이름만 받는다 — 그 밖의 전처리기 지시문(#include <WiFi.h> 등)은
 * 손대지 않고 그대로 두어 원래대로 막힌다. 여기서 아무 헤더나 통과시키면
 * "적었으니 되겠지" 하고 없는 기능을 부르게 된다.
 */
const KIT_HEADER = /^[ \t]*#include[ \t]+"kit\.h"[ \t]*$/gm;

function preprocess(source) {
  const defines = {};
  const text = source
    .replace(KIT_HEADER, '')
    .replace(/^[ \t]*#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+(-?\d+)[ \t]*$/gm, (_, name, value) => {
      defines[name] = Number(value);
      return '';
    });
  return { text, defines };
}

export function compileProgram(source, { allowedApi, limits, kit }) {
  const pre = preprocess(source);
  // 학생이 직접 적은 #define 이 킷 기본값을 덮는다 — 실물 코드의 값이 언제나 우선이다.
  const constants = { ...constantsFor(kit, allowedApi), ...pre.defines };
  const errors = [];

  const bytes = new TextEncoder().encode(source).length;
  if (bytes > limits.max_code_bytes) {
    errors.push({ line: 1, col: 1, message: `코드가 너무 깁니다. (${bytes} / ${limits.max_code_bytes} bytes)` });
    return { ok: false, errors };
  }

  let ast;
  try {
    ast = parse(pre.text);
  } catch (e) {
    errors.push({ line: e.line || 1, col: e.col || 1, message: e.message });
    return { ok: false, errors };
  }

  const v = validate(ast, allowedApi, constants);
  if (v.errors.length) return { ok: false, errors: v.errors };

  const js = transpile(ast, constants);
  let factory;
  try {
    // eslint-disable-next-line no-new-func
    factory = new Function('__rt', '__guard', '__at', js);
  } catch (e) {
    return { ok: false, errors: [{ line: 1, col: 1, message: `내부 변환 오류: ${e.message}` }] };
  }

  return {
    ok: true,
    errors: [],
    js,
    makeProgram(sim) {
      const guard = createGuard(limits.max_ops_per_tick);
      const rt = createRuntimeApi(sim, kit);
      // 지금 실행 중인 줄. 화면이 읽기만 하는 값이라 엔진 상태가 아니다.
      const cursor = { line: 0 };
      return { gen: factory(rt, guard.call, (n) => { cursor.line = n; })(), guard, cursor };
    },
  };
}

function createGuard(maxOpsPerTick) {
  let ops = 0;
  return {
    reset() { ops = 0; },
    call() {
      ops += 1;
      if (ops > maxOpsPerTick) {
        throw new RuntimeError(
          `무한 루프로 보입니다. 한 tick(${maxOpsPerTick} 회) 안에서 반복문이 끝나지 않았습니다. 반복문 안에 delay() 를 넣었는지 확인하세요.`,
        );
      }
    },
  };
}

function createRuntimeApi(sim, kit) {
  const drive = kit.drive;
  const pins = kit.pins || {};
  const speed = (s) => (s === undefined ? drive.default_pwm : s);

  // ── 실물 배선 모델 ─────────────────────────────────────────
  // 실물 키트는 바퀴 하나에 핀 두 개다. 어느 핀이 전진인지는 좌우가 서로 반대로 배선돼 있고,
  // 그 사실까지 킷 스펙(kit.wiring)이 소유한다. 코드에는 핀 번호도 극성도 박지 않는다.
  const wiring = kit.wiring || {};
  const wheelPins = (side) => {
    const w = wiring[side] || {};
    const p1 = pins[w.pin1];
    const p2 = pins[w.pin2];
    return { p1, p2, fwd: w.forward === 'pin1' ? p1 : p2, rev: w.forward === 'pin1' ? p2 : p1 };
  };
  const RIGHT = wheelPins('right');
  const LEFT = wheelPins('left');

  const pinValue = new Map();
  const readPin = (pin) => pinValue.get(pin) || 0;
  const clampPwm = (v) => Math.max(0, Math.min(drive.pwm_max || 255, Math.trunc(Number(v) || 0)));

  /** 핀 두 개 → 부호 있는 PWM. 둘 다 값이 있으면 실물처럼 브레이크(0)다. */
  const wheelPwm = (w) => {
    const f = readPin(w.fwd);
    const r = readPin(w.rev);
    if (f > 0 && r > 0) return 0;
    return f > 0 ? f : -r;
  };
  const applyPins = () => setMotorPwm(sim, wheelPwm(LEFT), wheelPwm(RIGHT));

  /** 부호 있는 PWM → 핀 두 개. 기본 계층은 이 변환을 거쳐 같은 모델 위에서 돈다. */
  const writeWheel = (w, value) => {
    const v = Math.trunc(Number(value) || 0);
    pinValue.set(w.fwd, v > 0 ? clampPwm(v) : 0);
    pinValue.set(w.rev, v < 0 ? clampPwm(-v) : 0);
  };
  const setWheels = (left, right) => {
    writeWheel(LEFT, left);
    writeWheel(RIGHT, right);
    applyPins();
  };

  const rt = {
    ticks: () => sim.tick,

    // ── 기본 계층 — 실물 배선 모델 위의 래퍼다 ──────────────────
    setMotor: (left, right) => setWheels(left, right),
    stop: () => setWheels(0, 0),
    moveForward: (s) => setWheels(speed(s), speed(s)),
    moveBackward: (s) => setWheels(-speed(s), -speed(s)),
    turnLeft: (s) => setWheels(-speed(s), speed(s)),
    turnRight: (s) => setWheels(speed(s), -speed(s)),
  };

  // ── 시리얼 — 모든 챌린지에서 열린다. tick 을 소비하지 않는다 ──
  const fmt = (v) => {
    if (v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
  };
  let pending = '';
  const emitSerial = (text, newline) => {
    if (!sim.serial) return;
    pending += text;
    if (!newline) return;
    sim.serial.push({ tick: sim.tick, text: pending });
    pending = '';
  };
  rt.Serial = {
    begin: () => {},                                  // 속도 값은 받아만 둔다
    print: (v) => emitSerial(fmt(v), false),
    println: (v) => emitSerial(fmt(v), true),
  };

  // ── 카메라 계층 — 센서 읽기만 한다. 모터에도 물리에도 손대지 않는다 ──
  // 프로그램을 새로 만들 때(=시도 리셋) 목표 색도 함께 초기화한다.
  resetCamera(sim);
  rt.cameraSetTarget = (r, g, b, tolerance) => setCameraTarget(sim, r, g, b, tolerance);
  rt.cameraFound = () => readCamera(sim).found;
  rt.cameraOffset = () => readCamera(sim).offset;
  rt.cameraArea = () => readCamera(sim).area;

  // ── ML 계층 — 추론만 읽는다. 학습은 코드 밖 워크플로우 단계다 ──
  resetMl(sim);
  rt.mlBegin = () => mlBegin(sim);
  rt.mlClassify = () => readMl(sim).label;
  rt.mlConfidence = () => readMl(sim).confidence;

  // ── 심화 계층 — 실물 코드가 쓰는 그 핀에 그대로 쓴다 ─────────
  rt.pinMode = () => {};          // 모드 설정은 시뮬 거동에 영향이 없다
  rt.digitalWrite = (pin, value) => { pinValue.set(pin, value ? (drive.pwm_max || 255) : 0); applyPins(); };
  rt.analogWrite = (pin, value) => { pinValue.set(pin, clampPwm(value)); applyPins(); };

  rt.delay = function* (ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) {
      throw new RuntimeError('delay(ms) 의 인자가 숫자가 아닙니다.');
    }
    if (ms < 0) throw new RuntimeError('delay(ms) 에 음수를 넣을 수 없습니다.');
    const t = msToTicks(ms);
    for (let i = 0; i < t; i++) yield 1;
  };

  return Object.freeze(rt);
}
