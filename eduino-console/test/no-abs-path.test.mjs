// 하위 경로 배포 회귀 검출 — .html/.js/.css 안에 도메인 루트 기준 절대경로 참조
// 존재 시 실패 처리. (전제: 이 폴더가 도메인 루트가 아닌 하위 경로에 배포될 수 있음)
//
// 검출 대상:
//   - HTML  : src="/…" · href="/…" · <meta http-equiv="refresh" content="…url=/…">
//   - JS    : 문자열 리터럴 '/console…' · "/stages…" · `/platform…` · '/shared…' ·
//             '/modules…' · '/entry.html' · '/index.html' · '/favicon…' · '/apple-touch-icon…'
//             (홑따옴표·쌍따옴표·백틱 템플릿 리터럴 전부 대상, HTML 안의 인라인
//             <script> 본문도 같은 기준으로 함께 검사)
//   - CSS   : url(/…)  (HTML 안의 인라인 <style> 본문도 함께 검사)
//   ※ '/index.html' 접두사는 console/shared.js 의 '/index.html#…' 실제 참조를 반영해
//     추가 — 하위 경로 배포 시 다른 접두사와 동일하게 깨지는 지점이라 검출 대상에 포함.
//   ※ 오탐 제외 대상: 외부 URL(`//…`·`http://`·`https://`)과 data: URI.
//
// 기준선(2026-09-07 측정, 백틱 지원 반영 후): 스캔 38개(html+js+css) 중 위반 파일 17개,
//   총 161건 — html-attr 128 · inline-script-literal 13 · meta-refresh 4 · js-literal 16 · css-url 0.
//   (이 앱에는 백틱만 쓴 절대경로 리터럴이 없어 수치 변동 없음 — normal 쪽에서 신규 검출 확인)
//
// node:test 만 사용, 의존성 추가 없음.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

const EXCLUDE_DIRS = new Set(['node_modules', 'docs', '.git']);

