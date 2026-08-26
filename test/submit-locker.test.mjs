/* 미션 제출 UI (3가지 모드 공통) 통합 흐름 테스트 */
/* - vision_submissions 병합, 미션 뷰 상태 확인 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./load-app.mjs";

/* 이 파일은 결과물 만들기·미션함·제출의 동작을 본다. 이 기능들은 무료 구간에서 잠기므로
   (docs/access-policy.md 2-1), 접근 제어를 열어 두고 기능 자체만 확인한다.
   무료 쪽 잠금은 test/access-phase2.test.mjs 가 따로 본다. */
const PAID = { query: "?plan=paid" };

function setPhase(doc, phase, { name = "클래스 1", pct = 92 } = {}) {
  const tp = doc.querySelector("#top-pred .tp-name");
  const donut = doc.getElementById("top-donut-pct");
  tp.textContent =
    phase === "untrained"
      ? "아직 학습 전"
      : phase === "trained"
        ? "대기 중"
        : name;
  if (donut) donut.textContent = phase === "live" ? pct + "%" : "0%";
}
const asFree = (win) => win.Session.setMode({ mode: "free" });
const asClass = (win) =>
  win.Session.setMode({
    mode: "class",
    code: "AB12CD",
    name: "3학년 1반",
    student: "김에듀",
  });
const asTeach = (win) =>
  win.Session.setMode({ mode: "teach", code: "TE55CH", name: "5학년 2반" });
/* 현재 미션 (세션 키 설정) */
const setMission = (win, key) =>
  win.sessionStorage.setItem("vision_imagelab_mission", key);

const makeBtns = (doc, area = "#actionArea") => [
  ...doc.querySelectorAll(area + " .sb-grid .sb-b"),
];
const makeBtn = (doc, k) =>
  doc.querySelector(`#actionArea .sb-b[data-k="${k}"]`);
const bag = (doc) =>
  [...doc.querySelectorAll("#actionArea .sb-i")].map((x) => x.dataset.k);
const bagKeys = (doc) =>
  [...doc.querySelectorAll("#actionArea .sb-i")].map((x) => x.dataset.key);
const bagFrom = (doc) =>
  [...doc.querySelectorAll("#actionArea .sb-i .t small")].map(
    (x) => x.textContent,
  );
const bagRow = (doc, key) =>
  doc.querySelector(`#actionArea .sb-i[data-key="${key}"]`);
const bagCount = (doc) =>
  (doc.querySelector("#actionArea .sb-cap.bag .n") || {}).textContent || null;
const sendBtn = (doc) => doc.querySelector("#actionArea .sb-open");
const altBtn = (doc) => doc.querySelector("#actionArea .sb-alt");
const note = (doc) => doc.querySelector("#actionArea .sb-open-note");
const subs = (win) =>
  JSON.parse(win.localStorage.getItem("vision_submissions") || "[]");

/* data:URL 비동기 처리 대기용 */
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}
const add = async (win, k, t) => {
  const n = win.Locker.count();
  await win.Locker.add(k, { title: t, img: "data:image/png;base64," + k });
  return waitFor(() => win.Locker.count() === n + 1);
};
/* 제출 처리 및 학생명 입력 */
async function submit(doc, win, name = "김에듀") {
  const before = subs(win).length;
  sendBtn(doc).click();
  doc.getElementById("sName").value = name;
  doc.getElementById("sGo").click();
  return waitFor(() => subs(win).length === before + 1);
}

/* ══ 모드 분기 점검 ══ */

