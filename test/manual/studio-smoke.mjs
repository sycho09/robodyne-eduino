/* 결과물 스튜디오 수동 점검 하네스
   - npm run test 에는 포함되지 않는다 (test/*.test.mjs 글롭 밖)
   - 실행: node test/manual/studio-smoke.mjs
   - 왜 있나: 상상보드·캐릭터카드는 자동 테스트가 한 건도 없던 페이지다.
     리팩토링 전후로 "3트랙 전부에서 뜨는지 · 담기가 되는지"를 눈으로 확인하는 대신
     이걸 돌린다. jsdom 이라 실제 렌더 품질(PNG 줄바꿈 등)은 확인하지 못한다. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = join(import.meta.dirname, "..", "..");

/* 페이지가 부르는 로컬 스크립트를 인라인으로 바꿔 넣는다 (CDN 은 스텁) */
const inline = (html) =>
  html.replace(/<script\s+src="(\/[^"]+\.js)"\s*><\/script>/g, (_m, src) => {
    const code = readFileSync(join(ROOT, src), "utf8");
    return "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>";
  });

async function load(page, opts) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));

  const dom = new JSDOM(inline(readFileSync(join(ROOT, page), "utf8")), {
    url: "http://localhost" + page + (opts.query || ""),
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.requestAnimationFrame = () => 0;
      w.cancelAnimationFrame = () => {};
      w.html2canvas = async () => ({
        toDataURL: () => "data:image/png;base64,",
      });
      w.document.fonts = { ready: Promise.resolve(), load: async () => [] };
      if (opts.locker) {
        /* 학습 화면(부모 창) 안에서 열린 상황.
           jsdom 단독 문서는 parent === self 라 부모를 직접 심어 준다. */
        const kept = [];
        const fakeParent = {
          Locker: {
            add: async (kind, payload) => {
              kept.push({ kind, payload });
              return true;
            },
          },
          Studio: { close: () => {} },
          document: w.document,
        };
        Object.defineProperty(w, "parent", {
          value: fakeParent,
          configurable: true,
        });
        w.__kept = kept;
      }
    },
  });
  await new Promise((r) => setTimeout(r, 60));
  return { doc: dom.window.document, win: dom.window, errors };
}

let failed = 0;
const check = (ok, label, extra) => {
  console.log(`  ${ok ? "✔" : "✖"} ${label}${ok || !extra ? "" : " — " + extra}`);
  if (!ok) failed++;
};
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, page] of [
  ["상상보드", "/stages/apps/idea-board.html"],
  ["캐릭터카드", "/stages/apps/character-card.html"],
]) {
  for (const track of ["image", "audio", "pose"]) {
    const { doc, win, errors } = await load(page, {
      query: "?track=" + track,
      locker: true,
    });
    const tag = `${name} · ${track}`;
    check(errors.length === 0, `${tag}: 스크립트 오류 없음`, errors.map(String).join(" | "));
    check(!!win.StudioCommon, `${tag}: StudioCommon 로드됨`);
    check(!!win.StudioCommon.locker(), `${tag}: 부모 보관함을 찾는다`);
    check(
      doc.getElementById("btnKeep").style.display !== "none",
      `${tag}: 보관함이 있으면 담기 버튼이 보인다`,
    );

    /* 조건 미충족이면 담기지 않아야 한다 */
    doc.getElementById("btnKeep").click();
    await tick(80);
    check(win.__kept.length === 0, `${tag}: 미완성이면 담기지 않는다`);

    /* 캐릭터카드는 이름+특성만 채우면 담기까지 확인할 수 있다 */
    if (name === "캐릭터카드") {
      doc.getElementById("name").value = "테스트";
      doc.getElementById("name").dispatchEvent(new win.Event("input"));
      const blanks = [...doc.querySelectorAll("#tEditor .blk .bl")];
      blanks.forEach((b, i) => {
        b.textContent = "값" + i;
        b.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
      await tick(30);
      check(
        doc.querySelectorAll("#cTraits .tline:not(.empty)").length > 0,
        `${tag}: 빈칸을 채우면 카드에 특성 줄이 선다`,
      );
      doc.getElementById("btnKeep").click();
      await tick(150);
      check(
        win.__kept.length === 1 && win.__kept[0].kind === "character",
        `${tag}: 조건을 채우면 보관함에 담긴다`,
      );
      check(
        win.__kept[0] && win.__kept[0].payload.meta.track === win.StudioCommon.TRACKS[track].name,
        `${tag}: 담긴 메타에 트랙명이 실린다`,
      );
    }
  }

  /* 임시저장이 텍스트(localStorage) 와 이미지(ImageStore) 로 갈리는지 */
  {
    const { win } = await load(page, { query: "?track=image", locker: true });
    const SC = win.StudioCommon;
    const PNG = "data:image/png;base64,AAAABBBBCCCC";
    SC.draftKeep("probe:key", { text: "가나다" }, { img: PNG });
    await tick(60);
    const raw = win.localStorage.getItem("probe:key");
    check(!!raw && JSON.parse(raw).text === "가나다", `${name}: 텍스트는 localStorage 로 간다`);
    check(!!raw && !raw.includes("base64"), `${name}: 텍스트 저장에 이미지가 섞이지 않는다`);
    check((await SC.draftImage("probe:key", "img")) === PNG, `${name}: 이미지가 보관소에서 돌아온다`);
    SC.draftKeep("probe:key", { text: "x" }, { img: null });
    await tick(60);
    check(!(await SC.draftImage("probe:key", "img")), `${name}: null 을 주면 보관소에서 지운다`);
  }

  /* 단독 창(부모 없음)에서는 담을 곳이 없으므로 버튼을 숨긴다 */
  const solo = await load(page, { query: "?track=image", locker: false });
  check(
    solo.doc.getElementById("btnKeep").style.display === "none",
    `${name} · 단독창: 담기 버튼 숨김`,
  );
  check(solo.errors.length === 0, `${name} · 단독창: 스크립트 오류 없음`);
}

console.log(failed ? `\n실패 ${failed}건` : "\n전부 통과");
process.exit(failed ? 1 : 0);
