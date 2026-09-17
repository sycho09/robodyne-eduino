/**
 * runtime/codediff.js — 두 코드 사이의 변경점을 기계적으로 뽑는다.
 *
 * 자연어 설명을 만들지 않는다. 코드에서 읽어낸 사실만 돌려준다.
 *   값 변경  전역 변수 초깃값, 호출 인자의 숫자 리터럴
 *   구조 변경 줄 추가·삭제 개수
 *
 * 기본은 AST 비교다(서브셋 파서 재사용). 파싱이 안 되는 코드는 줄 단위 비교로 내려간다.
 */

import { parse } from './parser.js';

export function extractSignature(source) {
  const lines = source.split('\n');
  try {
    const ast = parse(source);
    return { ok: true, lines, globals: collectGlobals(ast), calls: collectCalls(ast) };
  } catch (_) {
    return { ok: false, lines, globals: new Map(), calls: [] };
  }
}

function literalValue(node) {
  if (!node) return null;
  if (node.kind === 'Num') return node.value;
  if (node.kind === 'Bool') return node.value;
  if (node.kind === 'Unary' && node.op === '-' && node.argument && node.argument.kind === 'Num') return -node.argument.value;
  return null;
}

function collectGlobals(ast) {
  const map = new Map();
  for (const decl of ast.globals || []) {
    for (const d of decl.declarations) {
      const v = literalValue(d.init);
      if (v !== null) map.set(d.name, v);
    }
  }
  return map;
}

/** 호출을 소스 순서대로 모은다. 같은 이름은 등장 순번으로 짝지어 비교한다. */
function collectCalls(ast) {
  const calls = [];
  const seen = new Map();
  const visitExpr = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'Call') {
      const idx = (seen.get(n.callee) || 0) + 1;
      seen.set(n.callee, idx);
      calls.push({
        key: `${n.callee}#${idx}`,
        callee: n.callee,
        args: n.args.map((a) => (a.kind === 'Ident' ? { ident: a.name } : { value: literalValue(a) })),
      });
    }
    for (const k of ['left', 'right', 'argument', 'value', 'test', 'init', 'update']) visitExpr(n[k]);
    if (Array.isArray(n.args)) n.args.forEach(visitExpr);
  };
  const visitStmt = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'Block') { n.body.forEach(visitStmt); return; }
    if (n.kind === 'VarDecl') { n.declarations.forEach((d) => visitExpr(d.init)); return; }
    if (n.kind === 'ExprStmt') { visitExpr(n.expression); return; }
    if (n.kind === 'If') { visitExpr(n.test); visitStmt(n.consequent); visitStmt(n.alternate); return; }
    if (n.kind === 'While') { visitExpr(n.test); visitStmt(n.body); return; }
    if (n.kind === 'For') { visitStmt(n.init); visitExpr(n.test); visitExpr(n.update); visitStmt(n.body); return; }
    if (n.kind === 'Return') { visitExpr(n.argument); }
  };
  for (const fn of ast.functions || []) visitStmt(fn.body);
  return calls;
}

/**
 * 줄 단위 LCS. 코드가 짧아 단순 DP 로 충분하다.
 * 숫자는 자리표로 바꿔 비교한다. 값만 바뀐 줄이 구조 변경으로 이중 집계되면 안 되기 때문이다.
 */
const normalizeLine = (line) => line.trim().replace(/-?\d+(\.\d+)?/g, '#');

function lineDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = normalizeLine(a[i]) === normalizeLine(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return { removed: n - common, added: m - common };
}

/**
 * @returns {{ values: Array<{label:string, from:*, to:*}>, structure: {added:number, removed:number}, mode: 'ast'|'lines' }}
 */
export function diffCode(prevSource, nextSource) {
  const prev = extractSignature(prevSource);
  const next = extractSignature(nextSource);
  const structure = lineDiff(prev.lines, next.lines);
  const values = [];

  if (!prev.ok || !next.ok) {
    return { values, structure, mode: 'lines' };
  }

  for (const [name, value] of next.globals) {
    if (prev.globals.has(name) && prev.globals.get(name) !== value) {
      values.push({ label: name, from: prev.globals.get(name), to: value });
    }
  }

  // 호출 열 자체가 달라졌으면 순번으로 짝지은 인자 비교는 엉뚱한 쌍을 만든다.
  // 그럴 때는 값 변경을 말하지 않고 구조 변경만 보고한다.
  const sameCallSequence = prev.calls.length === next.calls.length
    && prev.calls.every((c, i) => c.callee === next.calls[i].callee);
  if (!sameCallSequence) return { values, structure, mode: 'ast' };

  const prevCalls = new Map(prev.calls.map((c) => [c.key, c]));
  for (const call of next.calls) {
    const before = prevCalls.get(call.key);
    if (!before || before.args.length !== call.args.length) continue;
    call.args.forEach((arg, i) => {
      const was = before.args[i];
      if (arg.value === null || arg.value === undefined || was.value === null || was.value === undefined) return;
      if (arg.value !== was.value) {
        values.push({ label: `${call.callee}(${was.value})`, from: was.value, to: arg.value, call: call.callee });
      }
    });
  }

  return { values, structure, mode: 'ast' };
}

/** 화면에 그대로 쓰는 짧은 문자열. 사실만 담는다. */
export function formatDiff(diff) {
  const parts = diff.values.map((v) => (v.call
    ? `${v.call}(${v.from}) → ${v.call}(${v.to})`
    : `${v.label} ${v.from} → ${v.to}`));
  const changedLines = diff.structure.added + diff.structure.removed;
  if (changedLines > 0) parts.push(`구조 변경 ${changedLines}줄`);
  return parts;
}