test("세 모드가 같은 화면을 쓴다 — 수업 개설에만 미션 생성 버튼이 하나 더", async () => {
  const { doc, window: win } = await loadApp(PAID);
  setPhase(doc, "live");

  for (const [label, as] of [
    ["체험", asFree],
    ["수업 참여", asClass],
    ["수업 개설", asTeach],
  ]) {
    as(win);
    win.Submit.refresh();
    assert.deepEqual(
      makeBtns(doc).map((x) => x.dataset.k),
      ["maker", "idea", "character", "capture"],
      `${label}에 결과물 만들기 4버튼이 없다`,
    );
    assert.ok(
      doc.querySelector("#actionArea .sb-bag"),
      `${label}에 내 미션함이 없다`,
    );
    assert.match(
      sendBtn(doc).textContent,
      /미션 제출하기/,
      `${label}에 미션 제출하기가 없다`,
    );
  }

  /* 교사 모드 분기 확인 */
  asTeach(win);
  win.Submit.refresh();
  assert.match(
    altBtn(doc).textContent,
    /클래스 미션 생성/,
    "교사 화면에 미션 생성 버튼이 없다",
  );
  for (const as of [asFree, asClass]) {
    as(win);
    win.Submit.refresh();
    assert.equal(
      altBtn(doc),
      null,
      "교사가 아닌데 클래스 미션 생성 버튼이 떴다",
    );
  }
});

/* 진입 버튼 마크업 삭제 상태 검증 */
test("죽은 진입 버튼 마크업이 문서에 남아 있지 않다", async () => {
  const { doc } = await loadApp(PAID);
  assert.equal(
    doc.querySelectorAll("[data-maker]").length,
    0,
    "작품 만들기 진입 버튼 마크업이 남았다",
  );
  assert.equal(
    doc.querySelectorAll("[data-studio]").length,
    0,
    "상상보드·캐릭터 카드 마크업이 남았다",
  );
  assert.equal(doc.getElementById("makerBtn"), null);
});

test("상단 '내 현황' 버튼은 세 모드 공통 (교사만 '게시판')", async () => {
  const { doc, window: win } = await loadApp(PAID);
  const board = doc.getElementById("boardBtn");
  for (const [label, as] of [
    ["체험", asFree],
    ["수업 참여", asClass],
  ]) {
    as(win);
    win.Submit.refresh();
    assert.notEqual(
      board.style.display,
      "none",
      `${label}에 내 현황 버튼이 없다`,
    );
    assert.match(board.textContent, /내 현황/);
  }
  asTeach(win);
  win.Submit.refresh();
  assert.notEqual(board.style.display, "none");
  assert.match(board.textContent, /게시판/, "교사에게는 평가 게시판이다");
});

/* ══════════════ 제출은 한 곳으로 ══════════════ */

/* 통합 제출 레코드 (vision_submissions) 포맷 검증 */
test("세 모드 제출이 모두 vision_submissions 로 모인다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  setPhase(doc, "live");

  for (const [label, as] of [
    ["체험", asFree],
    ["수업 참여", asClass],
    ["수업 개설", asTeach],
  ]) {
    as(win);
    win.Submit.refresh();
    await add(win, "idea", "상상보드");
    assert.ok(await submit(doc, win, label), `${label} 제출이 안 쌓였다`);
    assert.equal(win.Locker.count(), 0, `${label} 제출 후 미션함이 안 비었다`);
  }

  assert.equal(subs(win).length, 3, "세 모드의 제출이 한 곳에 모이지 않았다");
  assert.equal(
    win.localStorage.getItem("vision_assignments"),
    null,
    "폐기한 저장소가 다시 생겼다",
  );
});

test("제출 레코드는 게시판이 읽는 모양 그대로 (기존 필드 유지 · items 만 덧붙임)", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asClass(win);
  setPhase(doc, "live");
  win.Submit.refresh();
  await add(win, "idea", "상상보드");
  await add(win, "maker", "작품");

  sendBtn(doc).click();
  assert.equal(
    doc.getElementById("sName").value,
    "김에듀",
    "수업에서 받은 이름이 안 채워졌다",
  );
  assert.match(
    doc.querySelector("#subCard .sub-chips").textContent,
    /상상보드/,
    "무엇을 내는지 안 보여 준다",
  );
  doc.getElementById("sGo").click();
  assert.ok(await waitFor(() => subs(win).length === 1));

  const [rec] = subs(win);
  assert.equal(rec.summary.length, 2, "게시판 칩이 될 summary 가 비었다");
  assert.match(rec.summary[0], /상상보드/);
  assert.match(
    rec.img || "",
    /^data:image/,
    "게시판 썸네일은 dataURL 이어야 그려진다",
  );
  assert.equal(rec.classCode, "AB12CD");
  assert.equal(rec.status, "제출됨");
  assert.equal(rec.score, null);
  assert.equal(rec.feedback, "");
  /* items 필드 내 메타데이터 포함 확인 */
  assert.deepEqual(
    rec.items.map((i) => i.kind),
    ["idea", "maker"],
  );
});

