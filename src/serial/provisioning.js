// provisioning.js — PING 핸드셰이크 + WebSerial 펌웨어 플래싱 (§3, §7, 부록 B)
//
// 핸드셰이크: PING 을 일정 간격으로 재전송하며 'PLAYHOUSE v*' 를 기다린다.
//   (보드는 포트 오픈 시 DTR 리셋으로 ~1초 부트로더 구간을 거치므로 재시도 필요.)
// 실패 -> 호출측 "보드 준비" 모달 -> flashFirmware() 로 .hex 를 굽고 재연결.

import { encodePing, isIdent } from './protocol.js';
import { flashUno } from './flasher.js';
import { KNOWN_VENDORS } from './webserial.js';

export const HANDSHAKE_ATTEMPTS = 4;
export const HANDSHAKE_INTERVAL_MS = 800;

/**
 * 열린 연결에 대해 핸드셰이크. PING 을 interval 마다 attempts 회 보낸다.
 * @returns {Promise<{ok:boolean, version?:number, raw?:string, reason?:string}>}
 */
export function handshake(connection, { attempts = HANDSHAKE_ATTEMPTS, interval = HANDSHAKE_INTERVAL_MS } = {}) {
  return new Promise((resolve) => {
    if (!connection || !connection.isOpen) {
      resolve({ ok: false, reason: 'not_open' });
      return;
    }

    let settled = false;
    let tries = 0;
    let timer = null;

    const unsub = connection.onLine((line) => {
      if (isIdent(line)) {
        const m = line.match(/v(\d+)/i);
        finish({ ok: true, version: m ? Number(m[1]) : undefined, raw: line.trim() });
      }
    });

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(result);
    }

    function ping() {
      if (settled) return;
      if (tries >= attempts) { finish({ ok: false, reason: 'timeout' }); return; }
      tries++;
      connection.write(encodePing()).catch((e) =>
        finish({ ok: false, reason: 'write_failed', error: String(e) })
      );
      timer = setTimeout(ping, interval);
    }
    ping();
  });
}

/**
 * 펌웨어 플래싱. Uno 는 WebSerial(STK500)로 실제 굽기를 수행한다(부록 B).
 *
 * @param {string} board 'uno' (그 외 보드는 추후 esptool-js 등)
 * @param {SerialPort|null} port 이미 권한 부여된 포트(있으면 재사용 — 추가 선택창 없음)
 * @param {{onProgress?:Function, onLog?:Function}} [cbs]
 * @returns {Promise<{flashed:boolean, stub:boolean, port?:SerialPort}>}
 */
export async function flashFirmware(board = 'uno', port = null, cbs = {}) {
  if (board === 'uno') {
    cbs.onLog?.('펌웨어(playhouse-uno.hex) 로드…');
    const res = await fetch('/firmware/playhouse-uno.hex');
    if (!res.ok) throw new Error('playhouse-uno.hex 를 찾을 수 없습니다.');
    const hexText = await res.text();

    // 포트가 없으면 새로 선택 (보통은 런타임에서 받은 포트를 재사용)
    if (!port) {
      port = await navigator.serial.requestPort({ filters: KNOWN_VENDORS });
    }
    await flashUno(port, hexText, cbs);
    return { flashed: true, stub: false, port };
  }

  // ESP 계열 등은 별도 작업자 트랙 (esptool-js) — 현재는 스텁
  console.info(`[flashFirmware:STUB] board=${board} 미지원 — resolve() 만 수행.`);
  cbs.onLog?.(`'${board}' 보드는 아직 웹 굽기 미지원 — 스텁.`);
  return { flashed: false, stub: true };
}
