/**
 * runtime/validate.js — allowed_api 강제 + 이름 해석.
 *
 * 매니페스트의 allowed_api[] 밖의 호출은 전부 오류다.
 * "목록에 없다"로 끝내지 않고, 실제 .ino 에서 흔히 쓰는 API 라면 왜 막혔는지 이유를 붙인다.
 * 선언되지 않은 식별자도 여기서 잡히므로 브라우저 전역(window, fetch ...)에 닿을 수 없다.
 */

import { ALWAYS_OPEN, API_REGISTRY, BLOCKED_API, ENTRY_POINTS } from './api.js';

export function validate(ast, allowedApi, constants = {}) {
  const errors = [];
  const allowed = new Set(allowedApi.filter((n) => !ENTRY_POINTS.includes(n)));
  const constNames = new Set(Object.keys(constants));
  const userFunctions = new Map();

  const err = (node, message) => errors.push({ line: node.line, col: node.col, message });

  for (const fn of ast.functions) {
    if (userFunctions.has(fn.name)) {
      err(fn, `함수 '${fn.name}' 가 중복 정의되었습니다.`);
      continue;
    }
    if (API_REGISTRY[fn.name]) {
      err(fn, `'${fn.name}' 는 시뮬레이터 API 이름입니다. 다른 이름을 쓰세요.`);
      continue;
    }
    userFunctions.set(fn.name, fn);
  }

  for (const name of ENTRY_POINTS) {
    const fn = userFunctions.get(name);
    if (!fn) {
      errors.push({ line: 1, col: 1, message: `${name}() 함수가 없습니다. .ino 는 setup() 과 loop() 가 반드시 있어야 합니다.` });
    } else if (fn.params.length > 0) {
      err(fn, `${name}() 은 매개변수를 가질 수 없습니다.`);
    } else if (fn.returnType !== 'void') {
      err(fn, `${name}() 의 반환형은 void 여야 합니다.`);
    }
  }

  // 전역 변수는 모든 함수에서 보인다.
  const globalScope = new Set();
  const globalCtx = { errors, allowed, constNames, userFunctions, err, loopDepth: 0 };
  for (const decl of ast.globals || []) {
    for (const d of decl.declarations) {
      if (d.init) walkExpr(d.init, [globalScope], globalCtx);
      if (globalScope.has(d.name)) err(d, `전역 변수 '${d.name}' 가 이미 선언되어 있습니다.`);
      globalScope.add(d.name);
    }
  }

  for (const fn of userFunctions.values()) {
    const scopes = [globalScope, new Set(fn.params.map((p) => p.name))];
    walkBlock(fn.body, scopes, { fn, errors, allowed, constNames, userFunctions, err, loopDepth: 0 });
  }

  return { errors, userFunctions: [...userFunctions.keys()] };
}

function declare(scopes, name) { scopes[scopes.length - 1].add(name); }
function isDeclared(scopes, name) { return scopes.some((s) => s.has(name)); }

function walkBlock(block, scopes, ctx) {
  scopes.push(new Set());
  for (const st of block.body) walkStmt(st, scopes, ctx);
  scopes.pop();
}

function walkStmt(node, scopes, ctx) {
  if (!node) return;
  switch (node.kind) {
    case 'Block': walkBlock(node, scopes, ctx); break;
    case 'Empty': break;
    case 'VarDecl':
      for (const d of node.declarations) {
        if (d.init) walkExpr(d.init, scopes, ctx);
        if (isDeclared(scopes, d.name)) ctx.err(d, `변수 '${d.name}' 가 이미 선언되어 있습니다.`);
        declare(scopes, d.name);
      }
      break;
    case 'If':
      walkExpr(node.test, scopes, ctx);
      walkStmt(node.consequent, scopes, ctx);
      walkStmt(node.alternate, scopes, ctx);
      break;
    case 'While':
      walkExpr(node.test, scopes, ctx);
      ctx.loopDepth += 1; walkStmt(node.body, scopes, ctx); ctx.loopDepth -= 1;
      break;
    case 'For':
      scopes.push(new Set());
      walkStmt(node.init, scopes, ctx);
      if (node.test) walkExpr(node.test, scopes, ctx);
      if (node.update) walkExpr(node.update, scopes, ctx);
      ctx.loopDepth += 1; walkStmt(node.body, scopes, ctx); ctx.loopDepth -= 1;
      scopes.pop();
      break;
    case 'Return':
      if (node.argument) walkExpr(node.argument, scopes, ctx);
      break;
    case 'Break':
    case 'Continue':
      if (ctx.loopDepth === 0) ctx.err(node, '반복문 밖에서는 break/continue 를 쓸 수 없습니다.');
      break;
    case 'ExprStmt': walkExpr(node.expression, scopes, ctx); break;
    default: break;
  }
}

