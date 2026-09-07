// HTML L1(타입 분리) 회귀 검출 — 인라인 <style> 또는 src 없는 <script> 본문을 찾으면 실패한다.
// 기준선(2026-09-07 측정): 위반 파일 2개, 총 4건(style 2 + script 2)
//   — platform/course.html · platform/index.html.
// 화이트리스트 없음: modules/*/index.html 7개는 이미 분리 완료 상태라 위반 0건이 정상.
//
// node:test 만 사용, 의존성 추가 없음.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

// 스캔 제외 디렉터리
const EXCLUDE_DIRS = new Set(['node_modules', 'docs', '.git']);

// 위반 판정 제외 파일 (앱 루트 기준 상대경로) — 분리 완료 확인된 파일만 등재
const WHITELIST = new Set([]);

const STYLE_TAG_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * HTML 주석 내부 텍스트를 공백으로 치환한다 (줄바꿈은 보존해 줄 번호가 밀리지 않게 함).
 * 문서 설명용 주석에 예시로 적힌 "<style>"·"<script>" 문구가 실제 태그로
 * 오검출되는 것을 막기 위함.
 */
function stripComments(content) {
  return content.replace(COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '));
}

/** 디렉터리를 재귀 순회해 확장자가 일치하는 파일의 절대경로 목록을 반환한다 */
function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), ext, out);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** 0-index 문자 위치를 1-index 줄 번호로 변환한다 */
function lineAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

/** 파일 하나를 검사해 인라인 style/script 위반 목록을 반환한다 */
function checkFile(rawContent) {
  const violations = [];
  const content = stripComments(rawContent); // 라인 오프셋 동일, 주석 텍스트만 무력화

  for (const m of content.matchAll(STYLE_TAG_RE)) {
    violations.push({ line: lineAt(content, m.index), kind: 'inline-style' });
  }

  for (const m of content.matchAll(SCRIPT_TAG_RE)) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const hasSrc = /\bsrc\s*=/.test(attrs);
    if (!hasSrc && body.trim().length > 0) {
      violations.push({ line: lineAt(content, m.index), kind: 'inline-script' });
    }
  }

  return violations.sort((a, b) => a.line - b.line);
}

test('HTML 파일에 인라인 style/script 본문이 없어야 한다', () => {
  const htmlFiles = walk(APP_ROOT, '.html');
  const fileReports = [];
  let totalViolations = 0;

  for (const file of htmlFiles) {
    const rel = path.relative(APP_ROOT, file).split(path.sep).join('/');
    if (WHITELIST.has(rel)) continue;

    const content = fs.readFileSync(file, 'utf8');
    const violations = checkFile(content);
    if (violations.length > 0) {
      totalViolations += violations.length;
      fileReports.push({ rel, violations });
    }
  }

  const summary = `[no-inline] 스캔 ${htmlFiles.length}개 · 위반 파일 ${fileReports.length}개 · 총 ${totalViolations}건`;
  console.log(summary);
  for (const { rel, violations } of fileReports) {
    console.log(`  ${rel}`);
    for (const v of violations) {
      console.log(`    - ${v.kind} @ line ${v.line}`);
    }
  }

  const detail = fileReports
    .map(({ rel, violations }) =>
      `  ${rel}\n${violations.map((v) => `    - ${v.kind} @ line ${v.line}`).join('\n')}`
    )
    .join('\n');

  assert.equal(totalViolations, 0, `${summary}\n${detail}`);
});