/* ══════════════ 미션함은 서랍 하나 ══════════════ */

test("미션함은 하나 — 모드를 오가도 담은 것이 그대로다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  await add(win, "idea", "상상보드");
  assert.deepEqual(bag(doc), ["idea"]);

  asClass(win);
  win.Submit.refresh();
  assert.deepEqual(bag(doc), ["idea"], "모드를 바꿨다고 담은 것이 사라졌다");
  assert.equal(sendBtn(doc).disabled, false);

  asTeach(win);
  win.Submit.refresh();
  assert.deepEqual(bag(doc), ["idea"]);
});

/* 미션/종류별 결과물 개별 저장 확인 */
test("다른 미션에서 같은 종류를 또 만들면 줄이 따로 남고 이름으로 갈린다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");

  setMission(win, "rps");
  await add(win, "idea", "상상보드");
  setMission(win, "recycle");
  await add(win, "idea", "상상보드");
  win.Submit.refresh();

  assert.deepEqual(
    bag(doc),
    ["idea", "idea"],
    "다른 미션의 결과물이 덮어써졌다",
  );
  assert.deepEqual(bagKeys(doc), ["idea@rps", "idea@recycle"]);
  assert.deepEqual(
    bagFrom(doc),
    ["가위바위보", "분리수거 분류기"],
    "어디서 만든 건지 안 보인다",
  );
  assert.equal(bagCount(doc), "2개");

  /* 동일 미션 내 재작성 시 덮어쓰기 */
  await add(win, "idea", "상상보드");
  win.Submit.refresh();
  assert.equal(bag(doc).length, 2, "같은 미션에서 다시 만들었는데 줄이 늘었다");
});

test("미션함은 지금 보고 있는 트랙의 결과물만 담는다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");

  setMission(win, "rps");
  await add(win, "idea", "상상보드");
  /* 다른 트랙(음성)에서 만든 결과물도 미션함에 들어 있는 상태로 둔다 */
  await win.Locker.add(
    "character",
    { title: "캐릭터 카드", img: "data:image/png;base64,c" },
    "audio",
  );
  await waitFor(() => win.Locker.count() === 2);
  win.Submit.refresh();

  /* 지금 화면은 이미지 트랙이므로 음성 결과물은 여기 섞이지 않는다.
     트랙을 가로질러 모아 보는 자리는 제출 뒤의 '내 제출 현황'이다. */
  assert.deepEqual(bagFrom(doc), ["가위바위보"], "다른 트랙 결과물이 섞여 들어왔다");
  assert.ok(await submit(doc, win));
  const [rec] = subs(win);
  assert.equal(rec.items.length, 1, "다른 트랙 결과물까지 함께 나갔다");
});

/* 헤더 영역 미션함 상태 노출 제한 */
test("헤더에 미션함 배지가 없다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  setPhase(doc, "live");
  asFree(win);
  await add(win, "idea", "상상보드");
  assert.equal(
    doc.getElementById("lockerBadge"),
    null,
    "헤더에 미션함 배지가 남아 있다",
  );
});

/* ══════════════ 만들기 ══════════════ */

