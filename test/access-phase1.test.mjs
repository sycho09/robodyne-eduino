/* 무료/유료 접근 제어 — Phase 1 (일반 코스 5종) 검증
   기준서: docs/access-policy.md · 구현: shared/access.js + modules/shared/course-dashboard.js

   다섯 코스의 실제 index.html 마크업을 그대로 쓰고, 접근 제어에 관여하는 스크립트만 실행한다.
   (모듈 자체 app.js/advanced.js 와 CDN 모델은 검증 대상이 아니라 제거한다 — 접근 제어는
    학습 로직을 건드리지 않는 상위 레이어라는 전제 자체를 이 방식으로 함께 검증한다.) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = join(import.meta.dirname, "..");
const COURSES = ["text", "data", "life", "concept", "gesture"];
/* 남겨서 실행할 스크립트 */
const KEEP = [
  /\/shared\/access\.js$/,
  /shared\/icons\.js$/,
  /shared\/course-dashboard\.js$/,
  /course-config\.js$/,
];

const pageFor = (course) => {
  const dir = join(ROOT, "modules", course);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  return html.replace(
    /<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi,
    (_m, src) => {
      if (!KEEP.some((re) => re.test(src))) return "";
      const path = src.startsWith("/") ? join(ROOT, src) : join(dir, src);
      const code = readFileSync(path, "utf8");
      return "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>";
    },
  );
};

