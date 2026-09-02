// board.js — 공유 보드 컨트롤러 (싱글턴)
// 모든 씬(setup / lesson …)이 이 모듈을 통해 보드를 제어한다.
// 시리얼 연결·핸드셰이크·웹 플래싱·핀 제어를 캡슐화하고,
// 라인/상태 이벤트를 구독자(시리얼 모니터 등)에게 브로드캐스트한다.

import { SerialConnection, isSupported as _isSupported } from '../serial/webserial.js';
import { handshake, flashFirmware } from '../serial/provisioning.js';
import { encodeDigitalWrite, encodePwm, encodeTone, encodeAnalogRead, encodeDigitalRead, encodeUltrasonic, encodeNeoPixel, encodeNeoFill, encodeNeoShow, parseLine, RESPONSE, FIRMWARE_VERSION } from '../serial/protocol.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => (n == null ? '—' : '0x' + n.toString(16).toUpperCase().padStart(4, '0'));

const conn = new SerialConnection();
let _version = null;

const lineSubs = new Set();
const stateSubs = new Set();

function emitLine(kind, text) {
  for (const f of lineSubs) { try { f(kind, text); } catch (e) { console.error(e); } }
}
function emitState(state, detail) {
  for (const f of stateSubs) { try { f(state, detail); } catch (e) { console.error(e); } }
}

conn.onLine((line) => {
  const p = parseLine(line);
  emitLine(p.kind === RESPONSE.ERR ? 'rx-err' : 'rx', line);
});
conn.onStateChange((s, d) => {
  if (s === 'closed' || s === 'error') _version = null;
  emitState(s, d);
});