test("만들기 버튼은 담김 여부를 말하지 않는다 (한 가지만 말한다)", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  await add(win, "idea", "상상보드");

  const b = makeBtn(doc, "idea");
  assert.equal(
    b.classList.contains("has"),
    false,
    "만들기 버튼에 담김 표시가 붙었다",
  );
  assert.equal(
    b.querySelector(".kept"),
    null,
    "만들기 버튼에 담아 둠 배지가 붙었다",
  );
  /* 미션함 목록으로 상태 확인 */
  assert.deepEqual(bag(doc), ["idea"]);
  assert.equal(bagCount(doc), "1개");
});

test("추론을 껐다 켜도 미션함 목록은 그대로다 (단계와 무관)", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  await add(win, "idea", "상상보드");
  assert.deepEqual(bag(doc), ["idea"]);

  /* 추론 상태 변경(모델 초기화) 시 기존 보관함 유지 확인 */
  setPhase(doc, "untrained");
  assert.ok(
    await waitFor(
      () => makeBtns(doc).every((b) => b.classList.contains("off")),
      3000,
    ),
  );
  assert.deepEqual(bag(doc), ["idea"], "학습이 풀렸다고 미션함이 비었다");
  assert.equal(sendBtn(doc).disabled, false, "담아 뒀는데 제출이 잠겼다");

  setPhase(doc, "live");
  assert.ok(
    await waitFor(
      () => makeBtns(doc).every((b) => !b.classList.contains("off")),
      3000,
    ),
  );
  assert.deepEqual(bag(doc), ["idea"]);
});

test("학습 전: 만들기 버튼은 보이지만 눌러도 안 가고 이유를 말한다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "untrained");
  win.Submit.refresh();

  assert.equal(makeBtns(doc).length, 4, "학습 전에 버튼이 사라졌다");
  assert.ok(makeBtns(doc).every((b) => b.classList.contains("off")));
  assert.match(note(doc).textContent, /AI를 학습시킨 뒤에/);

  makeBtn(doc, "idea").click();
  const ov = doc.querySelector(".st-ov");
  assert.ok(
    !ov || !ov.classList.contains("on"),
    "학습 전인데 결과물 화면이 열렸다",
  );
  assert.match(
    note(doc).textContent,
    /먼저 AI를 학습시켜 주세요/,
    "막힌 이유를 말하지 않았다",
  );
});

test("추론 중: 4개가 열리고 버튼이 결과물 화면을 연다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  win.Submit.refresh();
  assert.ok(makeBtns(doc).every((b) => !b.classList.contains("off")));
  assert.match(note(doc).textContent, /내 미션함/);

  makeBtn(doc, "idea").click();
  assert.ok(
    doc.querySelector(".st-ov").classList.contains("on"),
    "상상보드가 열리지 않았다",
  );
  win.Studio.close();
  makeBtn(doc, "maker").click();
  assert.ok(
    doc.querySelector(".mk-ov").classList.contains("on"),
    "작품 만들기가 열리지 않았다",
  );
});

test("추론을 켜면 버튼이 스스로 열린다 (다시 그리라고 부르지 않아도)", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "untrained");
  win.Submit.refresh();
  assert.ok(makeBtns(doc).every((b) => b.classList.contains("off")));

  /* 상태 폴링/이벤트 없이 DOM 감지 기반 버튼 상태 갱신 */
  setPhase(doc, "live");
  assert.ok(
    await waitFor(
      () => makeBtns(doc).every((b) => !b.classList.contains("off")),
      3000,
    ),
    "추론 중인데 버튼이 계속 잠겨 있다",
  );
});

test("이미지 저장하기: 미션함에 담고 파일로도 준다 · 다시 눌러 다시 담긴다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  win.Submit.refresh();

  makeBtn(doc, "capture").click();
  assert.ok(
    await waitFor(() => win.Locker.count() === 1),
    "화면 캡처가 담기지 않았다",
  );
  const key = bagKeys(doc)[0];
  const first = win.Locker.get(key).at;
  assert.deepEqual(bag(doc), ["capture"]);

  await new Promise((r) => setTimeout(r, 1100));
  makeBtn(doc, "capture").click();
  assert.ok(
    await waitFor(() => win.Locker.get(key).at !== first),
    "두 번째로 담기지 않았다",
  );
  assert.equal(
    win.Locker.count(),
    1,
    "같은 미션에서 다시 담았는데 개수가 늘었다",
  );
});

