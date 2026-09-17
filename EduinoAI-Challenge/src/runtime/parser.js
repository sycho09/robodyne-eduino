/**
 * runtime/parser.js — 서브셋 → AST (재귀 하강).
 *
 * 지원 문법
 *   함수 정의      : void setup() {}, void loop() {}, 사용자 함수(int f(int a) { ... })
 *   변수 선언      : int i = 0;  float v = 1.5, w;
 *   제어문         : if / else / while / for / return / break / continue / 블록
 *   식             : 산술 + - * / %, 비교, && || !, 단항 -, 대입/복합대입, ++/--, 함수 호출
 * 미지원(명시적 오류)
 *   포인터, 배열, 구조체/클래스, 멤버 접근(.), 문자열, 전처리기, switch, do-while, 삼항 연산자
 */

import { CompileError } from './errors.js';
import { tokenize } from './lexer.js';
import { MEMBER_OBJECTS } from './api.js';

export function parse(src) {
  const tokens = tokenize(src);
  let p = 0;

  const peek = (k = 0) => tokens[Math.min(p + k, tokens.length - 1)];
  const at = (type, value) => {
    const t = peek();
    return t.type === type && (value === undefined || t.value === value);
  };
  const next = () => tokens[p++];
  const expect = (type, value, what) => {
    const t = peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      const got = t.type === 'eof' ? '파일 끝' : JSON.stringify(String(t.value));
      throw new CompileError(`${what || `'${value}'`} 가(이) 필요합니다. (발견: ${got})`, t.line, t.col);
    }
    return next();
  };
  const fail = (msg) => { const t = peek(); throw new CompileError(msg, t.line, t.col); };

  function parseProgram() {
    const functions = [];
    const globals = [];
    while (!at('eof')) {
      // 자료형 다음이 '이름 (' 이면 함수, 아니면 전역 변수 선언이다.
      if (at('type') && !(peek(1).type === 'ident' && peek(2).type === 'punct' && peek(2).value === '(')) {
        globals.push(parseVarDecl());
        continue;
      }
      functions.push(parseFunction());
    }
    return { kind: 'Program', functions, globals };
  }

  function parseFunction() {
    if (!at('type')) fail('함수 정의로 시작해야 합니다. (예: void setup() { ... })');
    const typeTok = next();
    const nameTok = expect('ident', undefined, '함수 이름');
    expect('punct', '(');
    const params = [];
    if (!at('punct', ')')) {
      do {
        if (!at('type')) fail('매개변수 자료형이 필요합니다.');
        const pt = next();
        if (pt.value === 'void') fail('매개변수 자료형으로 void 를 쓸 수 없습니다.');
        const pn = expect('ident', undefined, '매개변수 이름');
        params.push({ type: pt.value, name: pn.value, line: pn.line, col: pn.col });
      } while (at('punct', ',') && next());
    }
    expect('punct', ')');
    const body = parseBlock();
    return {
      kind: 'FunctionDef',
      returnType: typeTok.value,
      name: nameTok.value,
      params,
      body,
      line: nameTok.line,
      col: nameTok.col,
    };
  }

  function parseBlock() {
    const open = expect('punct', '{');
    const body = [];
    while (!at('punct', '}')) {
      if (at('eof')) throw new CompileError('닫는 중괄호 } 가 없습니다.', open.line, open.col);
      body.push(parseStatement());
    }
    expect('punct', '}');
    return { kind: 'Block', body };
  }

  function parseStatement() {
    if (at('punct', '{')) return parseBlock();
    if (at('punct', ';')) { next(); return { kind: 'Empty' }; }
    if (at('type')) return parseVarDecl();
    if (at('kw', 'if')) return parseIf();
    if (at('kw', 'while')) return parseWhile();
    if (at('kw', 'for')) return parseFor();
    if (at('kw', 'return')) return parseReturn();
    if (at('kw', 'break')) { const t = next(); expect('punct', ';'); return { kind: 'Break', line: t.line, col: t.col }; }
    if (at('kw', 'continue')) { const t = next(); expect('punct', ';'); return { kind: 'Continue', line: t.line, col: t.col }; }
    if (at('kw', 'else')) fail("짝이 없는 else 입니다.");
    const expr = parseExpression();
    expect('punct', ';', "문장 끝의 세미콜론 ';'");
    return { kind: 'ExprStmt', expression: expr, line: expr.line, col: expr.col };
  }

  function parseVarDecl() {
    const t = next(); // type
    if (t.value === 'void') fail('void 로 변수를 선언할 수 없습니다.');
    const declarations = [];
    do {
      const nameTok = expect('ident', undefined, '변수 이름');
      if (at('punct', '[')) fail('배열은 모드1에서 지원하지 않습니다.');
      let init = null;
      if (at('punct', '=')) { next(); init = parseExpression(); }
      declarations.push({ name: nameTok.value, init, line: nameTok.line, col: nameTok.col });
    } while (at('punct', ',') && next());
    expect('punct', ';', "선언 끝의 세미콜론 ';'");
    return { kind: 'VarDecl', varType: t.value, declarations, line: t.line, col: t.col };
  }

  function parseIf() {
    const t = next();
    expect('punct', '(');
    const test = parseExpression();
    expect('punct', ')');
    const consequent = parseStatement();
    let alternate = null;
    if (at('kw', 'else')) { next(); alternate = parseStatement(); }
    return { kind: 'If', test, consequent, alternate, line: t.line, col: t.col };
  }

  function parseWhile() {
    const t = next();
    expect('punct', '(');
    const test = parseExpression();
    expect('punct', ')');
    const body = parseStatement();
    return { kind: 'While', test, body, line: t.line, col: t.col };
  }

  function parseFor() {
    const t = next();
    expect('punct', '(');
    let init = null;
    if (at('punct', ';')) next();
    else if (at('type')) init = parseVarDecl();
    else { init = { kind: 'ExprStmt', expression: parseExpression() }; expect('punct', ';'); }
    let test = null;
    if (!at('punct', ';')) test = parseExpression();
    expect('punct', ';');
    let update = null;
    if (!at('punct', ')')) update = parseExpression();
    expect('punct', ')');
    const body = parseStatement();
    return { kind: 'For', init, test, update, body, line: t.line, col: t.col };
  }

  function parseReturn() {
    const t = next();
    let argument = null;
    if (!at('punct', ';')) argument = parseExpression();
    expect('punct', ';');
    return { kind: 'Return', argument, line: t.line, col: t.col };
  }

  // ---- 식 ----
  function parseExpression() { return parseAssignment(); }

  function parseAssignment() {
    const left = parseLogicalOr();
    const ops = ['=', '+=', '-=', '*=', '/=', '%='];
    const t = peek();
    if (t.type === 'punct' && ops.includes(t.value)) {
      if (left.kind !== 'Ident') throw new CompileError('대입은 변수에만 할 수 있습니다.', t.line, t.col);
      next();
      const value = parseAssignment();
      return { kind: 'Assign', op: t.value, target: left, value, line: left.line, col: left.col };
    }
    if (t.type === 'punct' && t.value === '?') {
      throw new CompileError('삼항 연산자(?:)는 모드1에서 지원하지 않습니다.', t.line, t.col);
    }
    return left;
  }

  const binaryLevels = [
    ['||'],
    ['&&'],
    ['==', '!='],
    ['<', '>', '<=', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  function parseLogicalOr() { return parseBinary(0); }

  function parseBinary(level) {
    if (level >= binaryLevels.length) return parseUnary();
    let left = parseBinary(level + 1);
    for (;;) {
      const t = peek();
      if (t.type === 'punct' && binaryLevels[level].includes(t.value)) {
        next();
        const right = parseBinary(level + 1);
        const kind = (t.value === '&&' || t.value === '||') ? 'Logical' : 'Binary';
        left = { kind, op: t.value, left, right, line: left.line, col: left.col };
      } else if (t.type === 'punct' && (t.value === '&' || t.value === '|' || t.value === '^' || t.value === '~')) {
        throw new CompileError('비트 연산자는 모드1에서 지원하지 않습니다.', t.line, t.col);
      } else {
        return left;
      }
    }
  }

  function parseUnary() {
    const t = peek();
    if (t.type === 'punct' && (t.value === '!' || t.value === '-' || t.value === '+')) {
      next();
      const argument = parseUnary();
      return { kind: 'Unary', op: t.value, argument, line: t.line, col: t.col };
    }
    if (t.type === 'punct' && (t.value === '++' || t.value === '--')) {
      next();
      const argument = parseUnary();
      if (argument.kind !== 'Ident') throw new CompileError('++/-- 는 변수에만 쓸 수 있습니다.', t.line, t.col);
      return { kind: 'Update', op: t.value, argument, prefix: true, line: t.line, col: t.col };
    }
    if (t.type === 'punct' && t.value === '*') throw new CompileError('포인터는 모드1에서 지원하지 않습니다.', t.line, t.col);
    return parsePostfix();
  }

  function parsePostfix() {
    let node = parsePrimary();
    for (;;) {
      const t = peek();
      if (t.type === 'punct' && t.value === '(') {
        if (node.kind !== 'Ident') throw new CompileError('함수 이름이 아닌 곳에 호출 괄호가 있습니다.', t.line, t.col);
        next();
        const args = [];
        if (!at('punct', ')')) {
          do { args.push(parseExpression()); } while (at('punct', ',') && next());
        }
        expect('punct', ')', "호출을 닫는 ')'");
        node = { kind: 'Call', callee: node.name, args, line: node.line, col: node.col };
      } else if (t.type === 'punct' && (t.value === '++' || t.value === '--')) {
        next();
        if (node.kind !== 'Ident') throw new CompileError('++/-- 는 변수에만 쓸 수 있습니다.', t.line, t.col);
        node = { kind: 'Update', op: t.value, argument: node, prefix: false, line: t.line, col: t.col };
      } else if (t.type === 'punct' && t.value === '.') {
        // 멤버 접근은 허용된 객체(Serial 등)에서만 열린다. 그 밖에는 그대로 막는다.
        if (node.kind !== 'Ident' || !MEMBER_OBJECTS.includes(node.name)) {
          throw new CompileError('멤버 접근(.)은 이 서브셋에서 지원하지 않습니다.', t.line, t.col);
        }
        next();
        const m = peek();
        if (m.type !== 'ident') throw new CompileError("'.' 뒤에 이름이 없습니다.", m.line, m.col);
        next();
        node = { kind: 'Ident', name: `${node.name}.${m.value}`, line: node.line, col: node.col };
      } else if (t.type === 'punct' && t.value === '[') {
        throw new CompileError('배열 인덱싱은 모드1에서 지원하지 않습니다.', t.line, t.col);
      } else {
        return node;
      }
    }
  }

  function parsePrimary() {
    const t = peek();
    if (t.type === 'num') { next(); return { kind: 'Num', value: t.value, line: t.line, col: t.col }; }
    if (t.type === 'str') { next(); return { kind: 'Str', value: t.value, line: t.line, col: t.col }; }
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) {
      next();
      return { kind: 'Bool', value: t.value === 'true', line: t.line, col: t.col };
    }
    if (t.type === 'ident') { next(); return { kind: 'Ident', name: t.value, line: t.line, col: t.col }; }
    if (t.type === 'punct' && t.value === '(') {
      next();
      const e = parseExpression();
      expect('punct', ')', "닫는 괄호 ')'");
      return e;
    }
    if (t.type === 'type') throw new CompileError('식 안에서는 자료형을 쓸 수 없습니다. (형변환 미지원)', t.line, t.col);
    fail('식이 필요한 자리입니다.');
  }

  const program = parseProgram();
  return program;
}