function walkExpr(node, scopes, ctx) {
  if (!node) return;
  switch (node.kind) {
    case 'Num':
    case 'Bool':
      break;
    case 'Str':
      ctx.err(node, '문자열은 Serial.print / Serial.println 의 인자로만 쓸 수 있습니다.');
      break;
    case 'Ident':
      if (ctx.constNames.has(node.name)) break;   // 핀 번호·HIGH/LOW 같은 상수
      if (!isDeclared(scopes, node.name)) {
        if (BLOCKED_API[node.name]) ctx.err(node, `'${node.name}' 는 모드1에서 사용할 수 없습니다. ${BLOCKED_API[node.name]}`);
        else if (API_REGISTRY[node.name]) ctx.err(node, `'${node.name}' 는 함수입니다. ${API_REGISTRY[node.name].sig} 처럼 호출해야 합니다.`);
        else ctx.err(node, `선언되지 않은 이름입니다: '${node.name}'`);
      }
      break;
    case 'Assign':
      walkExpr(node.value, scopes, ctx);
      if (!isDeclared(scopes, node.target.name)) ctx.err(node.target, `선언되지 않은 변수에 대입했습니다: '${node.target.name}'`);
      break;
    case 'Update':
      if (!isDeclared(scopes, node.argument.name)) ctx.err(node.argument, `선언되지 않은 변수입니다: '${node.argument.name}'`);
      break;
    case 'Unary': walkExpr(node.argument, scopes, ctx); break;
    case 'Binary':
    case 'Logical':
      walkExpr(node.left, scopes, ctx);
      walkExpr(node.right, scopes, ctx);
      break;
    case 'Call': {
      // 문자열은 시리얼 출력의 인자로만 허용한다. 그 밖에서는 아래 walkExpr 가 막는다.
      const isSerial = String(node.callee).startsWith('Serial.');
      for (const a of node.args) { if (!(isSerial && a.kind === 'Str')) walkExpr(a, scopes, ctx); }
      const name = node.callee;
      if (ENTRY_POINTS.includes(name)) {
        ctx.err(node, `${name}() 은 시뮬레이터가 호출합니다. 직접 호출할 수 없습니다.`);
        return;
      }
      if (ctx.userFunctions.has(name)) {
        const fn = ctx.userFunctions.get(name);
        if (fn.params.length !== node.args.length) {
          ctx.err(node, `${name}() 은 인자 ${fn.params.length}개가 필요합니다. (${node.args.length}개 전달)`);
        }
        return;
      }
      if (BLOCKED_API[name]) {
        ctx.err(node, `'${name}' 는 모드1에서 사용할 수 없습니다. ${BLOCKED_API[name]}`);
        return;
      }
      if (!ctx.allowed.has(name) && !ALWAYS_OPEN.includes(name)) {
        const known = API_REGISTRY[name];
        ctx.err(node, known
          ? `'${name}' 는 이 챌린지에서 열려 있지 않은 API 입니다. (${known.layer === 'pin' ? '심화(핀 제어) 계층' : '기본 계층'})`
          : `사용할 수 없는 함수입니다: '${name}'`);
        return;
      }
      const info = API_REGISTRY[name];
      if (info) {
        const [min, max] = info.arity;
        if (node.args.length < min || node.args.length > max) {
          const need = min === max ? `${min}개` : `${min}~${max}개`;
          ctx.err(node, `${info.sig} 는 인자 ${need}가 필요합니다. (${node.args.length}개 전달)`);
        }
      }
      break;
    }
    default: break;
  }
}