/* ══════════════ 내 미션함 ══════════════ */

test("미션함: 줄에서 바로 이미지로 저장한다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  setMission(win, "rps");
  await add(win, "idea", "상상보드");

  const files = [];
  win.HTMLAnchorElement.prototype.click = function () {
    if (this.download) files.push(this.download);
  };
  bagRow(doc, "idea@rps").querySelector('.op[data-a="dl"]').click();
  assert.ok(
    await waitFor(() => files.length > 0),
    "이미지 파일을 내려받지 않았다",
  );
  assert.match(files[0], /^상상보드_가위바위보_\d+\.png$/);
});

test("미션함: ✕ 로 삭제하면 확인 뒤 목록에서 사라진다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  setMission(win, "rps");
  await add(win, "idea", "상상보드");
  await add(win, "capture", "화면 캡처");
  assert.deepEqual(bag(doc).sort(), ["capture", "idea"]);

  /* 삭제 확인 다이얼로그 노출 */
  win.confirm = () => {
    throw new Error("네이티브 confirm 이 떴다");
  };
  bagRow(doc, "capture@rps").querySelector('.op[data-a="rm"]').click();
  const dlg = doc.querySelector(".vd-ov.on");
  assert.ok(dlg, "확인창이 뜨지 않았다");
  assert.match(dlg.textContent, /화면 캡처/, "무엇을 빼는지 알려주지 않았다");

  dlg.querySelector('[data-v="1"]').click();
  assert.ok(
    await waitFor(() => bag(doc).length === 1),
    "뺐는데 목록에 남아 있다",
  );
  assert.deepEqual(bag(doc), ["idea"]);
  assert.equal(win.Locker.count(), 1);
});

test("미션을 바꿔도 앞서 담은 것이 목록에 그대로 있다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  const pick = async (k) => {
    doc.querySelector(`#lab-scenarios .lab-sc[data-k="${k}"]`).click();
    await new Promise((r) => setTimeout(r, 20));
    win.Submit.refresh();
  };

  await pick("recycle");
  await add(win, "idea", "상상보드");
  assert.deepEqual(bag(doc), ["idea"]);

  await pick("rps");
  assert.deepEqual(bag(doc), ["idea"], "미션을 바꿨다고 담은 것이 사라졌다");
  assert.deepEqual(
    bagFrom(doc),
    ["분리수거 분류기"],
    "어디서 만든 건지 안 보인다",
  );

  /* 단일 통합 저장소 사용 확인 */
  assert.deepEqual(
    Object.keys(JSON.parse(win.localStorage.getItem("vision_locker"))),
    ["bag"],
  );
});

test("미션함: 만든 시각이 오늘/어제/그 이전으로 갈려 보인다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  const at = (ms) => new Date(Date.now() - ms).toISOString();
  const it = (kind, title, ms) => ({
    key: kind + "@custom",
    kind,
    title,
    from: "자유 주제",
    imgId: "x/" + kind,
    at: at(ms),
    sid: "s",
  });
  win.localStorage.setItem(
    "vision_locker",
    JSON.stringify({
      bag: {
        "idea@custom": it("idea", "상상보드", 5 * 60e3),
        "maker@custom": it("maker", "작품", 30 * 3600e3),
        "capture@custom": it("capture", "화면 캡처", 5 * 86400e3),
      },
    }),
  );
  win.Submit.refresh();

  const at_ = (k) =>
    bagRow(doc, k + "@custom").querySelector(".at").textContent;
  assert.match(at_("idea"), /분 전/, "오늘 것이 상대시간이 아니다");
  assert.match(at_("maker"), /^어제 \d{2}:\d{2}$/, "어제 것에 시각이 없다");
  assert.match(at_("capture"), /^\d+월 \d+일$/, "오래된 것에 날짜가 없다");
});

