/* 미션 칩 선택 테스트 */
/* - sessionStorage.vision_imagelab_mission 연동 확인 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

const chips = (doc) => [...doc.querySelectorAll("#lab-scenarios .lab-sc")];
const chip = (doc, key) =>
  doc.querySelector(`#lab-scenarios .lab-sc[data-k="${key}"]`);
const onKeys = (doc) =>
  chips(doc)
    .filter((b) => b.classList.contains("on"))
    .map((b) => b.dataset.k);
const items = (doc) => [...doc.querySelectorAll("#class-list .class-item")];
const ids = (doc) => items(doc).map((el) => el.dataset.id);
const names = (doc) =>
  items(doc).map((el) => el.querySelector(".class-name").value);
const shots = (doc) =>
  items(doc).map((el) => el.querySelector(".class-count").textContent);
/* 다이얼로그 처리 비동기 대기 */
const tick = () => new Promise((r) => setTimeout(r, 0));

test("처음에는 아무 미션도 선택돼 있지 않다", async () => {
  const { doc } = await loadApp();
  assert.ok(chips(doc).length >= 5, "미션 칩이 렌더되지 않았다");
  assert.deepEqual(onKeys(doc), [], "고르지도 않은 미션이 선택돼 있다");
  assert.equal(chip(doc, "rps").getAttribute("aria-pressed"), "false");
});

test("미션을 누르면 그 칩만 선택 표시가 서고 힌트가 뜬다", async () => {
  const { doc } = await loadApp();
  chip(doc, "recycle").click();

  assert.deepEqual(
    onKeys(doc),
    ["recycle"],
    "선택 표시가 한 칩에만 서지 않았다",
  );
  assert.equal(chip(doc, "recycle").getAttribute("aria-pressed"), "true");
  assert.match(
    doc.getElementById("lab-sctip").textContent,
    /쓰레기를/,
    "미션 힌트가 안 떴다",
  );
  /* 클래스도 그 미션 구성으로 바뀐다 (기존 동작 유지) */
  const names = [
    ...doc.querySelectorAll("#class-list .class-item .class-name"),
  ].map((i) => i.value);
  assert.deepEqual(names, ["캔", "페트병", "종이"]);
});

test("다른 미션을 누르면 선택이 옮겨간다", async () => {
  const { doc } = await loadApp();
  chip(doc, "recycle").click();
  chip(doc, "mask").click();
  assert.deepEqual(onKeys(doc), ["mask"], "이전 선택이 남아 있다");
  assert.equal(chip(doc, "recycle").getAttribute("aria-pressed"), "false");
});

test("다시 그려도(hashchange) 선택 표시와 힌트가 남는다", async () => {
  const { doc, window: win } = await loadApp();
  chip(doc, "thumb").click();
  assert.deepEqual(onKeys(doc), ["thumb"]);

  win.dispatchEvent(new win.HashChangeEvent("hashchange"));
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(onKeys(doc), ["thumb"], "다시 그린 뒤 선택 표시가 사라졌다");
  assert.equal(chip(doc, "thumb").getAttribute("aria-pressed"), "true");
  assert.match(
    doc.getElementById("lab-sctip").textContent,
    /손 모양을/,
    "다시 그린 뒤 힌트가 사라졌다",
  );
});

