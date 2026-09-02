// HTML 자산 참조 경로 검증
// - 파일을 폴더 사이로 옮기면 href/src 가 조용히 404 나는 사고를 잡는다
//   (a4f3bbf 에서 stages/ 를 하위 폴더로 재편할 때 5개 파일 15건이 실제로 깨졌다)
// - 브라우저가 실제로 해석하는 방식 그대로 검사한다
//   · "/..."  → 사이트 루트(= 저장소 루트) 기준
//   · 그 외   → 그 HTML 이 있는 폴더 기준
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "models"]);

/* 저장소 안의 파일을 확장자로 수집 */
const filesWithExt = (ext, dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesWithExt(ext, path, out);
    else if (name.endsWith(ext)) out.push(path);
  }
  return out;
};
const htmlFiles = (dir, out = []) => filesWithExt(".html", dir, out);

const REF = /(?:href|src)\s*=\s*"([^"]+)"/g;
// 파일을 가리키지 않는 참조 (외부 URL·인라인 데이터·앵커)
const EXTERNAL = /^(https?:|data:|blob:|mailto:|about:|javascript:|#|\/\/)/i;

/* 이 참조가 로컬 파일을 가리키는가 */
const isLocalRef = (ref) =>
  !EXTERNAL.test(ref) &&
  // 스크립트가 문자열로 조립하는 경로는 정적 검사 대상이 아니다 (예: `<img src="${u}">`)
  !ref.includes("${") &&
  !ref.includes("{{") &&
  ref.split(/[?#]/)[0] !== "";

/* 브라우저와 같은 방식으로 실제 경로를 구한다 */
const resolveRef = (htmlPath, ref) => {
  const clean = ref.split(/[?#]/)[0];
  return clean.startsWith("/")
    ? join(ROOT, clean)
    : resolve(dirname(htmlPath), clean);
};

const pages = htmlFiles(ROOT);

test("저장소에서 HTML 을 찾을 수 있다", () => {
  assert.ok(pages.length > 0, "검사할 HTML 이 한 개도 없다");
});

test("모든 HTML 의 href/src 가 실재하는 파일을 가리킨다", () => {
  const broken = [];
  let checked = 0;

  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    for (const [, ref] of html.matchAll(REF)) {
      if (!isLocalRef(ref)) continue;
      checked++;
      if (existsSync(resolveRef(page, ref))) continue;
      broken.push(
        `  ${relative(ROOT, page).split(sep).join("/")}  ->  ${ref}`,
      );
    }
  }

  assert.ok(checked > 0, "로컬 참조를 하나도 찾지 못했다 (정규식이 깨졌다)");
  assert.deepEqual(
    broken,
    [],
    `가리키는 파일이 없는 참조 ${broken.length}건:\n${broken.join("\n")}`,
  );
});

/* JS 안의 이동 경로도 같은 사고를 낸다.
   console/shared.js 의 TRACKS[].href 5건이 stages/ 재편 뒤 404 인 채로 남아 있었다.
   HTML 속성만 보는 위 검사로는 잡히지 않아 별도로 본다. */
const JS_REF = /['"](\/(?:stages|console|platform|modules)\/[^'"?#]+\.(?:html|js|css))['"]/g;
// 주석 속 사용법 안내는 실행되지 않으므로 검사 대상이 아니다
const isComment = (line) => /^\s*(\/\/|\/\*|\*|║)/.test(line);

test("JS 가 문자열로 들고 있는 사이트 절대경로가 실재한다", () => {
  const scripts = filesWithExt(".js", ROOT).filter(
    (p) => !relative(ROOT, p).startsWith("test" + sep),
  );
  const broken = [];
  let checked = 0;

  for (const file of scripts) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (isComment(line)) continue;
      for (const [, ref] of line.matchAll(JS_REF)) {
        checked++;
        if (existsSync(join(ROOT, ref))) continue;
        broken.push(
          `  ${relative(ROOT, file).split(sep).join("/")}  ->  ${ref}`,
        );
      }
    }
  }

  assert.ok(checked > 0, "JS 에서 절대경로를 하나도 찾지 못했다 (정규식이 깨졌다)");
  assert.deepEqual(
    broken,
    [],
    `가리키는 파일이 없는 경로 ${broken.length}건:\n${broken.join("\n")}`,
  );
});

/* 재편으로 사라진 옛 경로가 되살아나지 않도록 못을 박는다 */
test("stages/ 최상단에 남아 있던 옛 평면 경로를 참조하지 않는다", () => {
  const GONE = [
    "/stages/icons.js",
    "/stages/session.js",
    "/stages/cert.js",
    "/stages/admin.js",
    "/stages/board.js",
    "/stages/maker.js",
    "/stages/imagelab.js",
    "/stages/studio.js",
    "/stages/studio-common.js",
    "/stages/tokens.css",
    "/stages/trainer.css",
    "/stages/stage.css",
  ];
  const hits = [];

  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    for (const old of GONE) {
      if (html.includes(`"${old}"`))
        hits.push(`  ${relative(ROOT, page).split(sep).join("/")}  ->  ${old}`);
    }
  }

  assert.deepEqual(
    hits,
    [],
    `재편 전 경로가 남아 있다 ${hits.length}건:\n${hits.join("\n")}`,
  );
});