/* ══════════════ 제출 ══════════════ */

test("제출: 담긴 것을 한 건으로 낸다 · 그림 참조와 글이 함께 남는다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  await add(win, "idea", "상상보드");
  await add(win, "capture", "화면 캡처");

  assert.ok(await submit(doc, win, "김에듀"));
  const list = subs(win);
  assert.equal(list.length, 1, "레코드가 1건이 아니다");
  const rec = list[0];
  assert.equal(rec.items.length, 2);
  assert.deepEqual(rec.items.map((i) => i.kind).sort(), ["capture", "idea"]);
  assert.ok(
    rec.items.every((i) => i.imgId),
    "그림 참조(imgId)가 빠졌다",
  );
  assert.equal(rec.name, "김에듀");
  /* 비로그인 시 user null 처리 */
  assert.equal(rec.user, null);

  assert.equal(win.Locker.count(), 0, "제출 후 미션함이 비지 않았다");
  assert.deepEqual(bag(doc), []);
  assert.match(doc.querySelector("#subCard").textContent, /제출 완료/);
  assert.match(
    doc.querySelector("#subCard").textContent,
    /내 현황/,
    "어디서 볼 수 있는지 안 알려준다",
  );
});

test("제출하고 나면 미션함이 비고 제출 버튼이 다시 잠긴다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  await add(win, "idea", "상상보드");
  assert.deepEqual(bag(doc), ["idea"]);
  assert.equal(sendBtn(doc).disabled, false);

  assert.ok(await submit(doc, win));
  assert.deepEqual(bag(doc), [], "제출 후에도 미션함에 남아 있다");
  assert.ok(sendBtn(doc).disabled, "낼 게 없는데 제출 버튼이 열려 있다");
  assert.ok(sendBtn(doc).classList.contains("off"));
});

/* 제출 조건 미충족 시 버튼 비활성화 (라벨 변경 없음) */
test("낼 게 없으면 제출 버튼이 같은 이름으로 꺼져 있다", async () => {
  const { doc, window: win } = await loadApp(PAID);
  asFree(win);
  setPhase(doc, "live");
  win.Submit.refresh();
  const send = sendBtn(doc);
  assert.ok(send.disabled);
  assert.ok(send.classList.contains("off"), "꺼진 모습이 아니다");
  assert.match(send.textContent, /미션 제출하기/);
  assert.doesNotMatch(
    send.textContent,
    /먼저|주세요/,
    "버튼이 안내문을 대신 떠맡고 있다",
  );
  assert.match(
    doc.querySelector("#actionArea .sb-empty").textContent,
    /만든 결과물을 여기에 담아요/,
  );
});

test("사전학습 체험 스테이지에는 결과물·미션함이 없다 (이전 담당자 동작 그대로)", async () => {
  const { doc, window: win } = await loadApp(PAID);
  /* 체험 스테이지 환경 모의 (직접 제작 패널 제거) */
  doc.getElementById("panel-direct").id = "panel-direct-x";
  asFree(win);
  win.Submit.refresh();

  const area = doc.getElementById("actionArea");
  assert.equal(
    area.querySelectorAll(".sb-b, .sb-bag, .sb-open").length,
    0,
    "체험 스테이지에 결과물 UI 가 떴다",
  );
  assert.match(area.textContent, /이미지 저장하기/);
  assert.equal(
    doc.getElementById("boardBtn").style.display,
    "none",
    "스테이지의 체험 모드에는 내 현황 버튼이 없어야 한다",
  );

  /* 스테이지 환경 파일 첨부 레거시 UI 노출 확인 */
  asClass(win);
  win.Submit.refresh();
  assert.match(area.textContent, /이미지 저장/);
  assert.match(area.textContent, /미션 제출/);
});
