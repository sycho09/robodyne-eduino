/* 무료/유료 접근 제어 — Phase 2 (비전 제작 트랙 3종) 검증
   기준서: docs/access-policy.md 2장 · 구현: shared/access.js + stages/

   기존 test/load-app.mjs 하니스를 그대로 쓴다 — 루트 index.html 을 실제 스크립트와 함께
   띄우고 tf·mobilenet·pose-detection 등만 스텁한다. 접근 제어가 실제 트레이너·스튜디오
   코드 위에서 성립하는지를 본다.

   창은 반드시 닫는다 — imagelab.js 가 1.3초 간격 타이머를 돌리므로 닫지 않으면
   테스트가 쌓일수록 느려지다 멈춘다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

/* 세 트랙은 id 접두사만 다르다 — 구현과 같은 규약으로 검사한다 */
const TRACKS = [
  { name: "이미지 분류", pfx: "", panel: "panel-direct", track: "image" },
  { name: "동작 분류", pfx: "p-", panel: "sub-pose", track: "pose" },
  { name: "음성 분류", pfx: "a-", panel: "sub-audio", track: "audio" },
];

/* 기준서 2-2 · 2-3 · 2-4 의 프리셋 접근 표 */
const PRESETS = {
  image: { free: ["mask", "thumb"], paid: ["recycle", "rps", "custom"] },
  pose: { free: ["pose-arm", "pose-sit"], paid: ["pose-custom"] },
  audio: { free: ["audio-onoff", "audio-updown"], paid: ["audio-custom"] },
};

/* 창을 반드시 닫는 실행 껍데기 */
async function withApp(opts, fn) {
  const app = await loadApp(opts);
  try {
    return await fn(app);
  } finally {
    app.window.close();
  }
}

const badgeIn = (el) => el && el.querySelector(".ax-badge");
const click = (win, el) =>
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
/* 캡처 차단이 원본 핸들러까지 막는지 보려면 원본과 같은 자리(버블)에 붙여 본다 */
const clickWithSpy = (win, el) => {
  let ran = false;
  el.addEventListener("click", () => { ran = true; });
  click(win, el);
  return ran;
};
/* 트랙 탭을 바꾸고 프리셋 행을 다시 그린다 */
const switchTo = (doc, win, panel) => {
  doc.querySelectorAll("#panel-direct, #sub-pose, #sub-audio")
    .forEach((el) => el.classList.remove("active"));
  doc.getElementById(panel).classList.add("active");
  win.ImageLab.renderScenarios();
};

/* ── 파이프라인 완주 (기준서 4장: 무료로 진행 불능 지점이 없어야 한다) ── */
test("무료: 세 트랙 모두 클래스 2개로 파이프라인이 막히지 않는다", () =>
  withApp({}, ({ doc }) => {
    for (const t of TRACKS) {
      const list = doc.getElementById(t.pfx + "class-list");
      assert.ok(list, `${t.name}: 클래스 목록이 없다`);
      assert.equal(
        list.querySelectorAll(".class-item").length, 2,
        `${t.name}: 무료 기본 클래스가 2개가 아니다`,
      );
      /* 학습·추론 버튼이 잠기면 완주할 수 없다 (기준서 2-1: 추론·평가는 무료) */
      for (const id of ["train", "infer-toggle"]) {
        const btn = doc.getElementById(t.pfx + id);
        if (btn) assert.equal(badgeIn(btn), null, `${t.name}: ${id} 이 잠겼다`);
      }
    }
  }));

/* ── 클래스 수 상한 (기준서 2-1 · 2-5) ── */
test("무료: 클래스 2개에 닿으면 추가 버튼이 잠금으로 바뀐다", () =>
  withApp({}, ({ doc, window: win }) => {
    for (const t of TRACKS) {
      const add = doc.getElementById(t.pfx + "add-class");
      assert.ok(badgeIn(add), `${t.name}: 잠금 표시가 없다`);
      /* 숨기지도 죽이지도 않는다 — 눌러서 이유를 읽을 수 있어야 한다 */
      assert.equal(add.hidden, false, `${t.name}: 추가 버튼이 숨겨졌다`);
      assert.equal(add.disabled, false, `${t.name}: 눌러도 이유를 알 수 없다`);
      assert.equal(clickWithSpy(win, add), false, `${t.name}: 클릭이 차단되지 않았다`);
      assert.ok(doc.querySelector(".ax-modal.on"), `${t.name}: 잠금 화면이 뜨지 않았다`);
      win.Access.close();
      assert.equal(
        doc.getElementById(t.pfx + "class-list").querySelectorAll(".class-item").length, 2,
        `${t.name}: 클래스가 늘었다`,
      );
      assert.match(
        doc.getElementById(t.pfx + "class-count-meta").textContent, /2 \/ 2/,
        `${t.name}: 개수 표기가 무료 상한을 따르지 않는다`,
      );
    }
  }));