export const board = {
  isSupported: _isSupported,
  get connected() { return conn.isOpen && _version != null; },
  get isOpen() { return conn.isOpen; },
  get version() { return _version; },
  /** 보드 펌웨어가 번들 버전보다 낮아 새 명령(초음파 등)을 모르는 상태인가. */
  get fwOutdated() { return _version != null && _version < FIRMWARE_VERSION; },
  get info() { return conn.getInfo(); },

  /** 시리얼 라인(tx/rx/sys) 구독. 반환값 호출 시 해제. */
  onLine(fn) { lineSubs.add(fn); return () => lineSubs.delete(fn); },
  /** 연결 상태(open/closed/error) 구독. */
  onState(fn) { stateSubs.add(fn); return () => stateSubs.delete(fn); },
  /** 씬에서 시스템/임의 로그를 모니터로 보낼 때. */
  log(kind, text) { emitLine(kind, text); },

  /** 포트 선택 + 오픈 + 핸드셰이크. (사용자 클릭 핸들러에서 호출) */
  async connect() {
    emitLine('sys', '포트 선택 중…');
    await conn.connect({ useFilters: false });    // 모든 시리얼 포트 표시(칩 종류 무관 — 클론 보드 호환)
    const i = conn.getInfo();
    emitLine('sys', `포트 열림 (VID ${hex(i?.usbVendorId)} / PID ${hex(i?.usbProductId)}).`);
    emitLine('tx', 'PING (최대 4회)');
    const r = await handshake(conn);
    if (r.ok) { _version = r.version; emitLine('sys', `핸드셰이크 통과: ${r.raw}`); }
    else { emitLine('sys', `핸드셰이크 실패 (${r.reason}) — 펌웨어가 필요할 수 있어요.`); }
    return r;
  },

  /** WebSerial 펌웨어 굽기 -> 재연결 -> 핸드셰이크. 기존 포트 재사용(선택창 없음). */
  async flash({ onProgress, onLog } = {}) {
    const port = conn.port;
    await conn.disconnect();
    _version = null;
    const res = await flashFirmware('uno', port, {
      onProgress,
      onLog: (m) => { onLog?.(m); emitLine('sys', m); },
    });
    await conn.attach(res.port || port);
    emitLine('sys', '보드 재시작 대기(약 1.6초)…');
    await delay(1600);
    emitLine('tx', 'PING (최대 4회)');
    const r = await handshake(conn);
    if (r.ok) { _version = r.version; emitLine('sys', `핸드셰이크 통과: ${r.raw}`); }
    return r;
  },

  /** 선택창 없이 이전 허용 포트로 자동 연결 + 핸드셰이크. (일시 오류 복구용)
   *  반환: {ok} | {ok:false, reason:'no_known'|'no_response'|'open_fail'|'unsupported', open?} */
  async connectAuto() {
    if (!_isSupported()) return { ok: false, reason: 'unsupported' };
    if (this.connected) return { ok: true, version: _version };
    let port;
    try { port = await conn.connectKnown(); }
    catch (e) { emitLine('sys', '자동 연결 실패(포트 열기): ' + (e?.message ?? e)); return { ok: false, reason: 'open_fail', error: e }; }
    if (!port) return { ok: false, reason: 'no_known' };
    emitLine('sys', '이전에 허용한 포트로 자동 연결 시도…');
    emitLine('tx', 'PING (최대 4회)');
    const r = await handshake(conn);
    if (r.ok) { _version = r.version; emitLine('sys', `핸드셰이크 통과: ${r.raw}`); return { ok: true, version: r.version }; }
    return { ok: false, reason: 'no_response', open: true };
  },

  /** 연결 예외를 원인별로 분류해 안내 문구를 만든다. */
  classify(e) {
    const name = e?.name || '';
    const msg = (e?.message || String(e) || '').toLowerCase();
    if (!_isSupported()) return { kind: 'unsupported', note: '이 브라우저는 WebSerial 을 지원하지 않아요. Chrome/Edge 데스크톱에서 열어주세요.', speak: '이 브라우저는 보드 연결을 지원 안 해. Chrome이나 Edge에서 열어줘.' };
    if (name === 'NotFoundError' || /no port selected|cancel/.test(msg))
      return { kind: 'cancel', note: '포트를 못 골랐어요. 선택창에 포트가 없으면 ① 아두이노 IDE/시리얼모니터를 닫고 ② 케이블을 다시 꽂은 뒤 ③ [보드 연결]을 다시 눌러주세요. (Chrome/Edge 데스크톱 필요)', speak: '포트가 안 보이면 IDE를 닫고 케이블을 다시 꽂아 시도해줘!' };
    if (name === 'InvalidStateError' || /open|in use|busy|already|access/.test(msg))
      return { kind: 'busy', note: '포트가 다른 프로그램(아두이노 IDE 등)이나 다른 탭에서 사용 중일 수 있어요. 닫고 다시 시도해주세요.', speak: '포트가 사용 중인 것 같아. 아두이노 IDE나 다른 탭을 닫고 다시!' };
    return { kind: 'unknown', note: '연결 중 오류가 났어요. 케이블을 다시 꽂고 [다시 연결 시도]를 눌러주세요.', speak: '오류가 났어. 케이블을 다시 꽂고 시도해보자.' };
  },

  async disconnect() { await conn.disconnect(); _version = null; },

  /** digitalWrite (write 가 멈춰도 UI 가 막히지 않도록 타임아웃 보호) */
  async digital(pin, on) {
    const c = encodeDigitalWrite(pin, on);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** analogWrite(PWM) */
  async pwm(pin, v) {
    const c = encodePwm(pin, v);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** 네오픽셀(WS2812) 1픽셀 색 버퍼 설정 — 반영하려면 neoShow() (펌웨어 v5) */
  async neoPixel(pin, idx, r, g, b) {
    const c = encodeNeoPixel(pin, idx, r, g, b);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** 네오픽셀 전체를 한 색으로 채우고 즉시 반영 (펌웨어 v5) */
  async neoFill(pin, r, g, b) {
    const c = encodeNeoFill(pin, r, g, b);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** 네오픽셀 show(버퍼 → LED 반영) (펌웨어 v5) */
  async neoShow(pin) {
    const c = encodeNeoShow(pin);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** tone(부저): pin 을 freq(Hz) 로 ms 동안 울림 (펌웨어 v3) */
  async tone(pin, freq, ms = 220) {
    const c = encodeTone(pin, freq, ms);
    await safeWrite(c);
    emitLine('tx', c);
  },
  /** analogRead → 0~1023 또는 null (펌웨어 v3) */
  analogRead(ch, { timeout = 700 } = {}) {
    if (!conn.isOpen) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(v); };
      const re = new RegExp('^A' + ch + ':(\\d+)');
      const unsub = this.onLine((kind, text) => { const m = re.exec(text); if (m) finish(Number(m[1])); });
      const timer = setTimeout(() => finish(null), timeout);
      emitLine('tx', encodeAnalogRead(ch));
      conn.write(encodeAnalogRead(ch)).catch(() => finish(null));
    });
  },
  /** digitalRead → 0/1 또는 null (펌웨어 v3) */
  digitalRead(pin, { timeout = 700 } = {}) {
    if (!conn.isOpen) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(v); };
      const re = new RegExp('^R' + pin + ':(\\d+)');
      const unsub = this.onLine((kind, text) => { const m = re.exec(text); if (m) finish(Number(m[1])); });
      const timer = setTimeout(() => finish(null), timeout);
      emitLine('tx', encodeDigitalRead(pin));
      conn.write(encodeDigitalRead(pin)).catch(() => finish(null));
    });
  },

  /** 초음파(HC-SR04) 거리 1회 읽기 → cm(>0) 또는 null (펌웨어가 U 명령 지원 시) */
  readUltrasonic({ trig, echo, timeout = 200 } = {}) {
    if (!conn.isOpen) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(v); };
      const unsub = this.onLine((kind, text) => {
        const m = /^US:(-?\d+)/.exec(text);
        if (m) { const cm = Number(m[1]); finish(cm > 0 ? cm : null); }
        else if (/^ERR:/.test(text)) finish(null);
      });
      const timer = setTimeout(() => finish(null), timeout);
      const c = encodeUltrasonic(trig, echo);
      emitLine('tx', c);
      conn.write(c).catch(() => finish(null));
    });
  },

  /** DHT-11 온습도 1회 읽기 → {temp,hum} 또는 null (펌웨어 v2+) */
  readDht({ timeout = 1300 } = {}) {
    if (!conn.isOpen) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); unsub(); resolve(v); };
      const unsub = this.onLine((kind, text) => {
        const m = /^DHT:(\d+),(\d+)/.exec(text);
        if (m) finish({ temp: Number(m[1]), hum: Number(m[2]) });
        else if (/^ERR:dht/.test(text)) finish(null);
      });
      const timer = setTimeout(() => finish(null), timeout);
      emitLine('tx', 'DHT');
      conn.write('DHT').catch(() => finish(null));
    });
  },

  /** 깜빡임 (내장 LED 테스트 등) — 항상 OFF 로 끝남 */
  async blink(pin, times = 4, period = 300) {
    for (let k = 0; k < times; k++) {
      await this.digital(pin, true); await delay(period);
      await this.digital(pin, false); await delay(period);
    }
    await this.digital(pin, false);
  },
};

// 시리얼 write 가 백프레셔 등으로 멈추면 1.2초 후 풀어주어 UI 가 얼지 않게 한다.
function safeWrite(cmd) {
  return Promise.race([
    conn.write(cmd),
    new Promise((_, rej) => setTimeout(() => rej(new Error('write timeout: ' + cmd)), 1200)),
  ]).catch((e) => { emitLine('sys', '⚠ 전송 지연/실패: ' + (e?.message ?? e)); });
}
