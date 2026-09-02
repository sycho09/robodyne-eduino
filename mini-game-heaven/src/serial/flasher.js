// flasher.js — Arduino Uno(ATmega328P / optiboot) WebSerial 플래셔
// STK500v1 부트로더 프로토콜을 WebSerial 위에서 직접 구현한다.
// IDE 없이 브라우저에서 .hex 를 굽는다. (부록 B 의 'Uno=STK500' 트랙)
//
// 흐름: DTR/RTS 펄스로 자동 리셋 -> GET_SYNC -> ENTER_PROGMODE
//       -> (LOAD_ADDRESS + PROG_PAGE) 반복 -> LEAVE_PROGMODE.

import { parseIntelHex } from './intelhex.js';

// STK500v1 상수
const STK = {
  OK: 0x10,
  INSYNC: 0x14,
  CRC_EOP: 0x20,
  GET_SYNC: 0x30,
  ENTER_PROGMODE: 0x50,
  LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55,
  PROG_PAGE: 0x64,
  READ_SIGN: 0x75,
};

const PAGE_SIZE = 128;          // ATmega328P 플래시 페이지(바이트)
const BAUD = 115200;            // optiboot 업로드 속도

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// 타임아웃 기반 바이트 리더 (raw Uint8Array 스트림)
class RawReader {
  constructor(port) {
    this.reader = port.readable.getReader();
    this.buf = [];
    this.waiters = [];
    this._run();
  }
  async _run() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) { for (const b of value) this.buf.push(b); this._pump(); }
      }
    } catch (_) { /* cancel 시 종료 */ }
  }
  _pump() {
    while (this.waiters.length && this.buf.length >= this.waiters[0].n) {
      const w = this.waiters.shift();
      clearTimeout(w.timer);
      w.resolve(Uint8Array.from(this.buf.splice(0, w.n)));
    }
  }
  read(n, timeoutMs) {
    return new Promise((resolve, reject) => {
      const w = { n, resolve, reject };
      w.timer = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error('응답 시간 초과'));
      }, timeoutMs);
      this.waiters.push(w);
      this._pump();
    });
  }
  flush() { this.buf.length = 0; }
  async close() {
    try { await this.reader.cancel(); } catch (_) {}
    try { this.reader.releaseLock(); } catch (_) {}
  }
}

// 명령 전송 + [INSYNC] (payload) [OK] 응답 검증
async function command(writer, rdr, payload, respLen = 0, timeout = 1000) {
  await writer.write(Uint8Array.from([...payload, STK.CRC_EOP]));
  const a = await rdr.read(1, timeout);
  if (a[0] !== STK.INSYNC) throw new Error(`INSYNC 기대, 0x${a[0].toString(16)} 수신`);
  let body = new Uint8Array(0);
  if (respLen) body = await rdr.read(respLen, timeout);
  const b = await rdr.read(1, timeout);
  if (b[0] !== STK.OK) throw new Error(`OK 기대, 0x${b[0].toString(16)} 수신`);
  return body;
}

// DTR/RTS 펄스로 보드 자동 리셋 (16U2/CH340 양쪽 대응 위해 양 에지 생성)
async function pulseReset(port) {
  await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  await delay(50);
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  await delay(250);
  await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  await delay(50);
}

async function sync(writer, rdr, log) {
  for (let i = 0; i < 8; i++) {
    try {
      rdr.flush();
      await command(writer, rdr, [STK.GET_SYNC], 0, 400);
      return;
    } catch (_) {
      log?.(`동기화 재시도 ${i + 1}/8…`);
      await delay(120);
    }
  }
  throw new Error('보드 동기화 실패 — 포트가 맞는지, Uno 가 연결됐는지 확인하세요.');
}

/**
 * 열려있지 않은(닫힌) SerialPort 에 .hex 를 굽는다.
 * 완료 후 포트를 닫는다(권한은 유지되므로 재연결 시 선택창 불필요).
 *
 * @param {SerialPort} port 사용자가 이미 권한 부여한 포트
 * @param {string} hexText  Intel HEX 내용
 * @param {{onProgress?:(d:number,t:number)=>void, onLog?:(m:string)=>void}} [cbs]
 */
export async function flashUno(port, hexText, cbs = {}) {
  const { onProgress, onLog } = cbs;
  const { data, size } = parseIntelHex(hexText);
  if (!size) throw new Error('빈 .hex — 펌웨어 파일을 확인하세요.');
  onLog?.(`펌웨어 ${size} 바이트 / 페이지 ${Math.ceil(size / PAGE_SIZE)}개`);

  // 직전 연결이 완전히 닫히지 않아 "already open" 이 나면, 한 번 닫고 다시 연다.
  try {
    await port.open({ baudRate: BAUD });
  } catch (e) {
    if (/already open|open on 'serialport'/i.test(e?.message || '')) {
      onLog?.('포트가 아직 열려 있어 닫고 다시 여는 중…');
      try { await port.close(); } catch (_) {}
      await delay(350);
      await port.open({ baudRate: BAUD });
    } else { throw e; }
  }
  let rdr = null;
  let writer = null;
  try {
    onLog?.('보드 리셋(DTR/RTS 펄스)…');
    await pulseReset(port);
    rdr = new RawReader(port);
    writer = port.writable.getWriter();
    await delay(60);
    rdr.flush();

    await sync(writer, rdr, onLog);
    onLog?.('동기화 완료. 프로그래밍 모드 진입.');
    await command(writer, rdr, [STK.ENTER_PROGMODE]);

    try {
      const sig = await command(writer, rdr, [STK.READ_SIGN], 3, 600);
      onLog?.('서명: ' + [...sig].map((x) => '0x' + x.toString(16)).join(' '));
    } catch (_) { /* optiboot 가 서명 미지원이어도 진행 */ }

    for (let addr = 0; addr < size; addr += PAGE_SIZE) {
      const page = data.subarray(addr, Math.min(addr + PAGE_SIZE, size));
      const word = addr >> 1;                              // 워드 주소
      await command(writer, rdr, [STK.LOAD_ADDRESS, word & 0xff, (word >> 8) & 0xff]);
      await command(writer, rdr, [STK.PROG_PAGE, (page.length >> 8) & 0xff, page.length & 0xff, 0x46, ...page]);
      onProgress?.(Math.min(addr + PAGE_SIZE, size), size);
    }

    await command(writer, rdr, [STK.LEAVE_PROGMODE]);
    onLog?.('프로그래밍 완료. 보드 재시작.');
  } finally {
    try { writer?.releaseLock(); } catch (_) {}
    try { if (rdr) await rdr.close(); } catch (_) {}
    try { await port.close(); } catch (_) {}
  }
}