/* ── 학습 횟수 (기준서 2-1 세부 규칙) ── */
test("무료: 학습 횟수는 기본값을 보인 채 잠긴다", () =>
  withApp({}, ({ doc, window: win }) => {
    for (const t of TRACKS) {
      const ep = doc.getElementById(t.pfx + "epochs");
      assert.ok(ep, `${t.name}: 학습 횟수 입력이 없다`);
      assert.equal(ep.hidden, false, `${t.name}: 숨겨졌다`);
      assert.ok(Number(ep.value) > 0, `${t.name}: 기본값 표시가 사라졌다`);
      assert.equal(ep.readOnly, true, `${t.name}: 값을 바꿀 수 있다`);
      assert.equal(clickWithSpy(win, ep), false, `${t.name}: 클릭이 차단되지 않았다`);
      assert.equal(
        doc.querySelector(".ax-modal .ax-lock-title").textContent.trim(), "학습 횟수 조절",
      );
      win.Access.close();
    }
  }));

/* ── 혼동행렬 · 학습곡선 (기준서 2-1) ── */
test("무료: 혼동행렬은 자리를 유지한 채 덮이고 학습곡선은 열려 있다", () =>
  withApp({}, ({ doc }) => {
    let veiled = 0;
    for (const t of TRACKS) {
      const box = doc.getElementById(t.pfx + "confusion-box");
      if (box) {
        veiled++;
        assert.equal(box.hidden, false, `${t.name}: 혼동행렬이 통째로 사라졌다`);
        assert.ok(box.querySelector(".ax-veil"), `${t.name}: 덮개가 없다`);
      }
      /* 학습곡선은 무료 — 손대지 않는다 */
      const chart = doc.getElementById(t.pfx + "train-chart-box");
      if (chart) {
        assert.equal(chart.querySelector(".ax-veil"), null, `${t.name}: 학습곡선이 덮였다`);
        assert.equal(badgeIn(chart), null, `${t.name}: 학습곡선에 잠금 표시가 붙었다`);
      }
    }
    assert.equal(veiled, 2, "혼동행렬을 가진 트랙 수가 예상과 다르다 (음성 트랙에는 없다)");
  }));

/* ── 프리셋 (기준서 2-2 · 2-3 · 2-4 · 2-5) ── */
test("무료: 세 트랙 모두 프리셋 행이 있고 유료 항목만 잠긴다", () =>
  withApp({}, ({ doc, window: win }) => {
    for (const t of TRACKS) {
      const spec = PRESETS[t.track];
      switchTo(doc, win, t.panel);
      const chips = [...doc.querySelectorAll("#lab-scenarios .lab-sc")];
      assert.deepEqual(
        chips.map((c) => c.dataset.k), spec.free.concat(spec.paid),
        `${t.name}: 프리셋 구성이 기준서와 다르다`,
      );
      for (const c of chips) {
        const paid = spec.paid.indexOf(c.dataset.k) >= 0;
        assert.equal(!!badgeIn(c), paid, `${t.name}/${c.dataset.k}: 잠금 표시가 어긋난다`);
        /* 숨기지 않고 라벨·클래스 설명을 선명하게 유지한다 */
        assert.ok(c.textContent.trim().length > 0, `${t.name}/${c.dataset.k}: 라벨이 비었다`);
      }
    }
  }));

test("무료: 유료 프리셋은 눌러도 적용되지 않고 잠금 화면이 뜬다", () =>
  withApp({}, ({ doc, window: win }) => {
    for (const t of TRACKS) {
      const spec = PRESETS[t.track];
      switchTo(doc, win, t.panel);
      const key = spec.paid[spec.paid.length - 1]; // 자유 주제
      const chip = doc.querySelector(`#lab-scenarios .lab-sc[data-k="${key}"]`);
      const names = () =>
        [...doc.querySelectorAll("#" + t.pfx + "class-list .class-name")].map((i) => i.value);
      const before = names();
      assert.equal(clickWithSpy(win, chip), false, `${t.name}: 유료 프리셋 클릭이 막히지 않았다`);
      assert.deepEqual(names(), before, `${t.name}: 유료 프리셋이 적용됐다`);
      /* 자유 주제 잠금 화면에는 가치 문구가 들어간다 (기준서 2-5) */
      const desc = doc.querySelector(".ax-modal .ax-lock-desc").textContent;
      assert.match(desc, /직접 주제를 정해 나만의 분류기 만들기/, `${t.name}: 가치 문구가 없다`);
      win.Access.close();
    }
  }));

