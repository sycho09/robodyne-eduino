/**
 * runtime/lexer.js — .ino 서브셋 토크나이저.
 * 지원하지 않는 문법은 "조용히 무시"하지 않고 위치와 이유를 붙여 오류로 만든다.
 */

import { CompileError } from './errors.js';

export const TYPE_KEYWORDS = new Set(['void', 'int', 'long', 'float', 'double', 'bool', 'boolean']);
export const KEYWORDS = new Set(['if', 'else', 'while', 'for', 'return', 'break', 'continue', 'true', 'false']);

// 긴 것부터 매칭해야 한다.
const PUNCT = [
  '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '(', ')', '{', '}', '[', ']', ';', ',', '+', '-', '*', '/', '%', '<', '>', '=', '!', '.', '?', ':', '&', '|', '^', '~',
];

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (type, value, l, c) => tokens.push({ type, value, line: l, col: c });
  const advance = (n) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line += 1; col = 1; } else { col += 1; }
      i += 1;
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { advance(1); continue; }

    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance(1);
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const l = line, c = col;
      advance(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) advance(1);
      if (i >= src.length) throw new CompileError('닫히지 않은 블록 주석입니다.', l, c);
      advance(2);
      continue;
    }

    if (ch === '#') {
      throw new CompileError('전처리기 지시문(#include, #define ...)은 모드1에서 지원하지 않습니다.', line, col);
    }
    // 문자열은 시리얼 출력에만 쓰인다(그 제한은 검증 단계가 건다).
    if (ch === '"') {
      const l = line, c = col;
      advance(1);
      let out = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') throw new CompileError('닫히지 않은 문자열입니다.', l, c);
        if (src[i] === '\\') {
          const e = src[i + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e === '\\' ? '\\' : e === '"' ? '"' : e;
          advance(2);
          continue;
        }
        out += src[i];
        advance(1);
      }
      if (i >= src.length) throw new CompileError('닫히지 않은 문자열입니다.', l, c);
      advance(1);
      push('str', out, l, c);
      continue;
    }
    if (ch === "'") {
      throw new CompileError('문자 리터럴(\'x\')은 지원하지 않습니다. 큰따옴표 문자열을 쓰세요.', line, col);
    }

    if (ch >= '0' && ch <= '9') {
      const l = line, c = col;
      let s = '';
      while (i < src.length && /[0-9]/.test(src[i])) { s += src[i]; advance(1); }
      if (src[i] === '.') {
        s += '.'; advance(1);
        while (i < src.length && /[0-9]/.test(src[i])) { s += src[i]; advance(1); }
      }
      if (i < src.length && /[a-zA-Z_]/.test(src[i])) {
        throw new CompileError('숫자 뒤에 올 수 없는 문자입니다. (접미사 L, f 등은 미지원)', line, col);
      }
      push('num', Number(s), l, c);
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const l = line, c = col;
      let s = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) { s += src[i]; advance(1); }
      if (TYPE_KEYWORDS.has(s)) push('type', s, l, c);
      else if (KEYWORDS.has(s)) push('kw', s, l, c);
      else push('ident', s, l, c);
      continue;
    }

    const p = PUNCT.find((sym) => src.startsWith(sym, i));
    if (p) {
      const l = line, c = col;
      advance(p.length);
      push('punct', p, l, c);
      continue;
    }

    throw new CompileError(`알 수 없는 문자입니다: ${JSON.stringify(ch)}`, line, col);
  }

  push('eof', null, line, col);
  return tokens;
}
