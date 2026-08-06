// intelhex.js — Intel HEX(.hex) 파서
// AVR 펌웨어(.hex)를 평면 바이트 배열로 변환한다. 빈 영역은 0xFF.
// Uno 펌웨어는 base=0, 레코드 타입 00(data)/01(EOF) 만 사용하지만
// 02(확장 세그먼트)/04(확장 선형)도 안전하게 처리한다.

/**
 * @param {string} text .hex 파일 내용
 * @returns {{ data: Uint8Array, size: number }}
 */
export function parseIntelHex(text) {
  const lines = text.split(/\r?\n/);
  const bytes = new Map();
  let base = 0;
  let max = -1;

  for (const ln of lines) {
    if (!ln || ln[0] !== ':') continue;
    const len = parseInt(ln.substr(1, 2), 16);
    const addr = parseInt(ln.substr(3, 4), 16);
    const type = parseInt(ln.substr(7, 2), 16);

    if (type === 0x01) break;                              // EOF
    if (type === 0x04) { base = parseInt(ln.substr(9, 4), 16) << 16; continue; }
    if (type === 0x02) { base = parseInt(ln.substr(9, 4), 16) << 4; continue; }
    if (type !== 0x00) continue;                           // data 만 처리

    for (let i = 0; i < len; i++) {
      const b = parseInt(ln.substr(9 + i * 2, 2), 16);
      const a = base + addr + i;
      bytes.set(a, b);
      if (a > max) max = a;
    }
  }

  let size = max + 1;
  if (size <= 0) return { data: new Uint8Array(0), size: 0 };
  if (size & 1) size++;                                    // 워드 경계 (짝수)

  const data = new Uint8Array(size).fill(0xff);
  for (const [a, b] of bytes) data[a] = b;
  return { data, size };
}