/* ── 결과물 · 평가 · 관리 (기준서 2-1 · 2-5) ── */
test("무료: 결과물 버튼 순서가 유지되고 이미지 저장하기만 열린다", () =>
  withApp({}, ({ doc }) => {
    const area = doc.querySelector("#actionArea, [data-actions]");
    assert.ok(area, "결과물 영역이 없다");
    const btns = [...area.querySelectorAll('[data-a="mk"]')];
    assert.ok(btns.length >= 3, "결과물 버튼이 3개 미만이다");
    /* 순서를 바꾸지 않는다 — 이미지 저장하기가 마지막 자리 그대로 */
    assert.equal(btns[btns.length - 1].dataset.k, "capture", "이미지 저장하기가 마지막이 아니다");
    for (const b of btns) {
      const free = b.dataset.k === "capture";
      assert.equal(!!badgeIn(b), !free, `${b.dataset.k}: 잠금 표시가 어긋난다`);
    }
    assert.ok(badgeIn(area.querySelector(".sb-cap.bag")), "내 미션함이 잠기지 않았다");
    assert.ok(badgeIn(area.querySelector('.sb-open[data-a="send"]')), "미션 제출이 잠기지 않았다");
  }));

/* ── 사전학습 체험 패널 7종 회귀 (기준서 0장: 변경 미적용) ── */
/* 제작 트랙 3종은 두 탭에 나뉘어 있다 — 이미지는 #panel-direct,
   동작·음성은 #panel-supervised 안의 서브패널. 체험 패널은 #panel-pretrained 하나뿐이다. */
test("사전학습 체험 패널에는 잠금이 번지지 않는다", () =>
  withApp({}, ({ doc }) => {
    const basic = doc.getElementById("panel-pretrained");
    assert.ok(basic, "체험 패널을 찾지 못했다");
    const subs = [...basic.querySelectorAll(".sub-panel")];
    assert.ok(subs.length >= 6, `체험 서브패널이 ${subs.length}개뿐이다`);
    assert.equal(basic.querySelector(".ax-badge"), null, "체험 패널에 잠금 표시가 번졌다");
    assert.equal(basic.querySelector(".ax-veil"), null, "체험 패널에 덮개가 번졌다");
    assert.equal(basic.querySelector(".ax-frozen"), null, "체험 패널의 조작 요소가 잠겼다");
  }));

/* 동작·음성 트랙이 제작 탭 안에 있다는 전제 자체를 못 박아 둔다.
   구조가 바뀌면 위 회귀 검사가 조용히 무의미해지기 때문이다. */
test("제작 트랙 3종의 위치 전제가 유지된다", () =>
  withApp({}, ({ doc }) => {
    assert.ok(doc.getElementById("panel-direct"), "이미지 분류 패널이 없다");
    const sup = doc.getElementById("panel-supervised");
    assert.ok(sup && sup.querySelector("#sub-pose") && sup.querySelector("#sub-audio"),
      "동작·음성 트랙이 제작 탭 안에 있지 않다");
  }));

/* ── 상한값이 기준서와 일치하는가 ── */
test("무료 상한값은 기준서와 일치한다 (클래스 2 · 촬영 30 · 녹음 20)", () =>
  withApp({}, ({ window: win }) => {
    assert.equal(win.Access.limit("classes"), 2);
    assert.equal(win.Access.limit("shots"), 30);
    assert.equal(win.Access.limit("records"), 20);
  }));

/* ── 유료 ── */
test("유료(?plan=paid): 비전 트랙의 잠금이 모두 풀린다", () =>
  withApp({ query: "?plan=paid" }, ({ doc, window: win }) => {
    assert.equal(win.Access.plan(), "paid");
    assert.equal(doc.querySelectorAll(".ax-badge").length, 0, "유료인데 잠금 표시가 남았다");
    assert.equal(doc.querySelectorAll(".ax-veil").length, 0, "유료인데 덮개가 남았다");
    for (const t of TRACKS) {
      assert.match(
        doc.getElementById(t.pfx + "class-count-meta").textContent, /\/ 4/,
        `${t.name}: 클래스 상한이 풀리지 않았다`,
      );
      assert.equal(
        doc.getElementById(t.pfx + "epochs").readOnly, false,
        `${t.name}: 학습 횟수가 잠겨 있다`,
      );
    }
    for (const kind of ["classes", "shots", "records"]) {
      assert.equal(win.Access.limit(kind), Infinity, `${kind} 상한이 남았다`);
    }
  }));

test("새로고침 후에도 상태가 유지되고 일반 코스와 같은 출처를 본다", async () => {
  await withApp({ query: "?plan=paid" }, ({ window: win }) => {
    assert.equal(win.localStorage.getItem("eduino_plan"), "paid");
  });
  /* 쿼리 없이 다시 들어와도 같은 판정 — 저장 키는 일반 코스와 공유한다 */
  await withApp({ seed: { eduino_plan: "paid" } }, ({ doc, window: win }) => {
    assert.equal(win.Access.plan(), "paid");
    assert.equal(badgeIn(doc.getElementById("add-class")), null, "새로고침 후 잠금이 되살아났다");
  });
});
