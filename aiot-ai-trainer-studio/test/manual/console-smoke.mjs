/* 비전 콘솔 수동 점검 하네스
   - npm run test 에는 포함되지 않는다 (test/*.test.mjs 글롭 밖)
   - 실행: node test/manual/console-smoke.mjs
   - 왜 있나: console/{map,cards}.html 은 자동 테스트가 한 건도 없던 페이지다.
     탭 마크업을 각 HTML 에서 걷어내 shared.js 로 옮겼기 때문에,
     "두 안이 TRACKS 대로 그려지고 · 트랙 전환/키 조작이 그대로인지" 를 여기서 확인한다.
     jsdom 이라 애니메이션·실제 렌더 품질은 확인하지 못한다. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = join(import.meta.dirname, "..", "..");

/* 페이지가 부르는 로컬 스크립트를 인라인으로 바꿔 넣는다 (CDN 은 무시) */
const inline = (html) =>
  html.replace(/<script\s+src="(\/[^"]+\.js)"\s*><\/script>/g, (_m, src) => {
    const code = readFileSync(join(ROOT, src), "utf8");
    return "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>";
  });

async function load(page, hash) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));

  const dom = new JSDOM(inline(readFileSync(join(ROOT, page), "utf8")), {
    url: "http://localhost" + page + (hash || ""),
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.requestAnimationFrame = () => 0;
      w.cancelAnimationFrame = () => {};
      // Web Audio 는 jsdom 에 없다 — 사운드는 점검 대상이 아니라 무해한 스텁으로 둔다
      w.AudioContext = function () {
        throw new Error("no audio in jsdom");
      };
    },
  });
  await new Promise((r) => setTimeout(r, 120));
  return { dom, w: dom.window, errors };
}

let fail = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log("  ✔ " + label);
  else {
    fail++;
    console.log("  ✖ " + label + (extra ? "  → " + extra : ""));
  }
};

async function check(page, label) {
  console.log("\n■ " + label + "  (" + page + ")");
  const { dom, w, errors } = await load(page);
  const doc = w.document;

  ok(errors.length === 0, "스크립트 오류 0", errors.map(String).join(" / "));
  ok(!!w.VStudio, "VStudio 부착");

  const TRACKS = w.VStudio && w.VStudio.TRACKS;
  const KEYS = (w.VStudio && w.VStudio.TRACK_KEYS) || [];

  /* 탭이 TRACKS 대로 그려졌는가 — 라벨·개수를 HTML 에 복붙하지 않는 게 핵심 */
  const tabs = [...doc.querySelectorAll("#tabs .v-tab")];
  ok(tabs.length === KEYS.length, `탭 ${KEYS.length}개 렌더 (실제 ${tabs.length})`);
  for (const k of KEYS) {
    const b = doc.querySelector(`#tabs .v-tab[data-track="${k}"]`);
    const t = TRACKS[k];
    if (!b) {
      ok(false, `탭[${k}] 존재`);
      continue;
    }
    const txt = b.textContent.replace(/\s+/g, " ").trim();
    ok(txt.includes(t.label), `탭[${k}] 라벨이 TRACKS.label`, txt);
    ok(txt.includes(t.no), `탭[${k}] 번호가 TRACKS.no`, txt);
    ok(
      b.querySelector(".cnt").textContent.trim() === String(t.items.length),
      `탭[${k}] 개수가 items.length (${t.items.length})`,
    );
    ok(
      (b.getAttribute("style") || "").includes(t.accent),
      `탭[${k}] 색이 TRACKS.accent 에서 옴`,
    );
  }

  /* 항목 링크가 실재 페이지를 가리키는가 (재편 후 5건이 404 였던 자리) */
  const bad = [];
  for (const k of KEYS)
    for (const it of TRACKS[k].items)
      if (!/^\/(stages|index)/.test(it.href)) bad.push(k + "/" + it.key + " " + it.href);
  ok(bad.length === 0, "TRACKS href 형태 정상", bad.join(", "));

  /* 활성 탭 표시 */
  const on = [...doc.querySelectorAll("#tabs .v-tab.on")];
  ok(on.length === 1, `활성 탭 1개 (실제 ${on.length})`);

  /* 트랙 전환 — 탭 클릭이 배선돼 있는가 */
  const first = on[0] && on[0].dataset.track;
  const other = w.VStudio.nextTrackKey(first);
  doc.querySelector(`#tabs .v-tab[data-track="${other}"]`).click();
  await new Promise((r) => setTimeout(r, 60));
  const on2 = doc.querySelector("#tabs .v-tab.on");
  ok(on2 && on2.dataset.track === other, `탭 클릭으로 ${first} → ${other} 전환`);

  /* 트랙 색이 문서에 반영됐는가 */
  const acc = doc.documentElement.style.getPropertyValue("--acc").trim();
  ok(acc === TRACKS[other].accent, `--acc 가 ${other} 색 (${acc})`);

  /* 키 조작 — ↑ 로 트랙 순환 */
  const back = w.VStudio.nextTrackKey(other);
  const ev = new w.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true });
  doc.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 60));
  const on3 = doc.querySelector("#tabs .v-tab.on");
  ok(on3 && on3.dataset.track === back, `↑ 키로 ${other} → ${back} 전환`);

  /* 항목 카드/노드가 트랙 개수만큼 그려졌는가 */
  const cells = doc.querySelectorAll(".node, .pack");
  ok(
    cells.length === TRACKS[back].items.length,
    `항목 ${TRACKS[back].items.length}개 렌더 (실제 ${cells.length})`,
  );

  dom.window.close();
}

console.log("비전 콘솔 스모크 — 2안 (A 맵 · C 카드)");
await check("/console/map.html", "A · 스테이지 맵");
await check("/console/cards.html", "C · 카드 캐러셀");

console.log(fail ? `\n실패 ${fail}건` : "\n전부 통과");
process.exit(fail ? 1 : 0);
