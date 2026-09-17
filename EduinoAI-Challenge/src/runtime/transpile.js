/**
 * runtime/transpile.js — AST → JS generator 소스.
 *
 * 핵심 규칙
 *  - 사용자 함수는 전부 generator 로 만든다. delay() 가 어느 깊이에 있어도 tick 을 소비할 수 있다.
 *  - blocking API(delay)는 `yield* __rt.delay(ms)` 로, 나머지 API 는 즉시 반환 호출로 나간다.
 *  - 반복문마다 __guard() 를 넣어, delay 없는 무한 루프가 브라우저를 멈추지 않게 한다.
 *  - loop() 가 한 번 도는 동안 tick 을 하나도 안 썼으면 강제로 1 tick 을 쓴다(진행 보장).
 *    delay 를 제대로 쓴 코드에서는 이 보정이 발동하지 않으므로 랩타임이 왜곡되지 않는다.
 *  - 식별자는 전부 접두사를 붙여 JS 전역/예약어와 충돌하지 않게 한다.
 */

import { API_REGISTRY } from './api.js';

const V = (name) => `u_${name}`;
const F = (name) => `f_${name}`;

let CONSTANTS = {};

export function transpile(ast, constants = {}) {
  CONSTANTS = constants;
  const out = [];
  out.push("'use strict';");
  for (const decl of ast.globals || []) {
    for (const d of decl.declarations) {
      out.push(`let ${V(d.name)} = ${d.init ? emitExpr(d.init) : '0'};`);
    }
  }
  for (const fn of ast.functions) {
    out.push(emitFunction(fn));
  }
  out.push('return function* () {');
  out.push(`  yield* ${F('setup')}();`);
  out.push('  for (;;) {');
  out.push('    const __t0 = __rt.ticks();');
  out.push(`    yield* ${F('loop')}();`);
  out.push('    if (__rt.ticks() === __t0) yield 1;');
  out.push('  }');
  out.push('};');
  return out.join('\n');
}

function emitFunction(fn) {
  const params = fn.params.map((p) => V(p.name)).join(', ');
  return `function* ${F(fn.name)}(${params}) {\n${emitBlockBody(fn.body, '  ')}\n}`;
}

/**
 * 문장마다 앞에 `__at(줄번호)` 를 둔다. 지금 실행 중인 줄을 에디터가 짚어 주기 위한 것으로,
 * tick 을 쓰지도 __guard 를 세지도 않으므로 랩타임에 닿지 않는다(45차 파트3).
 * 줄 번호는 전처리를 거친 뒤에도 그대로다 — #define 을 지운 자리에 빈 줄을 남기기 때문이다.
 */
function emitBlockBody(block, ind) {
  return block.body.map((s) => {
    const js = emitStmt(s, ind);
    if (!js) return null;
    return s.line ? `${ind}__at(${s.line});\n${js}` : js;
  }).filter(Boolean).join('\n');
}

function emitStmt(node, ind) {
  switch (node.kind) {
    case 'Block':
      return `${ind}{\n${emitBlockBody(node, ind + '  ')}\n${ind}}`;
    case 'Empty':
      return null;
    case 'VarDecl':
      return node.declarations
        .map((d) => `${ind}let ${V(d.name)} = ${d.init ? emitExpr(d.init) : '0'};`)
        .join('\n');
    case 'If': {
      let s = `${ind}if (${emitExpr(node.test)}) ${wrap(node.consequent, ind)}`;
      if (node.alternate) s += ` else ${wrap(node.alternate, ind)}`;
      return s;
    }
    case 'While':
      return `${ind}while (${emitExpr(node.test)}) ${wrapLoop(node.body, ind)}`;
    case 'For': {
      const init = node.init
        ? (node.init.kind === 'VarDecl'
          ? node.init.declarations.map((d) => `${V(d.name)} = ${d.init ? emitExpr(d.init) : '0'}`).join(', ')
          : emitExpr(node.init.expression))
        : '';
      const initPart = node.init && node.init.kind === 'VarDecl' ? `let ${init}` : init;
      const test = node.test ? emitExpr(node.test) : '';
      const update = node.update ? emitExpr(node.update) : '';
      return `${ind}for (${initPart}; ${test}; ${update}) ${wrapLoop(node.body, ind)}`;
    }
    case 'Return':
      return `${ind}return${node.argument ? ' ' + emitExpr(node.argument) : ''};`;
    case 'Break':
      return `${ind}break;`;
    case 'Continue':
      return `${ind}continue;`;
    case 'ExprStmt':
      return `${ind}${emitExpr(node.expression)};`;
    default:
      throw new Error(`transpile: 처리하지 않은 문장 ${node.kind}`);
  }
}

/** 단일 문장이어도 항상 블록으로 감싼다. (continue/guard 삽입을 안전하게) */
function wrap(node, ind) {
  if (node.kind === 'Block') return `{\n${emitBlockBody(node, ind + '  ')}\n${ind}}`;
  return `{\n${emitStmt(node, ind + '  ')}\n${ind}}`;
}

function wrapLoop(node, ind) {
  const inner = node.kind === 'Block' ? emitBlockBody(node, ind + '  ') : emitStmt(node, ind + '  ');
  return `{\n${ind}  __guard();\n${inner}\n${ind}}`;
}

function emitExpr(node) {
  switch (node.kind) {
    case 'Num':
      return String(node.value);
    case 'Str':
      return JSON.stringify(node.value);
    case 'Bool':
      return node.value ? 'true' : 'false';
    case 'Ident':
      // 핀 번호나 HIGH/LOW 는 변수가 아니라 상수다. 값으로 굳혀 넣는다.
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) return String(CONSTANTS[node.name]);
      return V(node.name);
    case 'Assign':
      return `(${V(node.target.name)} ${node.op} ${emitExpr(node.value)})`;
    case 'Update':
      return node.prefix ? `(${node.op}${V(node.argument.name)})` : `(${V(node.argument.name)}${node.op})`;
    case 'Unary':
      return `(${node.op}${emitExpr(node.argument)})`;
    case 'Binary':
    case 'Logical':
      return `(${emitExpr(node.left)} ${node.op} ${emitExpr(node.right)})`;
    case 'Call': {
      const args = node.args.map(emitExpr).join(', ');
      const info = API_REGISTRY[node.callee];
      if (info) {
        return info.blocking ? `(yield* __rt.${node.callee}(${args}))` : `__rt.${node.callee}(${args})`;
      }
      return `(yield* ${F(node.callee)}(${args}))`;
    }
    default:
      throw new Error(`transpile: 처리하지 않은 식 ${node.kind}`);
  }
}