const load = (course, { query = "", seed } = {}) => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(pageFor(course), {
    url: `http://localhost/modules/${course}/index.html${query}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.requestAnimationFrame = () => 0;
      w.cancelAnimationFrame = () => {};
      w.scrollTo = () => {};
      /* 새로고침 후 상태 유지를 보려면 앞선 방문의 저장소를 그대로 물려줘야 한다 */
      if (seed) for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
    },
  });
  const doc = dom.window.document;
  return { dom, doc, win: dom.window, errors };
};

const tabs = (doc) => [...doc.querySelectorAll(".steps .step")];
const panelOf = (doc, tab) => doc.getElementById("panel-" + tab.dataset.step);
const badgeIn = (el) => el.querySelector(".ax-badge");
/* 캡처 단계 차단이 실제로 원본 핸들러를 막는지 보려면, 원본과 같은 자리(버블)에 붙여 본다 */
const clickWithSpy = (win, el) => {
  let ran = false;
  el.addEventListener("click", () => { ran = true; });
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  return ran;
};
/* 사전 진단 문항을 끝까지 넘겨 결과 화면까지 간다 */
const finishPreCheck = (doc, win) => {
  for (let guard = 0; guard < 60; guard++) {
    const panel = doc.querySelector("#dash-panel-0");
    const opt = panel.querySelector(".dash-ox-option, .dash-quiz-option");
    if (!opt) break;
    opt.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    const next = panel.querySelector("#dash-pf-next");
    if (!next) break;
    next.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  }
};

/* ── 무료 상태 ── */
for (const course of COURSES) {
  test(`${course} · 무료: 실습 ③ 탭만 잠금 표시된다`, () => {
    const { doc, errors } = load(course);
    assert.deepEqual(errors.map(String), [], "스크립트 오류가 났다");
    const t = tabs(doc);
    assert.equal(t.length, 3, "실습 탭이 3개가 아니다");
    assert.equal(badgeIn(t[0]), null, "실습 ① 에 잠금 표시가 붙었다");
    assert.equal(badgeIn(t[1]), null, "실습 ② 에 잠금 표시가 붙었다");
    assert.ok(badgeIn(t[2]), "실습 ③ 에 잠금 표시가 없다");
    /* 라벨은 선명하게 유지 — 숨기거나 지우지 않는다 */
    assert.ok(t[2].querySelector(".t b").textContent.trim().length > 0);
    /* 배지에는 글자를 쓰지 않는다. 뜻은 title/aria-label 로만 전한다 */
    const b = badgeIn(t[2]);
    assert.equal(b.textContent.trim(), "", "배지에 글자가 들어갔다");
    assert.equal(b.getAttribute("aria-label"), "수업용 라이선스");
    assert.equal(b.getAttribute("title"), "수업용 라이선스");
  });

  test(`${course} · 무료: 실습 ③ 탭 클릭이 차단되고 잠금 화면이 뜬다`, () => {
    const { doc, win } = load(course);
    const t = tabs(doc);
    const locked = panelOf(doc, t[2]);
    const ran = clickWithSpy(win, t[2]);
    assert.equal(ran, false, "원본 클릭 핸들러가 실행됐다");
    assert.ok(doc.querySelector(".ax-modal.on"), "잠금 화면이 뜨지 않았다");
    assert.ok(doc.querySelector(".ax-modal .ax-lock-title").textContent.trim().length > 0);
    /* 잠긴 패널은 열리지 않는다 (원본 DOM 은 그대로 두고 진입만 막는다) */
    assert.ok(locked.hidden || locked.style.display === "none", "잠긴 패널이 열렸다");
  });

  test(`${course} · 무료: 잠금 화면에 미션 산출물 미리보기가 나온다`, () => {
    const { doc, win } = load(course);
    const t = tabs(doc);
    const steps = panelOf(doc, t[2]).querySelectorAll(".flow .fstep").length;
    assert.ok(steps >= 3, "미리보기로 읽을 미션 단계가 없다");
    t[2].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    assert.equal(
      doc.querySelectorAll(".ax-modal .ax-preview-item").length,
      steps,
      "미리보기 항목 수가 미션 단계 수와 다르다",
    );
  });

  test(`${course} · 무료: 실습 ① · ② 탭은 차단되지 않는다`, () => {
    const { doc, win } = load(course);
    const t = tabs(doc);
    assert.equal(clickWithSpy(win, t[0]), true, "실습 ① 클릭이 막혔다");
    assert.equal(clickWithSpy(win, t[1]), true, "실습 ② 클릭이 막혔다");
    assert.equal(doc.querySelector(".ax-modal.on"), null, "무료 구간에서 잠금 화면이 떴다");
  });

  test(`${course} · 무료: 최종 평가는 문항을 만들지 않고 잠금 화면만 둔다`, () => {
    const { doc } = load(course);
    const panel = doc.querySelector("#dash-panel-3");
    /* 사전 진단 결과와 같은 방식 — 단계 제목은 그대로 두고 잠긴 내용은 안내 띠 + 팝업으로 */
    assert.equal(panel.querySelector(".ax-lock"), null, "잠금 화면이 제자리에 통째로 얹혔다");
    assert.ok(panel.querySelector(".dash-head h1"), "단계 제목이 사라졌다");
    assert.ok(panel.querySelector(".ax-inline"), "잠금 안내 띠가 없다");
    assert.equal(panel.querySelectorAll(".dash-quiz-option").length, 0, "평가 문항이 렌더됐다");
    assert.equal(panel.querySelector(".dash-result"), null, "평가 결과가 렌더됐다");
  });

  test(`${course} · 무료: 사이드바에 최종 평가만 잠금 표시`, () => {
    const { doc, win } = load(course);
    /* 현재 코스 아래에 펼쳐지는 4단계. (학습 현황 종합은 제품 결정으로 제거됐다) */
    const flow = [...doc.querySelectorAll("#dash-sidebar [data-goto-step]")];
    assert.equal(flow.length, 4);
    assert.equal(badgeIn(flow[0]), null, "사전 진단에 잠금 표시가 붙었다");
    assert.equal(badgeIn(flow[1]), null, "이론 학습에 잠금 표시가 붙었다");
    assert.equal(badgeIn(flow[2]), null, "실습 퀘스트에 잠금 표시가 붙었다");
    assert.ok(badgeIn(flow[3]), "최종 평가에 잠금 표시가 없다");
    /* 최종 평가는 표시만 — 눌러 들어가서 잠금 화면을 읽을 수 있어야 한다 */
    flow[3].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    assert.equal(doc.querySelector("#dash-panel-3").hidden, false, "평가 단계로 이동하지 못했다");
  });

  test(`${course} · 무료: 코스 목록에는 잠금 표시가 없다`, () => {
    const { doc } = load(course);
    const courseLinks = [...doc.querySelectorAll("#dash-sidebar a.dash-nav-item")];
    assert.ok(courseLinks.length >= 5);
    assert.deepEqual(courseLinks.filter(badgeIn), [], "코스 목록에 잠금 표시가 붙었다");
  });

  test(`${course} · 무료: 실습 ② 아래에 잔여 분량 안내가 붙는다`, () => {
    const { doc } = load(course);
    const t = tabs(doc);
    const note = panelOf(doc, t[1]).querySelector(".ax-remaining");
    assert.ok(note, "잔여 분량 안내가 없다");
    assert.match(note.textContent, /1차시 분량의 약 3분의 2/);
    assert.equal(panelOf(doc, t[0]).querySelector(".ax-remaining"), null, "실습 ① 에도 붙었다");
  });

  test(`${course} · 무료: 사전 진단은 정답 개수만 주고 분석 리포트는 잠근다`, () => {
    const { doc, win } = load(course);
    finishPreCheck(doc, win);
    const panel = doc.querySelector("#dash-panel-0");
    assert.ok(panel.querySelector(".ax-score"), "정답 개수 표시가 없다");
    assert.match(panel.querySelector(".ax-score").textContent, /맞힌 문항 \d+ \/ \d+/);
    assert.equal(panel.querySelector(".dash-precheck-report"), null, "분석 리포트가 노출됐다");
    /* 이 화면에는 무료 결과(정답 개수)와 다음 행동 버튼이 이미 있다. 잠금 화면을 통째로
       얹으면 제목과 빨간 버튼이 두 벌이 되므로 한 줄 안내 띠만 두고 자세한 내용은 모달로 뺀다. */
    assert.equal(panel.querySelector(".ax-lock"), null, "결과 화면에 잠금 화면이 통째로 얹혔다");
    const strip = panel.querySelector(".ax-inline");
    assert.ok(strip, "분석 리포트 자리에 안내 띠가 없다");
    assert.equal(panel.querySelectorAll(".btn.primary").length, 1, "빨간 버튼이 두 개 이상이다");
    /* 눌러 보면 실습 ③ 탭과 같은 모달 잠금 화면이 뜬다 */
    strip.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    const modal = doc.querySelector(".ax-modal.on");
    assert.ok(modal, "안내 띠를 눌러도 잠금 화면이 뜨지 않는다");
    assert.equal(modal.querySelector(".ax-lock-title").textContent.trim(), "개념별 취약 영역 분석");
    assert.ok(modal.querySelectorAll(".ax-preview-item").length > 0, "미리보기가 모달에 없다");
    /* 같은 분석 결과가 이론 카드로 새어 나가지 않아야 잠금이 뜻을 가진다 */
    doc.querySelector('#dash-sidebar [data-goto-step="1"]')
      .dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    const leaked = doc.querySelectorAll("#dash-panel-1 .dash-concept-tag.weak, #dash-panel-1 .dash-concept-tag.known");
    assert.equal(leaked.length, 0, "취약/스킵 표시로 분석 결과가 새어 나갔다");
    /* 이론 학습 자체는 전부 무료다 */
    assert.ok(doc.querySelectorAll("#dash-panel-1 .dash-concept-card").length > 0, "이론 카드가 없다");
  });
}

/* ── 유료 상태 ── */
for (const course of COURSES) {
  test(`${course} · 유료(?plan=paid): 전 항목이 열린다`, () => {
    const { doc, win, errors } = load(course, { query: "?plan=paid" });
    assert.deepEqual(errors.map(String), [], "스크립트 오류가 났다");
    const t = tabs(doc);
    assert.deepEqual(t.filter(badgeIn), [], "유료인데 실습 탭에 잠금 표시가 있다");
    assert.equal(clickWithSpy(win, t[2]), true, "유료인데 실습 ③ 클릭이 막혔다");
    assert.equal(doc.querySelector(".ax-modal.on"), null, "유료인데 잠금 화면이 떴다");
    assert.equal(doc.querySelector(".ax-remaining"), null, "유료인데 잔여 분량 안내가 있다");

    const flow = [...doc.querySelectorAll("#dash-sidebar [data-goto-step]")];
    assert.deepEqual(flow.filter(badgeIn), [], "유료인데 사이드바에 잠금 표시가 있다");

    const quiz = doc.querySelector("#dash-panel-3");
    assert.equal(quiz.querySelector(".ax-lock"), null, "유료인데 평가가 잠겼다");
    assert.ok(quiz.querySelectorAll(".dash-quiz-option").length >= 2, "평가 문항이 렌더되지 않았다");

    finishPreCheck(doc, win);
    const pre = doc.querySelector("#dash-panel-0");
    assert.ok(pre.querySelector(".dash-precheck-report"), "유료인데 분석 리포트가 없다");
    assert.ok(pre.querySelector(".ax-score"), "유료에서도 정답 개수는 함께 보인다");
    assert.equal(pre.querySelector(".ax-lock"), null, "유료인데 잠금 화면이 남았다");
  });
}

/* ── 상태의 단일 출처 · 새로고침 일관성 ── */
test("?plan=paid 는 단일 출처에 저장되고 새로고침 후에도 유지된다", () => {
  const first = load("text", { query: "?plan=paid" });
  assert.equal(first.win.localStorage.getItem("eduino_plan"), "paid");

  /* 쿼리 없이 다시 들어와도(=새로고침·다른 페이지 이동) 같은 판정 */
  const again = load("text", { seed: { eduino_plan: "paid" } });
  assert.deepEqual(tabs(again.doc).filter(badgeIn), [], "새로고침 후 잠금 상태가 뒤집혔다");

  /* 다른 코스도 같은 출처를 본다 */
  const other = load("gesture", { seed: { eduino_plan: "paid" } });
  assert.deepEqual(tabs(other.doc).filter(badgeIn), [], "코스 사이에서 구매 상태가 공유되지 않았다");
});

test("?plan=free 로 되돌릴 수 있다", () => {
  const { doc, win } = load("text", { query: "?plan=free", seed: { eduino_plan: "paid" } });
  assert.equal(win.localStorage.getItem("eduino_plan"), "free");
  assert.ok(badgeIn(tabs(doc)[2]), "무료로 되돌렸는데 잠기지 않았다");
});

test("코스 단품 권한(entitlements)은 그 코스만 열어 준다", () => {
  const seed = { eduino_entitlements: JSON.stringify({ text: true }) };
  assert.equal(badgeIn(tabs(load("text", { seed }).doc)[2]), null, "구매한 코스가 잠겼다");
  assert.ok(badgeIn(tabs(load("gesture", { seed }).doc)[2]), "구매하지 않은 코스가 열렸다");
});
