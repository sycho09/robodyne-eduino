// 하위 경로 배포 회귀 검출 — .html/.js/.css 안에 도메인 루트 기준 절대경로 참조
// 존재 시 실패 처리. (전제: 이 폴더가 도메인 루트가 아닌 하위 경로에 배포될 수 있음)
//
// 검출 방식: 접두사 목록(예 '/console'·'/stages') 나열 방식은 새 폴더·새 자산
// 경로가 생길 때마다 목록에서 빠져 사각지대가 생기므로 전면 폐기. 대신 looksLikeRootPath
// 함수 하나로 "루트 기준 절대경로 형태 자체"를 판별 — 접두사와 무관하게 전부 후보로
// 잡는다(판별 조건은 함수 정의부 주석 참조).
//
// 검출 대상:
//   - HTML  : src=·href=·content=·srcset=·poster=·action=·data= 등 URL을 담는 속성의
//             값이 루트 절대경로 형태 · <meta http-equiv="refresh" content="…url=/…">
//   - JS    : 문자열 리터럴 값이 루트 절대경로 형태 (홑따옴표·쌍따옴표·백틱 템플릿
//             리터럴 전부 대상, 각 리터럴은 이스케이프까지 반영해 자기 종류의 닫는
//             따옴표까지 정확히 매치 — HTML 안의 인라인 <script> 본문도 같은
//             기준으로 함께 검사)
//   - CSS   : url(/…)  (HTML 안의 인라인 <style> 본문도 함께 검사)
//   ※ 오탐 제외 대상(패턴으로 처리, 하드코딩 목록 아님 — looksLikeRootPath 참조):
//     - 외부 URL: 프로토콜 상대(`//…`)·`http://`·`https://` — 전자는 "/" 뒤 "/"가
//       또 오는 형태로 배제, 후자 둘은 애초에 "/"로 시작하지 않아 자연히 제외.
//     - data:·blob: URI — "/"로 시작하지 않아 자연히 제외.
//     - 정규식 리터럴(예 `replace(/"/g, …)`) — 따옴표로 감싸인 형태가 아니라 자연히 제외.
//     - 순수 구분자 문자열('/' 단독) — "/" 뒤 최소 한 글자 이상 요구로 배제.
//     - 경로 의미 없는 문자열("a / b" 등) — "/"로 시작하지 않아 자연히 제외.
//     - 분수·비율 표시 문자열('/17' 등, good+'/17' 형태로 이웃 앱에 실제 존재) —
//       "/" 다음 글자가 영문자가 아니면(숫자 등) 경로로 보지 않음.
//     - 홑따옴표 문자열 안에 쌍따옴표가 섞인 SVG 마크업(예: '<path d="M…"/>') —
//       문자열 전체를 이스케이프 인지 방식으로 매치해 내장 다른 종류 따옴표를
//       여는 따옴표로 오인하지 않음.
//
// 기준선(2026-09-07 측정, 접두사 목록 폐기 반영 후): 스캔 43개(html+js+css) 중
//   위반 파일 0개, 총 0건 — 목록 밖 절대경로 잔존 없음을 확인.
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
// URL을 담을 수 있는 HTML 속성 전부 대상 — src·href 외 og:image류(content)·srcset·
// poster·action·data 포함. 값 판정(무엇을 경로로 볼지)은 looksLikeRootPath 로 일원화.
const ATTR_RE = /\b(?:src|href|content|srcset|poster|action|data)\s*=\s*(["'])([^"'>]*)\1/gi;
const META_REFRESH_RE = /<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi;
const META_URL_RE = /url\s*=\s*(\/[^"'\s>]*)/i;
// JS 문자열 리터럴 전체를 이스케이프까지 반영해 정확히 매치 — 홑따옴표·쌍따옴표·
// 백틱 각각 자기 종류의 닫는 따옴표까지만 진행한다. 예전처럼 "따옴표 3종을 전부
// 값에서 배제"하는 방식은 홑따옴표 문자열 안에 쌍따옴표 SVG 마크업이 섞인 경우
// (예: '<path d="M…"/>') 중간의 내장 쌍따옴표를 여는 따옴표로 오인해 "/><path d="
// 같은 조각을 절대경로로 오검출했다 — 실제로 이 코드베이스에 그런 아이콘 문자열이
// 존재해 접두사 목록 폐기 직후 대량 오탐으로 드러남.
const STRING_LITERAL_RE = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
const CSS_URL_RE = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;

/**
 * 값이 "도메인 루트 기준 절대경로"로 볼 수 있는 형태인지 판별.
 * - "/"로 시작 + 최소 두 글자 이상 (단독 "/" 배제)
 * - 바로 다음 글자가 "/"가 아님 (프로토콜 상대 URL "//…" 배제)
 * - 그 다음 글자가 영문자로 시작 (경로 세그먼트는 항상 이름으로 시작 —
 *   good+'/17' 같은 분수·비율 표시 문자열이 숫자로 시작하는 것과 구분하기 위함)
 * data:·blob: URI, http(s):// 는 애초에 "/"로 시작하지 않아 자연히 제외.
 */
function looksLikeRootPath(value) {
  if (!value || value[0] !== '/' || value.length < 2 || value[1] === '/') return false;
  return /[A-Za-z]/.test(value[1]);
}

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

/** HTML 파일 검사 — 속성·meta refresh(태그 영역) + 인라인 script/style 본문(JS·CSS 리터럴) */
function checkHtml(rawContent) {
  const violations = [];
  const content = stripComments(rawContent);

  // 속성 스캔은 <script>/<style> 본문을 가려서, 본문 안 JS 대입문(`.src = "/…"`)의
  // 이중 검출 차단 (본문 쪽은 아래에서 STRING_LITERAL_RE 로 별도 검사).
  const attrScanContent = maskBodies(maskBodies(content, SCRIPT_TAG_RE), STYLE_TAG_RE);

  for (const m of attrScanContent.matchAll(ATTR_RE)) {
    if (!looksLikeRootPath(m[2])) continue;
    violations.push({ line: lineAt(content, m.index), kind: 'html-attr', match: m[0] });
  }

  for (const m of attrScanContent.matchAll(META_REFRESH_RE)) {
    const um = META_URL_RE.exec(m[0]);
    if (um && looksLikeRootPath(um[1])) {
      violations.push({ line: lineAt(content, m.index), kind: 'meta-refresh', match: um[0] });
    }
  }

  for (const sm of content.matchAll(SCRIPT_TAG_RE)) {
    const body = sm[1] || '';
    const bodyStart = content.indexOf(body, sm.index);
    for (const jm of body.matchAll(STRING_LITERAL_RE)) {
      const inner = jm[0].slice(1, -1);
      if (!looksLikeRootPath(inner)) continue;
      const abs = bodyStart + jm.index;
      violations.push({ line: lineAt(content, abs), kind: 'inline-script-literal', match: jm[0] });
    }
  }

  for (const sm of content.matchAll(STYLE_TAG_RE)) {
    const body = sm[1] || '';
    const bodyStart = content.indexOf(body, sm.index);
    for (const cm of body.matchAll(CSS_URL_RE)) {
      if (!looksLikeRootPath(cm[2])) continue;
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
  for (const m of content.matchAll(STRING_LITERAL_RE)) {
    const inner = m[0].slice(1, -1);
    if (!looksLikeRootPath(inner)) continue;
    violations.push({ line: lineAt(content, m.index), kind: 'js-literal', match: m[0] });
  }
  return violations.sort((a, b) => a.line - b.line);
}

/** CSS 파일 검사 — url() */
function checkCss(rawContent) {
  const violations = [];
  for (const m of rawContent.matchAll(CSS_URL_RE)) {
    if (!looksLikeRootPath(m[2])) continue;
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