test("사진을 모은 뒤 미션 변경을 취소하면 이전 선택이 그대로다", async () => {
  const { doc, window: win } = await loadApp();
  chip(doc, "rps").click();
  await tick();
  assert.deepEqual(onKeys(doc), ["rps"]);

  /* 사진을 모은 상태를 만든다 → 미션을 바꾸려면 확인을 받는다 */
  doc.querySelector("#class-list .class-item .class-count").textContent = "12";
  win.confirm = () => {
    throw new Error("네이티브 confirm 이 떴다 — 앱 확인창을 써야 한다");
  };
  chip(doc, "mask").click();

  /* 네이티브 창이 아니라 앱 모달로 묻는다 */
  const dlg = doc.querySelector(".vd-ov.on");
  assert.ok(dlg, "앱 확인창이 뜨지 않았다");
  assert.match(dlg.textContent, /마스크 썼나요\?' 주제로 새로 시작할까요\?/);
  /* 무엇을 잃는지 먼저 보여 준다 — 사진이 지워지는 일은 되돌릴 수 없다 */
  assert.match(dlg.textContent, /사진이 모두 지워지고/);
  assert.match(
    dlg.querySelector(".vd-list").textContent,
    /가위 12장/,
    "지워질 사진을 알려주지 않았다",
  );

  dlg.querySelector('[data-v="0"]').click(); /* 학생이 취소 */
  await tick();

  assert.equal(
    doc.querySelector(".vd-ov.on"),
    null,
    "취소했는데 확인창이 남았다",
  );
  assert.deepEqual(onKeys(doc), ["rps"], "취소했는데 선택이 옮겨갔다");
  assert.equal(
    win.sessionStorage.getItem("vision_imagelab_mission"),
    "rps",
    "취소했는데 미션이 바뀌었다",
  );
});

test("사진을 모은 뒤 확인하면 그 주제로 바뀐다", async () => {
  const { doc, window: win } = await loadApp();
  chip(doc, "rps").click();
  await tick();
  doc.querySelector("#class-list .class-item .class-count").textContent = "12";

  chip(doc, "mask").click();
  doc.querySelector('.vd-ov.on [data-v="1"]').click();
  await tick();

  assert.deepEqual(onKeys(doc), ["mask"], "확인했는데 선택이 안 옮겨갔다");
  assert.equal(win.sessionStorage.getItem("vision_imagelab_mission"), "mask");
});

/* 미션 변경 시 이전 미션 사진 초기화 확인 (id 재생성 체크) */
test("미션을 바꾸면 모은 사진이 따라오지 않는다 — 클래스 개수가 같아도", async () => {
  const { doc } = await loadApp();
  chip(doc, "rps").click();
  await tick();
  const before = ids(doc);
  assert.deepEqual(names(doc), ["가위", "바위", "보"]);

  /* 사진을 모은 상태로 만들고, 클래스 개수가 같은 미션(3 → 3)으로 바꾼다 */
  doc.querySelector("#class-list .class-item .class-count").textContent = "12";
  chip(doc, "recycle").click();
  doc.querySelector('.vd-ov.on [data-v="1"]').click();
  await tick();

  assert.deepEqual(names(doc), ["캔", "페트병", "종이"]);
  assert.deepEqual(
    shots(doc),
    ["0", "0", "0"],
    "새 미션인데 이전 사진 장수가 남아 있다",
  );
  assert.equal(
    ids(doc).some((id) => before.includes(id)),
    false,
    "이전 미션의 클래스가 그대로다 — 거기 붙은 사진도 따라온다",
  );
});

test("미션을 바꾸면 학습도 풀린다 (다른 주제 사진으로 만든 모델이 남지 않게)", async () => {
  const { doc } = await loadApp();
  chip(doc, "rps").click();
  await tick();
  doc.querySelector("#class-list .class-item .class-count").textContent = "12";

  chip(doc, "mask").click();
  doc.querySelector('.vd-ov.on [data-v="1"]').click();
  await tick();

  assert.ok(
    doc.getElementById("infer-toggle").disabled,
    "미션을 바꿨는데 추론이 열려 있다",
  );
});

test("선택 표시는 hover 와 구별된다 (테두리 위에 링을 얹는다)", async () => {
  const { doc, window: win } = await loadApp();
  chip(doc, "recycle").click();
  const st = win.getComputedStyle(chip(doc, "recycle"));
  /* :hover 도 border-color 를 accent 로 바꾸므로, 선택은 inset 링 + 배경으로 구분한다 */
  assert.match(
    st.boxShadow,
    /inset/,
    "선택 칩에 inset 링이 없다 — hover 와 구별되지 않는다",
  );
  assert.notEqual(st.backgroundColor, "", "선택 칩에 배경 강조가 없다");
});