const COMMENT_RE = /<!--[\s\S]*?-->/g;
const SCRIPT_TAG_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const STYLE_TAG_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const ATTR_RE = /\b(?:src|href)\s*=\s*(["'])(\/[^"'>]*)\1/gi;
const META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi;
const META_URL_RE = /url\s*=\s*(\/[^"'\s>]*)/i;
// JS 문자열 리터럴 안의 앱 루트 절대경로 — 홑따옴표·쌍따옴표·백틱(템플릿 리터럴) 전부 대상.
// 접두사 뒤에 '/'·'.'로 이어지거나 그대로 끝나는 형태 인식.
const JS_LITERAL_RE =
  /(["'`])(\/(?:console|stages|platform|shared|modules)(?:[/.][^"'`]*)?|\/entry\.html[^"'`]*|\/index\.html[^"'`]*|\/favicon[^"'`]*|\/apple-touch-icon[^"'`]*)\1/g;
const CSS_URL_RE = /url\(\s*(["']?)(\/[^"')]*)\1\s*\)/gi;

/** 디렉터리 재귀 순회 — 확장자가 일치하는 파일의 절대경로 목록 반환 */
function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), exts, out);
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** 0-index 문자 위치를 1-index 줄 번호로 변환 */
function lineAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

/** HTML 주석 내부 텍스트 공백 치환 (줄바꿈 보존, 줄 번호 오프셋 유지) */
function stripComments(content) {
  return content.replace(COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '));
}

/** 태그 본문(스타일·스크립트) 구간을 공백으로 치환한 사본 반환 (속성 스캔 전용) */
function maskBodies(content, tagRe) {
  let masked = content;
  for (const m of content.matchAll(tagRe)) {
    const body = m[1];
    if (!body) continue;
    const start = content.indexOf(body, m.index);
    const blank = body.replace(/[^\n]/g, ' ');
    masked = masked.slice(0, start) + blank + masked.slice(start + body.length);
  }
  return masked;
}

/** 외부 URL(프로토콜 상대·http(s)·data:)인지 판별 */
function isExternal(val) {
  return val.startsWith('//') || val.startsWith('data:');
}

/** HTML 파일 검사 — 속성·meta refresh(태그 영역) + 인라인 script/style 본문(JS·CSS 리터럴) */
function checkHtml(rawContent) {
  const violations = [];
  const content = stripComments(rawContent);

  // 속성 스캔은 <script>/<style> 본문을 가려서, 본문 안 JS 대입문(`.src = "/…"`)의
  // 이중 검출 차단 (본문 쪽은 아래에서 JS_LITERAL_RE 로 별도 검사).
  const attrScanContent = maskBodies(maskBodies(content, SCRIPT_TAG_RE), STYLE_TAG_RE);

  for (const m of attrScanContent.matchAll(ATTR_RE)) {
    const val = m[2];
    if (isExternal(val)) continue;
    violations.push({ line: lineAt(content, m.index), kind: 'html-attr', match: m[0] });
  }

  for (const m of attrScanContent.matchAll(META_REFRESH_RE)) {
    const um = META_URL_RE.exec(m[0]);
    if (um && !isExternal(um[1])) {
      violations.push({ line: lineAt(content, m.index), kind: 'meta-refresh', match: um[0] });
    }
  }

  for (const sm of content.matchAll(SCRIPT_TAG_RE)) {
    const body = sm[1] || '';
    const bodyStart = content.indexOf(body, sm.index);
    for (const jm of body.matchAll(JS_LITERAL_RE)) {
      if (isExternal(jm[2])) continue;
      const abs = bodyStart + jm.index;
      violations.push({ line: lineAt(content, abs), kind: 'inline-script-literal', match: jm[0] });
    }
  }

  for (const sm of content.matchAll(STYLE_TAG_RE)) {
    const body = sm[1] || '';
    const bodyStart = content.indexOf(body, sm.index);
    for (const cm of body.matchAll(CSS_URL_RE)) {
      if (isExternal(cm[2])) continue;
      const abs = bodyStart + cm.index;
      violations.push({ line: lineAt(content, abs), kind: 'inline-style-url', match: cm[0] });
    }
  }

  return violations.sort((a, b) => a.line - b.line);
}

/** JS 파일 검사 — 문자열 리터럴 */
function checkJs(rawContent) {
  const content = stripComments(rawContent);
  const violations = [];
  for (const m of content.matchAll(JS_LITERAL_RE)) {
    if (isExternal(m[2])) continue;
    violations.push({ line: lineAt(content, m.index), kind: 'js-literal', match: m[0] });
  }
  return violations.sort((a, b) => a.line - b.line);
}

/** CSS 파일 검사 — url() */
function checkCss(rawContent) {
  const violations = [];
  for (const m of rawContent.matchAll(CSS_URL_RE)) {
    if (isExternal(m[2])) continue;
    violations.push({ line: lineAt(rawContent, m.index), kind: 'css-url', match: m[0] });
  }
  return violations.sort((a, b) => a.line - b.line);
}

test('HTML/JS/CSS 에 도메인 루트 절대경로 참조가 없어야 한다', () => {
  const files = [
    ...walk(APP_ROOT, ['.html']).map((f) => ({ file: f, kind: 'html' })),
    ...walk(APP_ROOT, ['.js']).map((f) => ({ file: f, kind: 'js' })),
    ...walk(APP_ROOT, ['.css']).map((f) => ({ file: f, kind: 'css' })),
  ];

  const fileReports = [];
  let total = 0;
  const byKind = {};

  for (const { file, kind } of files) {
    const content = fs.readFileSync(file, 'utf8');
    const violations =
      kind === 'html' ? checkHtml(content) : kind === 'js' ? checkJs(content) : checkCss(content);
    if (violations.length === 0) continue;

    const rel = path.relative(APP_ROOT, file).split(path.sep).join('/');
    fileReports.push({ rel, violations });
    total += violations.length;
    for (const v of violations) byKind[v.kind] = (byKind[v.kind] || 0) + 1;
  }

  const summary = `[no-abs-path] 스캔 ${files.length}개 · 위반 파일 ${fileReports.length}개 · 총 ${total}건 · 유형별 ${JSON.stringify(byKind)}`;
  console.log(summary);
  for (const { rel, violations } of fileReports) {
    console.log(`  ${rel}`);
    for (const v of violations) {
      console.log(`    - ${v.kind} @ line ${v.line} :: ${v.match}`);
    }
  }

  const detail = fileReports
    .map(
      ({ rel, violations }) =>
        `  ${rel}\n${violations.map((v) => `    - ${v.kind} @ line ${v.line} :: ${v.match}`).join('\n')}`
    )
    .join('\n');

  assert.equal(total, 0, `${summary}\n${detail}`);
});
